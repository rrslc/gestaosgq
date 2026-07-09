/**
 * @fileoverview GCM — Abertura: registro e acompanhamento de Controles de Mudança.
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, CATEGORIAS_GCM, IMPACTOS } from '../constants.js';

const AREAS = ['GQ', 'Produção', 'P&D', 'Regulatório', 'Logística', 'Compras', 'RH', 'TI', 'Fábrica', 'Outros'];

const PIPELINE = [
  { key: 'Aberta',         label: 'Aberta',         color: 'var(--red)'    },
  { key: 'Em Análise',     label: 'Análise',         color: 'var(--purple)' },
  { key: 'Aprovada',       label: 'Aprovada',        color: 'var(--blue)'   },
  { key: 'Em Implantação', label: 'Implantação',     color: 'var(--amber)'  },
  { key: 'Concluída',      label: 'Concluída',       color: 'var(--green)'  },
];

const NEXT_STATUS = {
  'Aberta':         'Em Análise',
  'Em Análise':     'Aprovada',
  'Aprovada':       'Em Implantação',
  'Em Implantação': 'Concluída',
};

function generateNumero() {
  const year = new Date().getFullYear();
  const all  = db.get('gcm');
  const seq  = all.length + 1;
  return `GCM-${year}-${String(seq).padStart(3, '0')}`;
}

function buildFields(forNew = false) {
  const equipe = db.get('equipe').map(m => m.nome);
  const resp   = equipe.length ? equipe : ['—'];
  const base   = [
    { id: 'numero',                 label: 'Nº CM',                      type: 'text',     required: true,  span: 1, readonly: true },
    { id: 'data',                   label: 'Data de Abertura',            type: 'date',     required: true,  span: 1 },
    { id: 'prazoImplementacao',     label: 'Prazo de Implementação',      type: 'date',     required: false, span: 1 },
    { id: 'area',                   label: 'Área',                        type: 'select',   required: true,  span: 1, options: AREAS },
    { id: 'categoria',              label: 'Categoria',                   type: 'select',   required: true,  span: 1, options: CATEGORIAS_GCM },
    { id: 'impacto',                label: 'Impacto',                     type: 'select',   required: true,  span: 1, options: IMPACTOS },
    { id: 'solicitante',            label: 'Solicitante',                 type: 'select',   required: true,  span: 1, options: resp },
    { id: 'responsavelImplementacao',label: 'Resp. pela Implementação',   type: 'select',   required: false, span: 1, options: resp },
    { id: 'descricao',              label: 'Descrição da Mudança',        type: 'textarea', required: true,  span: 2 },
    { id: 'justificativa',          label: 'Justificativa',               type: 'textarea', required: false, span: 2 },
  ];

  if (forNew) return base;

  return [
    ...base,
    { id: 'analiseRisco',           label: 'Análise de Risco',            type: 'textarea', required: false, span: 2 },
    { id: 'resultadoImplementacao', label: 'Resultado da Implementação',  type: 'textarea', required: false, span: 2 },
    { id: 'foiEficaz',              label: 'Foi Eficaz?',                 type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] },
    { id: 'dataFechamento',         label: 'Data de Fechamento',          type: 'date',     required: false, span: 1 },
    { id: 'status',                 label: 'Status',                      type: 'select',   required: true,  span: 1, options: STATUS.GCM },
    { id: 'observacoes',            label: 'Observações',                 type: 'textarea', required: false, span: 2 },
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
  if (!items.length) return emptyState('Nenhuma mudança registrada.');

  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  function diasAberto(r) {
    if (!r.data) return '—';
    const ini = new Date(r.data + 'T00:00:00');
    const fim = r.dataFechamento ? new Date(r.dataFechamento + 'T00:00:00') : hoje;
    const dias = Math.round((fim - ini) / 86400000);
    const emAtraso = !['Concluída', 'Rejeitada', 'Cancelada'].includes(r.status) &&
      r.prazoImplementacao && new Date(r.prazoImplementacao + 'T00:00:00') < hoje;
    return `<span style="color:${emAtraso ? 'var(--red)' : 'inherit'};font-weight:${emAtraso ? '600' : 'normal'}">${dias}d</span>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Número</th><th>Categoria</th><th>Descrição</th><th>Área</th>
          <th>Solicitante</th><th>Impacto</th><th>Data</th><th>T. Aberto</th><th>Status</th><th>Eficácia</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${items.map(r => {
            const nextSt = NEXT_STATUS[r.status];
            const eficaciaHtml = r.foiEficaz
              ? statusPill(r.foiEficaz === 'Sim' ? 'Eficaz' : r.foiEficaz === 'Não' ? 'Ineficaz' : 'Em Avaliação')
              : '—';
            return `<tr>
              <td><strong>${r.numero}</strong></td>
              <td>${r.categoria || '—'}</td>
              <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
              <td>${r.area || '—'}</td>
              <td>${r.solicitante || '—'}</td>
              <td>${statusPill(r.impacto)}</td>
              <td>${formatDate(r.data)}</td>
              <td style="text-align:center">${diasAberto(r)}</td>
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
  const search   = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
  const status   = container.querySelector('[data-filter="status"]')?.value ?? '';
  const categoria = container.querySelector('[data-filter="categoria"]')?.value ?? '';
  let items = db.get('gcm');
  if (search)    items = items.filter(r => r.numero?.toLowerCase().includes(search) || r.descricao?.toLowerCase().includes(search) || (r.solicitante || '').toLowerCase().includes(search));
  if (status)    items = items.filter(r => r.status === status);
  if (categoria) items = items.filter(r => r.categoria === categoria);
  container.querySelector('#gcm-pipeline').innerHTML = renderPipelineBar(db.get('gcm'));
  container.querySelector('#gcm-table-wrap').innerHTML = renderTable(items);
}

export default {
  render(container) {
    const allGcm = db.get('gcm');
    container.innerHTML = `
      <div class="page-header">
        <h2>GCM — Abertura</h2>
        <button class="btn btn-primary" data-action="new">+ Nova CM</button>
      </div>
      <div id="gcm-pipeline">${renderPipelineBar(allGcm)}</div>
      <div class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por número, descrição ou solicitante…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.GCM)}
        </select>
        <select class="toolbar-select" data-filter="categoria">
          <option value="">Todas as categorias</option>
          ${CATEGORIAS_GCM.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
      </div>
      <div class="card">
        <div id="gcm-table-wrap">${renderTable(allGcm)}</div>
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
          title: 'Nova CM — Controle de Mudança',
          fields: buildFields(true),
          data: { numero: generateNumero(), data: today(), status: 'Aberta' },
          onSave: data => {
            db.add('gcm', { ...data, status: 'Aberta' });
            toast('CM registrada com sucesso!');
            refresh(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('gcm', numId);
        if (!record) return;
        openModal({
          title: `Editar CM ${record.numero}`,
          fields: buildFields(false),
          data: record,
          onSave: data => {
            db.update('gcm', numId, data);
            toast('CM atualizada!');
            refresh(container);
          },
        });
      }

      if (action === 'advance') {
        showConfirm(`Avançar esta CM para "${next}"?`).then(ok => {
          if (!ok) return;
          const record  = db.getById('gcm', numId);
          const updates = { status: next };
          if (next === 'Concluída') {
            const dataFechamento = today();
            updates.dataFechamento = dataFechamento;
            if (record?.prazoImplementacao) {
              updates.encerradoStatus = dataFechamento <= record.prazoImplementacao
                ? 'Finalizado no prazo' : 'Finalizado em atraso';
            }
          }
          db.update('gcm', numId, updates);
          toast(`CM avançada para "${next}".`);
          refresh(container);
        });
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta CM? A operação não poderá ser desfeita.').then(ok => {
          if (!ok) return;
          db.remove('gcm', numId);
          toast('CM excluída.', 'warning');
          refresh(container);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) refresh(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) refresh(container); });
  },
};
