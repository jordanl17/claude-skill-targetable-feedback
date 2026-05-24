# Testing and eval strategy

Four test surfaces, in order of increasing effort. Pick the right one for the change you're making.

| Surface                            | What it catches                                                                                                                                          | When to run                                                                                                | Time    |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------- |
| 1. Vitest unit + integration suite | Widget runtime bugs (script init, click/input/change handlers, payload shape), bundle integrity (`type="module"` preservation, slot tokens, size budget) | After editing `widget-src/widget.ts`, `vite.config.ts`, or any build path. Runs automatically on every PR. | ~1 sec  |
| 2. Manual trigger walkthrough      | Whether SKILL.md description fires/skips correctly in real CC                                                                                            | After editing the SKILL.md `description:` frontmatter                                                      | ~5 min  |
| 3. Programmatic eval suite         | Verbatim preservation, sub-unit IDs, removal renumbering, plus trigger precision                                                                         | After editing SKILL.md body, parsing rules, or anything in `widget-src/`                                   | ~15 min |
| 4. Description optimization        | Trigger-rate tuning across many phrasings                                                                                                                | Currently broken for this skill - see below                                                                | n/a     |

## Surface 1: Vitest unit + integration suite

Run with `pnpm test`. Two files in [`tests/widget/`](widget/):

- [`bundle.test.ts`](widget/bundle.test.ts) - static checks against the built `widget-bundled.html`: the inlined `<script>` declares `type="module"` (otherwise it runs before the DOM is ready and breaks all event listeners), runtime slot tokens like `{{DOCUMENT_TITLE}}` are preserved, build-time tokens are substituted, critical string literals survive terser, bundle stays under 16 KB.
- [`widget.test.ts`](widget/widget.test.ts) - jsdom-based runtime checks: loads the bundle into Vitest's jsdom, runs the inlined script via `new Function()` (because jsdom does not execute `<script type="module">` natively), then exercises clicks, input events, the remove checkbox, and verifies `sendPrompt` is called with the right payload.

This is the layer that catches "the script runs but nothing happens" bugs - exactly what the eval suite (which only grades static HTML) cannot.

Run on every PR via `.github/workflows/build.yml`. Also runs in the release workflow before the zip step, so a broken bundle cannot reach a release.

## Surface 2: Manual trigger walkthrough

The checklist lives at [`tests/trigger-cases.md`](trigger-cases.md). 8 prompts you type into a fresh Claude Code session in an unrelated directory. Activate-or-skip decisions are observable in CC's output (does it read `SKILL.md`, reference `assets/widget-bundled.html`, attempt `show_widget`?).

Use this as a quick sanity check whenever you touch the description.

## Surface 3: Programmatic eval suite

Scaffold lives in [`tests/evals/`](evals/). Each iteration:

1. **Pick an iteration number** (last one is in `targetable-feedback-workspace/iteration-N`). Iteration 1 was run at skill v0.3.0; current main is v0.4.0+, so iteration 2 is the next one.
2. **Read [`tests/evals/orchestrator.md`](evals/orchestrator.md).** It has the setup commands and the two prompt templates (with_skill + baseline). A Claude Code agent spawns 18 background subagents in one Agent-tool batch and the system notifies on each completion.
3. **Grade** when all 18 are done:
   ```bash
   pnpm eval:grade targetable-feedback-workspace/iteration-N
   ```
   Writes `grading.json` per run with `{expectations: [...], summary: {pass_rate, ...}}`. Each assertion is programmatic (regex/string match against the widget HTML or response text).
4. **Build a visual review:**
   ```bash
   pnpm eval:preview targetable-feedback-workspace/iteration-N
   open targetable-feedback-workspace/iteration-N/eval-preview.html
   ```
   Shows each widget rendered inline with claude.ai design-system fallbacks, alongside the grading. Per-scenario feedback textareas auto-save to localStorage; "Copy feedback JSON" sticky button exports the payload.

The 9 scenarios in [`tests/evals/evals.json`](evals/evals.json) cover the four concerns we care about plus a mixed-structure check:

- **Trigger precision** (3 scenarios): fires on iteration intent, skips on single-edit feedback, skips on code tasks.
- **Verbatim preservation** (2 scenarios): one with exact prose, one with deliberately awkward phrasing the model would otherwise "improve".
- **Sub-unit handling** (1 scenario): 3 parents × 2-3 sub-bullets each, checks dot-notation `data-id` values like `1.1`, `2.3`.
- **Removal flow** (2 scenarios): siblings renumber, parent removal also drops the subtree.
- **Mixed shapes** (1 scenario): one document with intro prose paragraphs + `## Open risks` heading + bulleted parents with sub-bullets + closing prose. Checks that headings render as `<h3>` (not units), plain and bulleted shapes coexist correctly, and verbatim is preserved across all shapes.

### Editing the widget sources

The widget ships as `targetable-feedback/assets/widget-bundled.html` (a single file with CSS and JS inlined). The split sources live outside the skill folder at `widget-src/` (`widget.html`, `widget.css`, `widget.ts`, `globals.d.ts`) so they don't bloat the distributed zip. After editing any source, regenerate the bundle:

```bash
pnpm install      # first time only
pnpm type-check   # optional, recommended after TS edits
pnpm build
```

`pnpm build` runs Vite (`vite.config.ts`), which transpiles the TypeScript via esbuild, minifies the CSS with lightningcss and the JS with terser, then inlines everything into a single HTML file via `vite-plugin-singlefile`. `scripts/build-zip.sh` invokes the build automatically before zipping locally, and the release workflow runs it before producing the GitHub release zip - so the released artifact always reflects the latest source.

You can also run `pnpm dev` to open the widget in a local browser for visual smoke testing (note: the `Apply` button calls `sendPrompt`, which is only defined inside the claude.ai host - it will error in local dev).

### Iteration 1 baseline (skill v0.3.0)

- with_skill: 47/47 assertions passed (100%)
- without_skill: 15/27 (56%)
- Skill delta: +44 percentage points

The most informative scenario was `verbatim-awkward-phrasing`: the baseline rewrote the awkward OKRs into "improved" versions; the skill kept them byte-identical. That's the verbatim rule working as designed.

## Surface 4: Description optimization (currently broken)

Anthropic's `skill-creator` ships a `run_loop.py` description tuner. We tried it for this skill and got `recall=0%` across all iterations - no proposed description was ever able to trigger the skill in the optimizer's harness.

**Root cause:** the optimizer uses `claude -p` (headless CLI), which doesn't expose `visualize:show_widget`. The model rationally refuses to invoke a skill whose primary tool isn't available. So the harness fundamentally cannot measure trigger rate for this skill.

If you want to re-attempt:

1. Either modify `~/.claude/skills/skill-creator/scripts/run_eval.py` to inject a stub `show_widget` tool, or
2. Use Surface 1 / Surface 2 as proxies for trigger precision.

The 20 trigger queries we drafted (`tests/evals/trigger-eval.json`) are kept around for whenever this is unblocked.

## Workspace hygiene

`targetable-feedback-workspace/` is gitignored. It holds:

- per-iteration eval results (`iteration-N/`)
- snapshot copies of the skill (`skill-snapshot-iter-N/`)
- the eval-preview.html that `build_preview.ts` writes

Nothing in this directory needs to be committed. The scaffolding in `tests/evals/` is what's reproducible.
