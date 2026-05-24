import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlinkSync, existsSync, readFileSync, writeFileSync, statSync } from 'node:fs';

const repoRoot = dirname(fileURLToPath(import.meta.url));

const stripHtmlWhitespace = (html: string): string =>
  html
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join('\n');

const cleanInlineTagAttributes = (html: string): string =>
  html
    // The `rel="stylesheet"` and `crossorigin` attributes are leftovers from the
    // original <link>/<script src=...> tags and have no meaning on inlined
    // <style>/<script> blocks. The `type="module"` attribute MUST stay - it is
    // what makes the inlined script wait for the DOM to be parsed before
    // executing, so module-top DOM lookups (requireElement) can find their
    // targets even when Vite hoists the <script> to the top of the document.
    .replace(/<style\s+rel="stylesheet"\s+crossorigin>/g, '<style>')
    .replace(/<script\s+type="module"\s+crossorigin>/g, '<script type="module">');

const finalizeBundle = (): Plugin => ({
  name: 'finalize-bundle',
  enforce: 'post',
  writeBundle(options) {
    const outDir = options.dir ?? resolve(repoRoot, 'targetable-feedback/assets');
    const source = join(outDir, 'widget.html');
    const target = join(outDir, 'widget-bundled.html');
    if (!existsSync(source)) return;
    const raw = readFileSync(source, 'utf8');
    const finalized = stripHtmlWhitespace(cleanInlineTagAttributes(raw));
    writeFileSync(target, finalized, 'utf8');
    unlinkSync(source);
    const finalSize = statSync(target).size;
    this.info(`finalize-bundle: wrote ${target} (${finalSize.toLocaleString()} bytes)`);
  },
});

export default defineConfig({
  root: 'widget-src',
  base: './',
  plugins: [viteSingleFile({ removeViteModuleLoader: true }), finalizeBundle()],
  css: {
    transformer: 'lightningcss',
  },
  build: {
    outDir: resolve(repoRoot, 'targetable-feedback/assets'),
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
