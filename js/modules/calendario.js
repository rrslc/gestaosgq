/**
 * @fileoverview Módulo Calendário — grade mensal com prazos de todos os módulos.
 */

import { db } from '../db.js';

/** Estado local do calendário */
const state = { year: 0, month: 0 };

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

const TYPE_COLORS = {
  CAPA:  { bg: '#fee2e2', color: '#991b1b' },
  RNC:   { bg: '#fce7f3', color: '#9d174d' },
  VAL:   { bg: '#dbeafe', color: '#1e40af' },
  TECNO: { bg: '#fef3c7', color: '#92400e' },
  PRAGA: { bg: '#dcfce7', color: '#166534' },
  GCM:   { bg: '#ede9fe', color: '#5b21b6' },
};

function getEventsByDate() {
  const map = {};

  const add = (iso, label, tipo) => {
    if (!iso) return;
    if (!map[iso]) map[iso] = [];
    map[iso].push({ label, tipo });
  };

  db.get('capa').forEach(r => {
    add(r.dataAbertura, r.numero + ' CAPA', 'CAPA');
    if (r.dataInicioVerificacao) add(r.dataInicioVerificacao, r.numero + ' Verif.', 'CAPA');
  });
  db.get('rnc').forEach(r => add(r.dataAbertura, r.numero + ' RNC', 'RNC'));
  db.get('validacoes').forEach(r => add(r.prazo, r.numero + ' VAL', 'VAL'));
  db.get('tecno').forEach(r => add(r.prazoAnvisa, r.numero + ' TECNO', 'TECNO'));
  db.get('pragas').forEach(r => {
    add(r.dataRealizacao, r.numero + ' Pragas', 'PRAGA');
    add(r.proximaVisita, r.numero + ' Pragas+', 'PRAGA');
  });
  db.get('gcm').forEach(r => add(r.data, r.numero + ' GCM', 'GCM'));

  return map;
}

function renderGrid(year, month) {
  const events = getEventsByDate();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const totalDays = lastDay.getDate();

  const cells = [];

  // Padding before
  for (let i = 0; i < startDow; i++) {
    cells.push('<div class="cal-day cal-other-month"></div>');
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateObj = new Date(year, month, d);
    const iso = dateObj.toISOString().slice(0, 10);
    const isToday = dateObj.getTime() === today.getTime();
    const dayEvents = events[iso] || [];

    const evHtml = dayEvents.map(ev => {
      const c = TYPE_COLORS[ev.tipo] || { bg: '#f1f5f9', color: '#475569' };
      return `<span class="cal-event" style="background:${c.bg};color:${c.color}" title="${ev.label}">${ev.label}</span>`;
    }).join('');

    cells.push(`
      <div class="cal-day${isToday ? ' cal-today' : ''}">
        <div class="cal-day-num">${d}</div>
        ${evHtml}
      </div>
    `);
  }

  // Padding after
  const remaining = (7 - (cells.length % 7)) % 7;
  for (let i = 0; i < remaining; i++) {
    cells.push('<div class="cal-day cal-other-month"></div>');
  }

  const weekdayHeaders = WEEKDAYS.map(w => `<div class="cal-weekday">${w}</div>`).join('');
  return `
    <div class="cal-grid">
      ${weekdayHeaders}
      ${cells.join('')}
    </div>
  `;
}

function renderCalendar(container) {
  const calBody = container.querySelector('#cal-body');
  const calTitle = container.querySelector('#cal-month-title');
  if (calBody) calBody.innerHTML = renderGrid(state.year, state.month);
  if (calTitle) calTitle.textContent = `${MONTHS_PT[state.month]} ${state.year}`;
}

export default {
  render(container) {
    const now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth();

    container.innerHTML = `
      <div class="page-header">
        <h2>Calendário de Prazos</h2>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="cal-header" style="width:100%">
            <button class="btn btn-secondary btn-sm" data-cal-action="prev">‹</button>
            <span class="cal-title" id="cal-month-title">${MONTHS_PT[state.month]} ${state.year}</span>
            <button class="btn btn-secondary btn-sm" data-cal-action="next">›</button>
          </div>
        </div>
        <div class="card-body">
          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;font-size:0.75rem">
            ${Object.entries(TYPE_COLORS).map(([k, v]) => `<span><span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${v.bg};border:1px solid ${v.color};margin-right:3px"></span>${k}</span>`).join('')}
          </div>
          <div id="cal-body">
            ${renderGrid(state.year, state.month)}
          </div>
        </div>
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-cal-action]');
      if (!btn) return;
      const action = btn.dataset.calAction;
      if (action === 'prev') {
        state.month--;
        if (state.month < 0) { state.month = 11; state.year--; }
      } else if (action === 'next') {
        state.month++;
        if (state.month > 11) { state.month = 0; state.year++; }
      }
      renderCalendar(container);
    });
  },
};
