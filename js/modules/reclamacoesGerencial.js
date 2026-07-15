/**
 * @fileoverview Reclamações de Clientes — Gerencial: painel panorâmico P-SQ-014.
 */

import { db } from '../db.js';
import { formatDate, deadlineCell, statusPill, emptyState, today } from '../utils.js';
import { showConfirm } from '../modal.js';
import { toast } from '../toast.js';

const CLOSED = ['Concluída', 'Cancelada'];

const PIPELINE_STEPS = [
  { key: 'Aberta',             label: 'Aberta',      color: '#ef4444' },
  { key: 'Em Investigação',    label: 'Investigação', color: '#3b82f6' },
  { key: 'Aguardando Retorno', label: 'Ag. Retorno', color: '#f59e0b' },
  { key: 'Concluída',          label: 'Concluída',   color: '#22c55e' },
];

const NEXT_STATUS = {
  'Aberta':             'Em Investigação',
  'Em Investigação':    'Aguardando Retorno',
  'Aguardando Retorno': 'Concluída',
};

let _router = null;
async function getRouter() {
  if (!_router) { const m = await import('../app.js'); _router = m.router; }
  return _router;
}

function miniPipeline(status) {
  const idx = PIPELINE_STEPS.findIndex(p => p.key === status);
  if (idx < 0) return `<div style="font-size:0.68rem;color:#94a3b8;margin-top:3px">${status}</div>`;
  return `<div style="display:flex;gap:1px;height:5px;margin-top:4px;border-radius:3px;overflow:hidden">
    ${PIPELINE_STEPS.map((p, i) => `<div style="flex:1;background:${i < idx ? '#22c55e' : i === idx ? p.color : 'var(--border)'}" title="${p.label}"></div>`).join('')}
  </div>`;
}

function kpiCard(value, label, color, highlight) {
  return `<div style="padding:12px;background:var(--surface);border:1px solid ${highlight ? color : 'var(--border)'};border-left:3px solid ${color};border-radius:8px;text-align:center">
    <div style="font-size:1.6rem;font-weight:700;color:${color};line-height:1.1">${value}</div>
    <div style="font-size:0.71rem;color:var(--muted);margin-top:4px">${label}</div>
  </div>`;
}

function renderPipelineBar(all) {
  const counts = {};
  PIPELINE_STEPS.forEach(p => { counts[p.key] = 0; });
  all.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
  return `
    <div style="display:flex;gap:0;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
      ${PIPELINE_STEPS.map((p, i) => `
        <div style="flex:1;padding:12px 8px;text-align:center;background:var(--surface);${i > 0 ? 'border-left:1px solid var(--border)' : ''}">
          <div style="font-size:1.3rem;font-weight:700;color:${p.color}">${counts[p.key]}</div>
          <div style="font-size:0.7rem;color:var(--muted);margin-top:2px;line-height:1.3">${p.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAcompanhamento() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const open = db.get('reclamacoes').filter(r => !CLOSED.includes(r.status));
  if (!open.length) return '';

  return `
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:600;font-size:0.9rem;margin-bottom:14px">Acompanhamento por Etapa</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:10px">
        ${open.map(r => {
          const idx = PIPELINE_STEPS.findIndex(p => p.key === r.status);
          const step = idx >= 0 ? PIPELINE_STEPS[idx] : { label: r.status, color: '#94a3b8' };
          const emAtraso = r.prazoFechamento && new Date(r.prazoFechamento + 'T00:00:00') < hoje;
          return `<div style="border:1px solid var(--border);border-left:3px solid ${step.color};border-radius:8px;padding:11px 12px;background:var(--surface)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong style="font-size:0.84rem">${r.numero}</strong>
              ${emAtraso ? `<span style="font-size:0.68rem;color:#ef4444;font-weight:700;padding:1px 6px;border-radius:3px;background:#ef444418">⚠ atraso</span>` : ''}
            </div>
            <div style="font-size:0.75rem;color:var(--muted);margin-bottom:2px;font-weight:500">${r.cliente || '—'}</div>
            <div style="font-size:0.72rem;color:var(--muted);margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.produto || ''}">${r.produto || '—'}</div>
            <div style="display:flex;gap:1px;height:6px;margin-bottom:5px;border-radius:3px;overflow:hidden">
              ${PIPELINE_STEPS.map((p, i) => `<div style="flex:1;background:${i < idx ? '#22c55e' : i === idx ? p.color : 'var(--border)'}" title="${p.label}"></div>`).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:0.72rem;font-weight:600;color:${step.color}">${step.label}</span>
              ${r.responsavel ? `<span style="font-size:0.7rem;color:var(--muted)">${r.responsavel}</span>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderContent(container) {
  const all  = db.get('reclamacoes');
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const total      = all.length;
  const abertas    = all.filter(r => !CLOSED.includes(r.status)).length;
  const concNoPr   = all.filter(r =>
    r.status === 'Concluída' && r.prazoFechamento && r.dataFechamento &&
    r.dataFechamento <= r.prazoFechamento
  ).length;
  const concAtr    = all.filter(r =>
    r.status === 'Concluída' && r.prazoFechamento && r.dataFechamento &&
    r.dataFechamento > r.prazoFechamento
  ).length;
  const canceladas = all.filter(r => r.status === 'Cancelada').length;

  function diasAberto(r) {
    if (!r.dataAbertura) return '—';
    const ini = new Date(r.dataAbertura + 'T00:00:00');
    const fim = r.dataFechamento ? new Date(r.dataFechamento + 'T00:00:00') : hoje;
    return `${Math.round((fim - ini) / 86400000)}d`;
  }

  const tableHtml = all.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Número</th><th>Cliente</th><th>Status</th>
          <th>Prazo 90d</th><th>T. Aberto</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${all.map(r => {
            const nextSt = NEXT_STATUS[r.status];
            return `<tr>
              <td><strong>${r.numero}</strong></td>
              <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.cliente || ''}">${r.cliente || '—'}</td>
              <td>
                ${statusPill(r.status)}
                ${!CLOSED.includes(r.status) ? miniPipeline(r.status) : ''}
              </td>
              <td>${deadlineCell(r.prazoFechamento)}</td>
              <td style="text-align:center">${diasAberto(r)}</td>
              <td>
                <div class="td-actions">
                  ${nextSt ? `<button class="btn btn-secondary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nextSt}" title="Avançar para ${nextSt}">▶</button>` : ''}
                  <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="Editar (abre módulo Abertura)">✏</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : emptyState('Nenhuma reclamação registrada.');

  container.querySelector('#rec-ger-content').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px">
      ${kpiCard(total,      'Total',            'var(--blue)')}
      ${kpiCard(abertas,    'Em Aberto',        'var(--red)',    abertas > 0)}
      ${kpiCard(concNoPr,   'Conc. no Prazo',   'var(--green)')}
      ${kpiCard(concAtr,    'Conc. em Atraso',  'var(--amber)', concAtr > 0)}
      ${kpiCard(canceladas, 'Canceladas',       '#94a3b8')}
    </div>
    ${renderPipelineBar(all)}
    ${renderAcompanhamento()}
    <div class="card">
      <div style="font-weight:600;margin-bottom:12px;font-size:0.9rem">Todas as Reclamações</div>
      ${tableHtml}
    </div>
  `;
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Reclamações — Gerencial</h2>
        <button class="btn btn-primary" data-action="nova">+ Nova Reclamação</button>
      </div>
      <div id="rec-ger-content"></div>
    `;
    renderContent(container);
  },

  init(container) {
    container.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, next } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      if (action === 'nova' || action === 'edit') {
        const r = await getRouter();
        r.navigate('reclamacoesAbertura');
        return;
      }

      if (action === 'advance') {
        showConfirm(`Avançar para "${next}"?`).then(ok => {
          if (!ok) return;
          const updates = { status: next };
          if (next === 'Concluída') updates.dataFechamento = today();
          db.update('reclamacoes', numId, updates);
          toast(`Reclamação avançada para "${next}".`);
          renderContent(container);
        });
      }
    });
  },
};
