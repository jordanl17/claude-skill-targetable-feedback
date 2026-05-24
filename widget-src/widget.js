const guidance = new Map();
const removed = new Set();
function autosize(el) { el.style.height = 'auto'; el.style.height = Math.max(36, el.scrollHeight) + 'px'; }
function ownDescendant(unit, selector) {
  return Array.from(unit.querySelectorAll(selector)).find(el => el.closest('.unit') === unit);
}
const ownInput = unit => ownDescendant(unit, '.guidance-input');
const ownRemoveCheckbox = unit => ownDescendant(unit, '.remove-checkbox');

document.querySelectorAll('.guidance-wrap').forEach(wrap => {
  const label = document.createElement('label');
  label.className = 'remove-toggle';
  label.innerHTML = '<input type="checkbox" class="remove-checkbox"><span>Remove this section in the next draft</span>';
  wrap.appendChild(label);
});

document.querySelectorAll('.unit').forEach(unit => {
  unit.addEventListener('click', (e) => {
    if (e.target.closest('.unit') !== unit) return;
    if (e.target.tagName === 'TEXTAREA' || e.target.closest('.clear-x') || e.target.closest('.remove-toggle')) return;
    document.querySelectorAll('.unit.open').forEach(u => {
      if (u !== unit && !u.classList.contains('marked') && !u.classList.contains('removing')) u.classList.remove('open');
    });
    unit.classList.add('open');
    const input = ownInput(unit);
    setTimeout(() => { if (!input.disabled) { input.focus(); autosize(input); } }, 30);
  });
});

document.querySelectorAll('.guidance-input').forEach(input => {
  input.addEventListener('click', e => e.stopPropagation());
  input.addEventListener('input', () => {
    autosize(input);
    const unit = input.closest('.unit');
    const id = unit.dataset.id;
    const trimmed = input.value.trim();
    if (trimmed) { guidance.set(id, input.value); unit.classList.add('marked'); }
    else { guidance.delete(id); unit.classList.remove('marked'); }
    updateBar();
  });
  input.addEventListener('blur', (e) => {
    const unit = input.closest('.unit');
    if (e.relatedTarget && (e.relatedTarget.closest('.remove-toggle') || e.relatedTarget.closest('.clear-x'))) return;
    if (!input.value.trim() && !unit.classList.contains('removing')) unit.classList.remove('open');
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') input.blur(); });
});

document.querySelectorAll('.clear-x').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const unit = btn.closest('.unit');
    const input = ownInput(unit);
    input.value = '';
    autosize(input);
    guidance.delete(unit.dataset.id);
    unit.classList.remove('marked', 'open');
    updateBar();
  });
});

document.querySelectorAll('.remove-checkbox').forEach(cb => {
  cb.addEventListener('click', e => e.stopPropagation());
  cb.addEventListener('change', () => {
    const unit = cb.closest('.unit');
    const id = unit.dataset.id;
    const input = ownInput(unit);
    unit.classList.add('open');
    if (cb.checked) {
      removed.add(id);
      unit.classList.add('removing');
      unit.classList.remove('marked');
      guidance.delete(id);
      input.value = '';
      input.disabled = true;
      autosize(input);
    } else {
      removed.delete(id);
      unit.classList.remove('removing');
      input.disabled = false;
    }
    updateBar();
  });
});

function updateBar() {
  const total = guidance.size + removed.size;
  let label = 'No changes added';
  if (total === 1) label = '1 change pending';
  else if (total > 1) label = `${total} changes pending`;
  document.querySelector('.count').textContent = label;
  document.getElementById('applyBtn').disabled = total === 0;
  document.getElementById('clearAll').disabled = total === 0;
}

document.getElementById('clearAll').addEventListener('click', () => {
  guidance.clear();
  removed.clear();
  document.querySelectorAll('.unit').forEach(unit => {
    unit.classList.remove('marked', 'open', 'removing');
    const input = ownInput(unit);
    input.value = '';
    input.disabled = false;
    autosize(input);
    const cb = ownRemoveCheckbox(unit);
    if (cb) cb.checked = false;
  });
  updateBar();
});

document.getElementById('applyBtn').addEventListener('click', () => {
  if (guidance.size === 0 && removed.size === 0) return;
  const lines = ['Revise the draft based on this per-unit guidance:', ''];
  guidance.forEach((text, id) => {
    const unit = document.querySelector(`.unit[data-id="${id}"]`);
    const snippet = unit.dataset.snippet;
    lines.push(`Unit ${id} ("${snippet}"): ${text}`);
  });
  removed.forEach(id => {
    const unit = document.querySelector(`.unit[data-id="${id}"]`);
    const snippet = unit.dataset.snippet;
    lines.push(`Unit ${id} ("${snippet}"): REMOVE`);
  });
  lines.push('');
  lines.push('Apply only these changes. Leave unmarked units exactly as they are. Remove the units marked REMOVE entirely from the next draft and renumber remaining units to be contiguous. Return the revised draft so I can iterate.');
  sendPrompt(lines.join('\n'));
});
