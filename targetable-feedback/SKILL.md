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

- Paragraphs become top-level units.
- Top-level bullets become top-level units (add the `bullet` class).
- Direct sub-bullets of a bullet unit become sub-units nested inside the parent's content (add the `sub-unit` class).
- Sub-sub-bullets and deeper flatten into their containing sub-unit's text. Users can address them in guidance.
- Headings become section separators (`<h3>`), not addressable units.
- Inline code stays inline within its containing unit.
- Fenced code blocks become their own unit only if surrounded by prose. If the content is mostly code, do not activate.
- Tables behave like code blocks: tolerated if incidental, disqualifying if dominant.

**Data-id convention.** Top-level units get sequential integer IDs (`"1"`, `"2"`, `"3"`, ...). Sub-units get `"{parentId}.{N}"` where `N` is the 1-based index of the sub-bullet under its parent (`"9.1"`, `"9.2"`, ...). The dot-notation generalizes conceptually to deeper levels (`"9.2.1"`), but v1.1 caps parsing at 2 levels - anything deeper flattens into the containing sub-unit's text.

Set `data-snippet` to a short identifier (3-6 words) of the unit's content. Sub-units get their own snippet describing the sub-bullet, not the parent's snippet.

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
3. On each changed unit or sub-unit, add the `changed` class and a `<span class="changed-tag">changed</span>` after the content.
4. Show the rev pill in the `<h1>`: `<span class="rev-pill">rev N</span>`, incremented per revision.
5. Preserve `data-id` numbering across revisions, including sub-unit IDs, so the user can keep iterating.

**Hierarchical IDs in payloads.** Payloads may include lines like `Unit 9.2 ("snippet"): guidance text`. Treat sub-unit IDs identically to top-level IDs - find the matching `data-id` and apply the guidance to that unit's content only.

**Parent / sub-unit independence (CRITICAL).** Guidance on a parent affects only the parent's text. Sub-bullets stay byte-identical unless individually marked, and vice versa. There is no implicit "applies to children" behavior. The changed tag goes on whatever level actually changed: if only 9.2 changed, only 9.2 gets the tag; if parent 9 changed but its sub-bullets didn't, only 9 gets the tag.

**Mismatch handling.** If guidance fundamentally reframes a unit's purpose (not just rewords it), attempt the fit and flag it in the brief assistant message above the re-rendered widget. The flag should name the specific unit, what shifted, and why, so the user can push back. A vague meta-note is worse than no flag.

## When not to render

- Output is under roughly three paragraphs or fewer than five addressable units.
- User asked for plain text or a one-shot answer.
- Content is dominated by code blocks or tables.
- User is mid-conversation and never signaled iteration intent.
- Single-edit feedback on prior output (handle inline).
