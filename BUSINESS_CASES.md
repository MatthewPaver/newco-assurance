# Demonstration business cases

These cases show how Newco Assurance should work. They do not describe paying customers or proven savings.

## 1. Weekly status automation

**Buyer:** Head of Delivery, PMO Director or Head of Data
**Builder:** Project controls analyst
**Trigger:** The programme wants to reuse an AI-built weekly reporting workflow.

The original fixture embeds a credential, sends project facts to an external model, asks the model to write a favourable status and lacks an owner, tests and a failure route.

The corrected fixture:

- calculates date movement in code;
- limits the model to draft wording from minimised facts;
- loads credentials outside source;
- names an owner and backup;
- adds a test and failure behaviour;
- documents the external-service boundary.

**Decision question:** Can colleagues rely on the pack without transferring an unknown data or continuity risk to the programme?

**Pilot measures:**

- reviewer hours before and after the evidence pack;
- number of findings the builder can act on without translation;
- days between first submission and a recorded reliance decision;
- whether the reviewer changes or narrows the intended use;
- whether the corrected workflow returns for reassessment.

## 2. Tender opportunity assistant

**Buyer:** Commercial Director or Head of IT
**Builder:** Commercial intelligence analyst
**Trigger:** A model-generated score is starting to determine where the business spends bid effort.

The fixture uses public [Contracts Finder data](https://www.data.gov.uk/collections/government/contracts-finder). It adds synthetic internal criteria so the demonstration contains no confidential bid information.

The original version lets a model produce the score, evaluates model output as code, exposes a credential, floats dependency versions and retains no source-to-decision trail. An imported Semgrep SARIF result supplies specialist evidence for the dynamic-evaluation finding.

The corrected version:

- scores published fields with deterministic rules;
- separates public notice data from internal assumptions;
- pins dependencies and retains the lock file;
- keeps the source notice identifier;
- requires a Commercial Director to record the bid decision.

**Decision question:** Can the assistant prepare a shortlist without becoming the bid authority?

## 3. Major-project briefing

**Buyer:** Portfolio Director, PMO lead or research team
**Builder:** Portfolio analyst
**Trigger:** A public-data briefing has started to make claims stronger than its source supports.

The fixture uses official [NISTA/GMPP annual releases](https://www.gov.uk/government/collections/major-projects-data).

The original version asks a model to calculate date movement and a failure probability. It has no tests, owner or evidence boundary.

The corrected version:

- calculates observable date movement in code;
- removes failure prediction;
- records the source release for every fact;
- labels the output as a briefing aid;
- adds tests, ownership and a security boundary.

**Decision question:** Can a team use the briefing for investigation without treating it as an authorised project assessment?

## 4. Meeting follow-up workflow

**Buyer:** Delivery assurance lead
**Builder:** Project professional
**Trigger:** A browser tool is becoming the shared record of project commitments.

The original fixture stores approved records in browser storage, has no accountable owner and does not document its security boundary or failure behaviour.

The corrected fixture:

- names the service owner;
- removes retained browser storage from the demonstration;
- documents what the public tool may process;
- handles export failure;
- preserves the existing human approval gate.

**Decision question:** Can the team rely on the record without mistaking a generated draft for a meeting decision?

## Business-case calculation

The live calculator uses only buyer-supplied review and rework assumptions:

```text
review effort value =
workflows × reviews per workflow × review hours × loaded hourly cost

late rework value =
workflows × late rework hours × loaded hourly cost

quantified value pool =
review effort value + late rework value
```

The calculator excludes regulatory fines, hypothetical incidents and unverified productivity claims. A paid pilot must establish what portion of the value pool changes.
