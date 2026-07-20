import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";

const root = process.cwd();
const required = [
  "docs/index.html",
  "docs/styles.css",
  "docs/app.js",
  "docs/scanner-core.js",
  "docs/samples.js",
  "README.md",
  "PRODUCT.md",
  "SECURITY.md",
  "LICENSE",
];

const errors = [];
for (const relativePath of required) {
  try {
    const file = await stat(path.join(root, relativePath));
    if (!file.isFile() || file.size === 0) errors.push(`${relativePath} is empty or not a file`);
  } catch {
    errors.push(`${relativePath} is missing`);
  }
}

const html = await readFile(path.join(root, "docs/index.html"), "utf8");
const app = await readFile(path.join(root, "docs/app.js"), "utf8");

const expectations = [
  [html.includes("<h1>"), "A single product heading is required"],
  [(html.match(/<h1[\s>]/g) || []).length === 1, "Exactly one h1 is required"],
  [html.includes("Content-Security-Policy"), "A Content Security Policy is required"],
  [html.includes("connect-src 'none'"), "The public prototype must block network connections"],
  [html.includes('id="scanner"'), "The scanner landmark is required"],
  [html.includes("cannot approve production use"), "The production-approval boundary must be visible"],
  [html.includes("<noscript>"), "A no-JavaScript boundary is required"],
  [!/\son[a-z]+\s*=/i.test(html), "Inline event handlers are not allowed"],
  [!app.includes(".innerHTML"), "Unnecessary HTML injection APIs are not allowed"],
  [app.includes("5_000_000"), "The local folder byte limit must remain explicit"],
  [app.includes("slice(0, 500)"), "The local folder file limit must remain explicit"],
];

for (const [passes, message] of expectations) {
  if (!passes) errors.push(message);
}

for (const file of ["docs/app.js", "docs/scanner-core.js", "docs/samples.js"]) {
  const result = spawnSync(process.execPath, ["--check", file], { cwd: root, encoding: "utf8" });
  if (result.status !== 0) errors.push(`${file} failed syntax validation: ${result.stderr.trim()}`);
}

if (errors.length) {
  console.error(`Static validation failed:\n- ${errors.join("\n- ")}`);
  process.exit(1);
}

console.log(`Static validation passed (${required.length} required files, ${expectations.length} product gates).`);
