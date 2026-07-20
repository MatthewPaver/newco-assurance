from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field, model_validator


Severity = Literal["critical", "high", "medium", "low"]
Decision = Literal["hold", "personal", "team-conditional"]


class SourceEvidence(BaseModel):
    fileCount: int = Field(ge=0)
    sha256: str = Field(min_length=64, max_length=64)
    skippedFiles: list[dict[str, Any]] = Field(default_factory=list)


class Finding(BaseModel):
    id: str = Field(min_length=1)
    severity: Severity
    title: str = Field(min_length=1)
    file: str = Field(min_length=1)
    line: int | None = Field(default=None, ge=1)
    evidence: str = ""
    evidenceKind: Literal["line", "derived", "absence"]
    provenance: str = Field(min_length=1)

    @model_validator(mode="after")
    def severe_findings_need_inspectable_evidence(self):
        if self.severity in {"critical", "high"}:
            quoted_line = self.evidenceKind == "line" and self.line and self.evidence
            evidenced_absence = self.evidenceKind == "absence" and self.file
            specialist_result = self.evidenceKind == "derived" and self.evidence and self.provenance
            if not (quoted_line or evidenced_absence or specialist_result):
                raise ValueError("severe finding lacks inspectable evidence")
        return self


class AssuranceReport(BaseModel):
    schemaVersion: Literal["newco.scan.v1"]
    workflowName: str = Field(min_length=1)
    result: Literal["Ready", "Conditional", "Hold"]
    score: int = Field(ge=0, le=100)
    source: SourceEvidence
    findings: list[Finding]
    limits: list[str] = Field(min_length=1)


class ReviewCommand(BaseModel):
    decision: Decision
    reviewer: str = Field(min_length=1)
    conditions: str | None = None

    @model_validator(mode="after")
    def conditional_use_needs_conditions(self):
        if self.decision == "team-conditional" and not (self.conditions or "").strip():
            raise ValueError("team-conditional decisions require conditions")
        return self
