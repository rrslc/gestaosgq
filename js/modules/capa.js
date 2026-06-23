/**
 * @fileoverview Módulo CAPA — Ações Corretivas e Preventivas.
 */

import { db } from '../db.js';
import { formatDate, deadlineCell, statusPill, progressBar, emptyState, selectOptions } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, ORIGENS_CAPA } from '../constants.js';

const FIELDS = [
  { id: 'numero',    label: 'Número',      type: 'text',     required: true,  span: 1 },
  { id: 'origem',    label: 'Origem',       type: 'select',   required: true,  span: 1, options: ORIGENS_CAPA },
  { id: 'descricao', label: 'Descrição',    type: 'textarea', required: true,  span: 2 },
  { id: 'causa',     label: 'Causa Raiz',   type: 'textarea', required: false, span: 2 },
  { id: 'acao',      label: 'Ação Proposta',type: 'textarea', required: false, span: 2 },
  { id: 'responsavel', label: 'Responsável', type: 'text',   required: true,  span: 1 },
  { id: 'prazo',     label: 'Prazo',        type: 'date',     required: true,  span: 1 },
  { id: 'status',    label: 'Status',       type: 'select',   required: true,  span: 1, options: STATUS.CAPA },
  { id: 'progresso', label: 'Progresso (%)', type: 'number', required: false, span: 1, min: 0, max: 100 },
];

function getResponsaveis() {
  return db.get('equipe').map(m => m.nome);
}

function fieldsWithResponsavel() {
  return FIELDS.map(f => {
    if (f.id === 'responsavel') {
      const nomes = getResponsaveis();
      return nomes.length > 0
        ? { ...f, type: 'select', options: nomes }
        : f;
    }
    return f;
  });
}

function renderTable(items) {
  if (!items.length) return emptyState('Nenhuma CAPA encontrada.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Descrição</th>
            <th>Origem</th>
            <th>Responsável</th>
            <th>Prazo</th>
            <th>Status</th>
            <th>Progresso</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><strong>${r.numero}</strong></td>
              <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
              <td>${r.origem}</td>
              <td>${r.responsavel}</td>
              <td>${deadlineCell(r.prazo)}</td>
              <td>${statusPill(r.status)}</td>
              <td style="min-width:100px">${progressBar(r.progresso ?? 0)}</td>
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
  let items = db.get('capa');
  if (search) items = items.filter(r => r.numero.toLowerCase().includes(search) || r.descricao.toLowerCase().includes(search) || r.responsavel.toLowerCase().includes(search));
  if (status) items = items.filter(r => r.status === status);
  container.querySelector('#capa-tbody-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>CAPA — Ações Corretivas e Preventivas</h2>
        <button class="btn btn-primary" data-action="new">+ Nova CAPA</button>
      </div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, descrição ou responsável…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.CAPA)}
        </select>
      </div>
      <div class="card">
        <div id="capa-tbody-wrap">
          ${renderTable(db.get('capa'))}
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
          title: 'Nova CAPA',
          fields: fieldsWithResponsavel(),
          data: {},
          onSave: data => {
            db.add('capa', { ...data, progresso: Number(data.progresso) || 0 });
            toast('CAPA criada com sucesso!');
            applyFilters(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('capa', numId);
        if (!record) return;
        openModal({
          title: 'Editar CAPA',
          fields: fieldsWithResponsavel(),
          data: record,
          onSave: data => {
            db.update('capa', numId, { ...data, progresso: Number(data.progresso) || 0 });
            toast('CAPA atualizada!');
            applyFilters(container);
          },
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta CAPA? A operação não poderá ser desfeita.').then(ok => {
          if (!ok) return;
          db.remove('capa', numId);
          toast('CAPA excluída.', 'warning');
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
