/**
 * @fileoverview Sistema de modais — formulário dinâmico e confirm dialog.
 */

import { selectOptions } from './utils.js';

let overlay = null;

function getOverlay() {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.display = 'none';
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay.style.display !== 'none') closeModal();
    });
  }
  return overlay;
}

/**
 * Coleta e valida dados do formulário.
 * @param {Array<Object>} fields
 * @returns {Object}
 */
function collectFormData(fields) {
  const data = {};
  const errors = [];
  for (const f of fields) {
    if (f.type === 'checkboxgroup') {
      const checked = Array.from(
        document.querySelectorAll(`input[name="field-${f.id}"]:checked`)
      ).map(cb => cb.value);
      if (f.required && !checked.length) errors.push(`"${f.label}" é obrigatório`);
      data[f.id] = checked;
    } else {
      const el = document.getElementById('field-' + f.id);
      const val = el?.value?.trim() ?? '';
      if (f.required && !val) errors.push(`"${f.label}" é obrigatório`);
      data[f.id] = val;
    }
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return data;
}

/**
 * Cria o HTML de um campo do formulário.
 * @param {Object} field
 * @param {Object} data — valores atuais
 * @returns {string} HTML
 */
function buildField(field, data) {
  const val = data[field.id] ?? '';
  const spanClass = field.span === 2 ? ' span-2' : '';
  let input = '';

  switch (field.type) {
    case 'select':
      input = `<select id="field-${field.id}" ${field.required ? 'required' : ''}>
        <option value="">Selecione...</option>
        ${selectOptions(field.options ?? [], val)}
      </select>`;
      break;
    case 'checkboxgroup': {
      const selected = Array.isArray(val) ? val
        : (val ? String(val).split(',').map(s => s.trim()).filter(Boolean) : []);
      input = `<div class="checkbox-group" id="field-${field.id}" role="group" aria-label="${field.label}">
        ${(field.options ?? []).map(opt => `
          <label class="checkbox-item">
            <input type="checkbox" name="field-${field.id}" value="${opt}" ${selected.includes(opt) ? 'checked' : ''}>
            <span>${opt}</span>
          </label>`).join('')}
      </div>`;
      break;
    }
    case 'textarea':
      input = `<textarea id="field-${field.id}" rows="3" ${field.required ? 'required' : ''}>${val}</textarea>`;
      break;
    case 'number':
      input = `<input type="number" id="field-${field.id}" value="${val}"
        ${field.min !== undefined ? `min="${field.min}"` : ''}
        ${field.max !== undefined ? `max="${field.max}"` : ''}
        ${field.required ? 'required' : ''}>`;
      break;
    default:
      input = `<input type="${field.type || 'text'}" id="field-${field.id}" value="${val}"
        ${field.required ? 'required' : ''}
        ${field.readonly ? 'readonly style="background:var(--bg);color:var(--muted);cursor:default"' : ''}>`;
  }

  return `
    <div class="form-group${spanClass}">
      <label for="field-${field.id}">${field.label}${field.required ? ' <span style="color:var(--red)">*</span>' : ''}</label>
      ${input}
    </div>
  `;
}

/**
 * Abre um modal de formulário dinâmico.
 * @param {{ title: string, fields: Array, data: Object, onSave: function }} opts
 */
export function openModal({ title, fields, data = {}, onSave }) {
  const o = getOverlay();

  const formRows = fields.map(f => buildField(f, data)).join('');

  o.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-header">
        <h3>${title}</h3>
        <button class="modal-close" aria-label="Fechar">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid" id="modal-form">
          ${formRows}
        </div>
        <div id="modal-errors" style="display:none;margin-top:10px;padding:8px 10px;background:#fee2e2;border-radius:6px;font-size:0.78rem;color:#991b1b;white-space:pre-line;"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" data-modal-action="cancel">Cancelar</button>
        <button class="btn btn-primary" data-modal-action="save">Salvar</button>
      </div>
    </div>
  `;

  o.style.display = 'flex';

  o.querySelector('.modal-close').addEventListener('click', closeModal);
  o.querySelector('[data-modal-action="cancel"]').addEventListener('click', closeModal);
  o.querySelector('[data-modal-action="save"]').addEventListener('click', () => {
    const errBox = o.querySelector('#modal-errors');
    try {
      const formData = collectFormData(fields);
      errBox.style.display = 'none';
      onSave(formData);
      closeModal();
    } catch (e) {
      errBox.textContent = e.message;
      errBox.style.display = 'block';
    }
  });

  // Focus first input
  setTimeout(() => {
    const first = o.querySelector('input, select, textarea');
    first?.focus();
  }, 50);
}

/** Fecha o modal ativo. */
export function closeModal() {
  const o = getOverlay();
  o.style.display = 'none';
  o.innerHTML = '';
}

/** Remove todos os overlays de modal do DOM (inclui modais de outros módulos). */
export function closeAllModals() {
  document.querySelectorAll('.modal-overlay').forEach(el => el.remove());
  overlay = null;
}

/**
 * Exibe um diálogo de confirmação sem usar window.confirm.
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function showConfirm(message) {
  return new Promise(resolve => {
    const o = getOverlay();

    o.innerHTML = `
      <div class="modal-dialog confirm-dialog">
        <div class="modal-header">
          <h3>Confirmar ação</h3>
          <button class="modal-close" aria-label="Fechar">✕</button>
        </div>
        <div class="modal-body">
          <p class="confirm-message">${message}</p>
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" data-confirm="cancel">Cancelar</button>
          <button class="btn btn-danger" data-confirm="ok">Confirmar</button>
        </div>
      </div>
    `;

    o.style.display = 'flex';

    const finish = result => {
      closeModal();
      resolve(result);
    };

    o.querySelector('.modal-close').addEventListener('click', () => finish(false));
    o.querySelector('[data-confirm="cancel"]').addEventListener('click', () => finish(false));
    o.querySelector('[data-confirm="ok"]').addEventListener('click', () => finish(true));
  });
}
