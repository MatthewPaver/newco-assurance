#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from newco_assurance.evaluation import run_release_evaluation


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Run Newco Assurance's deterministic synthetic release evaluation."
    )
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = run_release_evaluation()
    print(
        f"Newco Assurance release evaluation: {report['passed']}/{report['cases']} passed "
        f"({report['pass_rate']:.0%})."
    )
    for result in report["results"]:
        if not result["passed"]:
            print(
                f"FAIL {result['id']}: expected={result['expected']} "
                f"actual={result['actual']}"
            )
    if args.output:
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print(f"Report written to {args.output}")
    return 0 if report["failed"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
