/**
 * @fileoverview Módulo Dashboard — KPIs, listas rápidas e workload.
 * Importa router de app.js — é seguro pois ES Modules resolvem circular refs pelo live binding.
 */

import { db } from '../db.js';
import { deadlineCell, progressBar, emptyState, statusPill } from '../utils.js';

// Router é importado depois de ser criado em app.js.
// A importação dinâmica evita problemas de ordem de execução.
let _router = null;
async function getRouter() {
  if (!_router) {
    const mod = await import('../app.js');
    _router = mod.router;
  }
  return _router;
}

function buildKpis() {
  const capaAberta = db.get('capa').filter(r => r.status === 'Aberta' || r.status === 'Em Andamento');
  const now = new Date(); now.setHours(0,0,0,0);
  const capaUrgente = capaAberta.filter(r => {
    if (!r.prazo) return false;
    const d = new Date(r.prazo + 'T00:00:00');
    return Math.round((d - now) / 86400000) <= 7;
  }).length;

  const rncAberta = db.get('rnc').filter(r => r.status !== 'Encerrada' && r.status !== 'Cancelada').length;

  const forn = db.get('fornecedores');
  const fornQual = forn.filter(r => r.status === 'Qualificado').length;
  const fornPct = forn.length ? Math.round(100 * fornQual / forn.length) : 0;

  const valAtivas = db.get('validacoes').filter(r => r.status === 'Em Execução' || r.status === 'Planejada').length;
  const recAbertos = db.get('tecno').filter(r => r.status === 'Aberto' || r.status === 'Em Investigação').length;

  return { capaAberta: capaAberta.length, capaUrgente, rncAberta, fornPct, valAtivas, recAbertos };
}

function renderUpcomingCAPAs() {
  const items = db.get('capa')
    .filter(r => r.status !== 'Concluída' && r.status !== 'Cancelada' && r.prazo)
    .sort((a, b) => a.prazo.localeCompare(b.prazo))
    .slice(0, 5);

  if (!items.length) return emptyState('Nenhuma CAPA pendente.');

  return items.map(r => `
    <div class="upcoming-item">
      <span class="upcoming-num">${r.numero}</span>
      <span class="upcoming-desc" title="${r.descricao}">${r.descricao}</span>
      ${deadlineCell(r.prazo)}
    </div>
  `).join('');
}

function renderCriticalRNCs() {
  const items = db.get('rnc')
    .filter(r => (r.classificacao === 'Crítica' || r.classificacao === 'Maior') && r.status !== 'Encerrada' && r.status !== 'Cancelada')
    .slice(0, 5);

  if (!items.length) return emptyState('Nenhuma RNC crítica em aberto.');

  return items.map(r => `
    <div class="upcoming-item">
      <span class="upcoming-num">${r.numero}</span>
      <span class="upcoming-desc" title="${r.descricao}">${r.descricao}</span>
      ${statusPill(r.status)}
    </div>
  `).join('');
}

function renderNext30Days() {
  const now = new Date(); now.setHours(0,0,0,0);
  const limit = new Date(now); limit.setDate(limit.getDate() + 30);
  const items = [];

  const addItems = (col, labelFn, dateFn, type) => {
    db.get(col).forEach(r => {
      const iso = dateFn(r);
      if (!iso) return;
      const d = new Date(iso + 'T00:00:00');
      if (d >= now && d <= limit) items.push({ label: labelFn(r), date: iso, type });
    });
  };

  addItems('capa', r => `${r.numero} — ${r.descricao}`, r => r.prazo, 'CAPA');
  addItems('validacoes', r => `${r.numero} — ${r.descricao}`, r => r.prazo, 'VAL');
  addItems('tecno', r => `${r.numero} — ${r.descricao}`, r => r.prazoAnvisa, 'TECNO');
  addItems('pragas', r => `${r.numero} — ${r.area}`, r => r.proximaVisita, 'PRAGA');

  items.sort((a, b) => a.date.localeCompare(b.date));

  if (!items.length) return emptyState('Nenhum prazo nos próximos 30 dias.');

  return items.map(r => `
    <div class="upcoming-item">
      <span class="upcoming-type-tag">${r.type}</span>
      <span class="upcoming-desc" title="${r.label}">${r.label}</span>
      ${deadlineCell(r.date)}
    </div>
  `).join('');
}

function renderWorkload() {
  const equipe = db.get('equipe');
  if (!equipe.length) return emptyState('Nenhuma colaboradora cadastrada.');

  const openItems = [
    ...db.get('capa').filter(r => r.status !== 'Concluída' && r.status !== 'Cancelada'),
    ...db.get('rnc').filter(r => r.status !== 'Encerrada' && r.status !== 'Cancelada'),
    ...db.get('validacoes').filter(r => r.status !== 'Aprovada' && r.status !== 'Reprovada' && r.status !== 'Cancelada'),
    ...db.get('tecno').filter(r => r.status !== 'Concluído' && r.status !== 'Cancelado'),
  ];

  const counts = {};
  equipe.forEach(m => { counts[m.nome] = 0; });
  openItems.forEach(item => {
    if (item.responsavel && counts[item.responsavel] !== undefined) counts[item.responsavel]++;
  });

  const max = Math.max(...Object.values(counts), 1);

  return equipe.map(m => {
    const c = counts[m.nome] || 0;
    const pct = Math.round(100 * c / max);
    return `
      <div class="workload-item">
        <div class="workload-avatar" style="background:${m.cor}">${m.iniciais}</div>
        <span class="workload-name">${m.nome}</span>
        <div style="flex:1">${progressBar(pct, pct > 75 ? 'red' : pct > 50 ? 'amber' : 'blue')}</div>
        <span class="workload-count">${c}</span>
      </div>
    `;
  }).join('');
}

export default {
  render(container) {
    const k = buildKpis();

    container.innerHTML = `
      <div class="kpi-grid">
        <div class="kpi-card">
          <div class="kpi-label">CAPAs em Aberto</div>
          <div class="kpi-value ${k.capaAberta > 0 ? 'kpi-amber' : 'kpi-green'}">${k.capaAberta}</div>
          <div class="kpi-sub">${k.capaUrgente} urgente(s) ≤7 dias</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">RNCs Ativas</div>
          <div class="kpi-value ${k.rncAberta > 0 ? 'kpi-red' : 'kpi-green'}">${k.rncAberta}</div>
          <div class="kpi-sub">em andamento</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Forn. Qualificados</div>
          <div class="kpi-value ${k.fornPct < 80 ? 'kpi-amber' : 'kpi-green'}">${k.fornPct}%</div>
          <div class="kpi-sub">do total de fornecedores</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">Validações em Curso</div>
          <div class="kpi-value kpi-blue">${k.valAtivas}</div>
          <div class="kpi-sub">planejadas ou em execução</div>
        </div>
        <div class="kpi-card">
          <div class="kpi-label">RECs/Tecnovigilância</div>
          <div class="kpi-value ${k.recAbertos > 0 ? 'kpi-red' : 'kpi-green'}">${k.recAbertos}</div>
          <div class="kpi-sub">abertos ou em investigação</div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-header"><h3>CAPAs — Próximas do Vencimento</h3></div>
          <div class="card-body">${renderUpcomingCAPAs()}</div>
        </div>
        <div class="card">
          <div class="card-header"><h3>RNCs Críticas em Aberto</h3></div>
          <div class="card-body">${renderCriticalRNCs()}</div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Próximos 30 Dias</h3></div>
          <div class="card-body">${renderNext30Days()}</div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Workload por Colaboradora</h3></div>
          <div class="card-body">${renderWorkload()}</div>
        </div>
      </div>
    `;
  },

  async init(_container) {
    // Update sidebar badges via router
    const r = await getRouter();
    const capaOpen = db.get('capa').filter(r => r.status === 'Aberta' || r.status === 'Em Andamento').length;
    const rncOpen  = db.get('rnc').filter(r => r.status !== 'Encerrada' && r.status !== 'Cancelada').length;
    r.updateBadge('capa', capaOpen);
    r.updateBadge('rnc', rncOpen);
  },
};
