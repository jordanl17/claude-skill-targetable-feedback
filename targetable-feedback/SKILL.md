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

**Do not re-segment the input.** Paragraph boundaries (blank lines) and bullet boundaries are inherited directly from the source. A paragraph that contains multiple sentences becomes ONE unit, even if the sentences address distinct topics and could be split for finer-grained addressability. The same applies to bullets - one bullet in, one unit out. Splitting "feels more useful for feedback" is exactly the editorial judgment the verbatim rule prohibits.

## Parsing into units

Three independent rendering modes. Choose per unit based on what helps the user navigate the content.

### Top-level units

| Mode | When to use | Markup |
|------|-------------|--------|
| **Plain** | Prose-like sections, OKRs, RFC items, brainstormed ideas, anything where a marker would just add visual noise. | `<div class="unit plain">{{CONTENT}}</div>` (no `<span class="num">`) |
| **Numbered** | Items are ordered and the user might refer to them by number ("redo step 3"). Recipes, sequential instructions, ranked lists. | `<div class="unit"><span class="num">N</span>{{CONTENT}}</div>` |
| **Bulleted** | Source content was authored as a bullet list AND the bullets are part of how the user thinks about the items. Shopping lists, feature comparisons, checklists. Items aren't inherently ordered. | `<div class="unit plain bullet">{{CONTENT}}</div>` (no `<span class="num">`) |

Numbers and bullets are **independent decisions**. Bullets do not imply numbers; numbers do not imply bullets. Combining them (`<div class="unit bullet"><span class="num">N</span>...</div>`) is also valid but rare - reserve it for content where both the order and the bullet-ness genuinely matter.

### Sub-units

Add the `sub-unit` class to any of the three modes; the widget renders a `◦` marker automatically. Numbered sub-units use `N.M` in the `<span class="num">`. Sub-units don't have to match their parent's mode but usually should.

### Other content rules

- Sub-sub-bullets and deeper flatten into their containing sub-unit's text. Users can address them in guidance.
- Headings become section separators (`<h3>`), not addressable units.
- Inline code stays inline within its containing unit.
- Fenced code blocks become their own unit only if surrounded by prose. If the content is mostly code, do not activate.
- Tables behave like code blocks: tolerated if incidental, disqualifying if dominant.

**Default bias.** When unsure, plain. Numbers for order; bullets when the source was authored as a list and that matters.

**Data-id and snippet.** Every unit gets a `data-id` (used internally for the revision payload): top-level units use `"1"`, `"2"`, ...; sub-units use `"{parentId}.{N}"` like `"9.1"`. Capped at 2 levels - deeper nesting flattens into the containing sub-unit. Every unit also gets a `data-snippet` - a 3-6 word identifier of its own content (sub-units describe themselves, not the parent).

## Rendering

Read `assets/widget-bundled.html`. It contains the full widget with styles and behaviour already inlined. Fill the content slots (`{{DOCUMENT_TITLE}}`, `{{SUB_LINE}}`, each unit's `data-id`, `data-snippet`, `{{UNIT_CONTENT}}`, `{{SECTION_NAME}}`) and pass the result to `visualize:show_widget` as `widget_code`.

Call shape:

- `title`: `targetable_draft_{short-descriptor}`
- `loading_messages`: 3-4 playful messages about preparing the widget
- `widget_code`: the filled HTML

Write one short lead line before the widget, e.g. "Here's the draft. Tap any unit to add guidance, apply when ready." Never duplicate the draft content in prose around the widget.

## The revision loop

When the widget calls `sendPrompt` with per-unit guidance:

1. Apply only the marked changes. Unmarked units come back byte-identical.
2. Re-render the widget with the new content.
3. On each changed unit or sub-unit, add the `changed` class and a `<span class="tag changed">changed</span>` after the content.
4. Show the rev pill in the `<h1>`: `<span class="rev-pill">rev N</span>`, incremented per revision.
5. Preserve `data-id` numbering across revisions, including sub-unit IDs, so the user can keep iterating.

**Hierarchical IDs in payloads.** Payloads may include lines like `Unit 9.2 ("snippet"): guidance text`. Treat sub-unit IDs identically to top-level IDs - find the matching `data-id` and apply the guidance to that unit's content only.

**Removal markers.** A line like `Unit 7 ("snippet"): REMOVE` means the user has flagged that unit for deletion. Drop it entirely from the next draft - do not retain its content anywhere. Renumber the remaining top-level units sequentially (1, 2, 3, ...) with no gaps. For a removed sub-unit, renumber its siblings within the same parent (parentId.1, parentId.2, ...). Removed units do not get a changed tag because there is nothing left to attach it to; they simply do not appear. If the user removed a parent that had sub-units, the entire subtree is gone.

**Parent / sub-unit independence (CRITICAL).** Guidance on a parent affects only the parent's text. Sub-bullets stay byte-identical unless individually marked, and vice versa. There is no implicit "applies to children" behavior. The changed tag goes on whatever level actually changed: if only 9.2 changed, only 9.2 gets the tag; if parent 9 changed but its sub-bullets didn't, only 9 gets the tag.

**Mismatch handling.** If guidance fundamentally reframes a unit's purpose (not just rewords it), attempt the fit and flag it in the brief assistant message above the re-rendered widget. The flag should name the specific unit, what shifted, and why, so the user can push back. A vague meta-note is worse than no flag.

## When not to render

- Output is under roughly three paragraphs or fewer than five addressable units.
- User asked for plain text or a one-shot answer.
- Content is dominated by code blocks or tables.
- User is mid-conversation and never signaled iteration intent.
- Single-edit feedback on prior output (handle inline).
