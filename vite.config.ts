import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(repoRoot, 'targetable-feedback/assets');

// Post-processing passes applied in order to the inlined HTML.
// `rel="stylesheet"` and `crossorigin` are leftovers from the original
// <link>/<script src=...> tags and are meaningless on the inlined <style>/
// <script> blocks. `type="module"` MUST stay - it defers execution until the
// DOM is parsed, so module-top DOM lookups (requireElement) find their targets
// even when Vite hoists the <script> to the top of the document.
const htmlTransforms: Array<(html: string) => string> = [
  (html) => html.replace(/<style\s+rel="stylesheet"\s+crossorigin>/g, '<style>'),
  (html) => html.replace(/<script\s+type="module"\s+crossorigin>/g, '<script type="module">'),
  (html) =>
    html
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n'),
];

function finalizeBundle(): Plugin {
  return {
    name: 'finalize-bundle',
    enforce: 'post',
    writeBundle(options) {
      const outDir = options.dir ?? assetsDir;
      const source = join(outDir, 'widget.html');
      const target = join(outDir, 'widget-bundled.html');
      const finalized = htmlTransforms.reduce(
        (html, transform) => transform(html),
        readFileSync(source, 'utf8'),
      );
      writeFileSync(target, finalized, 'utf8');
      unlinkSync(source);
      const byteLength = Buffer.byteLength(finalized, 'utf8');
      this.info(`finalize-bundle: wrote ${target} (${byteLength.toLocaleString()} bytes)`);
    },
  };
}

export default defineConfig({
  root: 'widget-src',
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true }), finalizeBundle()],
  css: {
    transformer: 'lightningcss',
  },
  build: {
    outDir: assetsDir,
    emptyOutDir: false,
    modulePreload: false,
    minify: 'terser',
    cssMinify: 'lightningcss',
    terserOptions: {
      ecma: 2020,
      compress: { drop_console: true },
      mangle: { toplevel: false },
      format: { comments: false },
    },
    rollupOptions: {
      input: resolve(repoRoot, 'widget-src/widget.html'),
    },
  },
});
