from __future__ import annotations

from typing import Any, TypedDict

from langgraph.checkpoint.memory import InMemorySaver
from langgraph.graph import END, START, StateGraph
from langgraph.types import interrupt

from .schema import AssuranceReport, ReviewCommand


class AssuranceState(TypedDict, total=False):
    assessment_id: str
    report: dict[str, Any]
    previous_report: dict[str, Any]
    validation_errors: list[str]
    review_status: str
    reviewer: str
    decision: str
    conditions: str | None
    final_record: dict[str, Any]


def _validate_report(state: AssuranceState) -> AssuranceState:
    try:
        report = AssuranceReport.model_validate(state["report"])
    except Exception as error:
        return {"validation_errors": [str(error)], "review_status": "invalid"}

    errors: list[str] = []
    if report.result == "Hold" and not any(
        finding.severity in {"critical", "high"} for finding in report.findings
    ):
        errors.append("Hold result has no critical or high finding")
    return {
        "report": report.model_dump(),
        "validation_errors": errors,
        "review_status": "ready-for-review" if not errors else "invalid",
    }


def _allowed_decisions(report: AssuranceReport) -> list[str]:
    if any(finding.severity == "critical" for finding in report.findings):
        return ["hold"]
    return ["hold", "personal", "team-conditional"]


def _review(state: AssuranceState) -> AssuranceState:
    if state.get("validation_errors"):
        return {"review_status": "invalid"}

    report = AssuranceReport.model_validate(state["report"])
    allowed = _allowed_decisions(report)
    response = interrupt(
        {
            "assessment_id": state.get("assessment_id"),
            "workflow_name": report.workflowName,
            "source_sha256": report.source.sha256,
            "result": report.result,
            "findings": [finding.model_dump() for finding in report.findings],
            "skipped_files": report.source.skippedFiles,
            "allowed_decisions": allowed,
            "production_decision_available": False,
        }
    )
    command = ReviewCommand.model_validate(response)
    if command.decision not in allowed:
        raise ValueError(
            f"{command.decision} is not permitted for this evidence; allowed: {', '.join(allowed)}"
        )
    return {
        "review_status": "reviewed",
        "reviewer": command.reviewer,
        "decision": command.decision,
        "conditions": command.conditions,
    }


def _finalize(state: AssuranceState) -> AssuranceState:
    if state.get("review_status") != "reviewed":
        return {}

    report = AssuranceReport.model_validate(state["report"])
    previous = (
        AssuranceReport.model_validate(state["previous_report"])
        if state.get("previous_report")
        else None
    )
    current_ids = {finding.id for finding in report.findings}
    previous_ids = {finding.id for finding in previous.findings} if previous else set()
    return {
        "final_record": {
            "schema_version": "newco.assurance-decision.v1",
            "assessment_id": state.get("assessment_id"),
            "workflow_name": report.workflowName,
            "source_sha256": report.source.sha256,
            "previous_source_sha256": previous.source.sha256 if previous else None,
            "scanner_result": report.result,
            "static_indicator": {
                "value": report.score,
                "calibrated": False,
            },
            "decision": state.get("decision"),
            "reviewer": state.get("reviewer"),
            "conditions": state.get("conditions"),
            "skipped_files": report.source.skippedFiles,
            "resolved_finding_ids": sorted(previous_ids - current_ids),
            "limits": report.limits,
        }
    }


def build_graph():
    builder = StateGraph(AssuranceState)
    builder.add_node("validate_report", _validate_report)
    builder.add_node("human_review", _review)
    builder.add_node("finalize", _finalize)
    builder.add_edge(START, "validate_report")
    builder.add_edge("validate_report", "human_review")
    builder.add_edge("human_review", "finalize")
    builder.add_edge("finalize", END)
    return builder.compile(checkpointer=InMemorySaver())
