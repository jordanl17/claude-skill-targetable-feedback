# targetable-feedback

A Claude skill for providing per-section feedback on multi-section drafts without copy-pasting or describing locations in prose. The draft renders as an interactive widget where each paragraph and bullet is tappable, accepts inline guidance, and applies all marked feedback in a single revision pass that touches only the marked units. It exists because chat is a poor medium for input that has shape, and per-section feedback has shape.

## When it activates

The skill triggers on stated iteration intent, not on output-shape heuristics. Two paths:

**At generation time.** Ask for a draft and signal iteration in the same request.

- "Draft an RFC for the new auth system and let me give feedback on each section."
- "Write a Q3 planning doc I can iterate on section by section."

**Retroactively on prior assistant output.** After Claude returns a multi-section response, ask to mark it up.

- "Let me give feedback on each part."
- "Make that targetable."
- "I want to iterate on what you just wrote."

The skill does not fire on one-shot drafting requests, single-edit feedback like "fix bullet 3," content dominated by code or tables, or output under roughly three paragraphs.

## Install

1. Download [`targetable-feedback.zip`](https://github.com/jordanl17/claude-targettable-feedback/releases/latest/download/targetable-feedback.zip) from the latest release.
2. In claude.ai, go to Settings, then find the Skills section (the exact menu path varies by claude.ai version), and upload the ZIP.

### Build from source

If you want to install from a specific commit or modify the skill locally:

1. Clone this repo.
2. From the repo root, create a ZIP of the `targetable-feedback/` directory. Unzipping the archive should produce a single `targetable-feedback/` folder containing `SKILL.md` and `resources/`. On macOS: right-click `targetable-feedback/` in Finder and choose Compress.
3. Upload the ZIP via claude.ai Settings as above.

## Limitations

- claude.ai chat only. The widget renders through `visualize:show_widget`, which is not available in Claude Code or the API.
- Flat units only. Sub-bullets flatten into their parent unit. Address them in guidance text if needed.
- Prose only. Code blocks and tables are tolerated when incidental and disqualifying when dominant.
- No structural edits through the widget. Reordering, splitting, or merging units requires a prose follow-up.

## License

MIT. See [LICENSE](LICENSE).
