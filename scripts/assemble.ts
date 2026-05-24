#!/usr/bin/env tsx
// Assemble the bundled widget from split source assets.
//
// Reads:
//   widget-src/widget.html  (template with {{WIDGET_CSS}} and {{WIDGET_JS}} slots)
//   widget-src/widget.css   (styles)
//   widget-src/widget.js    (behaviour)
//
// Writes:
//   targetable-feedback/assets/widget-bundled.html  (single file, CSS + JS inlined and minified)
//
// CSS is minified with lightningcss (AST-level) and JS with terser. The HTML
// pass only strips per-line whitespace and blank lines - we deliberately avoid
// a heavyweight HTML minifier so that semantic whitespace inside the script
// and style blocks stays intact through slot substitution.
//
// Runtime slot tokens (DOCUMENT_TITLE, SUB_LINE, UNIT_CONTENT, SHORT_IDENTIFIER,
// PARENT_CONTENT, PARENT_IDENTIFIER, SECTION_NAME) survive bundling untouched -
// they are filled by Claude at render time, not at build time.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform as transformCss } from 'lightningcss';
import { minify as minifyJs } from 'terser';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const sourceDir = resolve(repoRoot, 'widget-src');
const outputPath = resolve(repoRoot, 'targetable-feedback', 'assets', 'widget-bundled.html');

const minifyHtmlStructure = (html: string): string =>
  html
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8');

const minifyCss = (css: string): string => {
  const result = transformCss({
    filename: 'widget.css',
    code: textEncoder.encode(css),
    minify: true,
  });
  return textDecoder.decode(result.code);
};

const minifyJavaScript = async (js: string): Promise<string> => {
  const result = await minifyJs(js, {
    ecma: 2020,
    compress: { drop_console: true },
    // sendPrompt is injected by claude.ai at runtime, so leave top-level names alone.
    mangle: { toplevel: false },
    format: { comments: false },
  });
  if (typeof result.code !== 'string') {
    throw new Error('terser returned no code');
  }
  return result.code;
};

const main = async (): Promise<void> => {
  const templateSource = readFileSync(resolve(sourceDir, 'widget.html'), 'utf8');
  const cssSource = readFileSync(resolve(sourceDir, 'widget.css'), 'utf8');
  const jsSource = readFileSync(resolve(sourceDir, 'widget.js'), 'utf8');

  const minifiedTemplate = minifyHtmlStructure(templateSource);
  const minifiedCss = minifyCss(cssSource);
  const minifiedJsCode = await minifyJavaScript(jsSource);

  const bundled = minifiedTemplate
    .replace('{{WIDGET_CSS}}', minifiedCss)
    .replace('{{WIDGET_JS}}', minifiedJsCode);

  writeFileSync(outputPath, bundled, 'utf8');

  const sourceTotal = templateSource.length + cssSource.length + jsSource.length;
  const bundleSize = bundled.length;
  const saved = sourceTotal - bundleSize;
  const pct = sourceTotal === 0 ? 0 : (saved / sourceTotal) * 100;
  const format = (bytes: number): string => bytes.toLocaleString('en-US');

  console.log(`Bundled: ${outputPath}`);
  console.log(
    `  source: ${format(sourceTotal)} bytes (widget.html ${format(templateSource.length)} + widget.css ${format(cssSource.length)} + widget.js ${format(jsSource.length)})`,
  );
  console.log(`  bundle: ${format(bundleSize)} bytes (${pct.toFixed(1)}% smaller)`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
