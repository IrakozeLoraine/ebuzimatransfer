"""
Load test that produces the Average API Response Time under
Increasing Request Load.

For each concurrency level it fires a fixed number of requests at the chosen
endpoints, keeping exactly N requests in flight at a time, and records the
average response time. Results are written as both a CSV (the raw data behind
the figure) and a PNG (the figure itself).

Measure from the same host as the API, not across the internet — otherwise the
curve is dominated by network round-trip rather than server behaviour. The
usual workflow is to collect on the server and plot afterwards:

    # on the server (no matplotlib needed):
    python scripts/loadtest.py --medical-id <MEDICAL_ID> --password '<password>' \
        --base-url http://localhost:8000 --no-figure

    # then, having copied results.csv down:
    python scripts/loadtest.py --plot-only loadtest_results/results.csv

The API must be running with a populated database; the script logs in once and
reuses the token, so the login cost is not counted in the measurements.
"""
import argparse
import asyncio
import csv
import statistics
import time
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import httpx

# Concurrency levels along the X-axis. Each is a separate measurement round.
DEFAULT_LEVELS = [1, 5, 10, 20, 50, 100, 200, 250, 500, 750, 1000]

# Endpoints to measure — authenticated reads that run real database queries, so
# the curve reflects the system rather than just framework overhead.
DEFAULT_ENDPOINTS = [
    "/api/v1/resources",
    "/api/v1/referrals",
    "/api/v1/dashboard/capacity",
]


@dataclass
class RoundResult:
    """One (endpoint, concurrency) measurement."""

    endpoint: str
    concurrency: int
    avg_ms: float
    p95_ms: float
    min_ms: float
    max_ms: float
    throughput_rps: float
    errors: int
    samples: int
    # Split so a saturated server (connection refused / timeout) is
    # distinguishable from one returning 5xx — they mean different things.
    http_errors: int = 0
    network_errors: int = 0
    # Server-process utilisation sampled during the round; 0 when --api-pid
    # was not supplied. CPU can exceed 100% on multi-core machines.
    cpu_mean_pct: float = 0.0
    cpu_peak_pct: float = 0.0
    mem_mean_mb: float = 0.0
    mem_peak_mb: float = 0.0

    @property
    def attempted(self) -> int:
        return self.samples + self.errors

    @property
    def success_rate(self) -> float:
        """Percentage of attempted requests that returned a non-error response."""
        return 100.0 * self.samples / self.attempted if self.attempted else 0.0


async def _login(base_url: str, medical_id: str, password: str) -> str:
    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as client:
        resp = await client.post(
            "/api/v1/auth/login",
            json={"medical_id": medical_id, "password": password},
        )
        resp.raise_for_status()
        body = resp.json()
    token = body.get("access_token")
    if not token:
        raise SystemExit(
            "Login succeeded but returned no access_token "
            f"(requires_password_reset={body.get('requires_password_reset')}). "
            "Use an account whose password is already set."
        )
    return token


class _ResourceSampler:
    """Polls a process's CPU and RSS in the background while a round runs.

    Sampling the *server* process (not this one) is the point: the load
    generator's own usage is irrelevant to how the API behaves under load.
    """

    def __init__(self, pid: int | None, interval: float = 0.25) -> None:
        self._interval = interval
        self._proc = None
        self._task: asyncio.Task | None = None
        self._procs: dict[int, object] = {}
        self.cpu: list[float] = []
        self.mem: list[float] = []
        if pid is not None:
            import psutil

            self._proc = psutil.Process(pid)
            self._refresh_tree()

    def _refresh_tree(self) -> None:
        """Track the target process plus its children, reusing Process objects.

        Sampling only the given PID undercounts two common layouts: uvicorn
        started with --workers (the master is idle, the workers do the work)
        and a container whose PID 1 is a shell wrapping uvicorn.

        The objects must be cached rather than rebuilt each poll: psutil
        computes cpu_percent() as a delta since the previous call on that same
        object, so a freshly constructed Process always reports 0.0.
        """
        import psutil

        try:
            current = [self._proc, *self._proc.children(recursive=True)]
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            return
        for proc in current:
            if proc.pid not in self._procs:
                self._procs[proc.pid] = proc
                try:
                    # Prime this process's baseline; this first reading is 0.0.
                    proc.cpu_percent()
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    self._procs.pop(proc.pid, None)

    async def _poll(self) -> None:
        import psutil

        while True:
            # Workers can be spawned or replaced mid-run, so re-scan each time.
            self._refresh_tree()
            cpu_total = 0.0
            mem_total = 0.0
            found = False
            for pid, proc in list(self._procs.items()):
                try:
                    cpu_total += proc.cpu_percent()
                    mem_total += proc.memory_info().rss / (1024 * 1024)
                    found = True
                except (psutil.NoSuchProcess, psutil.AccessDenied):
                    self._procs.pop(pid, None)
            if not found:
                return
            self.cpu.append(cpu_total)
            self.mem.append(mem_total)
            await asyncio.sleep(self._interval)

    async def __aenter__(self) -> "_ResourceSampler":
        if self._proc is not None:
            self._task = asyncio.create_task(self._poll())
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    @property
    def stats(self) -> tuple[float, float, float, float]:
        """(cpu_mean, cpu_peak, mem_mean, mem_peak); zeros when not sampling."""
        if not self.cpu:
            return (0.0, 0.0, 0.0, 0.0)
        return (
            statistics.fmean(self.cpu),
            max(self.cpu),
            statistics.fmean(self.mem) if self.mem else 0.0,
            max(self.mem) if self.mem else 0.0,
        )


async def _run_round(
    client: httpx.AsyncClient,
    endpoint: str,
    concurrency: int,
    total_requests: int,
    api_pid: int | None = None,
) -> RoundResult:
    """Fire `total_requests` at `endpoint`, keeping `concurrency` in flight."""
    latencies: list[float] = []
    http_errors = 0
    network_errors = 0
    # A semaphore caps in-flight requests, so concurrency is the independent
    # variable rather than however fast the event loop happens to dispatch.
    gate = asyncio.Semaphore(concurrency)

    async def one_request() -> None:
        nonlocal http_errors, network_errors
        async with gate:
            started = time.perf_counter()
            try:
                resp = await client.get(endpoint)
                elapsed_ms = (time.perf_counter() - started) * 1000
                if resp.status_code >= 400:
                    http_errors += 1
                else:
                    latencies.append(elapsed_ms)
            except httpx.HTTPError:
                # Refused connection, timeout, reset — the server never answered.
                network_errors += 1

    async with _ResourceSampler(api_pid) as sampler:
        wall_start = time.perf_counter()
        await asyncio.gather(*(one_request() for _ in range(total_requests)))
        wall_elapsed = time.perf_counter() - wall_start
    cpu_mean, cpu_peak, mem_mean, mem_peak = sampler.stats

    errors = http_errors + network_errors

    # A round where everything failed is a real data point for the success-rate
    # figure (the server is past its limit), not a reason to abort — so record
    # it with zeroed timings rather than raising. The caller decides whether a
    # total failure this early means the test is misconfigured.
    if not latencies:
        return RoundResult(
            endpoint=endpoint,
            concurrency=concurrency,
            avg_ms=0.0,
            p95_ms=0.0,
            min_ms=0.0,
            max_ms=0.0,
            throughput_rps=0.0,
            errors=errors,
            samples=0,
            http_errors=http_errors,
            network_errors=network_errors,
            cpu_mean_pct=cpu_mean,
            cpu_peak_pct=cpu_peak,
            mem_mean_mb=mem_mean,
            mem_peak_mb=mem_peak,
        )

    ordered = sorted(latencies)
    p95_index = min(int(len(ordered) * 0.95), len(ordered) - 1)
    return RoundResult(
        endpoint=endpoint,
        concurrency=concurrency,
        avg_ms=statistics.fmean(latencies),
        p95_ms=ordered[p95_index],
        min_ms=ordered[0],
        max_ms=ordered[-1],
        throughput_rps=len(latencies) / wall_elapsed if wall_elapsed else 0.0,
        errors=errors,
        samples=len(latencies),
        http_errors=http_errors,
        network_errors=network_errors,
        cpu_mean_pct=cpu_mean,
        cpu_peak_pct=cpu_peak,
        mem_mean_mb=mem_mean,
        mem_peak_mb=mem_peak,
    )


async def _warmup(client: httpx.AsyncClient, endpoints: list[str]) -> None:
    """Prime connections and query plans so the first level isn't penalised."""
    for endpoint in endpoints:
        for _ in range(5):
            await client.get(endpoint)


async def collect(
    base_url: str,
    token: str,
    endpoints: list[str],
    levels: list[int],
    requests_per_level: int,
    timeout: float = 60.0,
    api_pid: int | None = None,
) -> list[RoundResult]:
    results: list[RoundResult] = []
    limits = httpx.Limits(
        max_connections=max(levels) + 10,
        max_keepalive_connections=max(levels) + 10,
    )
    async with httpx.AsyncClient(
        base_url=base_url,
        timeout=timeout,
        limits=limits,
        headers={"Authorization": f"Bearer {token}"},
    ) as client:
        print("Warming up…")
        await _warmup(client, endpoints)

        for endpoint in endpoints:
            for level in levels:
                result = await _run_round(
                    client, endpoint, level, requests_per_level, api_pid
                )
                # Nothing has ever succeeded, including at the lowest load — that
                # is a bad URL, token or database, not a capacity limit.
                if not any(r.samples for r in results) and not result.samples:
                    raise SystemExit(
                        f"Every request to {endpoint} failed at concurrency {level} "
                        f"({result.http_errors} HTTP, {result.network_errors} network). "
                        "Check the API is running, the base URL is right, and the "
                        "account can read this endpoint."
                    )
                results.append(result)
                print(
                    f"  {endpoint:32s} c={level:<4d} "
                    f"avg={result.avg_ms:7.1f}ms  p95={result.p95_ms:7.1f}ms  "
                    f"{result.throughput_rps:6.0f} req/s  "
                    f"success={result.success_rate:5.1f}%  errors={result.errors}"
                )
                # Let the server settle so one level doesn't bleed into the next.
                await asyncio.sleep(1.0)
    return results


def write_csv(results: list[RoundResult], path: Path) -> None:
    with path.open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(
            [
                "endpoint",
                "concurrent_requests",
                "avg_response_ms",
                "p95_response_ms",
                "min_response_ms",
                "max_response_ms",
                "throughput_rps",
                "success_rate_pct",
                "cpu_mean_pct",
                "cpu_peak_pct",
                "mem_mean_mb",
                "mem_peak_mb",
                "attempted",
                "errors",
                "http_errors",
                "network_errors",
                "samples",
            ]
        )
        for r in results:
            writer.writerow(
                [
                    r.endpoint,
                    r.concurrency,
                    f"{r.avg_ms:.2f}",
                    f"{r.p95_ms:.2f}",
                    f"{r.min_ms:.2f}",
                    f"{r.max_ms:.2f}",
                    f"{r.throughput_rps:.2f}",
                    f"{r.success_rate:.2f}",
                    f"{r.cpu_mean_pct:.2f}",
                    f"{r.cpu_peak_pct:.2f}",
                    f"{r.mem_mean_mb:.2f}",
                    f"{r.mem_peak_mb:.2f}",
                    r.attempted,
                    r.errors,
                    r.http_errors,
                    r.network_errors,
                    r.samples,
                ]
            )


def read_csv(path: Path) -> list[RoundResult]:
    """Load a previous run's CSV so the figure can be re-plotted anywhere."""
    with path.open(newline="") as fh:
        return [
            RoundResult(
                endpoint=row["endpoint"],
                concurrency=int(row["concurrent_requests"]),
                avg_ms=float(row["avg_response_ms"]),
                p95_ms=float(row["p95_response_ms"]),
                min_ms=float(row["min_response_ms"]),
                max_ms=float(row["max_response_ms"]),
                throughput_rps=float(row["throughput_rps"]),
                errors=int(row["errors"]),
                samples=int(row["samples"]),
                # Tolerated as missing so CSVs from earlier runs still re-plot.
                http_errors=int(row.get("http_errors") or 0),
                network_errors=int(row.get("network_errors") or 0),
                cpu_mean_pct=float(row.get("cpu_mean_pct") or 0),
                cpu_peak_pct=float(row.get("cpu_peak_pct") or 0),
                mem_mean_mb=float(row.get("mem_mean_mb") or 0),
                mem_peak_mb=float(row.get("mem_peak_mb") or 0),
            )
            for row in csv.DictReader(fh)
        ]


def _plot(
    results: list[RoundResult],
    path: Path,
    value: "Callable[[RoundResult], float]",
    xlabel: str,
    ylabel: str,
    title: str,
    xscale: str = "linear",
    ylim: tuple[float, float] | None = None,
) -> None:
    """Draw one line per endpoint of `value` against concurrency."""
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(8, 5))
    markers = ["o", "s", "^", "D", "v"]

    endpoints = sorted({r.endpoint for r in results})
    for idx, endpoint in enumerate(endpoints):
        rows = sorted(
            (r for r in results if r.endpoint == endpoint),
            key=lambda r: r.concurrency,
        )
        ax.plot(
            [r.concurrency for r in rows],
            [value(r) for r in rows],
            marker=markers[idx % len(markers)],
            linewidth=1.8,
            markersize=5,
            label=endpoint,
        )

    # Tick only at the levels actually measured, so every plotted point is
    # labelled instead of falling between round-number ticks.
    levels = sorted({r.concurrency for r in results})
    if xscale == "log":
        ax.set_xscale("log")
    ax.set_xticks(levels)
    ax.set_xticklabels([str(level) for level in levels])
    ax.minorticks_off()
    if ylim:
        ax.set_ylim(*ylim)

    ax.set_xlabel(xlabel)
    ax.set_ylabel(ylabel)
    ax.set_title(title)
    ax.grid(True, linestyle="--", alpha=0.4)
    ax.legend(frameon=False)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=300)
    plt.close(fig)


def write_figure(results: list[RoundResult], path: Path, xscale: str = "linear") -> None:
    """Average response time against load."""
    _plot(
        results,
        path,
        value=lambda r: r.avg_ms,
        xlabel="Number of concurrent requests",
        ylabel="Average response time (milliseconds)",
        title="Average API Response Time under Increasing Request Load",
        xscale=xscale,
    )


def write_success_figure(
    results: list[RoundResult], path: Path, xscale: str = "linear"
) -> None:
    """Percentage of requests that succeeded, against load."""
    _plot(
        results,
        path,
        value=lambda r: r.success_rate,
        xlabel="Concurrent users",
        ylabel="Successful requests (%)",
        title="Successful Request Rate under Concurrent User Load",
        xscale=xscale,
        # Fixed 0-100 axis so a flat 100% line reads as "no failures" rather
        # than being auto-zoomed into meaningless noise.
        ylim=(0, 105),
    )


def write_cpu_figure(results: list[RoundResult], path: Path, xscale: str = "linear") -> None:
    """CPU utilisation of the API process against load."""
    _plot(
        results,
        path,
        value=lambda r: r.cpu_mean_pct,
        xlabel="Number of concurrent requests",
        ylabel="CPU utilisation (%, one core = 100%)",
        title="API Server CPU Utilisation under Increasing Workload",
        xscale=xscale,
    )


def write_memory_figure(results: list[RoundResult], path: Path, xscale: str = "linear") -> None:
    """Resident memory of the API process against load."""
    _plot(
        results,
        path,
        value=lambda r: r.mem_mean_mb,
        xlabel="Number of concurrent requests",
        ylabel="Memory utilisation (MB resident)",
        title="API Server Memory Utilisation under Increasing Workload",
        xscale=xscale,
    )


def _write_figures(
    results: list[RoundResult], out_dir: Path, xscale: str
) -> list[Path]:
    response_png = out_dir / "response_time.png"
    success_png = out_dir / "success_rate.png"
    write_figure(results, response_png, xscale=xscale)
    write_success_figure(results, success_png, xscale=xscale)
    written = [response_png, success_png]

    # Only meaningful when --api-pid was supplied; otherwise every sample is 0
    # and the chart would imply the server used no resources at all.
    if any(r.cpu_peak_pct or r.mem_peak_mb for r in results):
        cpu_png = out_dir / "cpu_utilisation.png"
        mem_png = out_dir / "memory_utilisation.png"
        write_cpu_figure(results, cpu_png, xscale=xscale)
        write_memory_figure(results, mem_png, xscale=xscale)
        written += [cpu_png, mem_png]
    return written


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--medical-id", help="Account to log in as")
    parser.add_argument("--password")
    parser.add_argument(
        "--plot-only",
        type=Path,
        metavar="CSV",
        help="Re-plot a previous run's CSV instead of hitting the API",
    )
    parser.add_argument(
        "--no-figure",
        action="store_true",
        help="Write only the CSV (for servers without matplotlib installed)",
    )
    parser.add_argument(
        "--endpoints",
        nargs="+",
        default=DEFAULT_ENDPOINTS,
        help="Endpoints to measure",
    )
    parser.add_argument(
        "--levels",
        nargs="+",
        type=int,
        default=DEFAULT_LEVELS,
        help="Concurrency levels for the X-axis",
    )
    parser.add_argument(
        "--requests-per-level",
        type=int,
        default=200,
        help="Requests fired at each concurrency level",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=60.0,
        help=(
            "Seconds before a request counts as failed. The default is high "
            "enough that the server effectively never fails, only slows down; "
            "lower it (e.g. 3) to define success as 'answered within an "
            "acceptable wait' for the success-rate figure."
        ),
    )
    parser.add_argument(
        "--api-pid",
        type=int,
        help=(
            "PID of the uvicorn process, to sample its CPU and memory during "
            "each round (adds the resource-utilisation figures)"
        ),
    )
    parser.add_argument("--out-dir", type=Path, default=Path("loadtest_results"))
    parser.add_argument(
        "--xscale",
        choices=["linear", "log"],
        default="linear",
        help="Log spreads out the low concurrency levels when they bunch up",
    )
    args = parser.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)

    if args.plot_only:
        for path in _write_figures(read_csv(args.plot_only), args.out_dir, args.xscale):
            print(f"Wrote {path}")
        return

    if not args.medical_id or not args.password:
        parser.error("--medical-id and --password are required unless --plot-only is used")

    # The semaphore only caps concurrency if there are more requests than slots.
    # Below that, a level silently degrades into a --requests-per-level run and
    # the point on the graph is a duplicate rather than a measurement.
    too_few = [level for level in args.levels if level > args.requests_per_level]
    if too_few:
        parser.error(
            f"--requests-per-level ({args.requests_per_level}) is below these "
            f"concurrency levels: {too_few}. Each level needs more requests than "
            f"its concurrency, or it never actually reaches it. Use at least "
            f"--requests-per-level {max(args.levels) * 10} for a stable average."
        )

    print(f"Logging in as {args.medical_id}…")
    token = asyncio.run(_login(args.base_url, args.medical_id, args.password))

    results = asyncio.run(
        collect(
            args.base_url,
            token,
            args.endpoints,
            args.levels,
            args.requests_per_level,
            args.timeout,
            args.api_pid,
        )
    )

    csv_path = args.out_dir / "results.csv"
    write_csv(results, csv_path)
    print(f"\nWrote {csv_path}")

    if not args.no_figure:
        for path in _write_figures(results, args.out_dir, args.xscale):
            print(f"Wrote {path}")


if __name__ == "__main__":
    main()
