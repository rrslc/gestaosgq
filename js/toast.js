/**
 * @fileoverview Sistema de notificações toast.
 */

let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  return container;
}

const ICONS = {
  success: '✔',
  error: '✖',
  warning: '⚠',
};

/**
 * Exibe uma notificação toast.
 * @param {string} message
 * @param {'success'|'error'|'warning'} [type='success']
 */
export function toast(message, type = 'success') {
  const c = getContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `
    <span class="toast-icon">${ICONS[type] ?? ICONS.success}</span>
    <span class="toast-msg">${message}</span>
  `;
  c.appendChild(el);

  // Auto-remove after 3s
  const timer = setTimeout(() => remove(el), 3000);

  el.addEventListener('click', () => {
    clearTimeout(timer);
    remove(el);
  });
}

function remove(el) {
  el.classList.add('toast-out');
  el.addEventListener('animationend', () => el.remove(), { once: true });
}
