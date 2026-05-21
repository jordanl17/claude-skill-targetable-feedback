---
name: targetable-feedback
description: Renders multi-section drafts as an interactive widget where each paragraph and bullet is tappable for inline per-unit guidance. Use when the user signals intent to iterate on a draft, either at generation time ("draft an RFC and let me give feedback on each section," "write X so I can iterate on each part") or retroactively on prior multi-section assistant output ("let me give feedback on each part," "make that targetable," "I want to mark up what you just wrote"). Do not trigger for one-shot drafting requests with no stated iteration intent, single-edit feedback like "fix bullet 3," content that is mostly code or tables, or output under roughly three paragraphs.
---

# Targetable feedback

## When to activate

Two paths, both keyed on user intent.

**Generative.** User asks for a draft and signals iteration intent in the same request. Generate the content and render it directly as the widget. No plain-prose version first.

> "Draft an RFC for the new auth system and let me give feedback on each section."

**Retroactive.** User wants to mark up multi-section output already in the conversation. The more common path.

> "Let me give feedback on each part." / "Make that targetable." / "I want to iterate on what you just wrote."

**Ambiguity boundary.** Single-edit requests are not activations. "Fix bullet 3" is one-shot feedback, answer inline. "Let me refine each bullet" is iteration intent, activate. If the user names specific edits in the activation message, apply those edits first, then render the result.

## The verbatim rule (CRITICAL)

When activating retroactively, the prior assistant content goes into the widget unchanged. Do not rewrite, summarize, expand, sharpen, or improve units during conversion. The user wants to mark up what they saw, not negotiate a new version.

Parsing is deterministic. A bullet reading "Goal 1: reduce time" becomes a unit reading "Goal 1: reduce time," not "First goal: time reduction."

## Parsing into units

- Paragraphs become units.
- Top-level bullets become units (add the `bullet` class).
- Sub-bullets flatten into their parent unit's text. Users can address them in guidance.
- Headings become section separators (`<h3>`), not addressable units.
- Inline code stays inline within its containing unit.
- Fenced code blocks become their own unit only if surrounded by prose. If the content is mostly code, do not activate.
- Tables behave like code blocks: tolerated if incidental, disqualifying if dominant.

Assign `data-id` sequentially starting at 1. Set `data-snippet` to a short identifier (3-6 words) of the unit's content, used in the revision payload.

## Rendering

1. Load the widget template from `resources/widget.html`.
2. Fill the slots: `{{DOCUMENT_TITLE}}`, `{{SUB_LINE}}`, each unit's `data-id`, `data-snippet`, and `{{UNIT_CONTENT}}`, and `{{SECTION_NAME}}` for any section headers.
3. Call `visualize:show_widget` with:
   - `title`: `targetable_draft_{short-descriptor}`
   - `loading_messages`: 3-4 playful messages about preparing the widget
   - `widget_code`: the filled template

**The assistant message around the widget.** One short lead line before the widget signals that it is interactive and how to use it. Example: "Here's the draft. Tap any unit to add guidance, apply when ready."

Do not repeat the draft content in prose around the widget. The widget is the surface for the content. Writing it twice is the primary anti-pattern.

## The revision loop

When the widget calls `sendPrompt` with per-unit guidance:

1. Apply only the marked changes. Unmarked units come back byte-identical.
2. Re-render the widget with the new content.
3. On each changed unit, add the `changed` class and a `<span class="changed-tag">changed</span>` after the unit content.
4. Show the rev pill in the `<h1>`: `<span class="rev-pill">rev N</span>`, incremented per revision.
5. Preserve `data-id` numbering across revisions so the user can keep iterating.

**Mismatch handling.** If guidance fundamentally reframes a unit's purpose (not just rewords it), attempt the fit and flag it in the brief assistant message above the re-rendered widget. The flag should name the specific unit, what shifted, and why, so the user can push back. A vague meta-note is worse than no flag.

## When not to render

- Output is under roughly three paragraphs or fewer than five addressable units.
- User asked for plain text or a one-shot answer.
- Content is dominated by code blocks or tables.
- User is mid-conversation and never signaled iteration intent.
- Single-edit feedback on prior output (handle inline).
