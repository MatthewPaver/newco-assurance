import { scanProject, sha256 } from "./scanner-core.js";
import { SCENARIOS } from "./samples.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

// BA-facing labels — map engine severities without touching scanner-core
const SEVERITY_BA = {
  critical: { label: "Blocks go-live", meaning: "Do not put this near live customers or live data until fixed." },
  high: { label: "Serious — fix soon", meaning: "Likely to fail an IT or Data review." },
  medium: { label: "Needs attention", meaning: "Should be on the action list before wider rollout." },
  low: { label: "Note", meaning: "Worth recording; not usually a hard stop on its own." },
};

// Plain-English control themes grouped by inspection dimension
const DIMENSION_WHY = {
  Security: "Credential security and unsafe constructs — themes IT already audit.",
  "Data & privacy": "Where data leaves the organisation and what is retained locally.",
  Robustness: "Predictable failure handling when inputs or services break.",
  Documentation: "Whether a newcomer can understand boundaries and limits.",
  Ownership: "Who is accountable when something goes wrong in live use.",
  Tests: "Whether changes can be checked before wider reliance.",
};

const CHECK_STEPS = [
  { label: "Secrets left in the tool", detail: "Keys and passwords that should never be shared" },
  { label: "Customer data leaving the organisation", detail: "Personal details sent to external AI services" },
  { label: "Linking issues to known controls", detail: "So IT and Data can act without a jargon debate" },
];

const state = {
  files: [],
  report: null,
  record: null,
  findingFilter: "all",
  scenario: null,
  scenarioPhase: null,
  baselineReport: null,
  selectedScenarioId: null,
};

const folderInput = $("#folderInput");
const reportElement = $("#report");
const reportEmpty = $("#reportEmpty");
const checkPanel = $("#checkPanel");
const approveButton = $("#approveReport");

function escapeMarkdown(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function humanBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function money(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Stage rail: 1 Choose → 2 Check → 3 Answer → 4 Why → 5 Take away
function setStage(stage) {
  $$("[data-stage-marker]").forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.stageMarker) <= stage);
  });
}

function setReliance(value) {
  const input = $(`input[name="reliance"][value="${value}"]`);
  if (input) input.checked = true;
}

function severityBa(severity) {
  return SEVERITY_BA[severity] || SEVERITY_BA.medium;
}

function sponsorVerdict(result) {
  if (result === "Hold") {
    return { word: "Hold", hint: "Not ready for live use", lede: "Not ready for live use yet — blocking issues found." };
  }
  if (result === "Conditional") {
    return { word: "Conditional", hint: "Use with agreed fixes", lede: "Can proceed with conditions — fix the action list first." };
  }
  return { word: "Ready", hint: "No blocking issues in this check", lede: "No blocking issues in this check — IT and Data still own the gate." };
}

function renderScannerScenarios() {
  const grid = $("#scannerScenarioGrid");
  grid.replaceChildren();
  SCENARIOS.forEach((scenario) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "scanner-scenario";
    button.dataset.scenarioId = scenario.id;
    if (state.selectedScenarioId === scenario.id) button.classList.add("is-selected");

    const mark = document.createElement("span");
    mark.className = "scanner-scenario-mark";
    mark.textContent = scenario.mark;

    const body = document.createElement("span");
    body.className = "scanner-scenario-body";
    const title = document.createElement("b");
    title.textContent = scenario.title;
    const expect = document.createElement("small");
    expect.textContent = `Expected: ${scenario.originalDecision}`;
    body.append(title, expect);

    button.append(mark, body);
    button.addEventListener("click", () => {
      state.selectedScenarioId = scenario.id;
      $$(".scanner-scenario").forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      selectScenario(scenario.id, "original");
    });
    grid.append(button);
  });
}

function renderScenarioGrid() {
  const grid = $("#scenarioGrid");
  grid.replaceChildren();
  SCENARIOS.forEach((scenario, index) => {
    const article = document.createElement("article");
    const top = document.createElement("div");
    const mark = document.createElement("span");
    const indexLabel = document.createElement("small");
    const title = document.createElement("h3");
    const trigger = document.createElement("p");
    const meta = document.createElement("dl");
    const role = document.createElement("div");
    const roleTerm = document.createElement("dt");
    const roleValue = document.createElement("dd");
    const evidence = document.createElement("div");
    const evidenceTerm = document.createElement("dt");
    const evidenceValue = document.createElement("dd");
    const path = document.createElement("div");
    const original = document.createElement("span");
    const arrow = document.createElement("i");
    const corrected = document.createElement("span");
    const button = document.createElement("button");

    article.className = "case-card";
    article.dataset.scenarioId = scenario.id;
    top.className = "case-card-top";
    mark.className = "case-mark";
    mark.textContent = scenario.mark;
    indexLabel.textContent = String(index + 1).padStart(2, "0");
    top.append(mark, indexLabel);
    title.textContent = scenario.title;
    trigger.textContent = scenario.trigger;
    roleTerm.textContent = "User";
    roleValue.textContent = scenario.role;
    role.append(roleTerm, roleValue);
    evidenceTerm.textContent = "Evidence";
    evidenceValue.textContent = `${scenario.source.kind} · ${scenario.source.label}`;
    evidence.append(evidenceTerm, evidenceValue);
    meta.append(role, evidence);
    path.className = "case-decision-path";
    original.textContent = scenario.originalDecision;
    arrow.textContent = "→ fixes →";
    corrected.textContent = scenario.correctedDecision;
    path.append(original, arrow, corrected);
    button.className = "button outline";
    button.type = "button";
    button.textContent = "Run original case";
    button.addEventListener("click", () => selectScenario(scenario.id, "original"));
    article.append(top, title, trigger, meta, path, button);
    grid.append(article);
  });
}

function renderActiveCase() {
  const panel = $("#activeCase");
  if (!state.scenario) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $("#activeCaseTitle").textContent = state.scenario.title;
  $("#activeCaseTrigger").textContent = state.scenario.trigger;
  $("#activeCaseRole").textContent = state.scenario.role;
  $("#activeCaseSource").replaceChildren();
  if (state.scenario.source.url) {
    const link = document.createElement("a");
    link.href = state.scenario.source.url;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = state.scenario.source.label;
    $("#activeCaseSource").append(link);
  } else {
    $("#activeCaseSource").textContent = state.scenario.source.label;
  }
  $("#activeCaseType").textContent =
    state.scenarioPhase === "corrected" ? "DOCUMENTED CORRECTION · REASSESSMENT" : "ORIGINAL WORKFLOW · DEMONSTRATION";
}

async function showChecking(label) {
  setStage(2);
  reportEmpty.hidden = true;
  reportElement.hidden = true;
  checkPanel.hidden = false;
  $("#checkTarget").textContent = label;
  const list = $("#checkList");
  list.replaceChildren();

  const nodes = CHECK_STEPS.map((step) => {
    const item = document.createElement("li");
    const strong = document.createElement("strong");
    strong.textContent = step.label;
    const span = document.createElement("span");
    span.textContent = step.detail;
    const em = document.createElement("em");
    em.textContent = "Waiting";
    item.append(strong, span, em);
    list.append(item);
    return { item, em };
  });

  for (let index = 0; index < nodes.length; index += 1) {
    nodes[index].item.classList.add("is-running");
    nodes[index].em.textContent = "Checking…";
    $("#checkStatus").textContent = CHECK_STEPS[index].label;
    await sleep(320);
    nodes[index].item.classList.remove("is-running");
    nodes[index].item.classList.add("is-done");
    nodes[index].em.textContent = "Done";
  }
  $("#checkStatus").textContent = "Preparing the sponsor answer…";
  await sleep(220);
}

async function selectScenario(id, phase) {
  const scenario = SCENARIOS.find((item) => item.id === id);
  if (!scenario) return;
  state.scenario = scenario;
  state.scenarioPhase = phase;
  state.selectedScenarioId = id;
  if (phase === "original") state.baselineReport = null;
  setReliance(scenario.intendedReliance);
  $("#workflowName").value = scenario.title;
  $("#workflowOwner").value = phase === "corrected" ? `${scenario.role} (named owner)` : scenario.owner;
  renderActiveCase();
  renderScannerScenarios();
  const files = phase === "corrected" ? scenario.correctedFiles : scenario.originalFiles;
  await runScan(files, `${scenario.title} · ${phase} fixture`, {}, `${scenario.title}`);
  $("#scanner").scrollIntoView({ behavior: "smooth", block: "start" });
}

function selectedReliance() {
  return $('input[name="reliance"]:checked')?.value || "team";
}

function severityRank(severity) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity] || 0;
}

function resultClass(result) {
  return result.toLowerCase();
}

function makeMetric(value, label) {
  const cell = document.createElement("div");
  const number = document.createElement("b");
  const text = document.createElement("span");
  number.textContent = String(value);
  text.textContent = label;
  cell.append(number, text);
  return cell;
}

function renderFixFirst() {
  const list = $("#fixFirstList");
  list.replaceChildren();
  if (!state.report.fixFirst.length) {
    const item = document.createElement("li");
    const mark = document.createElement("span");
    const body = document.createElement("div");
    const title = document.createElement("b");
    const detail = document.createElement("p");
    mark.textContent = "✓";
    title.textContent = "No priority gaps found by active rules";
    detail.textContent = "Review coverage and limits before choosing reliance.";
    body.append(title, detail);
    item.append(mark, body);
    list.append(item);
    return;
  }
  state.report.fixFirst.forEach((finding, index) => {
    const item = document.createElement("li");
    const number = document.createElement("span");
    const body = document.createElement("div");
    const title = document.createElement("b");
    const action = document.createElement("p");
    const sev = document.createElement("small");
    number.textContent = String(index + 1).padStart(2, "0");
    title.textContent = finding.title;
    action.textContent = finding.action;
    sev.className = "fix-sev";
    sev.textContent = severityBa(finding.severity).label;
    body.append(title, sev, action);
    item.append(number, body);
    list.append(item);
  });
}

function renderWhyMatters() {
  const host = $("#whyCards");
  host.replaceChildren();
  const grouped = {};
  state.report.findings.forEach((finding) => {
    grouped[finding.dimension] = (grouped[finding.dimension] || 0) + 1;
  });
  const dimensions = Object.keys(grouped);
  if (!dimensions.length) {
    const empty = document.createElement("p");
    empty.className = "why-empty";
    empty.textContent = "No control themes were hit on this run.";
    host.append(empty);
    return;
  }
  dimensions.forEach((dimension) => {
    const card = document.createElement("article");
    card.className = "why-card";
    const title = document.createElement("b");
    title.textContent = dimension;
    const count = document.createElement("span");
    count.textContent = `${grouped[dimension]} related issue${grouped[dimension] === 1 ? "" : "s"}`;
    const plain = document.createElement("p");
    plain.textContent = DIMENSION_WHY[dimension] || "A theme IT and Data already recognise.";
    card.append(title, count, plain);
    host.append(card);
  });
}

function findingVisible(finding) {
  if (state.findingFilter === "all") return true;
  if (state.findingFilter === "high") return severityRank(finding.severity) >= 3;
  return finding.dimension === state.findingFilter;
}

function renderFindings() {
  const list = $("#findingList");
  list.replaceChildren();
  const visible = state.report.findings.filter(findingVisible);
  if (!visible.length) {
    const empty = document.createElement("p");
    empty.className = "finding-empty";
    empty.textContent = "No findings match this view.";
    list.append(empty);
    return;
  }

  visible.forEach((finding) => {
    const card = document.createElement("article");
    card.className = `finding-card severity-${finding.severity}`;
    const top = document.createElement("div");
    top.className = "finding-top";
    const identity = document.createElement("span");
    identity.textContent = `${finding.id} · ${finding.dimension}`;
    const severity = document.createElement("b");
    severity.textContent = severityBa(finding.severity).label;
    top.append(identity, severity);

    const title = document.createElement("h5");
    title.textContent = finding.title;
    const why = document.createElement("p");
    why.textContent = finding.why;
    const meaning = document.createElement("p");
    meaning.className = "finding-meaning";
    meaning.textContent = severityBa(finding.severity).meaning;

    const tech = document.createElement("details");
    tech.className = "finding-tech";
    const summary = document.createElement("summary");
    summary.textContent = "Where it showed up (for IT)";
    const evidence = document.createElement("div");
    evidence.className = "finding-evidence";
    const location = document.createElement("span");
    location.textContent = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    const quote = document.createElement("code");
    quote.textContent = finding.evidence || "Project-level absence";
    evidence.append(location, quote);
    tech.append(summary, evidence);

    const footer = document.createElement("div");
    footer.className = "finding-footer";
    const provenance = document.createElement("span");
    provenance.textContent = finding.provenance;
    const action = document.createElement("p");
    action.textContent = finding.action;
    footer.append(provenance, action);

    card.append(top, title, why, meaning, tech, footer);
    list.append(card);
  });
}

function renderCoverage() {
  const coverage = $("#coverageList");
  coverage.replaceChildren();
  state.report.coverage.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = `${item.name}: ${item.mode}`;
    coverage.append(li);
  });

  const limits = $("#limitsList");
  limits.replaceChildren();
  state.report.limits.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    limits.append(li);
  });

  const fileCoverage = $("#fileCoverageList");
  fileCoverage.replaceChildren();
  const included = document.createElement("li");
  included.textContent = `${state.report.source.fileCount} selected text files inspected (${humanBytes(
    state.report.source.byteCount
  )}).`;
  fileCoverage.append(included);
  if (state.report.source.skippedFiles.length) {
    state.report.source.skippedFiles.slice(0, 8).forEach((item) => {
      const li = document.createElement("li");
      li.textContent = `${item.path}: skipped — ${item.reason}`;
      fileCoverage.append(li);
    });
    if (state.report.source.skippedFiles.length > 8) {
      const remaining = document.createElement("li");
      remaining.textContent = `${state.report.source.skippedFiles.length - 8} further skipped files are preserved in the export.`;
      fileCoverage.append(remaining);
    }
  } else {
    const complete = document.createElement("li");
    complete.textContent = "No selected files were skipped by the browser limits.";
    fileCoverage.append(complete);
  }
}

function renderReassessment() {
  const panel = $("#reassessmentPanel");
  const button = $("#runCorrected");
  const delta = $("#reassessmentDelta");
  delta.replaceChildren();
  if (!state.scenario) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  if (state.scenarioPhase === "original") {
    $("#reassessmentCopy").textContent =
      "This is the original share-safe fixture. The documented correction changes only the evidence shown in the case pack; it does not edit a user's files.";
    const current = makeMetric(state.report.result, "Original result");
    const planned = makeMetric(state.scenario.correctedDecision, "Expected after correction");
    const actions = makeMetric(state.scenario.fixes.length, "Documented fixes");
    delta.append(current, planned, actions);
    button.hidden = false;
    button.textContent = "Load documented fixes and reassess";
    return;
  }

  const priorIds = new Set(state.baselineReport?.findings.map((item) => item.id) || []);
  const currentIds = new Set(state.report.findings.map((item) => item.id));
  const resolved = [...priorIds].filter((id) => !currentIds.has(id));
  $("#reassessmentCopy").textContent =
    "The corrected fixture was scanned as a new source state. Resolved findings are calculated from the two reports; a person still chooses permitted reliance.";
  delta.append(
    makeMetric(state.baselineReport?.result || "—", "Before"),
    makeMetric(state.report.result, "After"),
    makeMetric(resolved.length, "Findings resolved")
  );
  button.hidden = true;
}

function renderSponsorAnswer(report) {
  const verdict = sponsorVerdict(report.result);
  $("#resultLabel").textContent = report.result;
  $("#resultLabel").className = resultClass(report.result);
  $("#relianceLabel").textContent = report.context.intendedReliance;
  $("#sponsorLede").textContent = verdict.lede;
  $("#verdictWord").textContent = verdict.word;
  $("#verdictHint").textContent = verdict.hint;
  const badge = $("#verdictBadge");
  badge.className = `verdict-badge verdict-${resultClass(report.result)}`;
  $("#scoreValue").textContent = String(report.score);
  $("#scoreNote").hidden = false;
}

async function renderReport() {
  const report = state.report;
  renderSponsorAnswer(report);
  $("#findingCount").textContent = `${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}`;

  const metrics = $("#reportMetrics");
  metrics.replaceChildren();
  const counts = {
    blocking: report.findings.filter((item) => item.severity === "critical").length,
    serious: report.findings.filter((item) => item.severity === "high").length,
    themes: new Set(report.findings.map((item) => item.dimension)).size,
    files: report.source.fileCount,
  };
  metrics.append(
    makeMetric(counts.blocking, "Blocks go-live"),
    makeMetric(counts.serious, "Serious"),
    makeMetric(counts.themes, "Control themes"),
    makeMetric(counts.files, "Files read")
  );

  $("#storageSignal").textContent = report.dataFlow.storage.replace(" detected", "");
  $("#externalSignal").textContent = report.dataFlow.externalDestinations.join(", ") || "None found";
  renderFixFirst();
  renderWhyMatters();
  renderFindings();
  renderCoverage();
  renderReassessment();

  report.source.sha256 = await sha256(report.source.fingerprintSeed);
  delete report.source.fingerprintSeed;
  checkPanel.hidden = true;
  reportEmpty.hidden = true;
  reportElement.hidden = false;
  setStage(4);
  $("#inputStatus").textContent = `${report.source.fileCount} files checked`;
  $("#inputMessage").textContent = `${report.findings.length} evidenced findings across ${counts.files} files. Review limits before recording a decision.`;
}

async function runScan(files, sourceLabel, coverage = {}, checkLabel = sourceLabel) {
  await showChecking(checkLabel);
  state.files = files;
  state.findingFilter = "all";
  const context = {
    intendedReliance: selectedReliance(),
    owner: $("#workflowOwner").value,
    skippedFiles: coverage.skippedFiles || [],
  };
  state.report = scanProject(files, context);
  state.report.workflowName = $("#workflowName").value.trim() || sourceLabel;
  state.report.source.label = sourceLabel;
  await renderReport();
  reportElement.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function readLocalFiles(fileList) {
  const ignoredPath = /(^|\/)(\.git|node_modules|dist|build|coverage)(\/|$)/i;
  const skippedFiles = [];
  const eligible = [];
  [...fileList].forEach((file) => {
    const path = file.webkitRelativePath || file.name;
    if (ignoredPath.test(path)) {
      skippedFiles.push({ path, bytes: file.size, reason: "generated or excluded directory" });
    } else if (file.size > 1_000_000) {
      skippedFiles.push({ path, bytes: file.size, reason: "larger than the 1 MB per-file limit" });
    } else {
      eligible.push(file);
    }
  });
  const candidates = eligible.slice(0, 500);
  eligible.slice(500).forEach((file) => {
    skippedFiles.push({
      path: file.webkitRelativePath || file.name,
      bytes: file.size,
      reason: "beyond the 500-file browser limit",
    });
  });
  let totalBytes = 0;
  const readable = [];
  for (const file of candidates) {
    if (totalBytes + file.size > 5_000_000) {
      skippedFiles.push({
        path: file.webkitRelativePath || file.name,
        bytes: file.size,
        reason: "beyond the 5 MB browser limit",
      });
      continue;
    }
    readable.push(file);
    totalBytes += file.size;
  }
  const files = await Promise.all(
    readable.map(async (file) => ({
      path: file.webkitRelativePath || file.name,
      content: await file.text(),
      size: file.size,
    }))
  );
  return { files, skippedFiles };
}

folderInput.addEventListener("change", async () => {
  if (!folderInput.files?.length) return;
  state.scenario = null;
  state.scenarioPhase = null;
  state.baselineReport = null;
  state.selectedScenarioId = null;
  renderActiveCase();
  renderScannerScenarios();
  $("#inputMessage").textContent = `Reading ${folderInput.files.length} local files…`;
  const { files, skippedFiles } = await readLocalFiles(folderInput.files);
  const folderName = files[0]?.path.split("/")[0] || "Local workflow";
  if (!$("#workflowName").value) $("#workflowName").value = folderName;
  await runScan(files, folderName, { skippedFiles }, folderName);
  if (skippedFiles.length) {
    $("#inputMessage").textContent += ` ${skippedFiles.length} file${skippedFiles.length === 1 ? " was" : "s were"} skipped; every path and reason is retained in the export.`;
  }
});

$("#runCorrected").addEventListener("click", async () => {
  if (!state.scenario || state.scenarioPhase !== "original") return;
  state.baselineReport = structuredClone(state.report);
  await selectScenario(state.scenario.id, "corrected");
});

$$(".finding-filters button").forEach((button) => {
  button.addEventListener("click", () => {
    state.findingFilter = button.dataset.filter;
    $$(".finding-filters button").forEach((item) => item.classList.toggle("active", item === button));
    renderFindings();
  });
});

function updateReviewState() {
  approveButton.disabled = !(
    $("#reviewerName").value.trim() &&
    $("#reviewDecision").value &&
    $("#reviewCheck").checked
  );
}

$("#reviewerName").addEventListener("input", updateReviewState);
$("#reviewDecision").addEventListener("change", updateReviewState);
$("#reviewCheck").addEventListener("change", updateReviewState);

function decisionLabel(value) {
  return {
    hold: "Hold for remediation",
    personal: "Personal use only",
    "team-conditional": "Team use with conditions",
  }[value];
}

function recordMarkdown(record) {
  const lines = [
    `# Newco Assurance Record: ${record.workflow_name}`,
    "",
    `- Decision: ${record.decision_label}`,
    `- Reviewed by: ${record.reviewer}`,
    `- Reviewed at: ${record.reviewed_at}`,
    `- Intended reliance: ${record.scan.context.intendedReliance}`,
    `- Static-rule indicator: ${record.scan.score}/100 (not calibrated against customer decisions)`,
    `- Source SHA-256: ${record.scan.source.sha256}`,
    `- Files inspected: ${record.scan.source.fileCount}`,
    `- Files skipped: ${record.scan.source.skippedFiles.length}`,
    `- Conditions: ${record.conditions || "None stated"}`,
    "",
    "## Fix first",
    "",
  ];
  record.scan.fixFirst.forEach((item, index) => lines.push(`${index + 1}. ${escapeMarkdown(item.title)} — ${escapeMarkdown(item.action)}`));
  lines.push("", "## Limits", "");
  record.scan.limits.forEach((item) => lines.push(`- ${item}`));
  if (record.reassessment) {
    lines.push(
      "",
      "## Reassessment",
      "",
      `- Previous result: ${record.reassessment.previous_result}`,
      `- Current result: ${record.reassessment.current_result}`,
      `- Findings resolved: ${record.reassessment.resolved_finding_ids.join(", ") || "None"}`,
      `- Previous source SHA-256: ${record.reassessment.previous_source_sha256}`,
      ""
    );
  }
  lines.push("", "_This public prototype is a static pre-filter and cannot approve production use._", "");
  return lines.join("\n");
}

function download(name, content, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([content], { type }));
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

approveButton.addEventListener("click", () => {
  const decision = $("#reviewDecision").value;
  const priorIds = new Set(state.baselineReport?.findings.map((item) => item.id) || []);
  const currentIds = new Set(state.report.findings.map((item) => item.id));
  state.record = {
    schema_version: "newco.assurance-record.v1",
    workflow_name: state.report.workflowName,
    reviewer: $("#reviewerName").value.trim(),
    decision,
    decision_label: decisionLabel(decision),
    conditions: $("#reviewConditions").value.trim() || null,
    reviewed_at: new Date().toISOString(),
    scan: state.report,
    reassessment: state.baselineReport
      ? {
          previous_result: state.baselineReport.result,
          current_result: state.report.result,
          previous_source_sha256: state.baselineReport.source.sha256,
          current_source_sha256: state.report.source.sha256,
          resolved_finding_ids: [...priorIds].filter((id) => !currentIds.has(id)),
        }
      : null,
  };
  $("#recordDecision").textContent = state.record.decision_label;
  $("#recordReviewer").textContent = `Reviewed by ${state.record.reviewer}`;
  const summary = $("#recordSummary");
  summary.replaceChildren(
    makeMetric(state.record.scan.result, "Sponsor answer"),
    makeMetric(state.record.scan.findings.length, "Findings"),
    makeMetric(state.record.scan.fixFirst.length, "Fix before go-live"),
    makeMetric(state.record.scan.source.skippedFiles.length, "Files skipped")
  );
  $("#approvedRecord").hidden = false;
  $("#reviewMessage").textContent = "Assurance decision recorded. Download the pack for IT and Data.";
  setStage(5);
  $("#approvedRecord").scrollIntoView({ behavior: "smooth", block: "start" });
});

$("#downloadJson").addEventListener("click", () => {
  if (!state.record) return;
  download("newco-assurance-record.json", JSON.stringify(state.record, null, 2), "application/json");
});

$("#downloadMarkdown").addEventListener("click", () => {
  if (!state.record) return;
  download("newco-assurance-record.md", recordMarkdown(state.record), "text/markdown");
});

$("#startAgain").addEventListener("click", () => {
  state.files = [];
  state.report = null;
  state.record = null;
  state.scenario = null;
  state.scenarioPhase = null;
  state.baselineReport = null;
  state.selectedScenarioId = null;
  folderInput.value = "";
  reportElement.hidden = true;
  reportEmpty.hidden = false;
  checkPanel.hidden = true;
  $("#approvedRecord").hidden = true;
  $("#scoreNote").hidden = true;
  $("#workflowName").value = "";
  $("#workflowOwner").value = "";
  $("#reviewerName").value = "";
  $("#reviewDecision").value = "";
  $("#reviewConditions").value = "";
  $("#reviewCheck").checked = false;
  approveButton.disabled = true;
  $("#inputStatus").textContent = "Not started";
  $("#inputMessage").textContent = "Choose an example above or add a folder to begin.";
  renderActiveCase();
  renderScannerScenarios();
  setStage(1);
  $("#scanner").scrollIntoView({ behavior: "smooth" });
});

function calculatorValues() {
  const read = (selector) => Math.max(0, Number($(selector).value) || 0);
  return {
    workflows: read("#calcWorkflows"),
    reviews: read("#calcReviews"),
    reviewHours: read("#calcReviewHours"),
    reworkHours: read("#calcReworkHours"),
    hourlyCost: read("#calcHourlyCost"),
    approvalDays: read("#calcApprovalDays"),
    pilotCost: read("#calcPilotCost"),
  };
}

function renderCalculator() {
  const values = calculatorValues();
  const reviewValue = values.workflows * values.reviews * values.reviewHours * values.hourlyCost;
  const reworkValue = values.workflows * values.reworkHours * values.hourlyCost;
  const valuePool = reviewValue + reworkValue;
  const breakEven = values.hourlyCost ? values.pilotCost / values.hourlyCost : 0;
  $("#calcReviewValue").textContent = money(reviewValue);
  $("#calcReworkValue").textContent = money(reworkValue);
  $("#calcValuePool").textContent = money(valuePool);
  $("#calcBreakEven").textContent = `${Math.ceil(breakEven)} hrs`;
  $("#calcNarrative").textContent =
    `${values.workflows} workflows × ${values.reviews} reviews exposes ${Math.round(
      values.workflows * values.reviews * values.reviewHours
    )} review hours and ${Math.round(values.workflows * values.reworkHours)} late-rework hours. ` +
    `${values.approvalDays} approval-delay days are tracked but not monetised. The value pool is not a saving claim; a pilot must measure what actually changes.`;
}

$("#valueCalculator").addEventListener("input", renderCalculator);

$("#downloadBusinessCase").addEventListener("click", () => {
  const assumptions = calculatorValues();
  const reviewEffortValue =
    assumptions.workflows * assumptions.reviews * assumptions.reviewHours * assumptions.hourlyCost;
  const lateReworkValue = assumptions.workflows * assumptions.reworkHours * assumptions.hourlyCost;
  const record = {
    schema_version: "newco.business-case-assumptions.v1",
    generated_at: new Date().toISOString(),
    status: "prospective-assumptions-not-customer-proof",
    assumptions,
    calculated: {
      review_effort_value_gbp: reviewEffortValue,
      late_rework_value_gbp: lateReworkValue,
      quantified_value_pool_gbp: reviewEffortValue + lateReworkValue,
      break_even_hours: assumptions.hourlyCost ? assumptions.pilotCost / assumptions.hourlyCost : null,
    },
    excluded: [
      "Regulatory fines",
      "Hypothetical security incidents",
      "Unverified productivity claims",
      "Approval-delay value without a client-supplied daily value",
    ],
  };
  download("newco-business-case-assumptions.json", JSON.stringify(record, null, 2), "application/json");
});

renderScenarioGrid();
renderScannerScenarios();
renderCalculator();
