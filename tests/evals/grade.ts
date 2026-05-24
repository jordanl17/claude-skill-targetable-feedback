/**
 * Grade each run's outputs against assertions. Writes grading.json per run.
 *
 * Usage:
 *   pnpm eval:grade <iteration-dir>
 *
 * Example:
 *   pnpm eval:grade targetable-feedback-workspace/iteration-8
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import {
  type Assertion,
  type Meta,
  type RunOutputs,
  activatedAssertion,
  assertion,
  countSubunits,
  countTopLevelUnits,
  extractDataIds,
  loadOutputs,
  SLOT_TOKENS,
  summarize,
} from './shared.js';

type Grader = (runDir: string, isBaseline: boolean) => Assertion[];

function gradeTriggerGenerativeFires(runDir: string, isBaseline: boolean): Assertion[] {
  const { widget, response, meta } = loadOutputs(runDir);
  if (isBaseline) {
    // Baseline has no skill so activation never happens; assertion text intentionally shortened.
    return [
      assertion(
        'widget_html_present',
        widget.includes('class="unit'),
        `widget contains unit div: ${widget.includes('class="unit') ? 'True' : 'False'}`,
      ),
      assertion(
        'min_5_units',
        countTopLevelUnits(widget) >= 5,
        `top-level units=${countTopLevelUnits(widget)}`,
      ),
      assertion(
        'no_duplicate_prose',
        response.length < 2000,
        `response.md length=${response.length}`,
      ),
    ];
  }
  return [
    activatedAssertion(meta, true),
    assertion(
      'widget_html_present: widget.html exists and contains unit divs',
      widget.includes('<div class="unit') || widget.includes('class="unit'),
      `widget length=${widget.length}`,
    ),
    assertion(
      'min_5_units: widget contains at least 5 top-level .unit divs',
      countTopLevelUnits(widget) >= 5,
      `top-level units=${countTopLevelUnits(widget)}`,
    ),
    assertion(
      'no_duplicate_prose: response.md does not embed the full RFC prose outside the widget',
      response.length < 2000,
      `response.md length=${response.length}`,
    ),
  ];
}

function gradeTriggerSingleEditSkips(runDir: string, isBaseline: boolean): Assertion[] {
  const { widget, response, meta } = loadOutputs(runDir);
  const expectations: Assertion[] = [];
  if (!isBaseline) {
    expectations.push(
      activatedAssertion(meta, false, 'activated_meta_false: meta.json has activated=false'),
    );
  }
  expectations.push(
    assertion(
      'no_widget_html: no widget unit divs produced',
      !widget.includes('class="unit'),
      `widget contains unit div: ${widget.includes('class="unit') ? 'True' : 'False'}`,
    ),
    assertion(
      "edit_applied: response contains 'within 24 hours'",
      response.includes('within 24 hours'),
      'checked response.md',
    ),
    assertion(
      'other_bullets_present: response still contains PagerDuty, war-room, and 48 hours',
      ['PagerDuty', 'war-room', '48 hours'].every((token) => response.includes(token)),
      'checked response.md',
    ),
  );
  return expectations;
}

function gradeTriggerCodeTaskSkips(runDir: string, isBaseline: boolean): Assertion[] {
  const { widget, response, meta } = loadOutputs(runDir);
  const expectations: Assertion[] = [];
  if (!isBaseline) {
    expectations.push(
      activatedAssertion(meta, false, 'activated_meta_false: meta.json has activated=false'),
    );
  }
  expectations.push(
    assertion(
      'no_widget_html: no widget unit divs produced',
      !widget.includes('class="unit'),
      `widget produced: ${widget.length > 0 ? 'True' : 'False'}`,
    ),
    assertion(
      "function_present: response contains 'def dedupe_preserving_order'",
      response.includes('def dedupe_preserving_order'),
      '',
    ),
    assertion(
      'docstring_present: response contains triple-quoted docstring',
      response.includes('"""'),
      '',
    ),
  );
  return expectations;
}

const VERBATIM_EXACT_PARAS = [
  'Acme Notebook 2026 is our most ambitious release yet. We are redefining what a notebook can be for everyday work.',
  'Built for the modern knowledge worker, Acme Notebook 2026 brings a clean, focused writing experience that adapts to how you actually think.',
  'Three new features: smart linking between notes, an AI-powered outline view, and seamless mobile sync that just works.',
  'Whether you are a writer, a researcher, or a student, you will feel at home from the first page. Acme Notebook 2026 is designed for everyone who thinks in writing.',
  'Available March 15th on web, desktop, and mobile. Sign up at acme.com to be the first to know.',
];

function gradeVerbatimExactProse(runDir: string, isBaseline: boolean): Assertion[] {
  const { widget, response, meta } = loadOutputs(runDir);
  // Baseline writes everything to response.md (no widget.html), so search both.
  const haystack = `${widget}\n${response}`;
  const expectations: Assertion[] = [];
  if (!isBaseline) {
    const dataIds = extractDataIds(widget);
    expectations.push(
      activatedAssertion(meta, true),
      assertion(
        'exactly_5_units: widget.html contains exactly 5 top-level .unit divs',
        countTopLevelUnits(widget) === 5,
        `top-level units=${countTopLevelUnits(widget)}`,
      ),
      assertion(
        'data_ids_sequential: widget data-ids are 1,2,3,4,5',
        arraysEqual(dataIds, ['1', '2', '3', '4', '5']),
        `data-ids=${formatStringArray(dataIds)}`,
      ),
    );
  }
  VERBATIM_EXACT_PARAS.forEach((paragraph, index) => {
    const found = haystack.includes(paragraph);
    expectations.push(
      assertion(
        `para${index + 1}_verbatim: output contains paragraph ${index + 1} byte-for-byte`,
        found,
        found ? '' : `missing: ${paragraph.slice(0, 60)}...`,
      ),
    );
  });
  return expectations;
}

const AWKWARD_GOALS = [
  'Goal 1: reduce time. Reducing time good.',
  'Goal 2: ship the thing that ships. We ship it by Q3.',
  'Goal 3: customers happy or sad? Make them happy. Survey says it.',
  'Goal 4: monies in. Monies up. Track in dashboard which we build.',
  'Goal 5: team happy too. Not just customers. Both.',
];

// Phrases that would indicate the model "improved" the awkward prose rather than preserving it.
const IMPROVEMENT_SMELL_WORDS = [
  'increase revenue',
  'customer satisfaction',
  'team satisfaction',
  'track revenue',
];

function gradeVerbatimAwkwardPhrasing(runDir: string, isBaseline: boolean): Assertion[] {
  const { widget, response, meta } = loadOutputs(runDir);
  const haystack = `${widget}\n${response}`;
  const expectations: Assertion[] = [];
  if (!isBaseline) {
    expectations.push(
      activatedAssertion(meta, true, 'activated_meta_true'),
      assertion(
        'exactly_5_units',
        countTopLevelUnits(widget) === 5,
        `top-level units=${countTopLevelUnits(widget)}`,
      ),
    );
  }
  AWKWARD_GOALS.forEach((goal, index) => {
    const found = haystack.includes(goal);
    expectations.push(
      assertion(
        `awkward${index + 1}_preserved`,
        found,
        found ? '' : `missing: ${goal.slice(0, 60)}...`,
      ),
    );
  });
  const leaked = IMPROVEMENT_SMELL_WORDS.filter((word) =>
    haystack.toLowerCase().includes(word.toLowerCase()),
  );
  expectations.push(
    assertion(
      "no_improvement_smell: no 'improved' rephrasing detected",
      leaked.length === 0,
      leaked.length ? `leaked: ${formatStringArray(leaked)}` : '',
    ),
  );
  return expectations;
}

const SUBUNIT_PARENT_TEXTS = [
  'Reduce p95 API latency',
  'Cut deploy time below 5 minutes',
  'Improve on-call experience',
];

const SUBUNIT_CHILD_TEXTS = [
  'Profile the slowest 10 endpoints and find the worst offenders.',
  'Migrate session lookups off Postgres onto Redis.',
  'Add request-coalescing to the user-profile endpoint.',
  'Parallelize the integration test suite across 4 runners.',
  'Cache pnpm install between CI jobs.',
  'Audit every page that fired last quarter and tag the actionable vs noise.',
  'Write three new runbooks for the most-common pages.',
  'Rotate secondary on-call weekly instead of monthly.',
];

function gradeSubunits(runDir: string, isBaseline: boolean): Assertion[] {
  const { widget, response, meta } = loadOutputs(runDir);
  const haystack = `${widget}\n${response}`;
  const expectations: Assertion[] = [];
  if (!isBaseline) {
    const dataIds = extractDataIds(widget);
    const topLevelIds = dataIds.filter((dataId) => !dataId.includes('.'));
    const subLevelIds = dataIds.filter((dataId) => dataId.includes('.'));
    const twoDotIds = dataIds.filter((dataId) => (dataId.match(/\./g) ?? []).length > 1);
    expectations.push(
      activatedAssertion(meta, true, 'activated_meta_true'),
      assertion(
        'three_top_level_parents: exactly 3 top-level units',
        countTopLevelUnits(widget) === 3,
        `top-level units=${countTopLevelUnits(widget)}`,
      ),
      assertion(
        'top_level_ids_sequential: top-level ids are 1, 2, 3',
        arraysEqual(topLevelIds, ['1', '2', '3']),
        `top-level ids=${formatStringArray(topLevelIds)}`,
      ),
      assertion(
        'dot_notation_subunit_ids: sub-unit ids use dot notation',
        subLevelIds.length >= 6 && subLevelIds.every((dataId) => /^\d+\.\d+$/.test(dataId)),
        `sub-level ids=${formatStringArray(subLevelIds)}`,
      ),
      assertion(
        'no_3_level_nesting: no ids with two dots',
        twoDotIds.length === 0,
        `ids with 2+ dots: ${formatStringArray(twoDotIds)}`,
      ),
    );
  }
  SUBUNIT_PARENT_TEXTS.forEach((parentText) => {
    const found = haystack.includes(parentText);
    expectations.push(
      assertion(`parent_present: '${parentText.slice(0, 40)}...'`, found, found ? '' : 'missing'),
    );
  });
  const missingChildren = SUBUNIT_CHILD_TEXTS.filter((text) => !haystack.includes(text));
  expectations.push(
    assertion(
      'all_8_subunit_texts_present',
      missingChildren.length === 0,
      missingChildren.length
        ? `missing ${missingChildren.length}: ${formatStringArray(missingChildren.map((child) => child.slice(0, 40)))}`
        : '',
    ),
  );
  return expectations;
}

const REMOVAL_REMOVED_PHRASES = [
  'Three new features',
  'smart linking',
  'AI outline view',
  'mobile sync',
];
const REMOVAL_REMAINING_PHRASES = [
  'Acme Notebook 2026 is our most ambitious release yet',
  'Built for the modern knowledge worker',
  'Whether you are a writer or a student',
  'Available March 15th on web, desktop, and mobile',
];

function gradeRemovalRenumbers(runDir: string, isBaseline: boolean): Assertion[] {
  const { widget, response } = loadOutputs(runDir);
  const haystack = `${widget}\n${response}`;
  const expectations: Assertion[] = [];
  if (!isBaseline) {
    const dataIds = extractDataIds(widget);
    expectations.push(
      assertion(
        'exactly_4_units: widget has exactly 4 top-level units',
        countTopLevelUnits(widget) === 4,
        `top-level units=${countTopLevelUnits(widget)}`,
      ),
      assertion(
        'data_ids_compact: data-ids are 1,2,3,4 (no gaps)',
        arraysEqual(dataIds, ['1', '2', '3', '4']),
        `data-ids=${formatStringArray(dataIds)}`,
      ),
      assertion('rev_pill_present: widget has rev-pill span', widget.includes('rev-pill'), ''),
    );
  }
  // Removed unit content must not appear in the widget (lead-in may legitimately mention what was removed).
  const leaked = REMOVAL_REMOVED_PHRASES.filter((phrase) => widget.includes(phrase));
  expectations.push(
    assertion(
      "removed_content_absent: removed unit's words don't appear in widget",
      leaked.length === 0,
      leaked.length ? `leaked into widget: ${formatStringArray(leaked)}` : '',
    ),
  );
  const missing = REMOVAL_REMAINING_PHRASES.filter((phrase) => !haystack.includes(phrase));
  expectations.push(
    assertion(
      'other_units_present: units 1, 2, 4, 5 still appear verbatim',
      missing.length === 0,
      missing.length ? `missing: ${formatStringArray(missing)}` : '',
    ),
  );
  return expectations;
}

const REMOVAL_SUBTREE_REMOVED_PHRASES = [
  'Cut deploy time',
  'Parallelize test suite',
  'Cache pnpm install',
];
const REMOVAL_SUBTREE_REMAINING_PHRASES = [
  'Reduce p95 API latency',
  'Improve on-call experience',
  'Profile slow endpoints',
  'Audit recent pages',
];

function gradeRemovalSubtree(runDir: string, isBaseline: boolean): Assertion[] {
  const { widget, response } = loadOutputs(runDir);
  const haystack = `${widget}\n${response}`;
  const expectations: Assertion[] = [];
  if (!isBaseline) {
    const subIds = extractDataIds(widget)
      .filter((dataId) => dataId.includes('.'))
      .sort();
    expectations.push(
      assertion(
        'two_top_level_parents: exactly 2 top-level units',
        countTopLevelUnits(widget) === 2,
        `top-level units=${countTopLevelUnits(widget)}`,
      ),
      assertion(
        'four_subunits: exactly 4 sub-units',
        countSubunits(widget) === 4,
        `sub-units=${countSubunits(widget)}`,
      ),
      assertion(
        'subunit_ids_renumbered: sub-ids are 1.1,1.2,2.1,2.2 (no 3.x)',
        arraysEqual(subIds, ['1.1', '1.2', '2.1', '2.2']),
        `sub-ids=${formatStringArray(subIds)}`,
      ),
    );
  }
  const leaked = REMOVAL_SUBTREE_REMOVED_PHRASES.filter((phrase) => widget.includes(phrase));
  expectations.push(
    assertion(
      "removed_subtree_absent: removed parent and sub-units don't appear in widget",
      leaked.length === 0,
      leaked.length ? `leaked into widget: ${formatStringArray(leaked)}` : '',
    ),
  );
  const missing = REMOVAL_SUBTREE_REMAINING_PHRASES.filter((phrase) => !haystack.includes(phrase));
  expectations.push(
    assertion(
      'remaining_subtrees_present',
      missing.length === 0,
      missing.length ? `missing: ${formatStringArray(missing)}` : '',
    ),
  );
  return expectations;
}

const MIXED_SHAPES_INTRO_PARAGRAPHS = [
  "We're targeting March 15th for the public launch. This brief captures where we are across the workstreams that gate the date.",
  "The work splits into three areas: product polish, marketing readiness, and ops/SRE. Each is on track but has 2-3 specific items that still need close attention. The biggest risk right now is the mobile sync feature - it's the only workstream where slipping the scope is still on the table.",
];

const MIXED_SHAPES_BULLET_PARENTS = [
  'Mobile sync reliability under poor network conditions',
  'Pricing page localization',
  'Support readiness',
];

const MIXED_SHAPES_SUBBULLETS = [
  'The current retry logic stalls if the device loses connection mid-sync rather than backing off cleanly.',
  "Conflict resolution on offline edits hasn't been tested with realistic multi-device timelines.",
  'Battery impact on iOS is 2x what we expected; needs profiling before launch.',
  'German and Japanese translations are returned but not reviewed.',
  'The annual-vs-monthly toggle layout breaks below 380px in Safari.',
  "Three of our six support agents haven't completed the product training yet.",
  'The shared inbox is missing rules to route AI-feature questions to the right specialist.',
];

const MIXED_SHAPES_CLOSING_PARAGRAPH =
  'The core sync, search, and AI outline features are done. Marketing site copy is approved. The press embargo lifts at 9am ET on launch day. The CDN warmup runbook has been rehearsed twice.';

function gradeMixedShapes(runDir: string, isBaseline: boolean): Assertion[] {
  const { widget, response, meta } = loadOutputs(runDir);
  const haystack = `${widget}\n${response}`;
  const expectations: Assertion[] = [];
  if (!isBaseline) {
    const hasOpenRisksH3 = /<h3[^>]*>\s*Open risks\s*<\/h3>/.test(widget);
    const hasLockedH3 = /<h3[^>]*>\s*What['’]s locked\s*<\/h3>/.test(widget);
    const unitTextMatches = Array.from(
      widget.matchAll(/<div\s+class="[^"]*\bunit\b[^"]*"[^>]*>([^<]+)/g),
    );
    const unitText = unitTextMatches.map((match) => match[1]).join(' ');
    const headingsLeakedIntoUnits =
      unitText.includes('Open risks') ||
      unitText.includes("What's locked") ||
      unitText.includes('What’s locked');
    const topLevelCount = countTopLevelUnits(widget);
    // A sub-unit div can have both "unit" and "bullet" in its class list; filter those out for the top-level bullet count.
    const bulletDivMatches = Array.from(
      widget.matchAll(/<div\s+class="[^"]*\bunit\b[^"]*\bbullet\b[^"]*"[^>]*>/g),
    ).map((match) => match[0]);
    const bulletParentsTop = bulletDivMatches.filter((match) => !match.includes('sub-unit'));
    const subCount = countSubunits(widget);
    expectations.push(
      activatedAssertion(meta, true, 'activated_meta_true'),
      assertion(
        "headings_as_h3: 'Open risks' and 'What's locked' rendered as <h3>",
        hasOpenRisksH3 && hasLockedH3,
        `Open risks h3=${hasOpenRisksH3 ? 'True' : 'False'}, What's locked h3=${hasLockedH3 ? 'True' : 'False'}`,
      ),
      assertion(
        'headings_not_units: heading text does not appear inside any .unit div',
        !headingsLeakedIntoUnits,
        headingsLeakedIntoUnits ? 'heading text leaked into a unit div' : '',
      ),
      assertion(
        'total_6_top_level_units: 2 intro + 3 bullet parents + 1 closing',
        topLevelCount === 6,
        `top-level units=${topLevelCount}`,
      ),
      assertion(
        'bullet_parents_present: 3 top-level bullet units',
        bulletParentsTop.length === 3,
        `top-level bullet units=${bulletParentsTop.length}`,
      ),
      assertion(
        'subunits_count_7: 3+2+2 sub-units under bullet parents',
        subCount === 7,
        `sub-units=${subCount}`,
      ),
    );
  }
  // Verbatim checks apply to both with_skill and baseline.
  MIXED_SHAPES_INTRO_PARAGRAPHS.forEach((paragraph, index) => {
    const found = haystack.includes(paragraph);
    expectations.push(
      assertion(
        `intro_para_${index + 1}_verbatim`,
        found,
        found ? '' : `missing: ${paragraph.slice(0, 60)}...`,
      ),
    );
  });
  const missingParents = MIXED_SHAPES_BULLET_PARENTS.filter((parent) => !haystack.includes(parent));
  expectations.push(
    assertion(
      'bullet_parents_verbatim: all 3 parent headings present byte-for-byte',
      missingParents.length === 0,
      missingParents.length ? `missing: ${formatStringArray(missingParents)}` : '',
    ),
  );
  const missingSubs = MIXED_SHAPES_SUBBULLETS.filter((text) => !haystack.includes(text));
  expectations.push(
    assertion(
      'subbullets_verbatim: all 7 sub-bullets present byte-for-byte',
      missingSubs.length === 0,
      missingSubs.length
        ? `missing ${missingSubs.length}: ${formatStringArray(missingSubs.map((text) => text.slice(0, 40)))}`
        : '',
    ),
  );
  const closingFound = haystack.includes(MIXED_SHAPES_CLOSING_PARAGRAPH);
  expectations.push(
    assertion(
      'closing_para_verbatim',
      closingFound,
      closingFound ? '' : 'missing closing paragraph',
    ),
  );
  return expectations;
}

const GRADERS: Record<string, Grader> = {
  'trigger-generative-fires': gradeTriggerGenerativeFires,
  'trigger-single-edit-skips': gradeTriggerSingleEditSkips,
  'trigger-code-task-skips': gradeTriggerCodeTaskSkips,
  'verbatim-exact-prose': gradeVerbatimExactProse,
  'verbatim-awkward-phrasing': gradeVerbatimAwkwardPhrasing,
  'subunits-2-level-nesting': gradeSubunits,
  'removal-renumbers-siblings': gradeRemovalRenumbers,
  'removal-subtree-on-parent': gradeRemovalSubtree,
  'mixed-shapes-document': gradeMixedShapes,
};

function slotFillAssertion(runDir: string): Assertion | null {
  const widgetPath = join(runDir, 'outputs', 'widget.html');
  if (!existsSync(widgetPath)) return null;
  const widget = readFileSync(widgetPath, 'utf8');
  if (widget.trim() === '') return null;
  const unfilled = SLOT_TOKENS.filter((token) => widget.includes(token));
  return assertion(
    'no_unfilled_slot_tokens: WIDGET_CSS and WIDGET_JS substituted into widget',
    unfilled.length === 0,
    unfilled.length ? `unfilled tokens present: ${formatStringArray([...unfilled])}` : '',
  );
}

function gradeRun(evalName: string, runDir: string, isBaseline: boolean): Assertion[] {
  const grader = GRADERS[evalName];
  if (!grader) throw new Error(`Unknown eval: ${evalName}`);
  const expectations = grader(runDir, isBaseline);
  if (!isBaseline) {
    const slotCheck = slotFillAssertion(runDir);
    if (slotCheck !== null) expectations.push(slotCheck);
  }
  return expectations;
}

interface IterationRun {
  evalName: string;
  variant: 'with_skill' | 'without_skill';
  runDir: string;
  isBaseline: boolean;
}

function* iterRuns(iterationDir: string): Generator<IterationRun> {
  const entries = readdirSync(iterationDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('eval-'))
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const evalDir = join(iterationDir, entry.name);
    const evalName = entry.name.slice('eval-'.length);
    for (const variant of ['with_skill', 'without_skill'] as const) {
      const variantDir = join(evalDir, variant);
      if (!existsSync(variantDir)) continue;
      const runOne = join(variantDir, 'run-1');
      const runDir = existsSync(runOne) ? runOne : variantDir;
      yield { evalName, variant, runDir, isBaseline: variant === 'without_skill' };
    }
  }
}

// Python-style repr() for a list of strings: ['a', 'b', 'c'] or ["a's", 'b'] mixed.
// Python's repr prefers single quotes, but switches to double quotes for strings that
// contain a single quote (and no double quote) so it can avoid backslash-escaping.
// Reproduced here so evidence strings render byte-identical to the pre-port output.
function reprString(value: string): string {
  const hasSingle = value.includes("'");
  const hasDouble = value.includes('"');
  if (hasSingle && !hasDouble) {
    return `"${value.replaceAll('\\', '\\\\')}"`;
  }
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function formatStringArray(items: readonly string[]): string {
  if (items.length === 0) return '[]';
  return `[${items.map(reprString).join(', ')}]`;
}

function arraysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function main(): void {
  const argv = process.argv.slice(2);
  const iterationArg = argv[0];
  if (!iterationArg) {
    console.error('Usage: pnpm eval:grade <iteration-dir>');
    process.exit(1);
  }
  const iterationDir = resolve(iterationArg);
  if (!existsSync(iterationDir) || !statSync(iterationDir).isDirectory()) {
    throw new Error(`Iteration directory not found: ${iterationDir}`);
  }

  const summaryLines: string[] = [];
  for (const { evalName, variant, runDir, isBaseline } of iterRuns(iterationDir)) {
    let expectations: Assertion[];
    try {
      expectations = gradeRun(evalName, runDir, isBaseline);
    } catch (error) {
      expectations = [assertion('grading_error', false, String((error as Error).message ?? error))];
    }
    const summary = summarize(expectations);
    writeFileSync(
      join(runDir, 'grading.json'),
      stringifyWithFloatPassRate({ expectations, summary }),
      'utf8',
    );
    summaryLines.push(
      `${evalName} (${variant}): ${summary.passed}/${summary.total} (${formatPercent(summary.pass_rate)})`,
    );
  }
  console.log(summaryLines.join('\n'));
}

// Match Python's `f"{pass_rate:.0%}"` formatting (round to nearest, no decimal places).
function formatPercent(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

// Python's json.dump writes float values like 1.0 / 0.0 with the trailing .0 preserved.
// JS JSON.stringify strips it (1.0 -> "1"). Post-process pass_rate specifically to
// restore the Python float formatting so grading.json stays byte-identical.
function stringifyWithFloatPassRate(value: {
  expectations: Assertion[];
  summary: ReturnType<typeof summarize>;
}): string {
  const json = JSON.stringify(value, null, 2);
  return json.replace(/"pass_rate": (-?\d+)(?=[,\n}])/g, '"pass_rate": $1.0');
}

// Suppress unused-import warning for `basename`/`Meta`/`RunOutputs` types referenced only by signature.
void basename;
void ({} as Meta);
void ({} as RunOutputs);

main();
