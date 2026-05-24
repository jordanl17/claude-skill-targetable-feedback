# Orchestrator: spawning the eval runs

A fresh Claude Code session uses the `Agent` tool to spawn 18 background subagents (9 scenarios × 2 conditions). Each subagent runs in its own context with full tool access and writes its output to a per-scenario directory.

## Setup once per iteration

```bash
N=2  # bump for each new iteration
WORKSPACE="targetable-feedback-workspace/iteration-$N"
mkdir -p "$WORKSPACE"
# Snapshot the current skill so the baseline is reproducible
cp -R targetable-feedback targetable-feedback-workspace/skill-snapshot-iter-$N
# Pre-create the per-scenario output dirs
for name in trigger-generative-fires trigger-single-edit-skips trigger-code-task-skips verbatim-exact-prose verbatim-awkward-phrasing subunits-2-level-nesting removal-renumbers-siblings removal-subtree-on-parent mixed-shapes-document; do
  mkdir -p "$WORKSPACE/eval-$name/with_skill/run-1/outputs"
  mkdir -p "$WORKSPACE/eval-$name/without_skill/run-1/outputs"
done
```

## Spawn all 18 subagents in one turn

For each scenario in `tests/evals/evals.json`, spawn TWO background subagents in the SAME Agent tool call batch (one with_skill, one without_skill). Use `subagent_type: "general-purpose"` and `run_in_background: true`. System notifications fire automatically as each completes.

### with_skill prompt template

```
You are evaluating the targetable-feedback Claude skill.

INSTRUCTIONS:
1. Read the skill at {ABSOLUTE_REPO_PATH}/targetable-feedback/SKILL.md. The widget template is at {ABSOLUTE_REPO_PATH}/targetable-feedback/assets/widget-bundled.html - read it if the skill tells you to.
2. Decide objectively whether the skill should activate for the task below, using the activation rules in SKILL.md. Don't activate just because you read the file; only activate if the rules clearly indicate this prompt should trigger.
3. If activating: follow the skill's instructions to produce the final widget HTML. The visualize:show_widget tool is NOT available in your environment - instead of calling it, write the FULL filled-in widget HTML to outputs/widget.html. Also write a brief assistant lead-in message to outputs/response.md.
4. If NOT activating: do the task naturally and write your natural response to outputs/response.md. Do not produce widget HTML.

TASK PROMPT:
{PROMPT_FROM_evals.json}

OUTPUT DIRECTORY (already exists):
{ABSOLUTE_REPO_PATH}/{WORKSPACE}/eval-{SCENARIO_ID}/with_skill/run-1/outputs/

ALSO WRITE meta.json at that directory: {"activated": true|false, "reason": "one sentence why"}

Return a one-line summary.
```

### without_skill (baseline) prompt template

```
You are responding to a user prompt as a normal Claude assistant. Do NOT consult any installed skills - in particular, ignore "targetable-feedback". Respond naturally as if no specialized skill existed.

TASK PROMPT:
{PROMPT_FROM_evals.json}

Write your full response to: {ABSOLUTE_REPO_PATH}/{WORKSPACE}/eval-{SCENARIO_ID}/without_skill/run-1/outputs/response.md

Return a one-line summary.
```

## After all 18 complete

```bash
pnpm eval:grade targetable-feedback-workspace/iteration-2
pnpm eval:preview targetable-feedback-workspace/iteration-2
open targetable-feedback-workspace/iteration-2/eval-preview.html
```

The preview page renders each widget visually with claude.ai design-system fallbacks, shows the grading per assertion, and lets the user leave per-scenario feedback that copies to clipboard as a JSON payload.

## Iteration 1 baseline

`targetable-feedback-workspace/iteration-1` is gitignored but iteration 1 of evals (run at skill v0.3.0) scored:

- with_skill: 47/47 assertions passed (100%)
- without_skill: 15/27 assertions passed (56%)
- delta: +44 percentage points

The headline finding: the verbatim rule is load-bearing. The baseline rewrote awkward OKRs; the skill preserved them byte-identical. Sub-unit nesting and removal renumbering both worked as specified.
