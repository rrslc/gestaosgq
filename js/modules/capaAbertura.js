/**
 * @fileoverview CAPA — Abertura: fluxo de abertura e processamento seguindo POP-GQ-009.
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, ORIGENS_CAPA } from '../constants.js';

const AREAS       = ['GQ', 'Produção', 'P&D', 'Regulatório', 'Logística', 'Compras', 'RH', 'TI', 'Fábrica', 'Outros'];
const RISK_LEVEL  = ['Baixa', 'Média', 'Alta'];
const PERIOD_VER  = ['3 meses', '6 meses', '9 meses', '12 meses'];
const FERRAMENTAS = ['5 Porquês', 'Diagrama de Ishikawa', 'Análise de Pareto', 'FTA', 'FMEA', 'Brainstorming', 'Outra'];

const PIPELINE = [
  { key: 'Aberta',                      label: 'Aberta',         color: 'var(--red)'    },
  { key: 'Em Investigação',             label: 'Investigação',   color: 'var(--purple)'  },
  { key: 'Em Plano de Ação',           label: 'Plano de Ação',  color: 'var(--blue)'   },
  { key: 'Em Verificação de Eficácia', label: 'Verificação',    color: 'var(--amber)'  },
  { key: 'Encerrada',                   label: 'Encerrada',      color: 'var(--green)'  },
];

const RISK_MATRIX = {
  'Baixa': { 'Baixa': 'Menor',   'Média': 'Menor',   'Alta': 'Maior'   },
  'Média': { 'Baixa': 'Menor',   'Média': 'Maior',   'Alta': 'Crítica' },
  'Alta':  { 'Baixa': 'Maior',   'Média': 'Crítica', 'Alta': 'Crítica' },
};

const NEXT_STATUS = {
  'Aberta':                      'Em Investigação',
  'Em Investigação':             'Em Plano de Ação',
  'Em Plano de Ação':           'Em Verificação de Eficácia',
  'Em Verificação de Eficácia': 'Encerrada',
};

function calcRisco(probabilidade, severidade) {
  return RISK_MATRIX[probabilidade]?.[severidade] ?? '';
}

function generateNumero() {
  const yy  = String(new Date().getFullYear()).slice(2);
  const all = db.get('capa');
  const seq = all.filter(r => r.numero?.endsWith(`/${yy}`)).length + 1;
  return `CAPA.${String(seq).padStart(3, '0')}/${yy}`;
}

function buildFields(forNew = false) {
  const equipe = db.get('equipe').map(m => m.nome);
  const base = [
    { id: 'numero',              label: 'Nº CAPA',                   type: 'text',     required: true,  span: 1, readonly: true },
    { id: 'dataAbertura',        label: 'Data de Abertura',           type: 'date',     required: true,  span: 1 },
    { id: 'prazoFinalizacao',    label: 'Prazo de Finalização',       type: 'date',     required: false, span: 1 },
    { id: 'area',                label: 'Área',                      type: 'select',   required: true,  span: 1, options: AREAS },
    { id: 'responsavelAbertura', label: 'Responsável pela Abertura',  type: 'select',   required: true,  span: 1, options: equipe.length ? equipe : AREAS },
    { id: 'origem',              label: 'Origem',                     type: 'select',   required: true,  span: 1, options: ORIGENS_CAPA },
    { id: 'descricao',           label: 'Descrição do Problema',      type: 'textarea', required: true,  span: 2 },
    { id: 'abrangencia',         label: 'Abrangência',                type: 'textarea', required: false, span: 2 },
    { id: 'severidade',          label: 'Severidade',                 type: 'select',   required: false, span: 1, options: RISK_LEVEL },
    { id: 'probabilidade',       label: 'Probabilidade',              type: 'select',   required: false, span: 1, options: RISK_LEVEL },
    { id: 'classificacaoRisco',  label: 'Classificação de Risco',     type: 'text',     required: false, span: 1, readonly: true },
  ];

  if (forNew) return base;

  return [
    ...base,
    { id: 'procedente',            label: 'Procedente',                     type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] },
    { id: 'justificativaNP',       label: 'Justificativa (Não Procedente)', type: 'textarea', required: false, span: 2 },
    { id: 'equipeInvestigacao',    label: 'Equipe de Investigação',          type: 'text',     required: false, span: 2 },
    { id: 'fontesInformacao',      label: 'Fontes de Informação',            type: 'text',     required: false, span: 2 },
    { id: 'resumoInvestigacao',    label: 'Resumo da Investigação',          type: 'textarea', required: false, span: 2 },
    { id: 'ferramentas',           label: 'Ferramentas Utilizadas',          type: 'select',   required: false, span: 1, options: FERRAMENTAS },
    { id: 'causaRaiz',             label: 'Causa Raiz',                      type: 'textarea', required: false, span: 2 },
    { id: 'porques',               label: '5 Porquês',                      type: 'textarea', required: false, span: 2 },
    { id: 'periodoVerificacao',    label: 'Período de Verificação',          type: 'select',   required: false, span: 1, options: PERIOD_VER },
    { id: 'dataInicioVerificacao', label: 'Início da Verificação',           type: 'date',     required: false, span: 1 },
    { id: 'resultadoVerificacao',  label: 'Resultado da Verificação',        type: 'textarea', required: false, span: 2 },
    { id: 'foiEficaz',             label: 'Foi Eficaz?',                     type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] },
    { id: 'dataFechamento',        label: 'Data de Fechamento',               type: 'date',     required: false, span: 1 },
    { id: 'status',                label: 'Status',                          type: 'select',   required: true,  span: 1, options: STATUS.CAPA },
    { id: 'observacoes',           label: 'Observações de Encerramento',     type: 'textarea', required: false, span: 2 },
  ];
}

function renderPipeline(items) {
  const counts = {};
  PIPELINE.forEach(p => { counts[p.key] = 0; });
  items.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

  return `
    <div style="display:flex;gap:0;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
      ${PIPELINE.map((p, i) => `
        <div style="flex:1;padding:12px 8px;text-align:center;background:var(--surface);${i > 0 ? 'border-left:1px solid var(--border)' : ''}">
          <div style="font-size:1.4rem;font-weight:700;color:${p.color}">${counts[p.key]}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;line-height:1.3">${p.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderTable(items) {
  if (!items.length) return emptyState('Nenhuma CAPA encontrada.');

  const RISK_CLASS = { 'Crítica': 'pill-red', 'Maior': 'pill-amber', 'Menor': 'pill-blue' };
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  function diasAberto(r) {
    if (!r.dataAbertura) return '—';
    const ini = new Date(r.dataAbertura + 'T00:00:00');
    const fim = r.dataFechamento ? new Date(r.dataFechamento + 'T00:00:00') : hoje;
    const dias = Math.round((fim - ini) / 86400000);
    const emAtraso = !['Encerrada','Não Procedente'].includes(r.status) &&
      r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje;
    return `<span style="color:${emAtraso ? 'var(--red)' : 'inherit'};font-weight:${emAtraso ? '600' : 'normal'}">${dias}d</span>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Número</th><th>Descrição</th><th>Origem</th><th>Área</th>
          <th>Responsável</th><th>Abertura</th><th>T. Aberto</th><th>Risco</th><th>Status</th><th>Eficácia</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const nextSt = NEXT_STATUS[r.status];
            const eficaciaHtml = r.foiEficaz
              ? statusPill(r.foiEficaz === 'Sim' ? 'Eficaz' : r.foiEficaz === 'Não' ? 'Ineficaz' : 'Em Avaliação')
              : '—';
            return `<tr>
              <td><strong>${r.numero}</strong></td>
              <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
              <td>${r.origem || '—'}</td>
              <td>${r.area || '—'}</td>
              <td>${r.responsavelAbertura || '—'}</td>
              <td>${formatDate(r.dataAbertura)}</td>
              <td style="text-align:center">${diasAberto(r)}</td>
              <td>${r.classificacaoRisco ? `<span class="pill ${RISK_CLASS[r.classificacaoRisco] ?? 'pill-gray'}">${r.classificacaoRisco}</span>` : '—'}</td>
              <td>${statusPill(r.encerradoStatus || r.status)}</td>
              <td>${eficaciaHtml}</td>
              <td>
                <div class="td-actions">
                  ${nextSt ? `<button class="btn btn-secondary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nextSt}" title="Avançar para ${nextSt}">▶</button>` : ''}
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="Editar">✏</button>
                  <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}" title="Excluir">🗑</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function refresh(container) {
  const search = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
  const status = container.querySelector('[data-filter="status"]')?.value ?? '';
  let items = db.get('capa');
  if (search) items = items.filter(r =>
    r.numero?.toLowerCase().includes(search) ||
    r.descricao?.toLowerCase().includes(search) ||
    (r.responsavelAbertura || '').toLowerCase().includes(search)
  );
  if (status) items = items.filter(r => r.status === status);
  container.querySelector('#capa-pipeline').innerHTML = renderPipeline(db.get('capa'));
  container.querySelector('#capa-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    const allCapas = db.get('capa');
    container.innerHTML = `
      <div class="page-header">
        <h2>CAPA — Abertura</h2>
        <button class="btn btn-primary" data-action="new">+ Abrir CAPA</button>
      </div>
      <div id="capa-pipeline">${renderPipeline(allCapas)}</div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, descrição ou responsável…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.CAPA)}
        </select>
      </div>
      <div class="card">
        <div id="capa-table-wrap">${renderTable(allCapas)}</div>
      </div>
    `;
  },

  init(container) {
    const preFill = window._capaFromRNC;
    if (preFill) {
      window._capaFromRNC = null;
      setTimeout(() => {
        openModal({
          title: 'Abrir Nova CAPA (a partir de RNC)',
          fields: buildFields(true),
          data: { numero: generateNumero(), dataAbertura: today(), status: 'Aberta', ...preFill },
          onSave: data => {
            const risco = calcRisco(data.probabilidade, data.severidade);
            db.add('capa', { ...data, classificacaoRisco: risco, status: 'Aberta' });
            toast('CAPA aberta com sucesso!');
            refresh(container);
          },
        });
      }, 50);
    }

    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, next } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      if (action === 'new') {
        openModal({
          title: 'Abrir Nova CAPA',
          fields: buildFields(true),
          data: { numero: generateNumero(), dataAbertura: today(), status: 'Aberta' },
          onSave: data => {
            const risco = calcRisco(data.probabilidade, data.severidade);
            db.add('capa', { ...data, classificacaoRisco: risco, status: 'Aberta' });
            toast('CAPA aberta com sucesso!');
            refresh(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('capa', numId);
        if (!record) return;
        openModal({
          title: `Editar CAPA ${record.numero}`,
          fields: buildFields(false),
          data: record,
          onSave: data => {
            const risco = calcRisco(data.probabilidade, data.severidade);
            db.update('capa', numId, { ...data, classificacaoRisco: risco });
            toast('CAPA atualizada!');
            refresh(container);
          },
        });
      }

      if (action === 'advance') {
        showConfirm(`Avançar esta CAPA para "${next}"?`).then(ok => {
          if (!ok) return;
          const record = db.getById('capa', numId);
          const updates = { status: next };
          if (next === 'Encerrada') {
            const dataFechamento = today();
            updates.dataFechamento = dataFechamento;
            if (record?.prazoFinalizacao) {
              updates.encerradoStatus = dataFechamento <= record.prazoFinalizacao
                ? 'Finalizado no prazo' : 'Finalizado em atraso';
            }
          }
          db.update('capa', numId, updates);
          toast(`CAPA avançada para "${next}".`);
          refresh(container);
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta CAPA? A operação não poderá ser desfeita.').then(ok => {
          if (!ok) return;
          db.remove('capa', numId);
          toast('CAPA excluída.', 'warning');
          refresh(container);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) refresh(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) refresh(container); });
  },
};
