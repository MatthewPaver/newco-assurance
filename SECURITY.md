# Security

Newco Assurance is currently a public, browser-local prototype. Do not use it as a security certification or production approval.

If you believe you have found a vulnerability, do not open a public issue containing credentials, personal data or exploitable details. Contact `mattpaver@outlook.com` with the subject “Newco Assurance security report”.

The public product reads selected text files in the current browser. It does not upload or execute them. Generated reports redact secret-like evidence but still contain filenames, line numbers, skipped-file paths and project metadata; review an export before sharing it.

SARIF files are treated as untrusted evidence. The product parses bounded result fields and does not execute tool output.

`src/newco_assurance/isolated_runner.py` is a controlled-pilot reference adapter. It requires explicit execution consent and Docker. It constructs a container with no network, a read-only root and source mount, dropped capabilities, `no-new-privileges`, a non-root user and CPU, memory, process and time limits. These controls reduce exposure but do not make unknown code safe or provide certified isolation. Run only approved, sanitised artefacts in an environment authorised by the client.

LangSmith tooling defaults to synthetic release cases. Do not enable tracing for client workflows until the client approves the data route, retention, workspace access and redaction policy.
