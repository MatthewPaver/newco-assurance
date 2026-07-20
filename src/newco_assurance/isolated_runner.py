from __future__ import annotations

import shutil
import subprocess
from pathlib import Path


RUNTIMES = {
    "python": ("python:3.11-alpine", ["python", "/workspace/main.py"]),
    "node": ("node:22-alpine", ["node", "/workspace/main.js"]),
}


def build_docker_command(source: Path, runtime: str) -> list[str]:
    if runtime not in RUNTIMES:
        raise ValueError(f"unsupported runtime: {runtime}")
    resolved = source.resolve(strict=True)
    if not resolved.is_dir():
        raise ValueError("source must be a directory")
    image, command = RUNTIMES[runtime]
    return [
        "docker",
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--memory",
        "256m",
        "--cpus",
        "0.5",
        "--pids-limit",
        "64",
        "--user",
        "65534:65534",
        "--tmpfs",
        "/tmp:rw,noexec,nosuid,size=64m",
        "--mount",
        f"type=bind,src={resolved},dst=/workspace,readonly",
        image,
        *command,
    ]


def run_isolated(
    source: Path,
    runtime: str,
    *,
    explicit_execution_consent: bool = False,
    timeout_seconds: int = 15,
) -> dict[str, object]:
    if not explicit_execution_consent:
        raise PermissionError("explicit execution consent is required")
    if shutil.which("docker") is None:
        raise RuntimeError("Docker is required for the controlled runtime adapter")
    command = build_docker_command(source, runtime)
    completed = subprocess.run(
        command,
        check=False,
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )
    return {
        "runtime": runtime,
        "network": "none",
        "read_only": True,
        "exit_code": completed.returncode,
        "stdout": completed.stdout[-50_000:],
        "stderr": completed.stderr[-50_000:],
    }
