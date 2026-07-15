/**
 * @fileoverview Módulo Tecnovigilância / RECs.
 */

import { db } from '../db.js';
import { formatDate, deadlineCell, statusPill, emptyState, selectOptions } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, TIPOS_TECNO } from '../constants.js';

const FIELDS = [
  { id: 'numero',           label: 'Número',              type: 'text',     required: true,  span: 1 },
  { id: 'tipo',             label: 'Tipo',                type: 'select',   required: true,  span: 1, options: TIPOS_TECNO },
  { id: 'produto',          label: 'Produto',             type: 'text',     required: true,  span: 2 },
  { id: 'descricao',        label: 'Descrição',           type: 'textarea', required: true,  span: 2 },
  { id: 'data',             label: 'Data de Abertura',    type: 'date',     required: true,  span: 1 },
  { id: 'prazoAnvisa',      label: 'Prazo ANVISA',        type: 'date',     required: false, span: 1 },
  { id: 'status',           label: 'Status',              type: 'select',   required: true,  span: 2, options: STATUS.TECNO },
  { id: 'reclamacaoOrigem', label: 'Reclamação de Origem', type: 'text',    required: false, span: 1 },
];

function renderTable(items) {
  if (!items.length) return emptyState('Nenhum registro de tecnovigilância.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Tipo</th>
            <th>Produto</th>
            <th>Descrição</th>
            <th>Abertura</th>
            <th>Prazo ANVISA</th>
            <th>Status</th>
            <th>Reclamação</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><strong>${r.numero}</strong></td>
              <td>${statusPill(r.tipo)}</td>
              <td>${r.produto}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
              <td>${formatDate(r.data)}</td>
              <td>${deadlineCell(r.prazoAnvisa)}</td>
              <td>${statusPill(r.status)}</td>
              <td style="white-space:nowrap">${r.reclamacaoOrigem ? `<span class="pill pill-blue" title="Originada da reclamação ${r.reclamacaoOrigem}">${r.reclamacaoOrigem}</span>` : '—'}</td>
              <td>
                <div class="td-actions">
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">✏</button>
                  <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">🗑</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function applyFilters(container) {
  const search = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
  const status = container.querySelector('[data-filter="status"]')?.value ?? '';
  let items = db.get('tecno');
  if (search) items = items.filter(r => r.numero.toLowerCase().includes(search) || r.produto.toLowerCase().includes(search) || r.descricao.toLowerCase().includes(search));
  if (status) items = items.filter(r => r.status === status);
  container.querySelector('#tecno-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Tecnovigilância / RECs</h2>
        <button class="btn btn-primary" data-action="new">+ Novo Registro</button>
      </div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, produto ou descrição…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.TECNO)}
        </select>
      </div>
      <div class="card">
        <div id="tecno-table-wrap">
          ${renderTable(db.get('tecno'))}
        </div>
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      if (action === 'new') {
        openModal({ title: 'Novo Registro Tecnovigilância', fields: FIELDS, data: {}, onSave: data => {
          db.add('tecno', data);
          toast('Registro criado!');
          applyFilters(container);
        }});
      }

      if (action === 'edit') {
        const record = db.getById('tecno', numId);
        if (!record) return;
        openModal({ title: 'Editar Registro', fields: FIELDS, data: record, onSave: data => {
          db.update('tecno', numId, data);
          toast('Registro atualizado!');
          applyFilters(container);
        }});
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir este registro?').then(ok => {
          if (!ok) return;
          db.remove('tecno', numId);
          toast('Registro excluído.', 'warning');
          applyFilters(container);
        });
      }
    });

    container.addEventListener('input', e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
