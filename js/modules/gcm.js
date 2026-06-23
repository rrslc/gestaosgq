/**
 * @fileoverview Módulo GCM — Gestão de Mudanças.
 */

import { db } from '../db.js';
import { formatDate, statusPill, impactPill, emptyState, selectOptions } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, CATEGORIAS_GCM, IMPACTOS } from '../constants.js';

const FIELDS = [
  { id: 'numero',     label: 'Número',       type: 'text',     required: true,  span: 1 },
  { id: 'data',       label: 'Data',         type: 'date',     required: true,  span: 1 },
  { id: 'descricao',  label: 'Descrição',    type: 'textarea', required: true,  span: 2 },
  { id: 'categoria',  label: 'Categoria',    type: 'select',   required: true,  span: 1, options: CATEGORIAS_GCM },
  { id: 'impacto',    label: 'Impacto',      type: 'select',   required: true,  span: 1, options: IMPACTOS },
  { id: 'solicitante',label: 'Solicitante',  type: 'text',     required: true,  span: 1 },
  { id: 'status',     label: 'Status',       type: 'select',   required: true,  span: 1, options: STATUS.GCM },
];

function fieldsWithResponsavel() {
  const nomes = db.get('equipe').map(m => m.nome);
  return FIELDS.map(f => {
    if (f.id === 'solicitante' && nomes.length > 0) return { ...f, type: 'select', options: nomes };
    return f;
  });
}

function renderTable(items) {
  if (!items.length) return emptyState('Nenhuma mudança registrada.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Data</th>
            <th>Descrição</th>
            <th>Categoria</th>
            <th>Impacto</th>
            <th>Solicitante</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><strong>${r.numero}</strong></td>
              <td>${formatDate(r.data)}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
              <td>${r.categoria}</td>
              <td>${impactPill(r.impacto)}</td>
              <td>${r.solicitante}</td>
              <td>${statusPill(r.status)}</td>
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
  let items = db.get('gcm');
  if (search) items = items.filter(r => r.numero.toLowerCase().includes(search) || r.descricao.toLowerCase().includes(search));
  if (status) items = items.filter(r => r.status === status);
  container.querySelector('#gcm-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>GCM — Gestão de Mudanças</h2>
        <button class="btn btn-primary" data-action="new">+ Nova Mudança</button>
      </div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número ou descrição…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.GCM)}
        </select>
      </div>
      <div class="card">
        <div id="gcm-table-wrap">
          ${renderTable(db.get('gcm'))}
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
        openModal({ title: 'Nova Mudança (GCM)', fields: fieldsWithResponsavel(), data: {}, onSave: data => {
          db.add('gcm', data);
          toast('Mudança registrada!');
          applyFilters(container);
        }});
      }

      if (action === 'edit') {
        const record = db.getById('gcm', numId);
        if (!record) return;
        openModal({ title: 'Editar Mudança', fields: fieldsWithResponsavel(), data: record, onSave: data => {
          db.update('gcm', numId, data);
          toast('Mudança atualizada!');
          applyFilters(container);
        }});
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir este registro de mudança?').then(ok => {
          if (!ok) return;
          db.remove('gcm', numId);
          toast('Mudança excluída.', 'warning');
          applyFilters(container);
        });
      }
    });

    container.addEventListener('input', e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
