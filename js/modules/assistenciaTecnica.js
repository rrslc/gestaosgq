/**
 * @fileoverview Módulo Assistência Técnica — P-SQ-021.
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';

const STATUS_AT = ['Aberta', 'Em Análise', 'Em Reparo', 'Aguardando Peça', 'Concluída', 'Cancelada'];
const TIPOS_AT  = ['Reparo', 'Calibração', 'Manutenção Preventiva', 'Inspeção', 'Troca de Componente', 'Outro'];
const CLOSED    = ['Concluída', 'Cancelada'];

function generateNumero() {
  const yy  = String(new Date().getFullYear()).slice(2);
  const all = db.get('assistenciaTecnica');
  const seq = all.filter(r => r.numero?.endsWith(`/${yy}`)).length + 1;
  return `AT.${String(seq).padStart(3, '0')}/${yy}`;
}

function buildFields() {
  const nomes = db.get('equipe').map(m => m.nome);
  return [
    { id: 'numero',          label: 'Nº AT',                       type: 'text',     required: false, span: 1, readonly: true },
    { id: 'dataAbertura',    label: 'Data de Abertura',            type: 'date',     required: true,  span: 1 },
    { id: 'responsavel',     label: 'Responsável',                 type: nomes.length ? 'select' : 'text', required: true,  span: 1, options: nomes },
    { id: 'cliente',         label: 'Cliente / Instituição',       type: 'text',     required: true,  span: 1 },
    { id: 'equipamento',     label: 'Equipamento / Produto',       type: 'text',     required: true,  span: 1 },
    { id: 'modelo',          label: 'Modelo / Referência',         type: 'text',     required: false, span: 1 },
    { id: 'numeroSerie',     label: 'Nº de Série',                 type: 'text',     required: false, span: 1 },
    { id: 'tipo',            label: 'Tipo de Atendimento',         type: 'select',   required: true,  span: 1, options: TIPOS_AT },
    { id: 'descricao',       label: 'Descrição do Problema',       type: 'textarea', required: true,  span: 2 },
    { id: 'status',          label: 'Status',                      type: 'select',   required: false, span: 1, options: STATUS_AT },
    { id: 'pecasSolicitadas',label: 'Peças Solicitadas',           type: 'text',     required: false, span: 2 },
    { id: 'laudoTecnico',    label: 'Laudo Técnico (RIT)',         type: 'textarea', required: false, span: 2 },
    { id: 'cartaPosReparo',  label: 'Carta Pós Reparo (CPR) enviada?', type: 'select', required: false, span: 1, options: ['Sim', 'Não', 'Não se aplica'] },
    { id: 'dataFechamento',  label: 'Data de Fechamento',          type: 'date',     required: false, span: 1 },
    { id: 'geraRNC',         label: 'Gera RNC/CAPA?',             type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] },
  ];
}

function renderStats(items) {
  const total          = items.length;
  const emAberto       = items.filter(r => !CLOSED.includes(r.status)).length;
  const concluidas     = items.filter(r => r.status === 'Concluída').length;
  const aguardandoPeca = items.filter(r => r.status === 'Aguardando Peça').length;

  return `
    <div class="kpi-grid" style="margin-bottom:1.5rem">
      <div class="kpi-card">
        <div class="kpi-label">Total</div>
        <div class="kpi-value kpi-blue">${total}</div>
        <div class="kpi-sub">ordens de serviço</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Em Aberto</div>
        <div class="kpi-value ${emAberto > 0 ? 'kpi-amber' : 'kpi-green'}">${emAberto}</div>
        <div class="kpi-sub">não encerradas</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Concluídas</div>
        <div class="kpi-value kpi-green">${concluidas}</div>
        <div class="kpi-sub">atendimentos finalizados</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Aguardando Peça</div>
        <div class="kpi-value ${aguardandoPeca > 0 ? 'kpi-red' : 'kpi-green'}">${aguardandoPeca}</div>
        <div class="kpi-sub">em espera de componente</div>
      </div>
    </div>
  `;
}

function renderTable(items) {
  if (!items.length) return emptyState('Nenhuma ordem de assistência técnica cadastrada.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Equipamento</th>
            <th>Cliente</th>
            <th>Tipo</th>
            <th>Responsável</th>
            <th>Abertura</th>
            <th>Status</th>
            <th>CPR</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><strong>${r.numero}</strong></td>
              <td>${r.equipamento}${r.modelo ? `<br><small style="color:var(--muted)">${r.modelo}</small>` : ''}</td>
              <td>${r.cliente}</td>
              <td>${r.tipo}</td>
              <td>${r.responsavel}</td>
              <td>${formatDate(r.dataAbertura)}</td>
              <td>${statusPill(r.status || 'Aberta')}</td>
              <td>${r.cartaPosReparo || '—'}</td>
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
  const tipo   = container.querySelector('[data-filter="tipo"]')?.value ?? '';
  let items = db.get('assistenciaTecnica');
  if (search) items = items.filter(r =>
    (r.numero || '').toLowerCase().includes(search) ||
    (r.equipamento || '').toLowerCase().includes(search) ||
    (r.cliente || '').toLowerCase().includes(search)
  );
  if (status) items = items.filter(r => r.status === status);
  if (tipo)   items = items.filter(r => r.tipo === tipo);
  container.querySelector('#at-stats').innerHTML     = renderStats(db.get('assistenciaTecnica'));
  container.querySelector('#at-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    const all = db.get('assistenciaTecnica');
    container.innerHTML = `
      <div class="page-header">
        <h2>Assistência Técnica</h2>
        <button class="btn btn-primary" data-action="new">+ Nova AT</button>
      </div>
      <div id="at-stats">${renderStats(all)}</div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, equipamento ou cliente…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS_AT)}
        </select>
        <select class="toolbar-select" data-filter="tipo">
          <option value="">Todos os tipos</option>
          ${selectOptions(TIPOS_AT)}
        </select>
      </div>
      <div class="card">
        <div id="at-table-wrap">
          ${renderTable(all)}
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
          title: 'Nova Ordem de Assistência Técnica',
          fields: buildFields(),
          data: { numero: generateNumero(), dataAbertura: today(), status: 'Aberta' },
          onSave: data => {
            db.add('assistenciaTecnica', { ...data, status: data.status || 'Aberta' });
            toast('Ordem de AT registrada!');
            applyFilters(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('assistenciaTecnica', numId);
        if (!record) return;
        openModal({
          title: 'Editar Ordem de AT',
          fields: buildFields(),
          data: record,
          onSave: data => {
            db.update('assistenciaTecnica', numId, data);
            toast('AT atualizada!');
            applyFilters(container);
          },
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta ordem de AT?').then(ok => {
          if (!ok) return;
          db.remove('assistenciaTecnica', numId);
          toast('AT excluída.', 'warning');
          applyFilters(container);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
