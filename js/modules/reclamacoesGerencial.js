/**
 * @fileoverview Reclamações — Gerencial (POP-GQ-010): painel enxuto com
 * KPIs clicáveis (drill-down no Registro), pipeline, tendência e o que
 * requer atenção. Espelha o padrão da Gerencial de RNC.
 */

import { db } from '../db.js';
import { statusPill, emptyState } from '../utils.js';

const CLOSED = ['Encerrada', 'Cancelada', 'Não Procedente'];

const PIPELINE = [
  { key: 'Aberta',             color: 'var(--red)',    label: 'Registro' },
  { key: 'Aguardando Retorno', color: 'var(--orange,#ea580c)', label: 'Ag. Retorno' },
  { key: 'Em Investigação',    color: 'var(--blue)',   label: 'Investigação' },
  { key: 'Em Resposta',        color: 'var(--teal)',   label: 'Resposta' },
  { key: 'Encerrada',          color: 'var(--green)',  label: 'Encerramento' },
];

const CRIT_PILL = { 'Tipo 1': 'pill-red', 'Tipo 2': 'pill-orange', 'Tipo 3': 'pill-amber', 'Tipo 4': 'pill-amber', 'Dispensada': 'pill-gray' };

function isOverdue(r, hoje) {
  if (CLOSED.includes(r.status)) return false;
  const fech = r.prazoFechamento && new Date(r.prazoFechamento + 'T00:00:00') < hoje;
  const snvs = r.prazoNotificacao && !r.dataNotificacao && new Date(r.prazoNotificacao + 'T00:00:00') < hoje;
  return !!(fech || snvs);
}

function kpiCard(value, label, color, highlight = false, sub = '', nav = '') {
  const empty = value === 0;
  const border = highlight && value > 0
    ? `border:1px solid ${color}50;box-shadow:0 0 0 2px ${color}14`
    : 'border:1px solid var(--border)';
  const click = nav ? `data-nav="${nav}" role="button" tabindex="0" title="Abrir no Registro" ` : '';
  return `<div ${click}style="padding:16px 10px 13px;background:var(--surface);${border};border-radius:10px;text-align:center;${nav ? 'cursor:pointer' : ''}">
    <div style="font-size:1.75rem;font-weight:800;color:${empty ? 'var(--muted)' : color};line-height:1;font-variant-numeric:tabular-nums">${value}</div>
    <div style="font-size:0.7rem;color:var(--muted);margin-top:5px;line-height:1.3">${label}${nav ? ' <span style="opacity:.5">›</span>' : ''}</div>
    ${sub ? `<div style="font-size:0.65rem;margin-top:3px;color:${color};font-weight:600;opacity:${empty ? 0.35 : 0.8}">${sub}</div>` : ''}
  </div>`;
}

function renderPipeline(all) {
  const cnt = {};
  PIPELINE.forEach(p => { cnt[p.key] = 0; });
  all.forEach(r => { if (cnt[r.status] !== undefined) cnt[r.status]++; });
  const totalAll = PIPELINE.reduce((s, p) => s + cnt[p.key], 0);
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:18px">
    <div style="padding:12px 16px 10px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)">Pipeline — reclamações por etapa</span>
      <span style="font-size:0.72rem;color:var(--muted)">${totalAll} total</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(5,1fr)">
      ${PIPELINE.map((p, i) => {
        const pct = totalAll ? Math.round(cnt[p.key] / totalAll * 100) : 0;
        const active = cnt[p.key] > 0;
        return `<div style="padding:14px 10px 13px;text-align:center;${i > 0 ? 'border-left:1px solid var(--border)' : ''};position:relative">
          ${i < PIPELINE.length - 1 ? `<div style="position:absolute;right:0;top:50%;transform:translateY(-50%);font-size:0.6rem;color:var(--border);z-index:1">▶</div>` : ''}
          <div style="font-size:1.75rem;font-weight:800;color:${active ? p.color : 'var(--border)'};line-height:1;margin-bottom:8px;font-variant-numeric:tabular-nums">${cnt[p.key]}</div>
          <div style="height:3px;border-radius:2px;background:var(--border);margin:0 4px 8px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${p.color};border-radius:2px"></div></div>
          <div style="font-size:0.67rem;color:${active ? 'var(--fg)' : 'var(--muted)'};line-height:1.3;font-weight:${active ? '600' : '400'}">${p.label}</div>
        </div>`;
      }).join('')}
    </div>
  </div>`;
}

function renderTendencia(all) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), abertas: 0, encerradas: 0 });
  }
  const idx = k => months.findIndex(m => m.key === k);
  all.forEach(r => {
    if (r.dataAbertura)   { const i = idx(r.dataAbertura.slice(0, 7));   if (i >= 0) months[i].abertas++; }
    if (r.dataFechamento) { const i = idx(r.dataFechamento.slice(0, 7)); if (i >= 0) months[i].encerradas++; }
  });
  const max = Math.max(1, ...months.map(m => Math.max(m.abertas, m.encerradas)));
  return `<div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:12px 16px;margin-bottom:18px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:6px">
      <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)">Tendência — abertas × encerradas (6 meses)</span>
      <span style="display:flex;gap:12px;font-size:0.68rem;color:var(--muted)">
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--blue);margin-right:4px"></span>Abertas</span>
        <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--green);margin-right:4px"></span>Encerradas</span>
      </span>
    </div>
    <div style="display:flex;align-items:flex-end;gap:14px;height:90px">
      ${months.map(m => `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end">
        <div style="display:flex;align-items:flex-end;gap:3px;height:100%;width:100%;justify-content:center">
          <div title="Abertas ${m.label}: ${m.abertas}" style="width:40%;max-width:22px;height:${Math.round(m.abertas / max * 100)}%;min-height:${m.abertas ? '3px' : '0'};background:var(--blue);border-radius:3px 3px 0 0"></div>
          <div title="Encerradas ${m.label}: ${m.encerradas}" style="width:40%;max-width:22px;height:${Math.round(m.encerradas / max * 100)}%;min-height:${m.encerradas ? '3px' : '0'};background:var(--green);border-radius:3px 3px 0 0"></div>
        </div>
        <span style="font-size:0.64rem;color:var(--muted);text-transform:capitalize">${m.label}</span>
      </div>`).join('')}
    </div>
  </div>`;
}

function renderRequerAtencao(all, hoje) {
  const diasAberta = r => r.dataAbertura ? Math.round((hoje - new Date(r.dataAbertura + 'T00:00:00')) / 86400000) : null;
  const items = all
    .filter(r => !CLOSED.includes(r.status))
    .map(r => ({
      r,
      emAtraso: r.prazoFechamento && new Date(r.prazoFechamento + 'T00:00:00') < hoje,
      snvsVenc: r.prazoNotificacao && !r.dataNotificacao && new Date(r.prazoNotificacao + 'T00:00:00') < hoje,
      capaPend: r.resultado === 'Procedente' && !r.capaAberta,
    }))
    .filter(x => x.emAtraso || x.snvsVenc || x.capaPend)
    .sort((a, b) => (b.snvsVenc - a.snvsVenc) || (b.emAtraso - a.emAtraso));

  if (!items.length) {
    return `<div class="card" style="text-align:center;padding:26px 16px">
      <div style="font-size:1.6rem;margin-bottom:6px">✅</div>
      <div style="font-size:0.9rem;font-weight:600">Nada requer atenção imediata</div>
      <div style="font-size:0.78rem;color:var(--muted);margin-top:3px">Nenhuma reclamação em atraso, notificação SNVS vencida ou CAPA pendente.</div>
    </div>`;
  }
  return `<div class="card">
    <div style="font-weight:600;margin-bottom:12px;font-size:0.9rem">⚠ Requer sua atenção <span style="font-size:0.75rem;color:var(--muted);font-weight:400">(${items.length})</span></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Número</th><th>Cliente</th><th>Criticidade</th><th>Status</th><th>Situação</th></tr></thead>
      <tbody>
        ${items.map(({ r, emAtraso, snvsVenc, capaPend }) => `<tr>
          <td><strong>${r.numero}</strong></td>
          <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${(r.clienteInstituicao || '').replace(/"/g, '&quot;')}">${r.clienteInstituicao || '—'}</td>
          <td>${r.criticidadeTipo ? `<span class="pill ${CRIT_PILL[r.criticidadeTipo] ?? 'pill-gray'}">${r.criticidadeTipo}</span>` : '—'}</td>
          <td>${statusPill(r.status)}</td>
          <td style="white-space:nowrap;display:flex;gap:5px;flex-wrap:wrap">
            ${snvsVenc ? `<span class="pill pill-red">⚠ notificação SNVS vencida</span>` : ''}
            ${emAtraso ? `<span class="pill pill-red">⚠ atraso · ${diasAberta(r)}d</span>` : ''}
            ${capaPend ? `<span class="pill pill-amber">procedente → CAPA</span>` : ''}
          </td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

function renderPainel(container) {
  const all  = db.get('reclamacoes');
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const kpis = {
    total:      all.length,
    abertas:    all.filter(r => r.status === 'Aberta').length,
    andamento:  all.filter(r => r.status !== 'Aberta' && !CLOSED.includes(r.status)).length,
    encerradas: all.filter(r => r.status === 'Encerrada').length,
    emAtraso:   all.filter(r => isOverdue(r, hoje)).length,
    snvs:       all.filter(r => r.criticidadeTipo && r.criticidadeTipo !== 'Dispensada' && !r.dataNotificacao && !CLOSED.includes(r.status)).length,
  };
  const fechadas = all.filter(r => r.dataAbertura && r.dataFechamento);
  const tmr = fechadas.length
    ? Math.round(fechadas.reduce((s, r) => s + (new Date(r.dataFechamento + 'T00:00:00') - new Date(r.dataAbertura + 'T00:00:00')) / 86400000, 0) / fechadas.length)
    : null;

  container.querySelector('#rec-ger-content').innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:18px">
      ${kpiCard(kpis.total,      'Total',          'var(--blue)',  false, '', 'all')}
      ${kpiCard(kpis.abertas,    'Aguardando GQ',  'var(--red)',   false, '', 'status:Aberta')}
      ${kpiCard(kpis.andamento,  'Em Andamento',   'var(--amber)', false, '', 'andamento')}
      ${kpiCard(kpis.emAtraso,   'Em Atraso',      'var(--red)',   true,  kpis.emAtraso > 0 ? '⚠ requer atenção' : '', 'atraso')}
      ${kpiCard(kpis.snvs,       'Notif. SNVS',    'var(--orange,#ea580c)', true, kpis.snvs > 0 ? 'pendente' : '', 'snvs')}
      ${kpiCard(kpis.encerradas, 'Encerradas',     'var(--green)', false, tmr !== null ? `TMR: ${tmr}d` : '', 'status:Encerrada')}
    </div>
    ${renderPipeline(all)}
    ${renderTendencia(all)}
    ${renderRequerAtencao(all, hoje)}
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
    renderPainel(container);
  },

  init(container) {
    container.addEventListener('click', e => {
      const navEl = e.target.closest('[data-nav]');
      if (navEl) { window._recPreset = navEl.dataset.nav; window.location.hash = '#reclamacoesAbertura'; return; }
      if (e.target.closest('[data-action="nova"]')) { window.location.hash = '#reclamacoesAbertura'; return; }
    });
  },
};
