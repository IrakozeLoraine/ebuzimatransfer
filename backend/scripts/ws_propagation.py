"""
Measures how quickly a resource-availability change reaches connected clients.

A subscriber holds a WebSocket open on the ``capacity`` channel. The script
then repeatedly updates a resource's occupancy counts over HTTP and times the
gap between issuing the update and the broadcast arriving on the socket. That
gap covers the whole path the application actually uses:

    PATCH /resources/{id}/counts
        → database commit
        → publish to Redis
        → Redis fan-out to every worker's subscriber
        → delivery to this WebSocket

Both the HTTP call and the socket run in this one process, so the two
timestamps come from the same clock and no clock-skew correction is needed.

Usage:

    python scripts/ws_propagation.py --medical-id <MEDICAL_ID> --password '<password>'
"""
import argparse
import asyncio
import csv
import json
import statistics
import time
from dataclasses import dataclass
from pathlib import Path

import httpx
import websockets


@dataclass
class Propagation:
    """One update and the delay before it arrived on the socket."""

    index: int
    delay_ms: float


async def _login(client: httpx.AsyncClient, medical_id: str, password: str) -> str:
    resp = await client.post(
        "/api/v1/auth/login", json={"medical_id": medical_id, "password": password}
    )
    resp.raise_for_status()
    token = resp.json().get("access_token")
    if not token:
        raise SystemExit("Login returned no access token; is the password set?")
    return token


async def _pick_resource(
    client: httpx.AsyncClient, resource_id: str | None
) -> tuple[str, int, dict[str, int]]:
    """Return (id, quantity, original_counts) for the resource to mutate.

    The original counts are captured so they can be written back afterwards —
    this script changes real occupancy data, which on a live system is what
    staff read to decide where to send a patient.
    """
    resp = await client.get("/api/v1/resources")
    resp.raise_for_status()
    resources = resp.json()
    if not resources:
        raise SystemExit(
            "No resources exist to update. Create at least one resource "
            "(a bed group) before measuring propagation."
        )
    if resource_id:
        chosen = next((r for r in resources if r["id"] == resource_id), None)
        if chosen is None:
            raise SystemExit(f"Resource {resource_id} not found or not visible.")
    else:
        chosen = resources[0]
    original = {
        "occupied": int(chosen.get("occupied") or 0),
        "reserved": int(chosen.get("reserved") or 0),
        "out_of_service": int(chosen.get("out_of_service") or 0),
    }
    return chosen["id"], int(chosen.get("quantity") or 1), original


async def measure(
    base_url: str,
    ws_url: str,
    medical_id: str,
    password: str,
    updates: int,
    gap_seconds: float,
    resource_id: str | None = None,
    restore: bool = True,
) -> list[Propagation]:
    async with httpx.AsyncClient(base_url=base_url, timeout=30.0) as client:
        token = await _login(client, medical_id, password)
        client.headers["Authorization"] = f"Bearer {token}"
        resource_id, quantity, original = await _pick_resource(client, resource_id)
        print(f"Updating resource {resource_id} (quantity {quantity})")
        print(f"Original counts: {original}" + ("" if restore else "  [will NOT restore]"))

        results: list[Propagation] = []
        try:
            await _measure_loop(
                client, ws_url, resource_id, quantity, updates, gap_seconds, results
            )
        finally:
            # Always put the real counts back, including on Ctrl-C or failure,
            # so a interrupted run does not leave bad capacity data behind.
            if restore:
                try:
                    resp = await client.patch(
                        f"/api/v1/resources/{resource_id}/counts", json=original
                    )
                    resp.raise_for_status()
                    print(f"Restored original counts: {original}")
                except httpx.HTTPError as exc:
                    print(f"WARNING: could not restore counts ({exc}). Set them manually.")

    return results


async def _measure_loop(
    client: httpx.AsyncClient,
    ws_url: str,
    resource_id: str,
    quantity: int,
    updates: int,
    gap_seconds: float,
    results: list[Propagation],
) -> None:
    async with websockets.connect(f"{ws_url}/ws/capacity") as socket:
        # Let the subscription settle before the first update, so the opening
        # handshake isn't charged to the first measurement.
        await asyncio.sleep(0.5)

        for index in range(updates):
            # Alternate occupancy so each PATCH is a genuine state change
            # rather than a no-op the service might short-circuit.
            occupied = index % max(quantity, 1)
            sent_at = time.perf_counter()
            resp = await client.patch(
                f"/api/v1/resources/{resource_id}/counts",
                json={"occupied": occupied, "reserved": 0, "out_of_service": 0},
            )
            resp.raise_for_status()

            # Wait for the broadcast this update caused.
            try:
                while True:
                    raw = await asyncio.wait_for(socket.recv(), timeout=10.0)
                    payload = json.loads(raw)
                    if payload.get("event") == "RESOURCE_UPDATED":
                        break
            except asyncio.TimeoutError:
                raise SystemExit(
                    f"Update {index + 1} never arrived on the capacity channel "
                    "after 10s. Is Redis running and the WebSocket reachable?"
                )

            delay_ms = (time.perf_counter() - sent_at) * 1000
            results.append(Propagation(index=index + 1, delay_ms=delay_ms))
            print(f"  update {index + 1:3d}  {delay_ms:7.1f} ms")
            await asyncio.sleep(gap_seconds)


def write_csv(results: list[Propagation], path: Path) -> None:
    with path.open("w", newline="") as fh:
        writer = csv.writer(fh)
        writer.writerow(["update_number", "propagation_delay_ms"])
        for r in results:
            writer.writerow([r.index, f"{r.delay_ms:.2f}"])


def write_figure(results: list[Propagation], path: Path) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    delays = [r.delay_ms for r in results]
    mean = statistics.fmean(delays)

    fig, ax = plt.subplots(figsize=(8, 5))
    ax.plot(
        [r.index for r in results],
        delays,
        marker="o",
        linewidth=1.6,
        markersize=4,
        label="Propagation delay",
    )
    ax.axhline(
        mean,
        linestyle="--",
        linewidth=1.2,
        color="grey",
        label=f"Mean ({mean:.0f} ms)",
    )

    ax.set_xlabel("Update number")
    ax.set_ylabel("Propagation time (milliseconds)")
    ax.set_title("Resource Availability Update Propagation Delay")
    ax.set_ylim(bottom=0)
    ax.grid(True, linestyle="--", alpha=0.4)
    ax.legend(frameon=False)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=300)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument(
        "--ws-url",
        help="Defaults to the base URL with http:// swapped for ws://",
    )
    parser.add_argument("--medical-id", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--updates", type=int, default=50)
    parser.add_argument(
        "--gap-seconds",
        type=float,
        default=0.2,
        help="Pause between updates so they are measured independently",
    )
    parser.add_argument(
        "--resource-id",
        help="Resource to mutate; defaults to the first one visible. On a live "
        "system, point this at a dedicated test resource.",
    )
    parser.add_argument(
        "--no-restore",
        action="store_true",
        help="Leave the mutated occupancy counts in place instead of restoring them",
    )
    parser.add_argument("--out-dir", type=Path, default=Path("loadtest_results"))
    parser.add_argument("--no-figure", action="store_true")
    args = parser.parse_args()

    ws_url = args.ws_url or args.base_url.replace("https://", "wss://").replace(
        "http://", "ws://"
    )
    args.out_dir.mkdir(parents=True, exist_ok=True)

    results = asyncio.run(
        measure(
            args.base_url,
            ws_url,
            args.medical_id,
            args.password,
            args.updates,
            args.gap_seconds,
            args.resource_id,
            not args.no_restore,
        )
    )

    delays = [r.delay_ms for r in results]
    ordered = sorted(delays)
    print(
        f"\nn={len(delays)}  "
        f"mean={statistics.fmean(delays):.1f}ms  "
        f"median={statistics.median(delays):.1f}ms  "
        f"p95={ordered[min(int(len(ordered) * 0.95), len(ordered) - 1)]:.1f}ms  "
        f"min={ordered[0]:.1f}ms  max={ordered[-1]:.1f}ms"
    )

    csv_path = args.out_dir / "propagation.csv"
    write_csv(results, csv_path)
    print(f"Wrote {csv_path}")
    if not args.no_figure:
        png_path = args.out_dir / "propagation_delay.png"
        write_figure(results, png_path)
        print(f"Wrote {png_path}")


if __name__ == "__main__":
    main()
