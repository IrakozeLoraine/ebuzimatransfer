"""
Builds the manual-vs-prototype referral processing time chart from *observed*
task timings that you collect yourself.

This script deliberately does not invent the manual-process baseline. How long
a phone-mediated referral takes cannot be derived from this codebase — it has
to come from timing real or simulated referrals and recording what you saw.
The same is true of the prototype side: the meaningful number is how long a
clinician takes to complete a referral, not how long the API call takes, so it
is measured with a stopwatch and participants rather than with a load test.

Record observations in a CSV with two columns::

    method,seconds
    Manual,2280
    Manual,1980
    Prototype,214
    Prototype,187

`method` may be any label; every distinct value becomes one bar, showing the
mean with an error bar giving the standard deviation across observations.
Record each observation as its own row so the spread is preserved.

    python scripts/referral_timing.py --observations my_timings.csv
"""
import argparse
import csv
import statistics
from collections import defaultdict
from pathlib import Path

TEMPLATE = """method,seconds
# One row per timed observation. Delete these comment lines before use.
# 'method' is the bar label; 'seconds' is how long that referral took.
Manual,2280
Manual,1980
Manual,2640
Prototype,214
Prototype,187
Prototype,243
"""


def read_observations(path: Path) -> dict[str, list[float]]:
    grouped: dict[str, list[float]] = defaultdict(list)
    with path.open(newline="") as fh:
        rows = [line for line in fh if not line.lstrip().startswith("#")]
    for row in csv.DictReader(rows):
        method = (row.get("method") or "").strip()
        raw = (row.get("seconds") or "").strip()
        if not method or not raw:
            continue
        grouped[method].append(float(raw))
    if not grouped:
        raise SystemExit(f"No usable rows in {path}. Expected columns: method,seconds")
    return dict(grouped)


def write_figure(grouped: dict[str, list[float]], path: Path, unit: str) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    divisor = 60.0 if unit == "minutes" else 1.0
    # Preserve the order methods first appear, so "Manual" stays left of
    # "Prototype" when that is how the observations were recorded.
    labels = list(grouped)
    means = [statistics.fmean(grouped[m]) / divisor for m in labels]
    # Standard deviation needs at least two observations; a single timing gets
    # no error bar rather than a fake zero-width one.
    errors = [
        statistics.stdev(grouped[m]) / divisor if len(grouped[m]) > 1 else 0.0
        for m in labels
    ]
    counts = [len(grouped[m]) for m in labels]

    fig, ax = plt.subplots(figsize=(7, 5))
    bars = ax.bar(
        labels,
        means,
        yerr=errors,
        capsize=6,
        width=0.55,
        color=["#c0504d", "#4f81bd", "#9bbb59", "#8064a2"][: len(labels)],
    )

    for bar, mean, count in zip(bars, means, counts):
        ax.annotate(
            f"{mean:.1f}\n(n={count})",
            (bar.get_x() + bar.get_width() / 2, bar.get_height()),
            textcoords="offset points",
            xytext=(0, 6),
            ha="center",
            fontsize=9,
        )

    ax.set_ylabel(f"Average processing time ({unit})")
    ax.set_title("Referral Processing Time: Manual Process vs Prototype")
    ax.grid(True, axis="y", linestyle="--", alpha=0.4)
    ax.set_axisbelow(True)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    fig.tight_layout()
    fig.savefig(path, dpi=300)
    plt.close(fig)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--observations",
        type=Path,
        help="CSV of observed timings (method,seconds)",
    )
    parser.add_argument(
        "--write-template",
        type=Path,
        help="Write a starter CSV to this path and exit",
    )
    parser.add_argument(
        "--unit",
        choices=["seconds", "minutes"],
        default="minutes",
        help="Y-axis unit; minutes usually reads better for manual workflows",
    )
    parser.add_argument("--out-dir", type=Path, default=Path("loadtest_results"))
    args = parser.parse_args()

    if args.write_template:
        args.write_template.parent.mkdir(parents=True, exist_ok=True)
        args.write_template.write_text(TEMPLATE)
        print(f"Wrote template to {args.write_template}")
        print("Fill it with your own observed timings, then re-run with --observations.")
        return

    if not args.observations:
        parser.error("--observations is required (or use --write-template to start one)")

    grouped = read_observations(args.observations)
    args.out_dir.mkdir(parents=True, exist_ok=True)

    print("Observations:")
    for method, values in grouped.items():
        spread = f" ± {statistics.stdev(values):.1f}s" if len(values) > 1 else ""
        print(f"  {method:12s} n={len(values):<3d} mean={statistics.fmean(values):.1f}s{spread}")

    png_path = args.out_dir / "referral_processing_time.png"
    write_figure(grouped, png_path, args.unit)
    print(f"Wrote {png_path}")


if __name__ == "__main__":
    main()
