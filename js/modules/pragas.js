/**
 * @fileoverview Módulo Controle de Pragas.
 */

import { db } from '../db.js';
import { formatDate, deadlineCell, statusPill, emptyState, selectOptions } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS } from '../constants.js';

const TIPOS = ['Dedetização e Desratização', 'Monitoramento com armadilhas', 'Desinsetização', 'Descupinização', 'Sanitização Ambiental'];

const FIELDS = [
  { id: 'numero',        label: 'Número',          type: 'text',   required: true,  span: 1 },
  { id: 'area',          label: 'Área',            type: 'text',   required: true,  span: 1 },
  { id: 'empresa',       label: 'Empresa Terceira',type: 'text',   required: true,  span: 2 },
  { id: 'tipo',          label: 'Tipo de Serviço', type: 'select', required: true,  span: 1, options: TIPOS },
  { id: 'status',        label: 'Status',          type: 'select', required: true,  span: 1, options: STATUS.PRAGA },
  { id: 'dataRealizacao',label: 'Data Realização', type: 'date',   required: false, span: 1 },
  { id: 'proximaVisita', label: 'Próxima Visita',  type: 'date',   required: false, span: 1 },
];

function renderTable(items) {
  if (!items.length) return emptyState('Nenhum controle de pragas registrado.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Área</th>
            <th>Empresa</th>
            <th>Tipo</th>
            <th>Realização</th>
            <th>Próxima Visita</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><strong>${r.numero}</strong></td>
              <td>${r.area}</td>
              <td>${r.empresa}</td>
              <td>${r.tipo}</td>
              <td>${formatDate(r.dataRealizacao)}</td>
              <td>${deadlineCell(r.proximaVisita)}</td>
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
  let items = db.get('pragas');
  if (search) items = items.filter(r => r.numero.toLowerCase().includes(search) || r.area.toLowerCase().includes(search) || r.empresa.toLowerCase().includes(search));
  if (status) items = items.filter(r => r.status === status);
  container.querySelector('#pragas-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Controle de Pragas</h2>
        <button class="btn btn-primary" data-action="new">+ Novo Registro</button>
      </div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, área ou empresa…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.PRAGA)}
        </select>
      </div>
      <div class="card">
        <div id="pragas-table-wrap">
          ${renderTable(db.get('pragas'))}
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
        openModal({ title: 'Novo Controle de Pragas', fields: FIELDS, data: {}, onSave: data => {
          db.add('pragas', data);
          toast('Registro criado!');
          applyFilters(container);
        }});
      }

      if (action === 'edit') {
        const record = db.getById('pragas', numId);
        if (!record) return;
        openModal({ title: 'Editar Controle de Pragas', fields: FIELDS, data: record, onSave: data => {
          db.update('pragas', numId, data);
          toast('Registro atualizado!');
          applyFilters(container);
        }});
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir este registro?').then(ok => {
          if (!ok) return;
          db.remove('pragas', numId);
          toast('Registro excluído.', 'warning');
          applyFilters(container);
        });
      }
    });

    container.addEventListener('input', e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
