# Trigger test cases

Cases for verifying the SKILL.md description fires on the right intents and skips the wrong ones. Run these in a fresh Claude Code session in an unrelated directory so nothing in the working tree biases the model.

## How to read each case

- **Prompt**: what to type into CC.
- **Expected**: activate or skip.
- **Success in CC**: what counts as a passing run. CC cannot render the widget (no `visualize:show_widget` in terminal), so success is instruction-following: the skill is recognized, `SKILL.md` is read, the widget template at `resources/widget.html` is referenced, and CC describes filling slots and calling `show_widget`. Failure modes: the skill is ignored when it should fire, or invoked when it should not.

## Path 1: generative activations

### Case 1.1

- **Prompt**: "Draft an RFC for migrating our auth system to OAuth2 and let me iterate on each section."
- **Expected**: activate.
- **Success in CC**: CC reads `SKILL.md`, generates the RFC content, loads `resources/widget.html`, walks through filling unit slots, and references the `show_widget` call shape.

### Case 1.2

- **Prompt**: "Write a Q3 planning doc I can give feedback on."
- **Expected**: activate.
- **Success in CC**: same as 1.1. "Give feedback on" applied to a draft-to-be-generated is iteration intent.

## Path 2: retroactive activations

Run these after asking CC to produce a multi-section response first. Suggested setup prompt: "Give me a five-paragraph overview of how database indexes work, with a short intro, three trade-offs as bullets, and a closing recommendation."

### Case 2.1

- **Prompt** (after the setup response): "Let me give feedback on each part."
- **Expected**: activate.
- **Success in CC**: CC takes the prior response verbatim, parses it into units following the rules in `SKILL.md` (paragraphs as units, top-level bullets as units, headings as separators), and walks through rendering. No rewriting, expanding, or sharpening of unit content during conversion.

### Case 2.2

- **Prompt** (after the setup response): "Make that targetable."
- **Expected**: activate.
- **Success in CC**: same as 2.1. This is the most direct path-2 trigger.

## Skips

### Case 3.1

- **Prompt**: "Write me a quick summary of how HTTPS works."
- **Expected**: skip.
- **Success in CC**: CC writes plain prose. No reference to `SKILL.md`, the widget template, or `show_widget`. No iteration intent signaled.

### Case 3.2

- **Prompt** (after a prior multi-section response): "Fix bullet 3."
- **Expected**: skip.
- **Success in CC**: CC edits bullet 3 inline. Single-edit feedback is one-shot, handled in prose.

### Case 3.3

- **Prompt**: "Write a sorting function in Python."
- **Expected**: skip.
- **Success in CC**: CC returns code. Code-dominated content is disqualified even if the user later asks to iterate.

### Case 3.4

- **Prompt**: "Write a short paragraph about why caching matters."
- **Expected**: skip.
- **Success in CC**: CC returns a single paragraph. Below the three-paragraph threshold.

## Results table

Fill this in after running the cases.

| Case | Expected | Actual | Notes |
| ---- | -------- | ------ | ----- |
| 1.1  | activate |        |       |
| 1.2  | activate |        |       |
| 2.1  | activate |        |       |
| 2.2  | activate |        |       |
| 3.1  | skip     |        |       |
| 3.2  | skip     |        |       |
| 3.3  | skip     |        |       |
| 3.4  | skip     |        |       |

## Iteration triggers

If a case fails, the likely fixes are:

- **Under-firing on path 1**: the description's path-1 example phrases are too narrow. Add closer paraphrases.
- **Under-firing on path 2**: the path-2 examples don't cover the failing phrasing. Add it.
- **Over-firing on 3.1 or 3.4**: the negative-space clause needs to be louder, or the description leaks iteration intent into plain drafting.
- **Over-firing on 3.2**: the single-edit boundary is not landing. Strengthen the "Do not trigger for single-edit feedback" clause or move it earlier in the description.
- **Over-firing on 3.3**: code-dominated exclusion is not landing. Make it more explicit.
