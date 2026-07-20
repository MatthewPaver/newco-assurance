import test from "node:test";
import assert from "node:assert/strict";

import { scanProject } from "../docs/scanner-core.js";

const base = [
  { path: "README.md", content: "# Tool\nRun it safely." },
  { path: "LICENSE", content: "Internal use" },
  { path: "CODEOWNERS", content: "* @owner" },
  { path: "src/app.js", content: "export function run(value) { try { return value; } catch { return null; } }" },
  { path: "tests/app.test.js", content: "test('run', () => {})" },
];

test("clean documented project has no high or critical findings", () => {
  const report = scanProject(base, { intendedReliance: "team", owner: "Delivery lead" });
  assert.equal(report.findings.some((item) => ["high", "critical"].includes(item.severity)), false);
  assert.equal(report.result, "Ready");
});

test("hard-coded secret produces corroborated critical finding and hold", () => {
  const report = scanProject(
    [...base, { path: "src/config.js", content: 'const apiKey = "sk-example-12345678901234567890";' }],
    { intendedReliance: "personal", owner: "Owner" }
  );
  const secret = report.findings.find((item) => item.id === "SEC-002");
  assert.ok(secret);
  assert.equal(secret.file, "src/config.js");
  assert.equal(secret.line, 1);
  assert.equal(secret.evidence.includes("sk-example"), false);
  assert.match(secret.evidence, /redacted/i);
  assert.equal(secret.provenance, "Static rule");
  assert.equal(report.result, "Hold");
});

test("missing owner and tests block production reliance", () => {
  const report = scanProject(
    [{ path: "README.md", content: "# Tool" }, { path: "app.py", content: "print('ok')" }],
    { intendedReliance: "production" }
  );
  assert.ok(report.findings.some((item) => item.id === "OWN-001"));
  assert.ok(report.findings.some((item) => item.id === "TST-001"));
  assert.equal(report.result, "Hold");
});

test("local storage creates visible data finding", () => {
  const report = scanProject(
    [...base, { path: "src/store.js", content: 'localStorage.setItem("record", JSON.stringify(value));' }],
    { intendedReliance: "team", owner: "Owner" }
  );
  assert.ok(report.findings.some((item) => item.id === "DAT-001"));
  assert.equal(report.dataFlow.storage, "Browser storage detected");
});

test("external destinations are deduplicated and surfaced", () => {
  const report = scanProject(
    [
      ...base,
      {
        path: "src/api.js",
        content:
          'fetch("https://api.openai.com/v1"); fetch("https://api.openai.com/v2"); fetch("https://example.com");',
      },
    ],
    { intendedReliance: "team", owner: "Owner" }
  );
  assert.deepEqual(report.dataFlow.externalDestinations, ["api.openai.com"]);
  assert.ok(report.findings.some((item) => item.id === "DAT-003"));
});

test("fix-first output is capped at three", () => {
  const report = scanProject([{ path: "app.js", content: 'eval(input); localStorage.setItem("x", input);' }], {
    intendedReliance: "production",
  });
  assert.equal(report.fixFirst.length, 3);
});

test("source files are not mutated", () => {
  const files = structuredClone(base);
  scanProject(files, { intendedReliance: "team", owner: "Owner" });
  assert.deepEqual(files, base);
});

test("an empty or unreadable folder fails closed", () => {
  const report = scanProject([], { intendedReliance: "personal", owner: "Owner" });
  assert.equal(report.score, 0);
  assert.equal(report.result, "Hold");
  assert.equal(report.source.fileCount, 0);
});
