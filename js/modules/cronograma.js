/**
 * @fileoverview Módulo Cronograma — Gantt visual por trimestre.
 */

import { db } from '../db.js';
import { formatDate, emptyState, statusPill } from '../utils.js';

function getGanttItems() {
  const items = [];

  db.get('capa').filter(r => r.prazo).forEach(r => {
    items.push({ label: r.numero, desc: r.descricao, resp: r.responsavel, date: r.prazo, tipo: 'CAPA', status: r.status });
  });
  db.get('validacoes').filter(r => r.prazo).forEach(r => {
    items.push({ label: r.numero, desc: r.descricao, resp: r.responsavel, date: r.prazo, tipo: 'VAL', status: r.status });
  });
  db.get('tecno').filter(r => r.prazoAnvisa).forEach(r => {
    items.push({ label: r.numero, desc: r.descricao, resp: '', date: r.prazoAnvisa, tipo: 'TECNO', status: r.status });
  });
  db.get('pragas').filter(r => r.proximaVisita).forEach(r => {
    items.push({ label: r.numero, desc: r.area, resp: r.empresa, date: r.proximaVisita, tipo: 'PRAGA', status: r.status });
  });

  items.sort((a, b) => a.date.localeCompare(b.date));
  return items;
}

function buildGantt(items) {
  if (!items.length) return emptyState('Nenhum item com prazo para exibir no cronograma.');

  // Determine range: start = earliest date or today-30, end = latest date or today+90
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dates = items.map(r => new Date(r.date + 'T00:00:00'));
  const minDate = new Date(Math.min(...dates, today.getTime() - 30 * 86400000));
  const maxDate = new Date(Math.max(...dates, today.getTime() + 90 * 86400000));
  const totalDays = Math.round((maxDate - minDate) / 86400000) || 1;

  function datePct(iso) {
    const d = new Date(iso + 'T00:00:00');
    return Math.min(100, Math.max(0, Math.round(100 * (d - minDate) / (maxDate - minDate) * totalDays / totalDays)));
  }

  const todayPct = Math.min(100, Math.max(0, Math.round(100 * (today - minDate) / (maxDate - minDate))));

  const TIPO_COLOR = { CAPA: 'var(--red)', VAL: 'var(--blue-light)', TECNO: 'var(--amber)', PRAGA: 'var(--green)' };

  const rows = items.map(r => {
    const pct = datePct(r.date);
    const color = TIPO_COLOR[r.tipo] || 'var(--muted)';
    return `
      <tr>
        <td style="white-space:nowrap;font-weight:600;min-width:100px">${r.label}</td>
        <td>${statusPill(r.tipo)}</td>
        <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:0.78rem" title="${r.desc}">${r.desc}</td>
        <td style="min-width:80px;font-size:0.75rem;color:var(--muted)">${r.resp}</td>
        <td style="white-space:nowrap;font-size:0.75rem">${formatDate(r.date)}</td>
        <td style="width:100%;min-width:200px;padding-right:8px">
          <div class="gantt-bar-wrap">
            <div class="gantt-today-line" style="left:${todayPct}%"></div>
            <div class="gantt-bar" style="left:${Math.max(0, pct - 3)}%;width:6px;min-width:6px;background:${color}"></div>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  const monthLabels = [];
  const cur = new Date(minDate);
  while (cur <= maxDate) {
    const pct = Math.round(100 * (cur - minDate) / (maxDate - minDate));
    monthLabels.push({ label: cur.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }), pct });
    cur.setMonth(cur.getMonth() + 1);
  }

  return `
    <div class="card">
      <div class="card-header">
        <h3>Cronograma de Prazos</h3>
        <div style="display:flex;gap:10px;font-size:0.75rem;flex-wrap:wrap">
          ${Object.entries(TIPO_COLOR).map(([k, v]) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${v};margin-right:4px"></span>${k}</span>`).join('')}
        </div>
      </div>
      <div class="card-body" style="overflow-x:auto">
        <table class="gantt-table">
          <thead>
            <tr>
              <th>Nº</th>
              <th>Tipo</th>
              <th>Descrição</th>
              <th>Responsável</th>
              <th>Prazo</th>
              <th>Linha do Tempo</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
  `;
}

export default {
  render(container) {
    const items = getGanttItems();
    container.innerHTML = `
      <div class="page-header">
        <h2>Cronograma</h2>
      </div>
      ${buildGantt(items)}
    `;
  },

  init(_container) {
    // Read-only view — no events
  },
};
