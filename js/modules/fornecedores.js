/**
 * @fileoverview Módulo Fornecedores.
 */

import { db } from '../db.js';
import { formatDate, deadlineCell, statusPill, emptyState, selectOptions } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, CRITICIDADES } from '../constants.js';

const CATEGORIAS = ['Matéria-Prima', 'Embalagem', 'Serviço Terceirizado', 'Equipamento', 'Reagente', 'Outros'];

const FIELDS = [
  { id: 'nome',        label: 'Razão Social',    type: 'text',   required: true,  span: 2 },
  { id: 'cnpj',        label: 'CNPJ',            type: 'text',   required: false, span: 1 },
  { id: 'categoria',   label: 'Categoria',       type: 'select', required: true,  span: 1, options: CATEGORIAS },
  { id: 'criticidade', label: 'Criticidade',     type: 'select', required: true,  span: 1, options: CRITICIDADES },
  { id: 'status',      label: 'Status',          type: 'select', required: true,  span: 1, options: STATUS.FORN },
  { id: 'validade',    label: 'Validade Qualif.', type: 'date',  required: false, span: 1 },
  { id: 'responsavel', label: 'Responsável',     type: 'text',   required: true,  span: 1 },
];

function fieldsWithResponsavel() {
  const nomes = db.get('equipe').map(m => m.nome);
  return FIELDS.map(f => {
    if (f.id === 'responsavel' && nomes.length > 0) {
      return { ...f, type: 'select', options: nomes };
    }
    return f;
  });
}

function renderTable(items) {
  if (!items.length) return emptyState('Nenhum fornecedor cadastrado.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Razão Social</th>
            <th>CNPJ</th>
            <th>Categoria</th>
            <th>Criticidade</th>
            <th>Status</th>
            <th>Validade</th>
            <th>Responsável</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><strong>${r.nome}</strong></td>
              <td>${r.cnpj || '—'}</td>
              <td>${r.categoria}</td>
              <td>${statusPill(r.criticidade)}</td>
              <td>${statusPill(r.status)}</td>
              <td>${deadlineCell(r.validade)}</td>
              <td>${r.responsavel}</td>
              <td>
                <div class="td-actions">
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="Editar">✏</button>
                  <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}" title="Excluir">🗑</button>
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
  let items = db.get('fornecedores');
  if (search) items = items.filter(r => r.nome.toLowerCase().includes(search) || (r.cnpj || '').includes(search));
  if (status) items = items.filter(r => r.status === status);
  container.querySelector('#forn-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Fornecedores Qualificados</h2>
        <button class="btn btn-primary" data-action="new">+ Novo Fornecedor</button>
      </div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por nome ou CNPJ…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.FORN)}
        </select>
      </div>
      <div class="card">
        <div id="forn-table-wrap">
          ${renderTable(db.get('fornecedores'))}
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
        openModal({
          title: 'Novo Fornecedor',
          fields: fieldsWithResponsavel(),
          data: {},
          onSave: data => {
            db.add('fornecedores', data);
            toast('Fornecedor cadastrado!');
            applyFilters(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('fornecedores', numId);
        if (!record) return;
        openModal({
          title: 'Editar Fornecedor',
          fields: fieldsWithResponsavel(),
          data: record,
          onSave: data => {
            db.update('fornecedores', numId, data);
            toast('Fornecedor atualizado!');
            applyFilters(container);
          },
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir este fornecedor?').then(ok => {
          if (!ok) return;
          db.remove('fornecedores', numId);
          toast('Fornecedor excluído.', 'warning');
          applyFilters(container);
        });
      }
    });

    container.addEventListener('input', e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
