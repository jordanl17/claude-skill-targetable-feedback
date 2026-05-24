import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const bundlePath = resolve(__dirname, '../../targetable-feedback/assets/widget-bundled.html');

function cycle(values: readonly string[]): () => string {
  let index = 0;
  return () => values[index++ % values.length] ?? values[0]!;
}

function fillSlots(template: string): string {
  const nextUnitContent = cycle(['First unit content.', 'Second unit content.', 'Third unit content.', 'Fourth unit content.']);
  const nextUnitSnippet = cycle(['first-snip', 'second-snip', 'third-snip', 'fourth-snip']);
  const nextUnitId = cycle(['1', '2', '3', '4', '5', '6', '7', '8']);

  return template
    .replace(/\{\{DOCUMENT_TITLE\}\}/g, 'Test document')
    .replace(/\{\{SUB_LINE\}\}/g, 'Draft 1')
    .replace(/\{\{SECTION_NAME\}\}/g, 'Section header')
    .replace(/\{\{UNIT_CONTENT\}\}/g, nextUnitContent)
    .replace(/\{\{SHORT_IDENTIFIER\}\}/g, nextUnitSnippet)
    .replace(/\{\{PARENT_CONTENT\}\}/g, 'Parent unit content.')
    .replace(/\{\{PARENT_IDENTIFIER\}\}/g, 'parent-snip')
    .replace(/\{\{SUB_IDENTIFIER_1\}\}/g, 'sub1-snip')
    .replace(/\{\{SUB_IDENTIFIER_2\}\}/g, 'sub2-snip')
    .replace(/\{\{SUB_CONTENT_1\}\}/g, 'First sub-unit content.')
    .replace(/\{\{SUB_CONTENT_2\}\}/g, 'Second sub-unit content.')
    .replace(/\{\{REVISED_SUB_CONTENT_2\}\}/g, 'Revised second sub-unit content.')
    .replace(/data-id="N\.1"/g, 'data-id="999.1"')
    .replace(/data-id="N\.2"/g, 'data-id="999.2"')
    .replace(/data-id="N"/g, () => `data-id="${nextUnitId()}"`);
}

// jsdom does NOT execute <script type="module"> inline scripts. To simulate
// what a real browser does (defer module execution until after DOM parsing),
// we strip the script from the bundle, write the rest into document.body,
// then run the script source manually via Function().
function renderBundle(): { sendPrompt: ReturnType<typeof vi.fn> } {
  const filled = fillSlots(readFileSync(bundlePath, 'utf8'));
  const scriptMatch = /<script[^>]*>([\s\S]*?)<\/script>/.exec(filled);
  if (!scriptMatch) throw new Error('No <script> tag found in bundle');
  const htmlWithoutScript = filled.slice(0, scriptMatch.index) + filled.slice(scriptMatch.index + scriptMatch[0].length);
  const scriptSource = scriptMatch[1]!;

  const sendPrompt = vi.fn();
  globalThis.sendPrompt = sendPrompt;
  document.body.innerHTML = htmlWithoutScript;
  new Function(scriptSource)();
  return { sendPrompt };
}

function units(): HTMLDivElement[] {
  return Array.from(document.querySelectorAll<HTMLDivElement>('.unit'));
}

function firstUnit(): HTMLDivElement {
  return document.querySelector<HTMLDivElement>('.unit')!;
}

function guidanceInput(unit: HTMLDivElement): HTMLTextAreaElement {
  return unit.querySelector<HTMLTextAreaElement>('.guidance-input')!;
}

function removeCheckbox(unit: HTMLDivElement): HTMLInputElement {
  return unit.querySelector<HTMLInputElement>('.remove-checkbox')!;
}

function applyBtn(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('#applyBtn')!;
}

function clearAllBtn(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('#clearAll')!;
}

function countText(): string | null {
  return document.querySelector('.count')!.textContent;
}

function typeGuidance(unit: HTMLDivElement, text: string): HTMLTextAreaElement {
  const input = guidanceInput(unit);
  input.value = text;
  input.dispatchEvent(new Event('input'));
  return input;
}

function toggleRemove(unit: HTMLDivElement, checked: boolean): HTMLInputElement {
  const checkbox = removeCheckbox(unit);
  checkbox.checked = checked;
  checkbox.dispatchEvent(new Event('change'));
  return checkbox;
}

describe('widget runtime', () => {
  let sendPrompt: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ sendPrompt } = renderBundle());
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('initialization', () => {
    it('script loads without throwing (catches Required-element-not-found regressions)', () => {
      expect(document.querySelector('#applyBtn')).not.toBeNull();
      expect(document.querySelector('#clearAll')).not.toBeNull();
      expect(document.querySelector('.count')).not.toBeNull();
    });

    it('Apply and Clear-All start disabled', () => {
      expect(applyBtn().disabled).toBe(true);
      expect(clearAllBtn().disabled).toBe(true);
    });

    it('counter starts with the default HTML text', () => {
      // The widget.ts updateBar() function uses 'No changes added' as its label
      // but the HTML template ships 'No guidance added' as the static default.
      // updateBar() only runs on interactions, so the static default is what
      // users see at first paint. (This is a known inconsistency worth cleaning
      // up in a separate pass.)
      expect(countText()).toBe('No guidance added');
    });

    it('counter updates to "No changes added" after the first interaction clears', () => {
      const unit = firstUnit();
      unit.click();
      typeGuidance(unit, 'x');
      typeGuidance(unit, '');
      expect(countText()).toBe('No changes added');
    });

    it('every guidance-wrap gets a remove-toggle injected after the script runs', () => {
      const wraps = document.querySelectorAll('.guidance-wrap');
      const checkboxes = document.querySelectorAll('.remove-checkbox');
      expect(wraps.length).toBeGreaterThan(0);
      expect(checkboxes.length).toBe(wraps.length);
    });
  });

  describe('clicking a unit', () => {
    it('adds the .open class to the clicked unit', () => {
      const unit = firstUnit();
      expect(unit.classList.contains('open')).toBe(false);
      unit.click();
      expect(unit.classList.contains('open')).toBe(true);
    });

    it('closes any previously-open unmarked unit when opening another', () => {
      const [first, second] = units();
      first!.click();
      expect(first!.classList.contains('open')).toBe(true);
      second!.click();
      expect(first!.classList.contains('open')).toBe(false);
      expect(second!.classList.contains('open')).toBe(true);
    });
  });

  describe('typing guidance', () => {
    it('marks the unit and enables Apply', () => {
      const unit = firstUnit();
      unit.click();
      typeGuidance(unit, 'Make this shorter');

      expect(unit.classList.contains('marked')).toBe(true);
      expect(applyBtn().disabled).toBe(false);
      expect(countText()).toBe('1 change pending');
    });

    it('clears the marked state when guidance is emptied', () => {
      const unit = firstUnit();
      unit.click();
      typeGuidance(unit, 'something');
      typeGuidance(unit, '');

      expect(unit.classList.contains('marked')).toBe(false);
      expect(countText()).toBe('No changes added');
    });
  });

  describe('remove checkbox', () => {
    it('toggling sets .removing on the unit and disables its input', () => {
      const unit = firstUnit();
      unit.click();
      toggleRemove(unit, true);

      expect(unit.classList.contains('removing')).toBe(true);
      expect(guidanceInput(unit).disabled).toBe(true);
      expect(countText()).toBe('1 change pending');
    });

    it('unchecking clears removing and re-enables the input', () => {
      const unit = firstUnit();
      unit.click();
      toggleRemove(unit, true);
      toggleRemove(unit, false);

      expect(unit.classList.contains('removing')).toBe(false);
      expect(guidanceInput(unit).disabled).toBe(false);
    });
  });

  describe('Apply button', () => {
    it('emits sendPrompt with the guidance payload', () => {
      const unit = firstUnit();
      unit.click();
      typeGuidance(unit, 'tighten the wording');

      applyBtn().click();

      expect(sendPrompt).toHaveBeenCalledTimes(1);
      const payload = sendPrompt.mock.calls[0]?.[0] as string;
      expect(payload).toContain('Revise the draft based on this per-unit guidance:');
      expect(payload).toContain('tighten the wording');
      expect(payload).toContain('Apply only these changes');
    });

    it('includes REMOVE markers when units are removed', () => {
      const unit = firstUnit();
      unit.click();
      toggleRemove(unit, true);

      applyBtn().click();
      expect(sendPrompt.mock.calls[0]?.[0]).toContain('REMOVE');
    });

    it('does nothing when there are no pending changes', () => {
      applyBtn().click();
      expect(sendPrompt).not.toHaveBeenCalled();
    });
  });

  describe('Clear All', () => {
    it('clears all pending changes and resets state', () => {
      const [first, second] = units();
      first!.click();
      typeGuidance(first!, 'change 1');
      toggleRemove(second!, true);

      expect(countText()).toBe('2 changes pending');

      clearAllBtn().click();

      expect(countText()).toBe('No changes added');
      expect(applyBtn().disabled).toBe(true);
      expect(first!.classList.contains('marked')).toBe(false);
      expect(second!.classList.contains('removing')).toBe(false);
    });
  });
});
