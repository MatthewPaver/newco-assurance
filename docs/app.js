import { scanProject, sha256 } from "./scanner-core.js";
import { SAMPLE_FILES } from "./samples.js";

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const state = {
  files: [],
  report: null,
  record: null,
  findingFilter: "all",
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

function setStage(stage) {
  $$("[data-stage-marker]").forEach((item) => {
    item.classList.toggle("active", Number(item.dataset.stageMarker) <= stage);
  });
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
    makeMetric(counts.destinations, "External hosts")
  );

  $("#storageSignal").textContent = report.dataFlow.storage.replace(" detected", "");
  $("#externalSignal").textContent = report.dataFlow.externalDestinations.join(", ") || "None found";
  renderFixFirst();
  renderFindings();
  renderCoverage();

  report.source.sha256 = await sha256(report.source.fingerprintSeed);
  delete report.source.fingerprintSeed;
  reportEmpty.hidden = true;
  reportElement.hidden = false;
  setStage(3);
  $("#inputStatus").textContent = `${report.source.fileCount} files checked`;
  $("#inputMessage").textContent = `${report.findings.length} evidenced findings. Review the coverage before recording a decision.`;
}

async function runScan(files, sourceLabel) {
  state.files = files;
  state.findingFilter = "all";
  const context = {
    intendedReliance: selectedReliance(),
    owner: $("#workflowOwner").value,
  };
  state.report = scanProject(files, context);
  state.report.workflowName = $("#workflowName").value.trim() || sourceLabel;
  state.report.source.label = sourceLabel;
  await renderReport();
  reportElement.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function readLocalFiles(fileList) {
  const ignoredPath = /(^|\/)(\.git|node_modules|dist|build|coverage)(\/|$)/i;
  const candidates = [...fileList]
    .filter((file) => file.size <= 1_000_000)
    .filter((file) => !ignoredPath.test(file.webkitRelativePath || file.name))
    .slice(0, 500);
  let totalBytes = 0;
  const readable = [];
  for (const file of candidates) {
    if (totalBytes + file.size > 5_000_000) break;
    readable.push(file);
    totalBytes += file.size;
  }
  const skipped = fileList.length - readable.length;
  const files = await Promise.all(
    readable.map(async (file) => ({
      path: file.webkitRelativePath || file.name,
      content: await file.text(),
      size: file.size,
    }))
  );
  return { files, skipped };
}

folderInput.addEventListener("change", async () => {
  if (!folderInput.files?.length) return;
  setStage(2);
  $("#inputMessage").textContent = `Reading ${folderInput.files.length} local files…`;
  const { files, skipped } = await readLocalFiles(folderInput.files);
  const folderName = files[0]?.path.split("/")[0] || "Local workflow";
  if (!$("#workflowName").value) $("#workflowName").value = folderName;
  await runScan(files, folderName);
  if (skipped) {
    $("#inputMessage").textContent += ` ${skipped} large, generated or excess file${skipped === 1 ? " was" : "s were"} skipped and are outside coverage.`;
  }
});

$("#loadSample").addEventListener("click", async () => {
  $("#workflowName").value = "MeetingProof public workflow";
  $("#workflowOwner").value = "";
  setStage(2);
  await runScan(SAMPLE_FILES, "Published safe sample");
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
    `- Static score: ${record.scan.score}/100`,
    `- Source SHA-256: ${record.scan.source.sha256}`,
    `- Conditions: ${record.conditions || "None stated"}`,
    "",
    "## Fix first",
    "",
  ];
  record.scan.fixFirst.forEach((item, index) => lines.push(`${index + 1}. ${escapeMarkdown(item.title)} — ${escapeMarkdown(item.action)}`));
  lines.push("", "## Limits", "");
  record.scan.limits.forEach((item) => lines.push(`- ${item}`));
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
  state.record = {
    schema_version: "newco.assurance-record.v1",
    workflow_name: state.report.workflowName,
    reviewer: $("#reviewerName").value.trim(),
    decision,
    decision_label: decisionLabel(decision),
    conditions: $("#reviewConditions").value.trim() || null,
    reviewed_at: new Date().toISOString(),
    scan: state.report,
  };
  $("#recordDecision").textContent = state.record.decision_label;
  $("#recordReviewer").textContent = `Reviewed by ${state.record.reviewer}`;
  const summary = $("#recordSummary");
  summary.replaceChildren(
    makeMetric(state.record.scan.score, "Static score"),
    makeMetric(state.record.scan.findings.length, "Findings"),
    makeMetric(state.record.scan.fixFirst.length, "Fix first"),
    makeMetric(state.record.scan.source.fileCount, "Files")
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
  setStage(1);
  $("#scanner").scrollIntoView({ behavior: "smooth" });
});
