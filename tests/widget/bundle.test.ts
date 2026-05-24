import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const bundlePath = resolve(__dirname, '../../targetable-feedback/assets/widget-bundled.html');
const bundle = readFileSync(bundlePath, 'utf8');

describe('bundle integrity', () => {
  describe('script execution timing', () => {
    it('the inlined <script> declares type="module" so it defers past DOM parsing', () => {
      // Without type="module", the script runs synchronously at parse time.
      // Vite hoists the script tag near the top of the document, so a
      // synchronous run would execute before the bar elements (#applyBtn,
      // #clearAll, .count) exist, and requireElement() would throw at module
      // top - breaking every event listener.
      expect(bundle).toMatch(/<script\s+type="module">/);
    });

    it('does NOT contain a bare <script> without attributes (legacy non-deferred pattern)', () => {
      // If we ever lose type="module" again, this catches it.
      expect(bundle).not.toMatch(/<script>\s*(?:var|const|let|function|document)/);
    });
  });

  describe('runtime slot tokens preserved (filled by Claude at render time)', () => {
    const runtimeTokens = [
      'DOCUMENT_TITLE',
      'SUB_LINE',
      'UNIT_CONTENT',
      'SHORT_IDENTIFIER',
      'PARENT_CONTENT',
      'PARENT_IDENTIFIER',
      'SECTION_NAME',
    ];

    runtimeTokens.forEach((token) => {
      it(`{{${token}}} is present in the bundled HTML`, () => {
        expect(bundle).toContain(`{{${token}}}`);
      });
    });
  });

  describe('build-time slot tokens substituted', () => {
    it('{{WIDGET_CSS}} has been replaced with the inlined <style>', () => {
      expect(bundle).not.toContain('{{WIDGET_CSS}}');
      expect(bundle).toMatch(/<style[^>]*>/);
    });

    it('{{WIDGET_JS}} has been replaced with the inlined <script>', () => {
      expect(bundle).not.toContain('{{WIDGET_JS}}');
      expect(bundle).toMatch(/<script[^>]*>/);
    });
  });

  describe('critical string literals survive JS minification', () => {
    // These selector strings and global identifiers must not be mangled.
    // Terser keeps string literals intact by default, but a future config
    // change (e.g. mangle.properties) could break this silently.
    const literals = [
      'relatedTarget',
      'focus-within',
      'remove-toggle',
      'remove-checkbox',
      'guidance-input',
      'clear-x',
      'closest',
      'sendPrompt',
      'applyBtn',
      'clearAll',
      'data-id',
    ];

    literals.forEach((literal) => {
      it(`"${literal}" appears in the bundled output`, () => {
        expect(bundle).toContain(literal);
      });
    });
  });

  describe('size budget', () => {
    it('bundle stays under 16 KB (16,384 bytes) - guards against accidental size regressions', () => {
      expect(bundle.length).toBeLessThan(16_384);
    });
  });
});
