import { scanProject, sha256 } from "./scanner-core.js";
import { SAMPLE_FILES, SCENARIOS } from "./samples.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  files: [],
  report: null,
  record: null,
  findingFilter: "all",
  scenario: null,
  scenarioPhase: null,
  baselineReport: null,
};

const folderInput = $("#folderInput");
const reportElement = $("#report");
const reportEmpty = $("#reportEmpty");
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

function setStage(stage) {
  $$("[data-stage-marker]").forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.stageMarker) <= stage);
  });
}

function setReliance(value) {
  const input = $(`input[name="reliance"][value="${value}"]`);
  if (input) input.checked = true;
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

async function selectScenario(id, phase) {
  const scenario = SCENARIOS.find((item) => item.id === id);
  if (!scenario) return;
  state.scenario = scenario;
  state.scenarioPhase = phase;
  if (phase === "original") state.baselineReport = null;
  setReliance(scenario.intendedReliance);
  $("#workflowName").value = scenario.title;
  $("#workflowOwner").value = phase === "corrected" ? `${scenario.role} (named owner)` : scenario.owner;
  renderActiveCase();
  setStage(2);
  const files = phase === "corrected" ? scenario.correctedFiles : scenario.originalFiles;
  await runScan(files, `${scenario.title} · ${phase} fixture`);
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
    number.textContent = String(index + 1).padStart(2, "0");
    title.textContent = finding.title;
    action.textContent = finding.action;
    body.append(title, action);
    item.append(number, body);
    list.append(item);
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
    severity.textContent = finding.severity;
    top.append(identity, severity);

    const title = document.createElement("h5");
    title.textContent = finding.title;
    const why = document.createElement("p");
    why.textContent = finding.why;

    const evidence = document.createElement("div");
    evidence.className = "finding-evidence";
    const location = document.createElement("span");
    location.textContent = finding.line ? `${finding.file}:${finding.line}` : finding.file;
    const quote = document.createElement("code");
    quote.textContent = finding.evidence || "Project-level absence";
    evidence.append(location, quote);

    const footer = document.createElement("div");
    footer.className = "finding-footer";
    const provenance = document.createElement("span");
    provenance.textContent = finding.provenance;
    const action = document.createElement("p");
    action.textContent = finding.action;
    footer.append(provenance, action);

    card.append(top, title, why, evidence, footer);
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

async function renderReport() {
  const report = state.report;
  $("#resultLabel").textContent = report.result;
  $("#resultLabel").className = resultClass(report.result);
  $("#relianceLabel").textContent = report.context.intendedReliance;
  $("#scoreValue").textContent = String(report.score);
  $("#findingCount").textContent = `${report.findings.length} finding${report.findings.length === 1 ? "" : "s"}`;

  const metrics = $("#reportMetrics");
  metrics.replaceChildren();
  const counts = {
    critical: report.findings.filter((item) => item.severity === "critical").length,
    high: report.findings.filter((item) => item.severity === "high").length,
    files: report.source.fileCount,
    destinations: report.dataFlow.externalDestinations.length,
  };
  metrics.append(
    makeMetric(counts.critical, "Critical"),
    makeMetric(counts.high, "High"),
    makeMetric(counts.files, "Files read"),
    makeMetric(report.source.skippedFiles.length, "Files skipped")
  );

  $("#storageSignal").textContent = report.dataFlow.storage.replace(" detected", "");
  $("#externalSignal").textContent = report.dataFlow.externalDestinations.join(", ") || "None found";
  renderFixFirst();
  renderFindings();
  renderCoverage();
  renderReassessment();

  report.source.sha256 = await sha256(report.source.fingerprintSeed);
  delete report.source.fingerprintSeed;
  reportEmpty.hidden = true;
  reportElement.hidden = false;
  setStage(3);
  $("#inputStatus").textContent = `${report.source.fileCount} files checked`;
  $("#inputMessage").textContent = `${report.findings.length} evidenced findings across ${counts.files} files. Review skipped files and limits before recording a decision.`;
}

async function runScan(files, sourceLabel, coverage = {}) {
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
  renderActiveCase();
  setStage(2);
  $("#inputMessage").textContent = `Reading ${folderInput.files.length} local files…`;
  const { files, skippedFiles } = await readLocalFiles(folderInput.files);
  const folderName = files[0]?.path.split("/")[0] || "Local workflow";
  if (!$("#workflowName").value) $("#workflowName").value = folderName;
  await runScan(files, folderName, { skippedFiles });
  if (skippedFiles.length) {
    $("#inputMessage").textContent += ` ${skippedFiles.length} file${skippedFiles.length === 1 ? " was" : "s were"} skipped; every path and reason is retained in the export.`;
  }
});

$("#loadSample").addEventListener("click", async () => {
  const meeting = SCENARIOS.find((scenario) => scenario.id === "meeting-proof");
  if (meeting) {
    await selectScenario(meeting.id, "original");
  } else {
    await runScan(SAMPLE_FILES, "Published safe sample");
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
    makeMetric(state.record.scan.score, "Static indicator*"),
    makeMetric(state.record.scan.findings.length, "Findings"),
    makeMetric(state.record.scan.fixFirst.length, "Fix first"),
    makeMetric(state.record.scan.source.skippedFiles.length, "Files skipped")
  );
  $("#approvedRecord").hidden = false;
  $("#reviewMessage").textContent = "Assurance decision recorded. Export it with the evidence fingerprint.";
  setStage(4);
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
  folderInput.value = "";
  reportElement.hidden = true;
  reportEmpty.hidden = false;
  $("#approvedRecord").hidden = true;
  $("#workflowName").value = "";
  $("#workflowOwner").value = "";
  $("#reviewerName").value = "";
  $("#reviewDecision").value = "";
  $("#reviewConditions").value = "";
  $("#reviewCheck").checked = false;
  approveButton.disabled = true;
  $("#inputStatus").textContent = "Not started";
  $("#inputMessage").textContent = "Choose a folder or load the sample to begin.";
  renderActiveCase();
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
renderCalculator();
