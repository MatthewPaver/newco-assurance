const TEXT_EXTENSIONS = new Set([
  "css",
  "csv",
  "env",
  "html",
  "ini",
  "js",
  "json",
  "jsx",
  "md",
  "mjs",
  "py",
  "sarif",
  "sql",
  "toml",
  "ts",
  "tsx",
  "txt",
  "yaml",
  "yml",
]);

const DIMENSIONS = [
  "Security",
  "Data & privacy",
  "Robustness",
  "Documentation",
  "Ownership",
  "Tests",
];

const SEVERITY_WEIGHT = { critical: 18, high: 10, medium: 5, low: 2 };
const SARIF_LEVELS = { error: "high", warning: "medium", note: "low", none: "low" };

function lineFor(content, offset) {
  return content.slice(0, offset).split(/\r?\n/).length;
}

function evidenceLine(content, lineNumber) {
  return content.split(/\r?\n/)[lineNumber - 1]?.trim().slice(0, 180) || "";
}

function extension(path) {
  return path.includes(".") ? path.split(".").pop().toLowerCase() : "";
}

function finding({
  id,
  dimension,
  severity,
  title,
  why,
  action,
  file,
  line = null,
  evidence = "",
  provenance = "Static rule",
  evidenceKind = line ? "line" : evidence ? "derived" : "absence",
}) {
  return { id, dimension, severity, title, why, action, file, line, evidence, provenance, evidenceKind };
}

function matchFirst(files, regex, details) {
  for (const file of files) {
    regex.lastIndex = 0;
    const match = regex.exec(file.content);
    if (!match) continue;
    const line = lineFor(file.content, match.index);
    const { redactEvidence = false, ...findingDetails } = details;
    return finding({
      ...findingDetails,
      file: file.path,
      line,
      evidence: redactEvidence
        ? "[Sensitive value redacted — inspect the named source line locally]"
        : evidenceLine(file.content, line),
    });
  }
  return null;
}

function collectExternalDestinations(files) {
  const destinations = new Set();
  const urlPattern = /https?:\/\/([a-z0-9.-]+\.[a-z]{2,})(?=[:/"'`\s)]|$)/gi;
  for (const file of files) {
    for (const match of file.content.matchAll(urlPattern)) {
      const host = match[1].toLowerCase();
      if (!["example.com", "localhost", "127.0.0.1"].includes(host)) destinations.add(host);
    }
  }
  return [...destinations].sort();
}

function hasPath(files, pattern) {
  return files.some((file) => pattern.test(file.path));
}

function manifestFindings(files) {
  const results = [];
  const packageManifest = files.find((file) => /(^|\/)package\.json$/i.test(file.path));
  if (packageManifest) {
    try {
      const parsed = JSON.parse(packageManifest.content);
      const dependencies = {
        ...(parsed.dependencies || {}),
        ...(parsed.devDependencies || {}),
        ...(parsed.optionalDependencies || {}),
      };
      const floating = Object.entries(dependencies)
        .filter(([, version]) => ["*", "latest", "next"].includes(String(version).trim().toLowerCase()))
        .map(([name]) => name);
      if (floating.length) {
        results.push(
          finding({
            id: "DEP-001",
            dimension: "Robustness",
            severity: "high",
            title: "Dependencies use floating versions",
            why: "A future install can resolve different code without the workflow itself changing.",
            action: "Pin reviewed versions and commit the package-manager lock file.",
            file: packageManifest.path,
            evidence: floating.slice(0, 6).join(", "),
          })
        );
      }
      if (
        Object.keys(dependencies).length &&
        !hasPath(files, /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/i)
      ) {
        results.push(
          finding({
            id: "DEP-002",
            dimension: "Robustness",
            severity: "medium",
            title: "JavaScript dependencies have no visible lock file",
            why: "The inspected folder does not prove which exact dependency versions were installed.",
            action: "Commit the lock file and run the organisation's approved dependency scanner.",
            file: packageManifest.path,
          })
        );
      }
    } catch {
      results.push(
        finding({
          id: "DEP-003",
          dimension: "Robustness",
          severity: "medium",
          title: "Package manifest could not be parsed",
          why: "Dependency evidence cannot be checked when the manifest is invalid.",
          action: "Correct package.json and repeat the pre-flight.",
          file: packageManifest.path,
        })
      );
    }
  }

  for (const file of files.filter((item) => /(^|\/)requirements[^/]*\.txt$/i.test(item.path))) {
    const unpinned = file.content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !/[<>=~!]=/.test(line));
    if (unpinned.length) {
      results.push(
        finding({
          id: "DEP-004",
          dimension: "Robustness",
          severity: "medium",
          title: "Python dependencies are not version constrained",
          why: "A future install can silently introduce different behavior or a vulnerable release.",
          action: "Record reviewed version constraints and retain the resolved environment evidence.",
          file: file.path,
          evidence: unpinned.slice(0, 6).join(", "),
        })
      );
      break;
    }
  }
  return results;
}

function sarifFindings(files) {
  const results = [];
  for (const file of files.filter((item) => /\.sarif$/i.test(item.path))) {
    try {
      const parsed = JSON.parse(file.content);
      for (const run of parsed.runs || []) {
        const toolName = run.tool?.driver?.name || "Specialist engine";
        for (const result of (run.results || []).slice(0, 50)) {
          const location = result.locations?.[0]?.physicalLocation;
          const sourceFile = location?.artifactLocation?.uri || file.path;
          const line = location?.region?.startLine || null;
          const message = result.message?.text || "Specialist engine finding";
          results.push(
            finding({
              id: `SARIF-${result.ruleId || results.length + 1}`,
              dimension: "Security",
              severity: SARIF_LEVELS[result.level] || "medium",
              title: message.slice(0, 110),
              why: `${toolName} supplied an inspectable result; the authorised reviewer must still confirm applicability.`,
              action: "Review the named rule and source location, remediate if applicable and retain the specialist report.",
              file: sourceFile,
              line,
              evidence: result.ruleId ? `Rule ${result.ruleId}` : `Imported from ${file.path}`,
              provenance: `Imported SARIF · ${toolName}`,
            })
          );
        }
      }
    } catch {
      results.push(
        finding({
          id: "SARIF-INVALID",
          dimension: "Security",
          severity: "medium",
          title: "Specialist report could not be parsed",
          why: "The report is present but cannot contribute trustworthy evidence.",
          action: "Export valid SARIF 2.1 JSON and repeat the pre-flight.",
          file: file.path,
        })
      );
    }
  }
  return results;
}

function normalizeFiles(files) {
  return files
    .filter((file) => TEXT_EXTENSIONS.has(extension(file.path)) || !extension(file.path))
    .map((file) => ({
      path: file.path.replace(/^\/+/, ""),
      content: String(file.content || ""),
      size: Number(file.size || String(file.content || "").length),
    }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function documentationFindings(files) {
  const results = [];
  if (!hasPath(files, /(^|\/)readme(\.[^/]+)?$/i)) {
    results.push(
      finding({
        id: "DOC-001",
        dimension: "Documentation",
        severity: "high",
        title: "No operating README found",
        why: "A reviewer cannot reproduce, support or safely retire a workflow without an operating description.",
        action: "Add purpose, setup, inputs, outputs, limits, validation and rollback instructions.",
        file: "Project root",
      })
    );
  }
  if (!hasPath(files, /(^|\/)(security|threat-model)(\.[^/]+)?$/i)) {
    results.push(
      finding({
        id: "DOC-002",
        dimension: "Documentation",
        severity: "medium",
        title: "Security boundary is undocumented",
        why: "Reviewers need to know what the workflow trusts and what it deliberately does not protect.",
        action: "Document data classification, external services, secrets handling and known exclusions.",
        file: "Project root",
      })
    );
  }
  return results;
}

function ownershipFindings(files, context) {
  const results = [];
  if (!hasPath(files, /(^|\/)codeowners$/i) && !context.owner?.trim()) {
    results.push(
      finding({
        id: "OWN-001",
        dimension: "Ownership",
        severity: "high",
        title: "No accountable owner is recorded",
        why: "A shared workflow becomes an operational dependency even when its original builder moves on.",
        action: "Name a service owner and a backup owner before team or production use.",
        file: "Project context",
      })
    );
  }
  if (!hasPath(files, /(^|\/)(licen[cs]e)(\.[^/]+)?$/i)) {
    results.push(
      finding({
        id: "OWN-002",
        dimension: "Ownership",
        severity: "low",
        title: "Reuse terms are not stated",
        why: "Unclear reuse terms complicate handover and organisational ownership.",
        action: "Add the appropriate licence or an internal-use statement.",
        file: "Project root",
      })
    );
  }
  return results;
}

function testFindings(files) {
  if (hasPath(files, /(^|\/)(__tests__|tests?|specs?)(\/|\.|-)|\.(test|spec)\.[a-z]+$/i)) return [];
  return [
    finding({
      id: "TST-001",
      dimension: "Tests",
      severity: "high",
      title: "No automated test artefacts found",
      why: "A working happy path does not show how the workflow behaves on bad input or after a change.",
      action: "Add repeatable tests for the main outcome, invalid input and one failure boundary.",
      file: "Project root",
    }),
  ];
}

export function scanProject(inputFiles, context = {}) {
  const files = normalizeFiles(inputFiles);
  const findings = [];

  const rules = [
    {
      regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/,
      details: {
        id: "SEC-001",
        dimension: "Security",
        severity: "critical",
        title: "Private key material appears in source",
        why: "Anyone with this key may be able to impersonate a trusted service or access protected systems.",
        action: "Revoke and rotate the key, remove it from history and use an approved secrets store.",
        redactEvidence: true,
      },
    },
    {
      regex: /\b(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][A-Za-z0-9_\-/.+=]{16,}["']/i,
      details: {
        id: "SEC-002",
        dimension: "Security",
        severity: "critical",
        title: "Secret-like value is hard-coded",
        why: "Credentials in source can leak through repositories, screenshots, logs and generated bundles.",
        action: "Rotate the value and load it from an approved secrets mechanism.",
        redactEvidence: true,
      },
    },
    {
      regex: /\beval\s*\(/,
      details: {
        id: "SEC-003",
        dimension: "Security",
        severity: "high",
        title: "Dynamic code execution is present",
        why: "Evaluating text as code can turn untrusted input into executable behavior.",
        action: "Replace eval with explicit parsing or a constrained allow-list.",
      },
    },
    {
      regex: /\b(?:exec|spawn)\s*\([^)]*\{\s*shell\s*:\s*true|subprocess\.[a-z_]+\s*\([^)]*shell\s*=\s*True/is,
      details: {
        id: "SEC-005",
        dimension: "Security",
        severity: "high",
        title: "A shell is enabled for command execution",
        why: "Untrusted values reaching a shell can become operating-system commands.",
        action: "Use an argument array without a shell and constrain every permitted command.",
      },
    },
    {
      regex: /\.innerHTML\s*=/,
      details: {
        id: "SEC-004",
        dimension: "Security",
        severity: "high",
        title: "HTML is inserted without a visible safety boundary",
        why: "Untrusted content inserted as HTML can enable script injection.",
        action: "Use textContent or sanitise through a reviewed allow-list.",
      },
    },
    {
      regex: /\b(localStorage|sessionStorage)\.(setItem|getItem)\s*\(/,
      details: {
        id: "DAT-001",
        dimension: "Data & privacy",
        severity: "medium",
        title: "Browser storage is used",
        why: "Stored data can persist on a shared device and is accessible to scripts on the same origin.",
        action: "Document exactly what is stored, minimise it and provide a clear removal path.",
      },
    },
    {
      regex: /fetch\s*\(\s*["']http:\/\//,
      details: {
        id: "DAT-002",
        dimension: "Data & privacy",
        severity: "high",
        title: "An unencrypted network destination is used",
        why: "Data sent over plain HTTP can be read or modified in transit.",
        action: "Use HTTPS and verify the destination, purpose and lawful basis.",
      },
    },
  ];

  for (const rule of rules) {
    const result = matchFirst(files, rule.regex, rule.details);
    if (result) findings.push(result);
  }

  const destinations = collectExternalDestinations(files);
  if (destinations.length) {
    findings.push(
      finding({
        id: "DAT-003",
        dimension: "Data & privacy",
        severity: "medium",
        title: `${destinations.length} external destination${destinations.length === 1 ? "" : "s"} detected`,
        why: "A reviewer needs to know what leaves the workflow before deciding whether the data use is acceptable.",
        action: "Confirm the purpose, data fields, contract, retention and region for each destination.",
        file: "Across project",
        evidence: destinations.join(", "),
      })
    );
  }

  findings.push(...sarifFindings(files));

  const codeFiles = files.filter((file) => /(?:\.js|\.mjs|\.ts|\.tsx|\.py)$/.test(file.path));
  if (codeFiles.length && !codeFiles.some((file) => /\btry\b|\bcatch\b|except\s+/.test(file.content))) {
    findings.push(
      finding({
        id: "ROB-001",
        dimension: "Robustness",
        severity: "medium",
        title: "No explicit failure handling found",
        why: "An operational workflow needs a predictable response when an input, file or external service fails.",
        action: "Handle expected failures, expose a useful error and define retry or rollback behavior.",
        file: "Across code files",
      })
    );
  }

  findings.push(
    ...manifestFindings(files),
    ...documentationFindings(files),
    ...ownershipFindings(files, context),
    ...testFindings(files)
  );
  findings.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] || a.id.localeCompare(b.id));

  const score = Math.max(
    0,
    Math.round(
      100 -
        findings.reduce((total, item) => total + SEVERITY_WEIGHT[item.severity], 0) -
        (files.length === 0 ? 100 : 0)
    )
  );

  const intendedReliance = ["personal", "team", "production"].includes(context.intendedReliance)
    ? context.intendedReliance
    : "team";
  const hasCritical = findings.some((item) => item.severity === "critical");
  const hasHigh = findings.some((item) => item.severity === "high");
  let result = "Ready";
  if (!files.length || hasCritical || (intendedReliance === "production" && hasHigh)) result = "Hold";
  else if (hasHigh || (intendedReliance === "production" && findings.length)) result = "Conditional";

  const fingerprintSeed = files.map((file) => `${file.path}:${file.size}:${file.content}`).join("|");
  const skippedFiles = Array.isArray(context.skippedFiles) ? context.skippedFiles : [];

  return {
    schemaVersion: "newco.scan.v1",
    generatedAt: new Date().toISOString(),
    source: {
      fileCount: files.length,
      byteCount: files.reduce((total, file) => total + file.size, 0),
      fingerprintSeed,
      includedFiles: files.map((file) => ({ path: file.path, bytes: file.size })),
      skippedFiles,
      complete: skippedFiles.length === 0,
    },
    context: {
      intendedReliance,
      owner: context.owner?.trim() || null,
    },
    result,
    score,
    indicator: {
      value: score,
      label: "Uncalibrated static-rule indicator",
      calibrationStatus: "Not calibrated against customer reviewer decisions",
    },
    findings,
    fixFirst: findings.slice(0, 3),
    coverage: DIMENSIONS.map((name) => ({
      name,
      active: true,
      mode: "Static rules only",
      findings: findings.filter((item) => item.dimension === name).length,
    })),
    dataFlow: {
      input: "Local project folder",
      processing: "Browser-local static rules",
      storage: findings.some((item) => item.id === "DAT-001") ? "Browser storage detected" : "No browser storage signal",
      externalDestinations: destinations,
    },
    limits: [
      "Files were read as text and were not uploaded or executed.",
      "No dependency vulnerability, runtime, penetration or infrastructure test was performed.",
      skippedFiles.length
        ? `${skippedFiles.length} file${skippedFiles.length === 1 ? " was" : "s were"} skipped and remain outside coverage.`
        : "No selected files were skipped by the browser limits.",
      "The result is a pre-filter, not security, privacy, legal or production approval.",
      "Production reliance requires independent review outside this public prototype.",
    ],
  };
}

export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
