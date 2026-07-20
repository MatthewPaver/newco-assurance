const file = (path, content) => ({ path, content, size: new TextEncoder().encode(content).length });

const meetingOriginal = [
  file(
    "MeetingProof/README.md",
    `# MeetingProof

Browser-local evidence-linked meeting follow-up.

## Run
python3 -m http.server 8000 --directory docs

## Boundaries
Notes are processed locally. Missing owners and dates remain missing.
`
  ),
  file("MeetingProof/LICENSE", "MIT License\nCopyright (c) 2026 Matthew Paver"),
  file(
    "MeetingProof/docs/app.js",
    `const notes = document.querySelector("#meetingNotes");
function approve(record) {
  localStorage.setItem("meetingproof:approved:v1", JSON.stringify(record));
}
function clearApproved() {
  localStorage.removeItem("meetingproof:approved:v1");
}
`
  ),
  file(
    "MeetingProof/tests/test_graph.py",
    `def test_export_requires_human_approval():
    assert True

def test_missing_owner_is_not_invented():
    assert True
`
  ),
  file(
    "MeetingProof/docs/index.html",
    `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>MeetingProof</title></head>
<body><main id="workspace">Browser-local meeting review</main></body>
</html>`
  ),
];

const meetingCorrected = [
  ...meetingOriginal.filter((item) => !["MeetingProof/docs/app.js"].includes(item.path)),
  file("MeetingProof/CODEOWNERS", "* @delivery-assurance-owner\n"),
  file(
    "MeetingProof/SECURITY.md",
    `# Security boundary

Synthetic notes only in the public product. Approved records remain in memory and are downloaded by the reviewer.
No network services, credentials or production approval are provided.
`
  ),
  file(
    "MeetingProof/docs/app.js",
    `const notes = document.querySelector("#meetingNotes");
function approve(record) {
  try {
    return JSON.stringify(record);
  } catch (error) {
    throw new Error("The reviewed record could not be prepared.");
  }
}
`
  ),
];

const weeklyOriginal = [
  file(
    "WeeklyStatus/README.md",
    `# Weekly status pack

Combines a project CSV with a model-written summary and emails it to the delivery team.
`
  ),
  file(
    "WeeklyStatus/status_pack.py",
    `import csv
import requests

api_key = "sk-demo-weekly-status-1234567890"

def create_pack(rows):
    prompt = "Write a green project update: " + str(rows)
    return requests.post(
        "https://api.openai.com/v1/responses",
        headers={"Authorization": "Bearer " + api_key},
        json={"input": prompt},
    ).json()
`
  ),
  file(
    "WeeklyStatus/project_status.csv",
    `project,forecast_finish,previous_finish,risk_owner
Northstar,2026-11-12,2026-08-31,
`
  ),
  file("WeeklyStatus/requirements.txt", "requests\n"),
];

const weeklyCorrected = [
  file(
    "WeeklyStatus/README.md",
    `# Weekly status pack

Purpose: calculate observable status changes and prepare a draft narrative for human review.
Owner: PMO Reporting Lead. Backup: Programme Controls Analyst.

## Reliance
Team use only. Dates are calculated in code. Model wording is a draft and cannot set status.

## Failure and rollback
If source validation or the external wording service fails, retain the prior approved pack and raise an error.
`
  ),
  file("WeeklyStatus/CODEOWNERS", "* @pmo-reporting-lead\n"),
  file("WeeklyStatus/LICENSE", "Internal use only\n"),
  file(
    "WeeklyStatus/SECURITY.md",
    `# Security

Use approved redacted project data only. Credentials come from the organisation's secret store.
The external wording service receives calculated, minimised facts and cannot approve the pack.
`
  ),
  file(
    "WeeklyStatus/status_pack.py",
    `from datetime import date

def finish_movement_days(current: date, previous: date) -> int:
    return (current - previous).days

def create_pack(rows, wording_client):
    try:
        facts = [{"project": row["project"], "movement_days": row["movement_days"]} for row in rows]
        return {"facts": facts, "draft": wording_client.explain(facts), "approval": "required"}
    except (KeyError, ValueError) as error:
        raise RuntimeError("Status source failed validation") from error
`
  ),
  file(
    "WeeklyStatus/tests/test_status_pack.py",
    `from datetime import date
from status_pack import finish_movement_days

def test_finish_movement_is_calculated():
    assert finish_movement_days(date(2026, 11, 12), date(2026, 8, 31)) == 73
`
  ),
  file("WeeklyStatus/requirements.txt", "requests>=2.32,<3\n"),
  file(
    "WeeklyStatus/specialist-clean.sarif",
    JSON.stringify({
      version: "2.1.0",
      runs: [{ tool: { driver: { name: "Semgrep" } }, results: [] }],
    })
  ),
];

const tenderOriginal = [
  file(
    "TenderTriage/README.md",
    `# Tender opportunity assistant

Downloads public Contracts Finder notices and automatically chooses which opportunities to pursue.
`
  ),
  file(
    "TenderTriage/app.js",
    `const apiKey = "sk-demo-tender-triage-1234567890";
async function decide(notice) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    body: JSON.stringify({notice, apiKey, instruction: "Return a numeric pursue score"})
  });
  return eval(await response.text());
}
`
  ),
  file(
    "TenderTriage/package.json",
    JSON.stringify({ dependencies: { openai: "latest", zod: "*" } }, null, 2)
  ),
  file(
    "TenderTriage/semgrep.sarif",
    JSON.stringify({
      version: "2.1.0",
      runs: [
        {
          tool: { driver: { name: "Semgrep" } },
          results: [
            {
              ruleId: "javascript.lang.security.audit.eval-detected",
              level: "error",
              message: { text: "Dynamic evaluation of model output" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "TenderTriage/app.js" },
                    region: { startLine: 7 },
                  },
                },
              ],
            },
          ],
        },
      ],
    })
  ),
];

const tenderCorrected = [
  file(
    "TenderTriage/README.md",
    `# Tender opportunity assistant

Retrieves public Contracts Finder notices and prepares an evidence-linked shortlist.
Commercial criteria and arithmetic are deterministic. A Commercial Director records the bid/no-bid decision.
`
  ),
  file("TenderTriage/CODEOWNERS", "* @commercial-intelligence\n"),
  file("TenderTriage/LICENSE", "Internal use only\n"),
  file(
    "TenderTriage/SECURITY.md",
    `# Security boundary

Only public notice fields are retrieved. Internal capacity and margin assumptions remain local.
No model output can set the bid decision.
`
  ),
  file(
    "TenderTriage/app.js",
    `export function scoreNotice(notice, criteria) {
  try {
    const score = criteria.reduce((total, item) => total + Number(notice[item.field] || 0) * item.weight, 0);
    return {score, source: notice.uri, decision: "human-review-required"};
  } catch (error) {
    throw new Error("Tender evidence could not be scored");
  }
}
`
  ),
  file(
    "TenderTriage/tests/app.test.js",
    `import test from "node:test";
import assert from "node:assert/strict";
import { scoreNotice } from "../app.js";

test("retains source and requires a decision", () => {
  const result = scoreNotice({fit: 4, uri: "contracts-finder-source"}, [{field: "fit", weight: 2}]);
  assert.deepEqual(result, {score: 8, source: "contracts-finder-source", decision: "human-review-required"});
});
`
  ),
  file(
    "TenderTriage/package.json",
    JSON.stringify({ type: "module", dependencies: { zod: "4.0.5" } }, null, 2)
  ),
  file(
    "TenderTriage/package-lock.json",
    JSON.stringify({ lockfileVersion: 3, packages: { "": { dependencies: { zod: "4.0.5" } } } }, null, 2)
  ),
];

const gmppOriginal = [
  file(
    "MajorBrief/README.md",
    `# Major project briefing

Uses the public NISTA/GMPP CSV to generate a board briefing and predict whether projects will fail.
Source: https://www.gov.uk/government/collections/major-projects-data
`
  ),
  file(
    "MajorBrief/brief.py",
    `def write_brief(row, model):
    prompt = "Calculate the date movement and failure probability: " + str(row)
    return eval(model(prompt))
`
  ),
  file(
    "MajorBrief/gmpp.csv",
    `project,current_end,previous_end,current_dca
Northstar,2026-11-12,2026-08-31,Amber
`
  ),
];

const gmppCorrected = [
  file(
    "MajorBrief/README.md",
    `# Major project briefing

Uses official NISTA/GMPP releases to calculate observable date and rating movements.
It does not predict failure. Model wording is bounded to explaining already-calculated facts.
Source: https://www.gov.uk/government/collections/major-projects-data
`
  ),
  file("MajorBrief/CODEOWNERS", "* @project-evidence-owner\n"),
  file("MajorBrief/LICENSE", "Open Government Licence source data; internal briefing code\n"),
  file(
    "MajorBrief/SECURITY.md",
    `# Evidence boundary

Public source data only. Calculations are deterministic. Every narrative statement retains its source release.
No output replaces an authorised project assessment or board decision.
`
  ),
  file(
    "MajorBrief/brief.py",
    `from datetime import date

def observable_movement(current: date, previous: date) -> int:
    try:
        return (current - previous).days
    except TypeError as error:
        raise ValueError("Published dates are required") from error

def briefing_fact(project, movement_days, source):
    return {"project": project, "movement_days": movement_days, "source": source, "prediction": None}
`
  ),
  file(
    "MajorBrief/tests/test_brief.py",
    `from datetime import date
from brief import observable_movement

def test_observable_movement():
    assert observable_movement(date(2026, 11, 12), date(2026, 8, 31)) == 73
`
  ),
];

export const SCENARIOS = [
  {
    id: "weekly-status",
    mark: "WS",
    title: "Weekly status automation",
    role: "PMO reporting lead",
    trigger: "A useful AI-built reporting workflow is about to be shared across the programme.",
    intendedReliance: "team",
    owner: "",
    originalDecision: "Hold",
    correctedDecision: "Ready",
    source: { label: "Synthetic project CSV", url: null, kind: "Synthetic" },
    fixes: ["Remove the embedded credential", "Keep date arithmetic in code", "Name the owner and failure route"],
    originalFiles: weeklyOriginal,
    correctedFiles: weeklyCorrected,
  },
  {
    id: "tender-triage",
    mark: "TT",
    title: "Tender opportunity assistant",
    role: "Commercial intelligence lead",
    trigger: "A model-generated score is being used to decide which public opportunities deserve bid effort.",
    intendedReliance: "team",
    owner: "",
    originalDecision: "Hold",
    correctedDecision: "Ready",
    source: {
      label: "Contracts Finder",
      url: "https://www.data.gov.uk/collections/government/contracts-finder",
      kind: "Official public data",
    },
    fixes: ["Remove model-controlled scoring", "Pin the dependency estate", "Retain source and human decision"],
    originalFiles: tenderOriginal,
    correctedFiles: tenderCorrected,
  },
  {
    id: "major-brief",
    mark: "MB",
    title: "Major-project briefing",
    role: "Portfolio analyst",
    trigger: "A public-data briefing makes stronger claims than the annual source can support.",
    intendedReliance: "team",
    owner: "",
    originalDecision: "Conditional",
    correctedDecision: "Ready",
    source: {
      label: "NISTA/GMPP annual releases",
      url: "https://www.gov.uk/government/collections/major-projects-data",
      kind: "Official public data",
    },
    fixes: ["Calculate movements deterministically", "Remove failure predictions", "Retain source and evidence boundary"],
    originalFiles: gmppOriginal,
    correctedFiles: gmppCorrected,
  },
  {
    id: "meeting-proof",
    mark: "MP",
    title: "Meeting follow-up workflow",
    role: "Delivery assurance lead",
    trigger: "A browser tool is becoming the shared record of project commitments.",
    intendedReliance: "team",
    owner: "",
    originalDecision: "Conditional",
    correctedDecision: "Ready",
    source: { label: "Synthetic meeting fixture", url: null, kind: "Synthetic" },
    fixes: ["Name the accountable owner", "Remove retained browser data", "Document the security boundary"],
    originalFiles: meetingOriginal,
    correctedFiles: meetingCorrected,
  },
];

export const SAMPLE_FILES = SCENARIOS.find((scenario) => scenario.id === "meeting-proof").originalFiles;
