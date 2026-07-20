# Newco Assurance

**Production-readiness assurance for AI-built project workflows.**

Newco Assurance helps a non-developer builder and an organisational reviewer decide whether a workflow is safe enough for personal, team or production use. The browser-local product inspects a folder with transparent static rules, imports SARIF evidence from specialist tools, shows exact evidence, maps visible data destinations and creates a human-reviewed assurance record.

## Why this product

AI makes it easy to produce something that works in a demo. The harder questions arrive when another person or a live process begins to rely on it:

- Where does the data go?
- Are credentials or unsafe constructs exposed?
- Are tests and operating instructions present?
- Who owns the workflow if its builder leaves?
- What did the scanner actually inspect?

The output is a pre-flight report, not an automated approval.

## Demonstration cases

The live product includes four share-safe before-and-after cases:

- weekly project reporting;
- tender opportunity triage using public Contracts Finder data;
- major-project briefing using public NISTA/GMPP data;
- evidence-linked meeting follow-up.

Every case loads an original fixture, a documented correction and a separate reassessment. These are demonstration scenarios, not customer case studies.

The repository also contains:

- [`BUSINESS_CASES.md`](BUSINESS_CASES.md) — buyer, trigger, evidence and pilot measures for each case;
- [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) — an eight-minute facilitated walkthrough;
- [`PILOT_OFFER.md`](PILOT_OFFER.md) — the £7,500 + VAT, three-workflow demand-test offer;
- [`CUSTOMER_VALIDATION.md`](CUSTOMER_VALIDATION.md) — interviews, blind report reviews and paid-pilot gates.

## Run

```bash
python3 -m http.server 8000 --directory docs
```

Open `http://localhost:8000`.

## Test

```bash
npm test
python3.11 -m venv .venv
source .venv/bin/activate
python -m pip install -e ".[dev,observability]"
pytest
python scripts/evaluate_release.py
python scripts/langsmith_release.py check
```

Browser QA:

```bash
python3 -m http.server 4175 --directory docs
# in another shell
python3 scripts/browser_qa.py
```

The release suite contains 13 Node tests, 8 Python tests, 20 synthetic LangGraph evaluation cases, static product gates and desktop/mobile/no-JavaScript browser journeys.

## LangGraph and LangSmith

The controlled-pilot reference graph lives under [`src/newco_assurance/`](src/newco_assurance/). It:

- validates the evidence contract;
- rejects unsupported severe claims;
- pauses before any decision;
- limits critical evidence to a Hold decision;
- requires conditions for conditional team use;
- preserves source fingerprints and reassessment deltas.

The observability extra installs `langsmith[openai-agents]`. `scripts/langsmith_release.py` can publish and run the synthetic dataset after `LANGSMITH_API_KEY` is supplied through a secret manager. Do not trace customer content without a recorded client policy, approval and redaction route.

## Prototype boundary

- All folder inspection happens in the current browser.
- Files are read as text and are not uploaded or executed.
- The public product performs deterministic static checks only.
- It checks dependency reproducibility but does not claim a vulnerability database scan.
- It can import SARIF 2.1 findings from established specialist engines.
- The controlled-pilot code includes an explicit-consent Docker adapter with no network, a read-only filesystem, dropped capabilities and resource limits. It is a reference adapter, not a certified sandbox.
- It does not perform penetration testing or legal/compliance certification.
- A production service still needs authenticated storage, retention controls, tenant isolation, operational monitoring and independent human reviewers.

## Relationship to the Newco vault

The private `newco-vault` remains the source of truth for company strategy, method, product scope and gate decisions. This repository is the buildable product surface for the Production-Readiness Scanner.

## Status

Commercial evidence demonstrator and controlled-pilot reference implementation. No paid-client, rebuy or reviewer-calibration evidence exists yet. It is not a multi-tenant service or security certification.

## Licence

MIT.
