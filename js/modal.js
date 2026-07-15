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
    if (f.type === 'heading') continue;
    if (f.type === 'acoes-table') {
      const el = document.getElementById('field-' + f.id);
      try { data[f.id] = JSON.parse(el?.value || '[]'); } catch { data[f.id] = []; }
      continue;
    }
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
    case 'heading':
      return `<div class="form-group span-2" style="padding:8px 0 4px;border-bottom:2px solid var(--border);margin-top:8px;display:flex;align-items:center;gap:10px;grid-column:1/-1">
        <span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:${field.locked ? 'var(--muted)' : 'var(--blue,#3b82f6)'}">${field.label}</span>
        ${field.locked ? '<span style="font-size:0.62rem;background:var(--border);color:var(--muted);padding:1px 7px;border-radius:10px">🔒 concluída</span>' : ''}
      </div>`;
    case 'acoes-table': {
      let rows;
      try { rows = val ? (Array.isArray(val) ? val : JSON.parse(val)) : []; } catch { rows = []; }
      while (rows.length < 3) rows.push({});
      const ro = !!field.readonly;
      const b  = 'border:1px solid var(--border);padding:2px';
      const si = `width:100%;border:none;background:transparent;padding:3px 5px;font-size:0.82rem${ro ? ';color:var(--muted)' : ''}`;
      const sit = ['', 'Pendente', 'Em andamento', 'Concluída'];
      const mkRow = (r, i) => `<tr>
        <td style="${b};text-align:center;font-size:0.78rem;color:var(--muted)">${i + 1}</td>
        <td style="${b}"><input type="text"  data-row="${i}" data-col="descricao"   value="${(r.descricao||'').replace(/"/g,'&quot;')}"   style="${si}" placeholder="Descreva a ação..." ${ro?'readonly':''}></td>
        <td style="${b}"><input type="text"  data-row="${i}" data-col="responsavel" value="${(r.responsavel||'').replace(/"/g,'&quot;')}" style="${si}" ${ro?'readonly':''}></td>
        <td style="${b}"><input type="date"  data-row="${i}" data-col="prazo"       value="${r.prazo||''}"        style="${si}" ${ro?'readonly':''}></td>
        <td style="${b}"><select data-row="${i}" data-col="situacao" style="width:100%;border:none;background:transparent;padding:3px 2px;font-size:0.82rem${ro?';pointer-events:none;color:var(--muted)':''}">
          ${sit.map(v => `<option value="${v}"${(r.situacao||'')=== v?' selected':''}>${v||'—'}</option>`).join('')}
        </select></td>
      </tr>`;
      return `
        <div class="form-group span-2">
          <label>${field.label}${field.required ? ' <span style="color:var(--red)">*</span>' : ''}</label>
          <input type="hidden" id="field-${field.id}">
          <div data-acoes-table="field-${field.id}" style="overflow-x:auto">
            <table style="width:100%;border-collapse:collapse;min-width:480px">
              <thead><tr style="font-size:0.7rem;text-transform:uppercase;letter-spacing:.04em;background:var(--surface,var(--bg))">
                <th style="width:24px;${b};text-align:center;color:var(--muted);font-weight:600">Nº</th>
                <th style="${b};padding:5px 8px;font-weight:600">Ação / Descrição</th>
                <th style="width:130px;${b};padding:5px 8px;font-weight:600">Responsável</th>
                <th style="width:108px;${b};padding:5px 8px;font-weight:600">Prazo</th>
                <th style="width:108px;${b};padding:5px 8px;font-weight:600">Situação</th>
              </tr></thead>
              <tbody id="field-${field.id}-tbody">
                ${rows.map((r, i) => mkRow(r, i)).join('')}
              </tbody>
            </table>
            ${!ro ? `<button type="button" data-add-row style="margin-top:6px;font-size:0.72rem;color:var(--blue,#3b82f6);background:none;border:1px solid currentColor;border-radius:4px;padding:2px 9px;cursor:pointer">＋ linha</button>` : ''}
          </div>
        </div>`;
    }
    case 'select': {
      const roAttrs = field.readonly
        ? 'style="pointer-events:none;background:var(--bg);color:var(--muted);cursor:default" tabindex="-1"'
        : '';
      input = `<select id="field-${field.id}" ${field.required ? 'required' : ''} ${roAttrs}>
        <option value="">Selecione...</option>
        ${selectOptions(field.options ?? [], val)}
      </select>`;
      break;
    }
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
      input = `<textarea id="field-${field.id}" rows="3" ${field.required ? 'required' : ''} ${field.readonly ? 'readonly style="background:var(--bg);color:var(--muted);cursor:default"' : ''}>${val}</textarea>`;
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
export function openModal({ title, fields, data = {}, onSave, setup }) {
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

  // Callback de setup personalizado (ex: auto-calc de campos)
  setup?.(o.querySelector('#modal-form'));

  // Inicializa e sincroniza tabelas de ações imediatas
  o.querySelectorAll('[data-acoes-table]').forEach(wrap => {
    const hidId  = wrap.dataset.acoesTable;
    const hidden = document.getElementById(hidId);
    const sync = () => {
      const map = {};
      wrap.querySelectorAll('[data-row][data-col]').forEach(el => {
        const i = el.dataset.row;
        if (!map[i]) map[i] = {};
        map[i][el.dataset.col] = el.value;
      });
      hidden.value = JSON.stringify(Object.values(map));
    };
    sync();
    wrap.addEventListener('input',  sync);
    wrap.addEventListener('change', sync);
    wrap.querySelector('[data-add-row]')?.addEventListener('click', () => {
      const tbody = wrap.querySelector('tbody');
      const i     = tbody.rows.length;
      const b     = 'border:1px solid var(--border);padding:2px';
      const s     = 'width:100%;border:none;background:transparent;padding:3px 5px;font-size:0.82rem';
      const tr    = document.createElement('tr');
      tr.innerHTML = `
        <td style="${b};text-align:center;font-size:0.78rem;color:var(--muted)">${i + 1}</td>
        <td style="${b}"><input type="text"  data-row="${i}" data-col="descricao"   style="${s}" placeholder="Descreva a ação..."></td>
        <td style="${b}"><input type="text"  data-row="${i}" data-col="responsavel" style="${s}"></td>
        <td style="${b}"><input type="date"  data-row="${i}" data-col="prazo"       style="${s}"></td>
        <td style="${b}"><select data-row="${i}" data-col="situacao" style="width:100%;border:none;background:transparent;padding:3px 2px;font-size:0.82rem">
          <option value="">—</option><option>Pendente</option><option>Em andamento</option><option>Concluída</option>
        </select></td>`;
      tbody.appendChild(tr);
      sync();
    });
  });

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
