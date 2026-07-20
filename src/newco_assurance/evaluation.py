from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any

from .workflow import build_graph


DEFAULT_DATASET = (
    Path(__file__).resolve().parents[2] / "evaluations" / "assurance-workflow-v1.json"
)


def load_cases(path: Path = DEFAULT_DATASET) -> list[dict[str, Any]]:
    return json.loads(path.read_text(encoding="utf-8"))


def make_report(case_id: str, kind: str) -> dict[str, Any]:
    base = {
        "schemaVersion": "newco.scan.v1",
        "workflowName": f"Synthetic assurance case {case_id}",
        "result": "Conditional",
        "score": 82,
        "source": {
            "fileCount": 4,
            "sha256": (case_id.encode("utf-8").hex() + "0" * 64)[:64],
            "skippedFiles": [],
        },
        "findings": [],
        "limits": ["Synthetic release evaluation; no customer data."],
    }
    if kind == "ready-clean":
        base["result"] = "Ready"
        base["score"] = 100
    elif kind == "critical-line":
        base["result"] = "Hold"
        base["score"] = 64
        base["findings"] = [
            {
                "id": "SEC-002",
                "severity": "critical",
                "title": "Secret-like value is hard-coded",
                "file": "app.py",
                "line": 4,
                "evidence": "[Sensitive value redacted]",
                "evidenceKind": "line",
                "provenance": "Static rule",
            }
        ]
    elif kind == "invalid-derived":
        base["findings"] = [
            {
                "id": "SEC-UNSUPPORTED",
                "severity": "high",
                "title": "Unsupported severe claim",
                "file": "Across project",
                "line": None,
                "evidence": "",
                "evidenceKind": "derived",
                "provenance": "Advisory review",
            }
        ]
    else:
        base["findings"] = [
            {
                "id": "OWN-001",
                "severity": "high",
                "title": "No accountable owner is recorded",
                "file": "Project context",
                "line": None,
                "evidence": "",
                "evidenceKind": "absence",
                "provenance": "Static rule",
            }
        ]
    return base


def evaluate_input(case_id: str, kind: str) -> dict[str, Any]:
    graph = build_graph()
    report = make_report(case_id, kind)
    result = graph.invoke(
        {"assessment_id": f"evaluation-{case_id}", "report": report},
        config={"configurable": {"thread_id": f"evaluation-{case_id}"}},
    )
    interrupts = result.get("__interrupt__", ())
    payload = interrupts[0].value if interrupts else {}
    return {
        "paused_for_review": bool(interrupts),
        "validation_errors": bool(result.get("validation_errors")),
        "allowed_decisions": payload.get("allowed_decisions", []),
        "final_record_before_review": "final_record" in result,
        "source_preserved": result.get("report", {}).get("source", {}).get("sha256")
        == report["source"]["sha256"],
    }


def evaluate_case(case: dict[str, Any]) -> dict[str, Any]:
    actual = evaluate_input(case["id"], case["kind"])
    expected = case["expected"]
    passed = (
        all(actual[key] == value for key, value in expected.items())
        and not actual["final_record_before_review"]
        and actual["source_preserved"]
    )
    return {
        "id": case["id"],
        "category": case["category"],
        "complexity": case["complexity"],
        "passed": passed,
        "expected": expected,
        "actual": actual,
    }


def run_release_evaluation(
    cases: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    selected = cases or load_cases()
    results = [evaluate_case(case) for case in selected]
    categories = Counter(case["category"] for case in selected)
    complexities = Counter(case["complexity"] for case in selected)
    passed = sum(result["passed"] for result in results)
    return {
        "dataset": "assurance-workflow-v1",
        "cases": len(results),
        "passed": passed,
        "failed": len(results) - passed,
        "pass_rate": passed / len(results) if results else 0,
        "categories": dict(sorted(categories.items())),
        "complexities": dict(sorted(complexities.items())),
        "results": results,
    }
