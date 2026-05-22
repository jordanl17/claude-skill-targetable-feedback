# Testing and eval strategy

Three test surfaces, in order of increasing effort. Pick the right one for the change you're making.

| Surface | What it catches | When to run | Time |
|---|---|---|---|
| 1. Manual trigger walkthrough | Whether SKILL.md description fires/skips correctly in real CC | After editing the SKILL.md `description:` frontmatter | ~5 min |
| 2. Programmatic eval suite | Verbatim preservation, sub-unit IDs, removal renumbering, plus trigger precision | After editing SKILL.md body, parsing rules, or widget.html | ~15 min |
| 3. Description optimization | Trigger-rate tuning across many phrasings | Currently broken for this skill - see below | n/a |

## Surface 1: Manual trigger walkthrough

The checklist lives at [`tests/trigger-cases.md`](trigger-cases.md). 8 prompts you type into a fresh Claude Code session in an unrelated directory. Activate-or-skip decisions are observable in CC's output (does it read `SKILL.md`, reference `resources/widget.html`, attempt `show_widget`?).

Use this as a quick sanity check whenever you touch the description.

## Surface 2: Programmatic eval suite

Scaffold lives in [`tests/evals/`](evals/). Each iteration:

1. **Pick an iteration number** (last one is in `targetable-feedback-workspace/iteration-N`). Iteration 1 was run at skill v0.3.0; current main is v0.4.0+, so iteration 2 is the next one.
2. **Read [`tests/evals/orchestrator.md`](evals/orchestrator.md).** It has the setup commands and the two prompt templates (with_skill + baseline). A Claude Code agent spawns 18 background subagents in one Agent-tool batch and the system notifies on each completion.
3. **Grade** when all 16 are done:
   ```bash
   python3 tests/evals/grade.py targetable-feedback-workspace/iteration-N
   ```
   Writes `grading.json` per run with `{expectations: [...], summary: {pass_rate, ...}}`. Each assertion is programmatic (regex/string match against the widget HTML or response text).
4. **Build a visual review:**
   ```bash
   python3 tests/evals/build_preview.py targetable-feedback-workspace/iteration-N
   open targetable-feedback-workspace/iteration-N/eval-preview.html
   ```
   Shows each widget rendered inline with claude.ai design-system fallbacks, alongside the grading. Per-scenario feedback textareas auto-save to localStorage; "Copy feedback JSON" sticky button exports the payload.

The 9 scenarios in [`tests/evals/evals.json`](evals/evals.json) cover the four concerns we care about plus a mixed-structure check:

- **Trigger precision** (3 scenarios): fires on iteration intent, skips on single-edit feedback, skips on code tasks.
- **Verbatim preservation** (2 scenarios): one with exact prose, one with deliberately awkward phrasing the model would otherwise "improve".
- **Sub-unit handling** (1 scenario): 3 parents × 2-3 sub-bullets each, checks dot-notation `data-id` values like `1.1`, `2.3`.
- **Removal flow** (2 scenarios): siblings renumber, parent removal also drops the subtree.
- **Mixed shapes** (1 scenario): one document with intro prose paragraphs + `## Open risks` heading + bulleted parents with sub-bullets + closing prose. Checks that headings render as `<h3>` (not units), plain and bulleted shapes coexist correctly, and verbatim is preserved across all shapes.

### Iteration 1 baseline (skill v0.3.0)

- with_skill: 47/47 assertions passed (100%)
- without_skill: 15/27 (56%)
- Skill delta: +44 percentage points

The most informative scenario was `verbatim-awkward-phrasing`: the baseline rewrote the awkward OKRs into "improved" versions; the skill kept them byte-identical. That's the verbatim rule working as designed.

## Surface 3: Description optimization (currently broken)

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
- the eval-preview.html that `build_preview.py` writes

Nothing in this directory needs to be committed. The scaffolding in `tests/evals/` is what's reproducible.
