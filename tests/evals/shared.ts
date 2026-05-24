import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface Assertion {
  text: string;
  passed: boolean;
  evidence: string;
}

export interface GradingSummary {
  passed: number;
  failed: number;
  total: number;
  pass_rate: number;
}

export interface Grading {
  expectations: Assertion[];
  summary: GradingSummary;
}

export interface Meta {
  activated?: boolean | null;
  reason?: string;
}

export interface RunOutputs {
  widget: string;
  response: string;
  meta: Meta;
}

const UNIT_DATA_ID_PATTERN = /<div\s+class="[^"]*\bunit\b[^"]*"[^>]*\bdata-id="([^"]+)"/g;

export const SLOT_TOKENS = ['{{WIDGET_CSS}}', '{{WIDGET_JS}}'] as const;

export function loadText(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

export function loadJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

export function loadOutputs(runDir: string): RunOutputs {
  const outputsDir = join(runDir, 'outputs');
  return {
    widget: loadText(join(outputsDir, 'widget.html')),
    response: loadText(join(outputsDir, 'response.md')),
    meta: loadJson<Meta>(join(outputsDir, 'meta.json'), {}),
  };
}

export function countDivs(html: string, className: string): number {
  const pattern = new RegExp(`<div\\s+class="[^"]*\\b${className}\\b[^"]*"[^>]*>`, 'g');
  return Array.from(html.matchAll(pattern)).length;
}

export function countTopLevelUnits(html: string): number {
  return countDivs(html, 'unit') - countDivs(html, 'sub-unit');
}

export function countSubunits(html: string): number {
  return countDivs(html, 'sub-unit');
}

export function extractDataIds(html: string): string[] {
  return Array.from(html.matchAll(UNIT_DATA_ID_PATTERN), (match) => match[1]!);
}

export function assertion(text: string, passed: boolean, evidence = ''): Assertion {
  return { text, passed, evidence };
}

export function activatedAssertion(
  meta: Meta,
  expected: boolean,
  label = 'activated_meta_true: meta.json has activated=true',
): Assertion {
  const actual = meta.activated;
  return assertion(label, actual === expected, `meta.activated=${formatPythonRepr(actual)}`);
}

// Match Python's repr() formatting for booleans/None - used in grading.json evidence
// strings so the migration produces byte-identical output to the pre-port snapshots.
function formatPythonRepr(value: unknown): string {
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (value === null || value === undefined) return 'None';
  return JSON.stringify(value);
}

export function summarize(expectations: Assertion[]): GradingSummary {
  const passedCount = expectations.filter((expectation) => expectation.passed).length;
  const total = expectations.length;
  return {
    passed: passedCount,
    failed: total - passedCount,
    total,
    pass_rate: total ? passedCount / total : 0.0,
  };
}
