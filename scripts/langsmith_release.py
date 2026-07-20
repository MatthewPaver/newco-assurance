#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
from typing import Any
from uuid import NAMESPACE_URL, uuid5

from newco_assurance.evaluation import evaluate_input, load_cases


DATASET_NAME = "newco-assurance-workflow-v1-synthetic"
PROJECT_NAME = "newco-assurance-synthetic"


def connection_status() -> dict[str, Any]:
    integration = False
    try:
        from agents import Agent, Runner, set_trace_processors  # noqa: F401
        from langsmith.integrations.openai_agents_sdk import (  # noqa: F401
            OpenAIAgentsTracingProcessor,
        )

        integration = True
    except ImportError:
        pass
    return {
        "langsmith_api_key": bool(os.getenv("LANGSMITH_API_KEY")),
        "workspace_id": bool(os.getenv("LANGSMITH_WORKSPACE_ID")),
        "openai_agents_integration": integration,
        "dataset": DATASET_NAME,
        "project": os.getenv("LANGSMITH_PROJECT", PROJECT_NAME),
        "data_policy": "synthetic-only unless client approval and redaction are recorded",
    }


def require_langsmith_key() -> None:
    if not os.getenv("LANGSMITH_API_KEY"):
        raise SystemExit(
            "LANGSMITH_API_KEY is not set. Add it through your shell or secret manager; "
            "never commit it or customer workflow content."
        )


def publish_dataset() -> None:
    from langsmith import Client

    require_langsmith_key()
    client = Client()
    if not client.has_dataset(dataset_name=DATASET_NAME):
        client.create_dataset(
            dataset_name=DATASET_NAME,
            description=(
                "Synthetic Newco Assurance human-gate cases covering inspectable evidence, "
                "critical holds and unsupported severe claims. Contains no customer artefacts."
            ),
            data_type="kv",
        )
    cases = load_cases()
    client.create_examples(
        dataset_name=DATASET_NAME,
        examples=[
            {
                "id": str(uuid5(NAMESPACE_URL, f"newco-assurance-v1:{case['id']}")),
                "inputs": {"case_id": case["id"], "kind": case["kind"]},
                "outputs": case["expected"],
                "metadata": {
                    "case_id": case["id"],
                    "category": case["category"],
                    "complexity": case["complexity"],
                    "dataset_version": "assurance-workflow-v1",
                    "synthetic": True,
                },
            }
            for case in cases
        ],
    )
    print(f"Published {len(cases)} synthetic cases to {DATASET_NAME}.")


def run_experiment() -> None:
    from langsmith import evaluate

    require_langsmith_key()

    def target(inputs: dict[str, Any]) -> dict[str, Any]:
        return evaluate_input(inputs["case_id"], inputs["kind"])

    def review_gate(run, example) -> dict[str, Any]:
        expected = example.outputs or {}
        actual = run.outputs or {}
        passed = all(actual.get(key) == value for key, value in expected.items())
        return {"key": "expected_review_gate", "score": int(passed)}

    def no_silent_decision(run, _example) -> dict[str, Any]:
        outputs = run.outputs or {}
        passed = not outputs.get("final_record_before_review") and outputs.get("source_preserved")
        return {"key": "no_silent_decision", "score": int(bool(passed))}

    results = evaluate(
        target,
        data=DATASET_NAME,
        evaluators=[review_gate, no_silent_decision],
        experiment_prefix="newco-assurance-release",
        description="Synthetic human-gate and evidence-integrity release evaluation.",
        metadata={"dataset_version": "assurance-workflow-v1", "synthetic_only": True},
        max_concurrency=2,
    )
    print(results)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Check, publish or evaluate Newco Assurance with LangSmith."
    )
    parser.add_argument(
        "action",
        choices=("check", "publish-dataset", "run-experiment"),
        nargs="?",
        default="check",
    )
    args = parser.parse_args()
    if args.action == "check":
        for key, value in connection_status().items():
            print(f"{key}: {value}")
    elif args.action == "publish-dataset":
        publish_dataset()
    else:
        run_experiment()


if __name__ == "__main__":
    main()
