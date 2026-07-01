/**
 * @fileoverview Módulo Validações e Qualificações.
 */

import { db } from '../db.js';
import { deadlineCell, statusPill, progressBar, emptyState, selectOptions } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, TIPOS_VAL } from '../constants.js';

const FASES = ['Planejamento', 'ERU/Especificação', 'Protocolo', 'Execução', 'QI', 'QO', 'QD', 'Relatório Final', 'Aprovação', 'Concluída'];

const CATEGORIAS_VAL = ['Qualificação', 'Validação', 'Revisão Periódica'];

function categoriaFromTipo(tipo) {
  if (!tipo) return '—';
  if (tipo.startsWith('Qualificação') || tipo.startsWith('Estudo')) return 'Qualificação';
  if (tipo === 'Revisão Periódica') return 'Revisão';
  return 'Validação';
}

const FIELDS = [
  { id: 'numero',     label: 'Número',        type: 'text',     required: true,  span: 1 },
  { id: 'tipo',       label: 'Tipo',          type: 'select',   required: true,  span: 1, options: TIPOS_VAL },
  { id: 'descricao',  label: 'Descrição',     type: 'textarea', required: true,  span: 2 },
  { id: 'fase',       label: 'Fase Atual',    type: 'select',   required: true,  span: 1, options: FASES },
  { id: 'responsavel',label: 'Responsável',   type: 'text',     required: true,  span: 1 },
  { id: 'prazo',      label: 'Prazo',         type: 'date',     required: true,  span: 1 },
  { id: 'status',     label: 'Status',        type: 'select',   required: true,  span: 1, options: STATUS.VAL },
  { id: 'progresso',  label: 'Progresso (%)', type: 'number',   required: false, span: 2, min: 0, max: 100 },
];

function fieldsWithResponsavel() {
  const nomes = db.get('equipe').map(m => m.nome);
  return FIELDS.map(f => {
    if (f.id === 'responsavel' && nomes.length > 0) return { ...f, type: 'select', options: nomes };
    return f;
  });
}

function renderTable(items) {
  if (!items.length) return emptyState('Nenhuma validação cadastrada.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Tipo</th>
            <th>Descrição</th>
            <th>Fase</th>
            <th>Responsável</th>
            <th>Prazo</th>
            <th>Status</th>
            <th>Progresso</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => {
            const cat = categoriaFromTipo(r.tipo);
            const catColor = cat === 'Qualificação' ? 'var(--blue)' : cat === 'Revisão' ? 'var(--purple)' : 'var(--accent)';
            const barColor = r.status === 'Qualificado/Validado' ? 'green' : r.status === 'Em Execução' ? 'blue' : 'gray';
            return `
            <tr>
              <td><strong>${r.numero}</strong></td>
              <td style="font-size:0.72rem;white-space:nowrap">
                <span style="display:inline-block;padding:1px 6px;border-radius:3px;background:${catColor}22;color:${catColor};font-weight:600;margin-bottom:2px">${cat}</span><br>
                <span style="color:var(--muted)">${r.tipo}</span>
              </td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
              <td style="font-size:0.8rem">${r.fase}</td>
              <td>${r.responsavel}</td>
              <td>${deadlineCell(r.prazo)}</td>
              <td>${statusPill(r.status)}</td>
              <td style="min-width:90px">${progressBar(r.progresso ?? 0, barColor)}</td>
              <td>
                <div class="td-actions">
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">✏</button>
                  <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">🗑</button>
                </div>
              </td>
            </tr>
          `;}).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function applyFilters(container) {
  const search   = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
  const status   = container.querySelector('[data-filter="status"]')?.value ?? '';
  const categoria = container.querySelector('[data-filter="categoria"]')?.value ?? '';
  let items = db.get('validacoes');
  if (search)    items = items.filter(r => r.numero.toLowerCase().includes(search) || r.descricao.toLowerCase().includes(search) || (r.tipo||'').toLowerCase().includes(search));
  if (status)    items = items.filter(r => r.status === status);
  if (categoria) items = items.filter(r => categoriaFromTipo(r.tipo) === categoria);
  container.querySelector('#val-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Validações e Qualificações</h2>
        <button class="btn btn-primary" data-action="new">+ Nova Validação</button>
      </div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, tipo ou descrição…" data-filter="search">
        <select class="toolbar-select" data-filter="categoria">
          <option value="">Todas as categorias</option>
          <option value="Qualificação">Qualificação</option>
          <option value="Validação">Validação</option>
          <option value="Revisão">Revisão Periódica</option>
        </select>
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.VAL)}
        </select>
      </div>
      <div class="card">
        <div id="val-table-wrap">
          ${renderTable(db.get('validacoes'))}
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
        openModal({ title: 'Nova Validação', fields: fieldsWithResponsavel(), data: {}, onSave: data => {
          db.add('validacoes', { ...data, progresso: Number(data.progresso) || 0 });
          toast('Validação criada!');
          applyFilters(container);
        }});
      }

      if (action === 'edit') {
        const record = db.getById('validacoes', numId);
        if (!record) return;
        openModal({ title: 'Editar Validação', fields: fieldsWithResponsavel(), data: record, onSave: data => {
          db.update('validacoes', numId, { ...data, progresso: Number(data.progresso) || 0 });
          toast('Validação atualizada!');
          applyFilters(container);
        }});
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta validação?').then(ok => {
          if (!ok) return;
          db.remove('validacoes', numId);
          toast('Validação excluída.', 'warning');
          applyFilters(container);
        });
      }
    });

    container.addEventListener('input', e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
