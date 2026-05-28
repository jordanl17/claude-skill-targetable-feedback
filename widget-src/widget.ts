import { ownDescendant, requireElement, sendPrompt } from '@visill/sdk';

type UnitElement = HTMLDivElement;
type GuidanceInput = HTMLTextAreaElement;

const guidance = new Map<string, string>();
const removed = new Set<string>();

const requireDataset = (unit: UnitElement, key: 'id' | 'snippet'): string => {
  const value = unit.dataset[key];
  if (value === undefined || value.length === 0) {
    throw new Error(`Unit element missing data-${key}`);
  }
  return value;
};

const autosize = (textarea: GuidanceInput): void => {
  textarea.style.height = 'auto';
  textarea.style.height = `${Math.max(36, textarea.scrollHeight)}px`;
};

const applyButton = requireElement<HTMLButtonElement>('#applyBtn');
const clearAllButton = requireElement<HTMLButtonElement>('#clearAll');
const counter = requireElement<HTMLElement>('.count');

const updateBar = (): void => {
  const total = guidance.size + removed.size;
  let label = 'No changes added';
  if (total === 1) label = '1 change pending';
  else if (total > 1) label = `${total} changes pending`;
  counter.textContent = label;
  applyButton.disabled = total === 0;
  clearAllButton.disabled = total === 0;
};

document.querySelectorAll<HTMLDivElement>('.guidance-wrap').forEach((wrap) => {
  const label = document.createElement('label');
  label.className = 'remove-toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'remove-checkbox';
  const text = document.createElement('span');
  text.textContent = 'Remove this section in the next draft';
  label.append(checkbox, text);
  wrap.appendChild(label);
});

document.querySelectorAll<UnitElement>('.unit').forEach((unit) => {
  unit.addEventListener('click', (event) => {
    const target = event.target;
    if (target instanceof Element) {
      if (target.closest('.unit') !== unit) return;
      if (target instanceof HTMLTextAreaElement) return;
      if (target.closest('.clear-x') || target.closest('.remove-toggle')) return;
    } else {
      return;
    }

    document.querySelectorAll<UnitElement>('.unit.open').forEach((otherUnit) => {
      if (otherUnit === unit) return;
      if (otherUnit.classList.contains('marked')) return;
      if (otherUnit.classList.contains('removing')) return;
      otherUnit.classList.remove('open');
    });
    unit.classList.add('open');
    const input = ownDescendant<GuidanceInput>(unit, '.guidance-input', '.unit');
    setTimeout(() => {
      if (input === undefined) return;
      if (input.disabled) return;
      input.focus();
      autosize(input);
    }, 30);
  });
});

document.querySelectorAll<GuidanceInput>('.guidance-input').forEach((input) => {
  input.addEventListener('click', (event) => event.stopPropagation());

  input.addEventListener('input', () => {
    autosize(input);
    const unit = input.closest<UnitElement>('.unit');
    if (unit === null) return;
    const unitId = requireDataset(unit, 'id');
    const trimmed = input.value.trim();
    if (trimmed.length > 0) {
      guidance.set(unitId, input.value);
      unit.classList.add('marked');
    } else {
      guidance.delete(unitId);
      unit.classList.remove('marked');
    }
    updateBar();
  });

  input.addEventListener('blur', (event) => {
    const unit = input.closest<UnitElement>('.unit');
    if (unit === null) return;
    const focusTarget = event.relatedTarget;
    if (
      focusTarget instanceof Element &&
      (focusTarget.closest('.remove-toggle') || focusTarget.closest('.clear-x'))
    ) {
      return;
    }
    if (input.value.trim().length > 0) return;
    if (unit.classList.contains('removing')) return;
    unit.classList.remove('open');
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') input.blur();
  });
});

document.querySelectorAll<HTMLButtonElement>('.clear-x').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const unit = button.closest<UnitElement>('.unit');
    if (unit === null) return;
    const input = ownDescendant<GuidanceInput>(unit, '.guidance-input', '.unit');
    if (input !== undefined) {
      input.value = '';
      autosize(input);
    }
    guidance.delete(requireDataset(unit, 'id'));
    unit.classList.remove('marked', 'open');
    updateBar();
  });
});

document.querySelectorAll<HTMLInputElement>('.remove-checkbox').forEach((checkbox) => {
  checkbox.addEventListener('click', (event) => event.stopPropagation());

  checkbox.addEventListener('change', () => {
    const unit = checkbox.closest<UnitElement>('.unit');
    if (unit === null) return;
    const unitId = requireDataset(unit, 'id');
    const input = ownDescendant<GuidanceInput>(unit, '.guidance-input', '.unit');
    unit.classList.add('open');
    if (checkbox.checked) {
      removed.add(unitId);
      unit.classList.add('removing');
      unit.classList.remove('marked');
      guidance.delete(unitId);
      if (input !== undefined) {
        input.value = '';
        input.disabled = true;
        autosize(input);
      }
    } else {
      removed.delete(unitId);
      unit.classList.remove('removing');
      if (input !== undefined) input.disabled = false;
    }
    updateBar();
  });
});

clearAllButton.addEventListener('click', () => {
  guidance.clear();
  removed.clear();
  document.querySelectorAll<UnitElement>('.unit').forEach((unit) => {
    unit.classList.remove('marked', 'open', 'removing');
    const input = ownDescendant<GuidanceInput>(unit, '.guidance-input', '.unit');
    if (input !== undefined) {
      input.value = '';
      input.disabled = false;
      autosize(input);
    }
    const checkbox = ownDescendant<HTMLInputElement>(unit, '.remove-checkbox', '.unit');
    if (checkbox !== undefined) checkbox.checked = false;
  });
  updateBar();
});

const formatChange = (unitId: string, body: string): string[] => {
  const unit = document.querySelector<UnitElement>(`.unit[data-id="${unitId}"]`);
  if (unit === null) return [];
  return [`Unit ${unitId} ("${requireDataset(unit, 'snippet')}"): ${body}`];
};

applyButton.addEventListener('click', () => {
  if (guidance.size === 0 && removed.size === 0) return;
  const guidanceLines = Array.from(guidance).flatMap(([unitId, text]) =>
    formatChange(unitId, text),
  );
  const removeLines = Array.from(removed).flatMap((unitId) => formatChange(unitId, 'REMOVE'));
  const payload = [
    'Revise the draft based on this per-unit guidance:',
    '',
    ...guidanceLines,
    ...removeLines,
    '',
    'Apply only these changes. Leave unmarked units exactly as they are. Remove the units marked REMOVE entirely from the next draft and renumber remaining units to be contiguous. Return the revised draft so I can iterate.',
  ].join('\n');
  sendPrompt(payload);
});
