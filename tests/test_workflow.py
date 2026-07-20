from __future__ import annotations

from copy import deepcopy

import pytest
from langgraph.types import Command

from newco_assurance.isolated_runner import build_docker_command, run_isolated
from newco_assurance.workflow import build_graph


def report(*, severity: str = "high", finding_id: str = "OWN-001", result: str = "Conditional"):
    return {
        "schemaVersion": "newco.scan.v1",
        "workflowName": "Weekly status automation",
        "result": result,
        "score": 82,
        "source": {
            "fileCount": 4,
            "sha256": "a" * 64,
            "skippedFiles": [],
        },
        "findings": [
            {
                "id": finding_id,
                "severity": severity,
                "title": "No accountable owner is recorded",
                "file": "Project context",
                "line": None,
                "evidence": "",
                "evidenceKind": "absence",
                "provenance": "Static rule",
            }
        ],
        "limits": ["Pre-filter only; production approval remains external."],
    }


def run_to_review(value=None, thread_id="assurance-1", previous=None):
    graph = build_graph()
    config = {"configurable": {"thread_id": thread_id}}
    state = {"assessment_id": thread_id, "report": value or report()}
    if previous:
        state["previous_report"] = previous
    first = graph.invoke(state, config=config)
    return graph, config, first


def test_graph_pauses_before_any_assurance_decision():
    _, _, first = run_to_review()
    assert "__interrupt__" in first
    assert "final_record" not in first
    assert first["review_status"] == "ready-for-review"


def test_named_reviewer_can_record_conditional_team_use():
    graph, config, _ = run_to_review()
    result = graph.invoke(
        Command(
            resume={
                "decision": "team-conditional",
                "reviewer": "Head of Data",
                "conditions": "No personal data; reassess after a material change.",
            }
        ),
        config=config,
    )
    record = result["final_record"]
    assert record["decision"] == "team-conditional"
    assert record["reviewer"] == "Head of Data"
    assert record["static_indicator"]["calibrated"] is False


def test_critical_finding_can_only_be_held():
    critical = report(severity="critical", finding_id="SEC-002", result="Hold")
    critical["findings"][0].update(
        {
            "title": "Secret-like value is hard-coded",
            "file": "app.py",
            "line": 4,
            "evidence": "[Sensitive value redacted]",
            "evidenceKind": "line",
        }
    )
    graph, config, first = run_to_review(critical)
    assert first["__interrupt__"][0].value["allowed_decisions"] == ["hold"]
    with pytest.raises(ValueError, match="not permitted"):
        graph.invoke(
            Command(
                resume={
                    "decision": "team-conditional",
                    "reviewer": "Reviewer",
                    "conditions": "Ignore the critical finding.",
                }
            ),
            config=config,
        )


def test_team_conditional_decision_requires_conditions():
    graph, config, _ = run_to_review()
    with pytest.raises(ValueError, match="require conditions"):
        graph.invoke(
            Command(
                resume={
                    "decision": "team-conditional",
                    "reviewer": "Reviewer",
                    "conditions": "",
                }
            ),
            config=config,
        )


def test_invalid_severe_claim_never_reaches_human_gate():
    invalid = report()
    invalid["findings"][0]["evidenceKind"] = "derived"
    _, _, result = run_to_review(invalid)
    assert "__interrupt__" not in result
    assert result["review_status"] == "invalid"
    assert result["validation_errors"]
    assert "final_record" not in result


def test_reassessment_preserves_previous_source_and_resolved_findings():
    previous = report()
    corrected = deepcopy(previous)
    corrected["source"]["sha256"] = "b" * 64
    corrected["findings"] = []
    corrected["result"] = "Ready"
    corrected["score"] = 100
    graph, config, _ = run_to_review(corrected, previous=previous)
    result = graph.invoke(
        Command(resume={"decision": "personal", "reviewer": "Delivery reviewer"}),
        config=config,
    )
    record = result["final_record"]
    assert record["previous_source_sha256"] == "a" * 64
    assert record["source_sha256"] == "b" * 64
    assert record["resolved_finding_ids"] == ["OWN-001"]


def test_runtime_adapter_builds_a_bounded_docker_command(tmp_path):
    command = build_docker_command(tmp_path, "python")
    assert command[:3] == ["docker", "run", "--rm"]
    assert ["--network", "none"] == command[3:5]
    assert "--read-only" in command
    assert "--cap-drop" in command
    assert "ALL" in command
    assert "no-new-privileges" in command
    assert command[-2:] == ["python", "/workspace/main.py"]


def test_runtime_adapter_refuses_execution_without_explicit_consent(tmp_path):
    with pytest.raises(PermissionError, match="explicit execution consent"):
        run_isolated(tmp_path, "python")
