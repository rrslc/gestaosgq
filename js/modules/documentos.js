/**
 * @fileoverview Módulo Controle de Documentos SGQ — conforme POP-GQ-002 (Rev 00, 16/03/2026).
 * Validade padrão: 3 anos a partir da data de homologação.
 * Tipos não revisáveis (PR, RE) não têm expiração.
 */

import { db } from '../db.js';
import { statusPill, emptyState, selectOptions, formatDate } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS } from '../constants.js';

const TIPOS_DOC = ['MA', 'PL', 'POP', 'IT', 'ESP', 'DT', 'PR', 'RE', 'RMP'];
const AREAS_DOC = ['GQ', 'RH', 'MT', 'PR', 'CQ', 'AR', 'LOG', 'ADM'];

const TIPO_META = {
  MA:  { label: 'Manual',        color: '#7c3aed' },
  PL:  { label: 'Plano',         color: '#2563eb' },
  POP: { label: 'POP',           color: '#059669' },
  IT:  { label: 'Instr. Trab.',  color: '#0891b2' },
  ESP: { label: 'Especificação', color: '#dc2626' },
  DT:  { label: 'Dossiê Téc.',   color: '#9333ea' },
  PR:  { label: 'Protocolo',     color: '#d97706' },
  RE:  { label: 'Relatório',     color: '#65a30d' },
  RMP: { label: 'Reg. Mestre',   color: '#334155' },
};

// PR e RE: não revisáveis, sem expiração de validade (POP-GQ-002, Quadro 1)
const SEM_VALIDADE = ['PR', 'RE'];

const FIELDS = [
  { id: 'numero',          label: 'Código (ex: POP-GQ-002)', type: 'text',     required: true,  span: 1 },
  { id: 'tipo',            label: 'Tipo de documento',       type: 'select',   required: true,  span: 1, options: TIPOS_DOC },
  { id: 'area',            label: 'Área emitente',           type: 'select',   required: true,  span: 1, options: AREAS_DOC },
  { id: 'revisao',         label: 'Revisão atual',           type: 'text',     required: true,  span: 1 },
  { id: 'titulo',          label: 'Título completo',         type: 'text',     required: true,  span: 2 },
  { id: 'dataHomologacao', label: 'Data de homologação',     type: 'date',     required: false, span: 1 },
  { id: 'status',          label: 'Status',                  type: 'select',   required: true,  span: 1, options: STATUS.DOC },
  { id: 'elaboradores',    label: 'Elaborado por',           type: 'text',     required: false, span: 1 },
  { id: 'revisores',       label: 'Revisado por (mín. 2)',   type: 'text',     required: false, span: 1 },
  { id: 'aprovadores',     label: 'Aprovado por',            type: 'text',     required: false, span: 1 },
  { id: 'descricao',       label: 'Objetivo / Descrição',    type: 'textarea', required: false, span: 2 },
];

const SOLICITAR_FIELDS = [
  { id: 'tipoSolic',        label: 'Tipo de solicitação',                   type: 'select',   required: true,  span: 2, options: ['Revisão', 'Cancelamento', 'Alteração de Distribuição'] },
  { id: 'solicitante',      label: 'Solicitante',                            type: 'text',     required: true,  span: 1 },
  { id: 'areaSolic',        label: 'Área solicitante',                       type: 'text',     required: true,  span: 1 },
  { id: 'justificativa',    label: 'Descrição da alteração / justificativa', type: 'textarea', required: true,  span: 2 },
  { id: 'impactoQualidade', label: 'Impacto na Qualidade do Produto?',       type: 'select',   required: true,  span: 1, options: ['Não', 'Sim'] },
  { id: 'impactoProcesso',  label: 'Impacto em Processos e Procedimentos?',  type: 'select',   required: true,  span: 1, options: ['Não', 'Sim'] },
  { id: 'impactoTreino',    label: 'Impacto em Treinamentos?',               type: 'select',   required: true,  span: 1, options: ['Não', 'Sim'] },
  { id: 'areasTreinar',     label: 'Áreas a serem treinadas',                type: 'text',     required: false, span: 1 },
];

function tipoBadge(tipo) {
  const m = TIPO_META[tipo] || { label: tipo, color: '#6b7280' };
  return `<span style="display:inline-block;padding:1px 8px;border-radius:3px;background:${m.color}1a;color:${m.color};font-size:0.72rem;font-weight:700;letter-spacing:.03em">${m.label}</span>`;
}

/** Calcula o status efetivo baseado na data de homologação (regra: 3 anos). */
function computedStatus(doc) {
  if (['Em Elaboração', 'Em Revisão', 'Cancelado', 'Suspenso'].includes(doc.status)) return doc.status;
  if (SEM_VALIDADE.includes(doc.tipo)) return 'Vigente';
  if (!doc.dataHomologacao) return doc.status || 'Em Elaboração';
  const expiry = new Date(doc.dataHomologacao);
  expiry.setFullYear(expiry.getFullYear() + 3);
  const diff = (expiry - new Date()) / 86400000;
  if (diff < 0) return 'Vencido';
  if (diff <= 90) return 'A Vencer';
  return 'Vigente';
}

/** Retorna a data de expiração (homologação + 3 anos) ou null para tipos sem validade. */
function expiryDate(doc) {
  if (SEM_VALIDADE.includes(doc.tipo) || !doc.dataHomologacao) return null;
  const d = new Date(doc.dataHomologacao);
  d.setFullYear(d.getFullYear() + 3);
  return d.toISOString().substring(0, 10);
}

function renderTable(items) {
  if (!items.length) return emptyState('Nenhum documento SGQ cadastrado.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Título</th>
            <th>Tipo</th>
            <th>Rev.</th>
            <th>Homologação</th>
            <th>Validade (3 anos)</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(doc => {
            const s = computedStatus(doc);
            const exp = expiryDate(doc);
            return `
              <tr>
                <td><strong style="font-family:monospace">${doc.numero}</strong></td>
                <td>
                  <div style="font-weight:500;max-width:280px">${doc.titulo}</div>
                  ${doc.descricao ? `<div style="font-size:0.72rem;color:var(--muted);margin-top:2px">${doc.descricao.substring(0, 70)}${doc.descricao.length > 70 ? '…' : ''}</div>` : ''}
                </td>
                <td>${tipoBadge(doc.tipo)}</td>
                <td style="text-align:center;font-family:monospace;font-size:0.8rem">Rev.${doc.revisao || '00'}</td>
                <td style="font-size:0.8rem">${doc.dataHomologacao ? formatDate(doc.dataHomologacao) : '<span style="color:var(--muted)">—</span>'}</td>
                <td style="font-size:0.8rem">${exp ? formatDate(exp) : '<span style="color:var(--muted)">—</span>'}</td>
                <td>${statusPill(s)}</td>
                <td>
                  <div class="td-actions">
                    <button class="btn btn-secondary btn-sm" data-action="solicitar" data-id="${doc.id}" title="Solicitar revisão (POP-GQ-002-01)">↻</button>
                    <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${doc.id}">✏</button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${doc.id}">🗑</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function applyFilters(container) {
  const search = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
  const tipo   = container.querySelector('[data-filter="tipo"]')?.value ?? '';
  const status = container.querySelector('[data-filter="status"]')?.value ?? '';
  let items = db.get('documentos');
  if (search) items = items.filter(d => d.numero?.toLowerCase().includes(search) || d.titulo?.toLowerCase().includes(search));
  if (tipo)   items = items.filter(d => d.tipo === tipo);
  if (status) items = items.filter(d => computedStatus(d) === status);
  container.querySelector('#docs-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Controle de Documentos SGQ</h2>
        <button class="btn btn-primary" data-action="new">+ Novo Documento</button>
      </div>
      <div style="font-size:0.8rem;color:var(--muted);margin:-8px 0 12px">
        Conforme POP-GQ-002 — validade 3 anos a partir da homologação · ↻ = Solicitar Revisão (POP-GQ-002-01)
      </div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por código ou título…" data-filter="search">
        <select class="toolbar-select" data-filter="tipo">
          <option value="">Todos os tipos</option>
          ${TIPOS_DOC.map(t => `<option value="${t}">${t} — ${TIPO_META[t]?.label || t}</option>`).join('')}
        </select>
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.DOC)}
        </select>
      </div>
      <div class="card">
        <div id="docs-table-wrap">
          ${renderTable(db.get('documentos'))}
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
          title: 'Novo Documento SGQ',
          fields: FIELDS,
          data: { revisao: '00', status: 'Em Elaboração' },
          onSave: data => {
            db.add('documentos', data);
            toast('Documento cadastrado!');
            applyFilters(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('documentos', numId);
        if (!record) return;
        openModal({
          title: 'Editar Documento',
          fields: FIELDS,
          data: record,
          onSave: data => {
            db.update('documentos', numId, data);
            toast('Documento atualizado!');
            applyFilters(container);
          },
        });
      }

      if (action === 'solicitar') {
        const doc = db.getById('documentos', numId);
        if (!doc) return;
        openModal({
          title: `Solicitar Revisão — ${doc.numero}`,
          fields: SOLICITAR_FIELDS,
          data: {},
          onSave: () => {
            db.update('documentos', numId, { status: 'Em Revisão' });
            toast(`Solicitação registrada. ${doc.numero} movido para "Em Revisão".`);
            applyFilters(container);
          },
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja remover este documento do controle?').then(ok => {
          if (!ok) return;
          db.remove('documentos', numId);
          toast('Documento removido.', 'warning');
          applyFilters(container);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
