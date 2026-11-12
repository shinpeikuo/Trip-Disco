// Pop-up messages and dialogs.
import { esc } from './util.js';

export function toast(msg, ms = 2600) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}

// Shows a dialog. buttons: [{ label, value, cls }]. Resolves { value, data } where data holds the form fields.
export function modal(title, bodyHtml, buttons = [{ label: 'OK', value: true, cls: 'primary' }]) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<form class="modal" novalidate>
      <h2>${esc(title)}</h2>
      <div class="modal-body">${bodyHtml}</div>
      <div class="modal-buttons">${buttons.map((b, i) => `<button type="button" class="btn ${b.cls || ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div>
    </form>`;
    document.body.appendChild(wrap);
    const form = wrap.querySelector('form');
    const close = (value) => {
      const data = Object.fromEntries(new FormData(form).entries());
      wrap.remove();
      resolve({ value, data });
    };
    wrap.addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-i]');
      if (b) close(buttons[+b.dataset.i].value);
      else if (ev.target === wrap) close(null);
    });
    form.addEventListener('submit', (ev) => { ev.preventDefault(); close(buttons[buttons.length - 1].value); });
    setTimeout(() => form.querySelector('input,select,textarea')?.focus(), 50);
  });
}

export async function confirmBox(message, okLabel = 'Delete') {
  const r = await modal(message, '', [{ label: 'Cancel', value: false }, { label: okLabel, value: true, cls: 'danger' }]);
  return r.value === true;
}
