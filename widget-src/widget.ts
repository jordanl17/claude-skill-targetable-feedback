export {};

type UnitElement = HTMLDivElement;
type GuidanceInput = HTMLTextAreaElement;

const guidance = new Map<string, string>();
const removed = new Set<string>();

const requireElement = <ElementType extends Element>(selector: string): ElementType => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`Required element not found: ${selector}`);
  return found as ElementType;
};

const requireUnitId = (unit: UnitElement): string => {
  const unitId = unit.dataset.id;
  if (!unitId) throw new Error('Unit element missing data-id');
  return unitId;
};

const requireUnitSnippet = (unit: UnitElement): string => {
  const snippet = unit.dataset.snippet;
  if (!snippet) throw new Error('Unit element missing data-snippet');
  return snippet;
};

const ownDescendant = <ElementType extends Element>(
  unit: UnitElement,
  selector: string,
): ElementType | undefined =>
  Array.from(unit.querySelectorAll<ElementType>(selector)).find(
    (element) => element.closest('.unit') === unit,
  );

const ownInput = (unit: UnitElement): GuidanceInput | undefined =>
  ownDescendant<GuidanceInput>(unit, '.guidance-input');

const ownRemoveCheckbox = (unit: UnitElement): HTMLInputElement | undefined =>
  ownDescendant<HTMLInputElement>(unit, '.remove-checkbox');

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
  label.innerHTML =
    '<input type="checkbox" class="remove-checkbox"><span>Remove this section in the next draft</span>';
  wrap.appendChild(label);
});

document.querySelectorAll<UnitElement>('.unit').forEach((unit) => {
  unit.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('.unit') !== unit) return;
    if (target instanceof HTMLTextAreaElement) return;
    if (target.closest('.clear-x') || target.closest('.remove-toggle')) return;

    document.querySelectorAll<UnitElement>('.unit.open').forEach((otherUnit) => {
      if (
        otherUnit !== unit &&
        !otherUnit.classList.contains('marked') &&
        !otherUnit.classList.contains('removing')
      ) {
        otherUnit.classList.remove('open');
      }
    });
    unit.classList.add('open');
    const input = ownInput(unit);
    setTimeout(() => {
      if (input && !input.disabled) {
        input.focus();
        autosize(input);
      }
    }, 30);
  });
});

document.querySelectorAll<GuidanceInput>('.guidance-input').forEach((input) => {
  input.addEventListener('click', (event) => event.stopPropagation());

  input.addEventListener('input', () => {
    autosize(input);
    const unit = input.closest<UnitElement>('.unit');
    if (!unit) return;
    const unitId = requireUnitId(unit);
    const trimmed = input.value.trim();
    if (trimmed) {
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
    if (!unit) return;
    const focusTarget = event.relatedTarget;
    if (
      focusTarget instanceof Element &&
      (focusTarget.closest('.remove-toggle') || focusTarget.closest('.clear-x'))
    ) {
      return;
    }
    if (!input.value.trim() && !unit.classList.contains('removing')) {
      unit.classList.remove('open');
    }
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') input.blur();
  });
});

document.querySelectorAll<HTMLButtonElement>('.clear-x').forEach((button) => {
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const unit = button.closest<UnitElement>('.unit');
    if (!unit) return;
    const input = ownInput(unit);
    if (input) {
      input.value = '';
      autosize(input);
    }
    guidance.delete(requireUnitId(unit));
    unit.classList.remove('marked', 'open');
    updateBar();
  });
});

document.querySelectorAll<HTMLInputElement>('.remove-checkbox').forEach((checkbox) => {
  checkbox.addEventListener('click', (event) => event.stopPropagation());

  checkbox.addEventListener('change', () => {
    const unit = checkbox.closest<UnitElement>('.unit');
    if (!unit) return;
    const unitId = requireUnitId(unit);
    const input = ownInput(unit);
    unit.classList.add('open');
    if (checkbox.checked) {
      removed.add(unitId);
      unit.classList.add('removing');
      unit.classList.remove('marked');
      guidance.delete(unitId);
      if (input) {
        input.value = '';
        input.disabled = true;
        autosize(input);
      }
    } else {
      removed.delete(unitId);
      unit.classList.remove('removing');
      if (input) input.disabled = false;
    }
    updateBar();
  });
});

clearAllButton.addEventListener('click', () => {
  guidance.clear();
  removed.clear();
  document.querySelectorAll<UnitElement>('.unit').forEach((unit) => {
    unit.classList.remove('marked', 'open', 'removing');
    const input = ownInput(unit);
    if (input) {
      input.value = '';
      input.disabled = false;
      autosize(input);
    }
    const checkbox = ownRemoveCheckbox(unit);
    if (checkbox) checkbox.checked = false;
  });
  updateBar();
});

applyButton.addEventListener('click', () => {
  if (guidance.size === 0 && removed.size === 0) return;
  const lines = ['Revise the draft based on this per-unit guidance:', ''];
  guidance.forEach((text, unitId) => {
    const unit = document.querySelector<UnitElement>(`.unit[data-id="${unitId}"]`);
    if (!unit) return;
    lines.push(`Unit ${unitId} ("${requireUnitSnippet(unit)}"): ${text}`);
  });
  removed.forEach((unitId) => {
    const unit = document.querySelector<UnitElement>(`.unit[data-id="${unitId}"]`);
    if (!unit) return;
    lines.push(`Unit ${unitId} ("${requireUnitSnippet(unit)}"): REMOVE`);
  });
  lines.push('');
  lines.push(
    'Apply only these changes. Leave unmarked units exactly as they are. Remove the units marked REMOVE entirely from the next draft and renumber remaining units to be contiguous. Return the revised draft so I can iterate.',
  );
  sendPrompt(lines.join('\n'));
});
