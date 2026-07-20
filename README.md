# Newco Assurance

**Production-readiness assurance for AI-built project workflows.**

Newco Assurance helps a non-developer builder and an organisational reviewer decide whether a workflow is safe enough for personal, team or production use. The browser-local prototype inspects a folder with transparent static rules, shows exact evidence, maps visible data destinations and creates a human-reviewed assurance record.

## Why this product

AI makes it easy to produce something that works in a demo. The harder questions arrive when another person or a live process begins to rely on it:

- Where does the data go?
- Are credentials or unsafe constructs exposed?
- Are tests and operating instructions present?
- Who owns the workflow if its builder leaves?
- What did the scanner actually inspect?

The output is a pre-flight report, not an automated approval.

## Run

```bash
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000`.

## Test

```bash
npm test
python3 scripts/browser_qa.py
```

The browser QA script expects the site at `http://127.0.0.1:4175`; the GitHub Actions workflow runs validation and deploys `docs/` to Pages.

## Prototype boundary

- All folder inspection happens in the current browser.
- Files are read as text and are not uploaded or executed.
- The prototype performs deterministic static checks only.
- It does not perform dependency-vulnerability analysis, runtime isolation, penetration testing or legal/compliance certification.
- A production pilot would add isolated workers, authenticated storage, explicit retention, independent human review and established analysis engines.
- LangGraph is appropriate for durable remediation/review pause-and-resume in the controlled pilot. LangSmith should receive synthetic or explicitly authorised/redacted traces only.

## Relationship to the Newco vault

The private `newco-vault` remains the source of truth for company strategy, method, product scope and gate decisions. This repository is the buildable product surface for the Production-Readiness Scanner.

## Status

Public product prototype. Not yet a commercial multi-tenant service and not a security certification.

## Licence

MIT.
