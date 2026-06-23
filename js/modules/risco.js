/**
 * @fileoverview Módulo Análise de Risco.
 */

import { db } from '../db.js';
import { statusPill, emptyState, selectOptions } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS } from '../constants.js';

const FIELDS = [
  { id: 'produto',       label: 'Produto/Processo', type: 'text',     required: true,  span: 2 },
  { id: 'perigo',        label: 'Perigo Identificado', type: 'text',  required: true,  span: 2 },
  { id: 'situacao',      label: 'Situação de Uso',  type: 'textarea', required: true,  span: 2 },
  { id: 'severidade',    label: 'Severidade (1-5)', type: 'number',   required: true,  span: 1, min: 1, max: 5 },
  { id: 'probabilidade', label: 'Probabilidade (1-5)', type: 'number',required: true,  span: 1, min: 1, max: 5 },
  { id: 'controle',      label: 'Medida de Controle', type: 'textarea',required: true, span: 2 },
  { id: 'status',        label: 'Status',           type: 'select',   required: true,  span: 2, options: STATUS.RISCO },
];

function rpnColor(rpn) {
  if (rpn >= 15) return 'pill-red';
  if (rpn >= 8)  return 'pill-amber';
  return 'pill-green';
}

function renderTable(items) {
  if (!items.length) return emptyState('Nenhum risco cadastrado.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Produto/Processo</th>
            <th>Perigo</th>
            <th>Situação</th>
            <th>Sev.</th>
            <th>Prob.</th>
            <th>RPN</th>
            <th>Controle</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td>${r.produto}</td>
              <td>${r.perigo}</td>
              <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.situacao}">${r.situacao}</td>
              <td style="text-align:center">${r.severidade}</td>
              <td style="text-align:center">${r.probabilidade}</td>
              <td><span class="pill ${rpnColor(r.rpn)}">${r.rpn}</span></td>
              <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.controle}">${r.controle}</td>
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
  let items = db.get('risco');
  if (search) items = items.filter(r => r.produto.toLowerCase().includes(search) || r.perigo.toLowerCase().includes(search));
  if (status) items = items.filter(r => r.status === status);
  container.querySelector('#risco-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Análise de Risco (FMEA/ISO 14971)</h2>
        <button class="btn btn-primary" data-action="new">+ Novo Risco</button>
      </div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por produto ou perigo…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.RISCO)}
        </select>
      </div>
      <div class="card">
        <div id="risco-table-wrap">
          ${renderTable(db.get('risco'))}
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
        openModal({ title: 'Novo Risco', fields: FIELDS, data: {}, onSave: data => {
          db.add('risco', { ...data, severidade: Number(data.severidade), probabilidade: Number(data.probabilidade) });
          toast('Risco cadastrado!');
          applyFilters(container);
        }});
      }

      if (action === 'edit') {
        const record = db.getById('risco', numId);
        if (!record) return;
        openModal({ title: 'Editar Risco', fields: FIELDS, data: { ...record, severidade: String(record.severidade), probabilidade: String(record.probabilidade) }, onSave: data => {
          db.update('risco', numId, { ...data, severidade: Number(data.severidade), probabilidade: Number(data.probabilidade) });
          toast('Risco atualizado!');
          applyFilters(container);
        }});
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir este risco?').then(ok => {
          if (!ok) return;
          db.remove('risco', numId);
          toast('Risco excluído.', 'warning');
          applyFilters(container);
        });
      }
    });

    container.addEventListener('input', e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
