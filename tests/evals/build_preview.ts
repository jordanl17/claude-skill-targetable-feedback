/**
 * Build a single static eval-preview.html that renders each widget visually
 * with design-system fallbacks injected, alongside its grading summary.
 *
 * Usage:
 *   pnpm eval:preview <iteration-dir>
 *
 * Example:
 *   pnpm eval:preview targetable-feedback-workspace/iteration-8
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Assertion, Grading, Meta } from './shared.js';

const here = dirname(fileURLToPath(import.meta.url));
const EVALS_JSON_PATH = join(here, 'evals.json');

const DESIGN_FALLBACKS = `
:root {
  --color-text-primary: #1a1816;
  --color-text-secondary: #5a5450;
  --color-text-tertiary: #8a8278;
  --color-text-info: #3a5da3;
  --color-text-success: #5a7c30;
  --color-text-danger: #a64633;
  --color-background-primary: #f8f7f5;
  --color-background-secondary: rgba(26, 24, 22, 0.05);
  --color-background-info: rgba(70, 100, 180, 0.10);
  --color-background-success: rgba(90, 130, 60, 0.12);
  --color-background-danger: rgba(180, 70, 60, 0.10);
  --color-border-primary: rgba(26, 24, 22, 0.12);
  --color-border-tertiary: rgba(26, 24, 22, 0.06);
  --font-sans: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Inter', system-ui, sans-serif;
  --font-serif: 'Charter', 'Iowan Old Style', 'Source Serif Pro', 'Georgia', serif;
  --font-text-xs-size: 12px;
  --font-text-xs-line-height: 1.4;
  --font-text-sm-size: 13px;
  --font-text-sm-line-height: 1.45;
  --font-text-md-size: 15px;
  --font-text-md-line-height: 1.5;
  --font-heading-xs-size: 14px;
  --font-heading-xs-line-height: 1.4;
  --font-heading-lg-size: 22px;
  --font-heading-lg-line-height: 1.3;
  --font-weight-medium: 500;
  --border-radius-sm: 6px;
  --border-radius-md: 8px;
  --border-radius-lg: 12px;
}
body { font-family: var(--font-sans); color: var(--color-text-primary); background: var(--color-background-primary); margin: 0; padding: 24px; }
`;

const PAGE_CSS = `
  :root {
    --bg: #f5f3ef;
    --surface: #ffffff;
    --text: #1a1816;
    --text-secondary: #5a5450;
    --text-tertiary: #8a8278;
    --border: rgba(26, 24, 22, 0.08);
    --pass: #5a7c30;
    --fail: #a64633;
    --partial: #c08a30;
    --info-bg: rgba(70, 100, 180, 0.10);
    --info-text: #3a5da3;
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'Inter', sans-serif; color: var(--text); background: var(--bg); }
  h1 { font-size: 26px; font-weight: 500; margin: 0 0 8px; }
  .subtitle { color: var(--text-secondary); margin: 0 0 32px; }
  section.eval { background: var(--surface); border: 0.5px solid var(--border); border-radius: 14px; margin-bottom: 24px; overflow: hidden; box-shadow: 0 2px 8px rgba(31, 29, 26, 0.04); }
  .eval-header { padding: 16px 24px; border-bottom: 0.5px solid var(--border); display: flex; justify-content: space-between; align-items: baseline; gap: 16px; }
  .eval-header h2 { margin: 0; font-size: 18px; font-weight: 500; }
  .eval-id { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; color: var(--text-tertiary); }
  .eval-body { display: grid; grid-template-columns: 1fr 1.2fr; gap: 0; }
  .left-col { padding: 20px 24px; border-right: 0.5px solid var(--border); display: flex; flex-direction: column; gap: 16px; }
  .right-col { padding: 20px 24px; display: flex; flex-direction: column; gap: 12px; }
  .label { font-size: 12px; font-weight: 500; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
  .prompt-box, .meta-box, .response-box { display: flex; flex-direction: column; gap: 6px; }
  pre.prompt, pre.response { margin: 0; padding: 10px 12px; background: #faf8f4; border: 0.5px solid var(--border); border-radius: 8px; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.5; color: var(--text-secondary); white-space: pre-wrap; max-height: 200px; overflow-y: auto; }
  pre.response { max-height: 100px; }
  .meta-box { font-size: 13px; color: var(--text-secondary); }
  .meta-line { padding: 2px 0; }
  .meta-line strong { color: var(--text); }
  .widget-frame { width: 100%; height: 600px; border: 0.5px solid var(--border); border-radius: 8px; background: #fff; }
  .no-widget { padding: 24px; background: #faf8f4; border: 0.5px dashed var(--border); border-radius: 8px; color: var(--text-tertiary); font-style: italic; }
  .grade-panel { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; background: #faf8f4; border: 0.5px solid var(--border); border-radius: 8px; }
  .grade-summary { font-weight: 600; font-size: 14px; padding: 4px 10px; border-radius: 999px; display: inline-block; align-self: flex-start; }
  .grade-summary.pass { background: rgba(90, 124, 48, 0.12); color: var(--pass); }
  .grade-summary.partial { background: rgba(192, 138, 48, 0.12); color: var(--partial); }
  .grade-summary.fail { background: rgba(166, 70, 51, 0.12); color: var(--fail); }
  .assertions { display: flex; flex-direction: column; gap: 4px; }
  .assertion { display: flex; gap: 8px; font-size: 12px; line-height: 1.45; padding: 2px 0; }
  .symbol { font-weight: 700; flex-shrink: 0; width: 14px; }
  .symbol.pass { color: var(--pass); }
  .symbol.fail { color: var(--fail); }
  .assertion-text { color: var(--text-secondary); }
  .assertion-evidence { color: var(--text-tertiary); font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 11px; margin-top: 2px; }
  .summary-banner { background: var(--surface); border: 0.5px solid var(--border); border-radius: 12px; padding: 16px 24px; margin-bottom: 24px; display: flex; gap: 32px; flex-wrap: wrap; }
  .summary-stat { display: flex; flex-direction: column; gap: 2px; }
  .summary-stat .value { font-size: 22px; font-weight: 500; }
  .summary-stat .key { font-size: 12px; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: 0.06em; }
  .header-left { display: flex; flex-direction: column; gap: 4px; }
  .nav-buttons { display: flex; align-items: center; gap: 12px; }
  .nav-btn { font-size: 12px; padding: 6px 12px; background: var(--surface); border: 0.5px solid var(--border); border-radius: 6px; cursor: pointer; color: var(--text-secondary); }
  .nav-btn:hover { background: #faf8f4; }
  .nav-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .nav-progress { font-size: 12px; color: var(--text-tertiary); }
  .feedback-box { display: flex; flex-direction: column; gap: 6px; }
  textarea.feedback { width: 100%; min-height: 80px; padding: 10px 12px; border: 0.5px solid var(--border); border-radius: 8px; font-family: inherit; font-size: 13px; line-height: 1.5; color: var(--text); resize: vertical; background: #ffffff; }
  textarea.feedback:focus { outline: none; border-color: var(--info-text); box-shadow: 0 0 0 1px var(--info-text); }
  .feedback-status { font-size: 11px; color: var(--text-tertiary); height: 14px; }
  .feedback-status.saved { color: var(--pass); }
  .copy-bar { position: sticky; bottom: 0; background: var(--surface); border: 0.5px solid var(--border); border-radius: 12px; padding: 14px 24px; margin-top: 32px; display: flex; justify-content: space-between; align-items: center; gap: 16px; box-shadow: 0 -2px 12px rgba(31, 29, 26, 0.06); }
  .copy-bar-status { font-size: 13px; color: var(--text-secondary); }
  .copy-btn { font-size: 14px; padding: 10px 20px; background: var(--info-text); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 500; }
  .copy-btn:hover { background: #2e4a82; }
  .copy-btn.copied { background: var(--pass); }
  details.json-preview { margin-top: 8px; font-size: 11px; }
  details.json-preview pre { background: #faf8f4; padding: 10px; border-radius: 6px; max-height: 240px; overflow: auto; }
`;

const PAGE_SCRIPT = `
const sections = Array.from(document.querySelectorAll("section.eval"));
const STORAGE_KEY = "targetable-feedback-iter1-feedback";

function loadFeedback() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch { return {}; }
}

function saveFeedback(map) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  updateJsonPreview(map);
}

function buildPayload() {
  const map = loadFeedback();
  const timestamp = new Date().toISOString();
  const reviews = sections.map(section => {
    const runId = section.dataset.runId;
    return { run_id: runId, feedback: (map[runId] || "").trim(), timestamp };
  });
  return { reviews, status: "complete" };
}

function updateJsonPreview(map) {
  const preview = document.getElementById("json-preview");
  if (preview) preview.textContent = JSON.stringify(buildPayload(), null, 2);
}

// Wire up textareas
const stored = loadFeedback();
document.querySelectorAll("textarea.feedback").forEach(textarea => {
  const runId = textarea.dataset.runId;
  if (stored[runId]) textarea.value = stored[runId];
  let debounceTimer = null;
  textarea.addEventListener("input", () => {
    const status = textarea.parentElement.querySelector(".feedback-status");
    status.textContent = "Saving...";
    status.classList.remove("saved");
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const map = loadFeedback();
      map[runId] = textarea.value;
      saveFeedback(map);
      status.textContent = "Saved locally";
      status.classList.add("saved");
    }, 400);
  });
});

// Navigation
function navigateTo(index) {
  const target = sections[Math.max(0, Math.min(sections.length - 1, index))];
  if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function currentIndex() {
  const scrollY = window.scrollY + 120;
  for (let index = 0; index < sections.length; index++) {
    const top = sections[index].offsetTop;
    const bottom = top + sections[index].offsetHeight;
    if (scrollY >= top && scrollY < bottom) return index;
  }
  return 0;
}

document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    navigateTo(currentIndex() + parseInt(btn.dataset.direction, 10));
  });
});

document.addEventListener("keydown", event => {
  if (event.target.tagName === "TEXTAREA") return;
  if (event.key === "ArrowDown" || event.key === "j") { event.preventDefault(); navigateTo(currentIndex() + 1); }
  if (event.key === "ArrowUp" || event.key === "k") { event.preventDefault(); navigateTo(currentIndex() - 1); }
});

// Copy button
document.getElementById("copy-btn").addEventListener("click", async () => {
  const payload = JSON.stringify(buildPayload(), null, 2);
  try {
    await navigator.clipboard.writeText(payload);
    const btn = document.getElementById("copy-btn");
    btn.textContent = "Copied! Paste into Claude Code";
    btn.classList.add("copied");
    setTimeout(() => {
      btn.textContent = "Copy feedback JSON";
      btn.classList.remove("copied");
    }, 2400);
  } catch (error) {
    alert("Clipboard copy failed - select the JSON in the preview below and copy manually. Error: " + error.message);
  }
});

// Update progress indicators in headers
sections.forEach((section, index) => {
  const progress = section.querySelector(".nav-progress");
  if (progress) progress.textContent = (index + 1) + " of " + sections.length;
});

updateJsonPreview(stored);
`;

interface EvalsJsonEntry {
  id: string;
  prompt: string;
}

interface EvalsJson {
  evals: EvalsJsonEntry[];
}

function widgetWithFallbacks(widgetPath: string): string {
  const body = existsSync(widgetPath)
    ? readFileSync(widgetPath, 'utf8')
    : '<!-- widget.html missing -->';
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>${DESIGN_FALLBACKS}</style></head>
<body>${body}</body></html>`;
}

function gradeColor(passRate: number): string {
  if (passRate >= 0.8) return 'pass';
  if (passRate >= 0.5) return 'partial';
  return 'fail';
}

function renderAssertion(expectation: Assertion): string {
  const passed = expectation.passed;
  const symbol = passed ? '✓' : '✗';
  const symbolClass = passed ? 'pass' : 'fail';
  const evidence = expectation.evidence || '';
  const evidenceBlock = evidence ? `<div class="assertion-evidence">${evidence}</div>` : '';
  return `<div class="assertion">
  <span class="symbol ${symbolClass}">${symbol}</span>
  <div class="assertion-body">
    <div class="assertion-text">${expectation.text || ''}</div>
    ${evidenceBlock}
  </div>
</div>`;
}

function renderGrading(grading: Grading | Record<string, never>): string {
  if (!grading || Object.keys(grading).length === 0) {
    return "<div class='no-grade'>No grading.</div>";
  }
  const summary = (grading as Grading).summary ?? { passed: 0, total: 0, failed: 0, pass_rate: 0 };
  const passRate = summary.pass_rate ?? 0;
  const passText = `${summary.passed ?? 0}/${summary.total ?? 0} (${Math.round(passRate * 100)}%)`;
  const rows = ((grading as Grading).expectations ?? []).map(renderAssertion).join('');
  return `<div class="grade-panel">
  <div class="grade-summary ${gradeColor(passRate)}">${passText}</div>
  <div class="assertions">${rows}</div>
</div>`;
}

function slugToLabel(slug: string): string {
  // Python's str.title() uppercases the first letter of each word and lowercases the rest.
  return slug
    .replaceAll('-', ' ')
    .replaceAll('_', ' ')
    .split(' ')
    .map((word) => (word.length === 0 ? '' : word[0]!.toUpperCase() + word.slice(1).toLowerCase()))
    .join(' ');
}

// Python's f-string interpolation for `dict.get(key, default)` returns the value's str() form.
// `True`/`False`/`None` (uppercase) for Python booleans/None vs JS lowercase `true`/`false`/`null`.
function formatPythonValue(value: unknown, fallback: string): string {
  if (value === undefined) return fallback;
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  return String(value);
}

function renderSection(
  evalName: string,
  prompt: string,
  meta: Meta,
  response: string,
  grading: Grading | Record<string, never>,
  widgetBlock: string,
): string {
  const runId = `eval-${evalName}-with_skill-run-1`;
  return `<section class="eval" id="section-${evalName}" data-run-id="${runId}">
  <header class="eval-header">
    <div class="header-left">
      <h2>${slugToLabel(evalName)}</h2>
      <div class="eval-id">${evalName}</div>
    </div>
    <div class="nav-buttons">
      <button class="nav-btn" data-direction="-1">← Previous</button>
      <span class="nav-progress"></span>
      <button class="nav-btn" data-direction="1">Next →</button>
    </div>
  </header>
  <div class="eval-body">
    <div class="left-col">
      <div class="prompt-box">
        <div class="label">Prompt</div>
        <pre class="prompt">${prompt}</pre>
      </div>
      <div class="meta-box">
        <div class="label">Subagent activation decision</div>
        <div class="meta-line"><strong>activated:</strong> ${formatPythonValue(meta.activated, 'n/a')}</div>
        <div class="meta-line"><strong>reason:</strong> ${formatPythonValue(meta.reason, 'n/a')}</div>
      </div>
      <div class="response-box">
        <div class="label">Assistant lead-in (response.md)</div>
        <pre class="response">${response}</pre>
      </div>
      ${renderGrading(grading)}
      <div class="feedback-box">
        <div class="label">Your feedback</div>
        <textarea class="feedback" data-run-id="${runId}" placeholder="Anything wrong, weird, or worth changing? Leave empty if it looks good."></textarea>
        <div class="feedback-status"></div>
      </div>
    </div>
    <div class="right-col">
      <div class="label">Rendered widget (with claude.ai design-system fallbacks)</div>
      ${widgetBlock}
    </div>
  </div>
</section>`;
}

function buildWidgetBlock(widgetPath: string): string {
  if (!existsSync(widgetPath)) {
    return '<div class="no-widget">No widget produced (skill did not activate or task was a skip case).</div>';
  }
  const rendered = widgetWithFallbacks(widgetPath);
  const srcdoc = rendered.replaceAll('"', '&quot;');
  return `<iframe class="widget-frame" srcdoc="${srcdoc}"></iframe>`;
}

interface RunArtifacts {
  widgetPath: string;
  response: string;
  meta: Meta;
  grading: Grading | Record<string, never>;
}

function loadRunArtifacts(runDir: string): RunArtifacts {
  const outputsDir = join(runDir, 'outputs');
  const widgetPath = join(outputsDir, 'widget.html');
  const responsePath = join(outputsDir, 'response.md');
  const metaPath = join(outputsDir, 'meta.json');
  const gradingPath = join(runDir, 'grading.json');
  return {
    widgetPath,
    response: existsSync(responsePath) ? readFileSync(responsePath, 'utf8') : '',
    meta: existsSync(metaPath) ? (JSON.parse(readFileSync(metaPath, 'utf8')) as Meta) : {},
    grading: existsSync(gradingPath)
      ? (JSON.parse(readFileSync(gradingPath, 'utf8')) as Grading)
      : {},
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const iterationArg = argv[0];
  if (!iterationArg) {
    console.error('Usage: pnpm eval:preview <iteration-dir>');
    process.exit(1);
  }
  const iterationDir = resolve(iterationArg);
  if (!existsSync(iterationDir) || !statSync(iterationDir).isDirectory()) {
    throw new Error(`Iteration directory not found: ${iterationDir}`);
  }

  const evalsConfig = JSON.parse(readFileSync(EVALS_JSON_PATH, 'utf8')) as EvalsJson;
  const promptsById = Object.fromEntries(
    evalsConfig.evals.map((entry) => [entry.id, entry.prompt]),
  );

  const sections = readdirSync(iterationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('eval-'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const evalName = entry.name.slice('eval-'.length);
      const runDir = join(iterationDir, entry.name, 'with_skill', 'run-1');
      const { widgetPath, response, meta, grading } = loadRunArtifacts(runDir);
      return renderSection(
        evalName,
        promptsById[evalName] ?? '',
        meta,
        response,
        grading,
        buildWidgetBlock(widgetPath),
      );
    });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>targetable-feedback eval iteration-1</title>
<style>${PAGE_CSS}</style>
</head>
<body>
<h1>targetable-feedback - eval iteration-1</h1>
<p class="subtitle">8 scenarios × 2 conditions. Widgets rendered inline with claude.ai design-system fallbacks. Baseline outputs omitted from the visual preview - see grading.json files for that data.</p>

<div class="summary-banner">
  <div class="summary-stat"><span class="value">100%</span><span class="key">with_skill pass rate</span></div>
  <div class="summary-stat"><span class="value">56%</span><span class="key">baseline pass rate</span></div>
  <div class="summary-stat"><span class="value">+44</span><span class="key">delta (percentage points)</span></div>
  <div class="summary-stat"><span class="value">47 / 47</span><span class="key">with_skill assertions</span></div>
  <div class="summary-stat"><span class="value">15 / 27</span><span class="key">baseline assertions</span></div>
</div>

${sections.join('')}

<div class="copy-bar">
  <div class="copy-bar-status">Leave feedback per scenario above. Empty = looks good. Then copy and paste into Claude Code.</div>
  <button class="copy-btn" id="copy-btn">Copy feedback JSON</button>
</div>

<details class="json-preview" style="margin: 8px 0 32px;">
  <summary>Preview JSON payload</summary>
  <pre id="json-preview">{}</pre>
</details>

<script>${PAGE_SCRIPT}</script>

</body>
</html>`;

  const outPath = join(iterationDir, 'eval-preview.html');
  writeFileSync(outPath, html, 'utf8');
  console.log(`Written: ${outPath}`);
}

main();
