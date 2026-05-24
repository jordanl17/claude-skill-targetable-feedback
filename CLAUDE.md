# Project notes for Claude Code

This repo is the `targetable-feedback` Claude skill - a `SKILL.md` + interactive widget that lets users iterate on multi-section drafts per-unit.

## Layout

- `targetable-feedback/` - the skill itself, byte-for-byte what ships in the zip (`SKILL.md`, `assets/widget-bundled.html`)
- `widget-src/` - editable widget sources (`widget.html`, `widget.css`, `widget.ts`, `globals.d.ts`) - NOT shipped, only inputs to the bundler
- `tests/` - testing docs and all eval scaffolding (manual checklists at the top, programmatic suite under `tests/evals/`)
- `demo/` - the animated GIF and static comparison shown in the README
- `vite.config.ts` - Vite + vite-plugin-singlefile config; bundles `widget-src/*` into `targetable-feedback/assets/widget-bundled.html`. Uses terser for JS, lightningcss for CSS. Run with `pnpm build`.
- `scripts/build-zip.sh` - runs `pnpm build` then zips the `targetable-feedback/` folder
- `package.json` / `tsconfig.json` / `pnpm-lock.yaml` - Node toolchain (requires Node 20+ and pnpm 10+). Widget JS is authored as strict TypeScript and stripped to JS at build time.

## Before changing the skill, read the testing docs

[`tests/EVALS.md`](tests/EVALS.md) is the entry point. It explains three test surfaces (manual trigger walkthrough, programmatic eval suite, description tuning) and tells you which to run based on what you're changing. **Do not skip it.** Changes to `SKILL.md` or `assets/widget-bundled.html` should be backed by either Surface 1 or Surface 2.

## Release pipeline

Release Please opens a release PR whenever a `feat:` or `fix:` commit lands on `main`. Merging the PR cuts a tag and uploads `targetable-feedback.zip` to the GitHub release. Conventional commit prefixes (`feat:`, `fix:`, `docs:`, `chore:`) determine the bump.

## Widget rendering caveat

The widget only renders in claude.ai (web app). Claude Code, Claude desktop, and `claude -p` (headless CLI) cannot invoke `visualize:show_widget`, which the skill depends on. Any evaluation harness that depends on actual rendering needs to account for this - see [`tests/EVALS.md`](tests/EVALS.md) Surface 3 for details.
