/**
 * @fileoverview Módulo Obrigações Regulatórias — rastreia envios periódicos a órgãos reguladores.
 */

import { db } from '../db.js';
import { deadlineCell, statusPill, emptyState, selectOptions, formatDate } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS } from '../constants.js';

const PERIODICIDADES = ['Mensal', 'Bimestral', 'Trimestral', 'Semestral', 'Anual', 'Sob demanda'];

const ORGAOS = [
  'Polícia Federal / SISCORI',
  'ANVISA',
  'INMETRO',
  'Vigilância Sanitária Estadual',
  'Vigilância Sanitária Municipal',
  'Receita Federal',
  'Outro',
];

const FIELDS = [
  { id: 'numero',          label: 'Número',            type: 'text',     required: true,  span: 1 },
  { id: 'nome',            label: 'Obrigação',          type: 'text',     required: true,  span: 1 },
  { id: 'orgao',           label: 'Órgão',              type: 'select',   required: true,  span: 1, options: ORGAOS },
  { id: 'periodicidade',   label: 'Periodicidade',      type: 'select',   required: true,  span: 1, options: PERIODICIDADES },
  { id: 'diaLimite',       label: 'Dia limite (do mês seguinte)', type: 'number', required: false, span: 1, min: 1, max: 31 },
  { id: 'responsavel',     label: 'Responsável',        type: 'text',     required: true,  span: 1 },
  { id: 'ultimoEnvio',     label: 'Último envio',       type: 'date',     required: false, span: 1 },
  { id: 'proximoVencimento', label: 'Próximo vencimento', type: 'date',  required: true,  span: 1 },
  { id: 'status',          label: 'Status',             type: 'select',   required: true,  span: 1, options: STATUS.OBR },
  { id: 'descricao',       label: 'Descrição / Base legal', type: 'textarea', required: false, span: 2 },
];

function fieldsWithResponsavel() {
  const nomes = db.get('equipe').map(m => m.nome);
  return FIELDS.map(f => {
    if (f.id === 'responsavel' && nomes.length > 0) return { ...f, type: 'select', options: nomes };
    return f;
  });
}

function periodicidadeBadge(p) {
  const colors = {
    'Mensal':     '#2d5be3',
    'Bimestral':  '#00897b',
    'Trimestral': '#7c3aed',
    'Semestral':  '#f59e0b',
    'Anual':      '#d97706',
    'Sob demanda':'#6b7280',
  };
  const c = colors[p] || '#6b7280';
  return `<span style="display:inline-block;padding:1px 7px;border-radius:3px;background:${c}22;color:${c};font-size:0.72rem;font-weight:600">${p}</span>`;
}

function renderTable(items) {
  if (!items.length) return emptyState('Nenhuma obrigação regulatória cadastrada.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Número</th>
            <th>Obrigação</th>
            <th>Órgão</th>
            <th>Periodicidade</th>
            <th>Responsável</th>
            <th>Último envio</th>
            <th>Próx. vencimento</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(r => `
            <tr>
              <td><strong>${r.numero}</strong></td>
              <td>
                <div style="font-weight:500">${r.nome}</div>
                ${r.descricao ? `<div style="font-size:0.72rem;color:var(--muted);margin-top:2px">${r.descricao.substring(0, 60)}${r.descricao.length > 60 ? '…' : ''}</div>` : ''}
              </td>
              <td style="font-size:0.8rem">${r.orgao}</td>
              <td>${periodicidadeBadge(r.periodicidade)}</td>
              <td>${r.responsavel}</td>
              <td style="font-size:0.8rem">${r.ultimoEnvio ? formatDate(r.ultimoEnvio) : '<span style="color:var(--muted)">—</span>'}</td>
              <td>${deadlineCell(r.proximoVencimento)}</td>
              <td>${statusPill(r.status)}</td>
              <td>
                <div class="td-actions">
                  <button class="btn btn-secondary btn-sm" data-action="registrar" data-id="${r.id}" title="Registrar envio">✓</button>
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
  let items = db.get('obrigacoes');
  if (search) items = items.filter(r => r.nome.toLowerCase().includes(search) || r.orgao.toLowerCase().includes(search));
  if (status) items = items.filter(r => r.status === status);
  container.querySelector('#obr-table-wrap').innerHTML = renderTable(items);
}

/** Avança o próximo vencimento com base na periodicidade a partir de hoje. */
function proximoVencimentoPor(periodicidade, diaLimite) {
  const hoje = new Date();
  const dia = Number(diaLimite) || 10;
  let d = new Date(hoje.getFullYear(), hoje.getMonth() + 1, dia); // mês seguinte
  if (periodicidade === 'Bimestral')  d = new Date(hoje.getFullYear(), hoje.getMonth() + 2, dia);
  if (periodicidade === 'Trimestral') d = new Date(hoje.getFullYear(), hoje.getMonth() + 3, dia);
  if (periodicidade === 'Semestral')  d = new Date(hoje.getFullYear(), hoje.getMonth() + 6, dia);
  if (periodicidade === 'Anual')      d = new Date(hoje.getFullYear() + 1, hoje.getMonth(), dia);
  return d.toISOString().substring(0, 10);
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Obrigações Regulatórias</h2>
        <button class="btn btn-primary" data-action="new">+ Nova Obrigação</button>
      </div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por obrigação ou órgão…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.OBR)}
        </select>
      </div>
      <div class="card">
        <div id="obr-table-wrap">
          ${renderTable(db.get('obrigacoes'))}
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
        openModal({ title: 'Nova Obrigação Regulatória', fields: fieldsWithResponsavel(), data: {}, onSave: data => {
          db.add('obrigacoes', data);
          toast('Obrigação cadastrada!');
          applyFilters(container);
        }});
      }

      if (action === 'edit') {
        const record = db.getById('obrigacoes', numId);
        if (!record) return;
        openModal({ title: 'Editar Obrigação', fields: fieldsWithResponsavel(), data: record, onSave: data => {
          db.update('obrigacoes', numId, data);
          toast('Obrigação atualizada!');
          applyFilters(container);
        }});
      }

      if (action === 'registrar') {
        const record = db.getById('obrigacoes', numId);
        if (!record) return;
        const hoje = new Date().toISOString().substring(0, 10);
        const proximo = proximoVencimentoPor(record.periodicidade, record.diaLimite);
        db.update('obrigacoes', numId, {
          ultimoEnvio: hoje,
          proximoVencimento: proximo,
          status: 'Em Dia',
        });
        toast(`Envio de "${record.nome}" registrado! Próximo: ${formatDate(proximo)}`);
        applyFilters(container);
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta obrigação regulatória?').then(ok => {
          if (!ok) return;
          db.remove('obrigacoes', numId);
          toast('Obrigação excluída.', 'warning');
          applyFilters(container);
        });
      }
    });

    container.addEventListener('input', e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
