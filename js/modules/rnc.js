/**
 * @fileoverview Módulo RNC — Registros de Não-Conformidade.
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, CLASSIFICACOES_RNC } from '../constants.js';

const FIELDS = [
  { id: 'numero',       label: 'Número',         type: 'text',     required: true,  span: 1 },
  { id: 'dataAbertura', label: 'Data Abertura',   type: 'date',     required: true,  span: 1 },
  { id: 'produto',      label: 'Produto',         type: 'text',     required: true,  span: 2 },
  { id: 'descricao',    label: 'Descrição',       type: 'textarea', required: true,  span: 2 },
  { id: 'classificacao',label: 'Classificação',   type: 'select',   required: true,  span: 1, options: CLASSIFICACOES_RNC },
  { id: 'status',       label: 'Status',          type: 'select',   required: true,  span: 1, options: STATUS.RNC },
  { id: 'responsavel',  label: 'Responsável',     type: 'text',     required: true,  span: 2 },
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
  if (!items.length) return emptyState('Nenhuma RNC encontrada.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Produto</th>
            <th>Descrição</th>
            <th>Classificação</th>
            <th>Responsável</th>
            <th>Abertura</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><strong>${r.numero}</strong></td>
              <td>${r.produto}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
              <td>${statusPill(r.classificacao)}</td>
              <td>${r.responsavel}</td>
              <td>${formatDate(r.dataAbertura)}</td>
              <td>${statusPill(r.status)}</td>
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
  let items = db.get('rnc');
  if (search) items = items.filter(r =>
    r.numero.toLowerCase().includes(search) ||
    r.descricao.toLowerCase().includes(search) ||
    r.produto.toLowerCase().includes(search)
  );
  if (status) items = items.filter(r => r.status === status);
  container.querySelector('#rnc-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>RNC — Registros de Não-Conformidade</h2>
        <button class="btn btn-primary" data-action="new">+ Nova RNC</button>
      </div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, produto ou descrição…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.RNC)}
        </select>
      </div>
      <div class="card">
        <div id="rnc-table-wrap">
          ${renderTable(db.get('rnc'))}
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
          title: 'Nova RNC',
          fields: fieldsWithResponsavel(),
          data: {},
          onSave: data => {
            db.add('rnc', data);
            toast('RNC criada com sucesso!');
            applyFilters(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('rnc', numId);
        if (!record) return;
        openModal({
          title: 'Editar RNC',
          fields: fieldsWithResponsavel(),
          data: record,
          onSave: data => {
            db.update('rnc', numId, data);
            toast('RNC atualizada!');
            applyFilters(container);
          },
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta RNC?').then(ok => {
          if (!ok) return;
          db.remove('rnc', numId);
          toast('RNC excluída.', 'warning');
          applyFilters(container);
        });
      }
    });

    container.addEventListener('input', e => {
      if (e.target.dataset.filter) applyFilters(container);
    });
    container.addEventListener('change', e => {
      if (e.target.dataset.filter) applyFilters(container);
    });
  },
};
