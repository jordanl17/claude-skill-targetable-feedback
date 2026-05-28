import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { finalizeBundle } from '@visill/build';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const assetsDir = resolve(repoRoot, 'targetable-feedback/assets');

export default defineConfig({
  root: 'widget-src',
  base: './',
  plugins: [
    viteSingleFile({ removeViteModuleLoader: true }),
    finalizeBundle({ outDir: assetsDir }),
  ],
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
