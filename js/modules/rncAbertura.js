/**
 * @fileoverview RNC — Abertura: fluxo de abertura e processamento de não-conformidades.
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, CLASSIFICACOES_RNC, ORIGENS_RNC } from '../constants.js';

const AREAS = ['GQ', 'Produção', 'P&D', 'Regulatório', 'Logística', 'Compras', 'RH', 'TI', 'Fábrica', 'Outros'];

const PIPELINE = [
  { key: 'Aberta',                   label: 'Aberta',      color: 'var(--red)'    },
  { key: 'Em Análise',              label: 'Em Análise',  color: 'var(--purple)' },
  { key: 'Em Tratamento',           label: 'Tratamento',  color: 'var(--blue)'   },
  { key: 'Verificação de Eficácia', label: 'Verificação', color: 'var(--amber)'  },
  { key: 'Encerrada',               label: 'Encerrada',   color: 'var(--green)'  },
];

const NEXT_STATUS = {
  'Aberta':                   'Em Análise',
  'Em Análise':              'Em Tratamento',
  'Em Tratamento':           'Verificação de Eficácia',
  'Verificação de Eficácia': 'Encerrada',
};

let _router = null;
async function getRouter() {
  if (!_router) { const m = await import('../app.js'); _router = m.router; }
  return _router;
}

function generateNumero() {
  const year = new Date().getFullYear();
  const all  = db.get('rnc');
  const seq  = all.length + 1;
  return `RNC-${year}-${String(seq).padStart(3, '0')}`;
}

function buildFields(forNew = false) {
  const nomes = db.get('equipe').map(m => m.nome);
  const resp  = nomes.length ? nomes : ['—'];
  const base  = [
    { id: 'numero',           label: 'Número',                type: 'text',     required: true,  span: 1, readonly: true },
    { id: 'dataAbertura',     label: 'Data de Abertura',      type: 'date',     required: true,  span: 1 },
    { id: 'prazoFinalizacao', label: 'Prazo de Finalização',  type: 'date',     required: false, span: 1 },
    { id: 'area',             label: 'Área',                  type: 'select',   required: true,  span: 1, options: AREAS },
    { id: 'origem',           label: 'Origem',                type: 'select',   required: true,  span: 1, options: ORIGENS_RNC },
    { id: 'classificacao',    label: 'Classificação',         type: 'select',   required: true,  span: 1, options: CLASSIFICACOES_RNC },
    { id: 'responsavel',      label: 'Responsável',           type: 'select',   required: true,  span: 1, options: resp },
    { id: 'produto',          label: 'Produto',               type: 'text',     required: true,  span: 2 },
    { id: 'descricao',        label: 'Descrição',             type: 'textarea', required: true,  span: 2 },
    { id: 'necessitaCapa',    label: 'Necessita abrir CAPA?', type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] },
    { id: 'status',           label: 'Status',                type: 'select',   required: true,  span: 1, options: STATUS.RNC },
  ];
  if (forNew) return base;
  return [
    ...base,
    { id: 'foiEficaz',      label: 'Foi Eficaz?',        type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] },
    { id: 'dataFechamento', label: 'Data de Fechamento', type: 'date',     required: false, span: 1 },
    { id: 'observacoes',    label: 'Observações',        type: 'textarea', required: false, span: 2 },
  ];
}

function renderPipelineBar(items) {
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
  if (!items.length) return emptyState('Nenhuma RNC encontrada.');

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  function diasAberto(r) {
    if (!r.dataAbertura) return '—';
    const ini = new Date(r.dataAbertura + 'T00:00:00');
    const fim = r.dataFechamento ? new Date(r.dataFechamento + 'T00:00:00') : hoje;
    const dias = Math.round((fim - ini) / 86400000);
    const emAtraso = !['Encerrada', 'Cancelada'].includes(r.status) &&
      r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje;
    return `<span style="color:${emAtraso ? 'var(--red)' : 'inherit'};font-weight:${emAtraso ? '600' : 'normal'}">${dias}d</span>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Número</th><th>Produto</th><th>Descrição</th><th>Origem</th>
          <th>Classificação</th><th>Responsável</th><th>Abertura</th>
          <th>T. Aberto</th><th>Status</th><th>Eficácia</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const nextSt  = NEXT_STATUS[r.status];
            const capaBtn = r.necessitaCapa === 'Sim' && !r.capaAberta
              ? `<button class="btn btn-secondary btn-sm" data-action="abrir-capa" data-id="${r.id}" title="Abrir CAPA">📋</button>`
              : '';
            const eficacia = r.foiEficaz
              ? statusPill(r.foiEficaz === 'Sim' ? 'Eficaz' : r.foiEficaz === 'Não' ? 'Ineficaz' : 'Em Avaliação')
              : '—';
            return `<tr>
              <td><strong>${r.numero}</strong></td>
              <td>${r.produto || '—'}</td>
              <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
              <td>${r.origem || '—'}</td>
              <td>${statusPill(r.classificacao)}</td>
              <td>${r.responsavel}</td>
              <td>${formatDate(r.dataAbertura)}</td>
              <td style="text-align:center">${diasAberto(r)}</td>
              <td>${statusPill(r.encerradoStatus || r.status)}</td>
              <td>${eficacia}</td>
              <td>
                <div class="td-actions">
                  ${nextSt ? `<button class="btn btn-secondary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nextSt}" title="Avançar para ${nextSt}">▶</button>` : ''}
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="Editar">✏</button>
                  ${capaBtn}
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
  const origem = container.querySelector('[data-filter="origem"]')?.value ?? '';
  const area   = container.querySelector('[data-filter="area"]')?.value ?? '';
  let items = db.get('rnc');
  if (search) items = items.filter(r =>
    (r.numero || '').toLowerCase().includes(search) ||
    (r.descricao || '').toLowerCase().includes(search) ||
    (r.produto || '').toLowerCase().includes(search)
  );
  if (status) items = items.filter(r => r.status === status);
  if (origem) items = items.filter(r => r.origem === origem);
  if (area)   items = items.filter(r => r.area === area);
  container.querySelector('#rnc-pipeline').innerHTML = renderPipelineBar(db.get('rnc'));
  container.querySelector('#rnc-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    const allRnc = db.get('rnc');
    container.innerHTML = `
      <div class="page-header">
        <h2>RNC — Abertura</h2>
        <button class="btn btn-primary" data-action="new">+ Nova RNC</button>
      </div>
      <div id="rnc-pipeline">${renderPipelineBar(allRnc)}</div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, produto ou descrição…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.RNC)}
        </select>
        <select class="toolbar-select" data-filter="origem">
          <option value="">Todas as origens</option>
          ${ORIGENS_RNC.map(o => `<option value="${o}">${o}</option>`).join('')}
        </select>
        <select class="toolbar-select" data-filter="area">
          <option value="">Todas as áreas</option>
          ${AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <div id="rnc-table-wrap">${renderTable(allRnc)}</div>
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, next } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      if (action === 'new') {
        openModal({
          title: 'Nova RNC',
          fields: buildFields(true),
          data: { numero: generateNumero(), dataAbertura: today(), status: 'Aberta' },
          onSave: data => {
            db.add('rnc', data);
            toast('RNC criada com sucesso!');
            refresh(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('rnc', numId);
        if (!record) return;
        openModal({
          title: `Editar RNC ${record.numero}`,
          fields: buildFields(false),
          data: record,
          onSave: data => {
            db.update('rnc', numId, data);
            toast('RNC atualizada!');
            refresh(container);
          },
        });
      }

      if (action === 'advance') {
        showConfirm(`Avançar esta RNC para "${next}"?`).then(ok => {
          if (!ok) return;
          const record = db.getById('rnc', numId);
          const updates = { status: next };
          if (next === 'Encerrada') {
            const dataFechamento = today();
            updates.dataFechamento = dataFechamento;
            if (record?.prazoFinalizacao) {
              updates.encerradoStatus = dataFechamento <= record.prazoFinalizacao
                ? 'Finalizado no prazo' : 'Finalizado em atraso';
            }
          }
          db.update('rnc', numId, updates);
          toast(`RNC avançada para "${next}".`);
          refresh(container);
        });
      }

      if (action === 'abrir-capa') {
        const record = db.getById('rnc', numId);
        if (!record) return;
        showConfirm(`Abrir uma CAPA a partir de ${record.numero}?`).then(async ok => {
          if (!ok) return;
          window._capaFromRNC = {
            origem: 'RNC/CAPA',
            descricao: `[RNC ${record.numero}] ${record.descricao}`,
            area: record.area || '',
          };
          db.update('rnc', numId, { capaAberta: true });
          const r = await getRouter();
          r.navigate('capaAbertura');
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta RNC?').then(ok => {
          if (!ok) return;
          db.remove('rnc', numId);
          toast('RNC excluída.', 'warning');
          refresh(container);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) refresh(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) refresh(container); });
  },
};
