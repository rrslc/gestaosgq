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
  const CAPA_CLOSED = ['Encerrada', 'Não Procedente'];
  const capaAberta = db.get('capa').filter(r => !CAPA_CLOSED.includes(r.status));
  const now = new Date(); now.setHours(0,0,0,0);
  const capaUrgente = capaAberta.filter(r => {
    const iso = r.prazo || r.dataAbertura;
    if (!iso) return false;
    const d = new Date(iso + 'T00:00:00');
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
    .filter(r => !['Encerrada', 'Não Procedente', 'Concluída', 'Cancelada'].includes(r.status) && r.dataAbertura)
    .sort((a, b) => a.dataAbertura.localeCompare(b.dataAbertura))
    .slice(0, 5);

  if (!items.length) return emptyState('Nenhuma CAPA pendente.');

  return items.map(r => `
    <div class="upcoming-item">
      <span class="upcoming-num">${r.numero}</span>
      <span class="upcoming-desc" title="${r.descricao}">${r.descricao}</span>
      ${statusPill(r.status)}
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

  addItems('capa', r => `${r.numero} — ${r.descricao}`, r => r.dataInicioVerificacao, 'CAPA');
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

function renderNext90Days() {
  const now = new Date(); now.setHours(0,0,0,0);
  const start = new Date(now); start.setDate(start.getDate() + 31);
  const limit = new Date(now); limit.setDate(limit.getDate() + 90);
  const items = [];

  const addItems = (col, labelFn, dateFn, type) => {
    db.get(col).forEach(r => {
      const iso = dateFn(r);
      if (!iso) return;
      const d = new Date(iso + 'T00:00:00');
      if (d >= start && d <= limit) items.push({ label: labelFn(r), date: iso, type });
    });
  };

  addItems('capa', r => `${r.numero} — ${r.descricao}`, r => r.dataInicioVerificacao, 'CAPA');
  addItems('rnc', r => `${r.numero} — ${r.descricao}`, r => r.prazoFinalizacao, 'RNC');
  addItems('gcm', r => `${r.numero} — ${r.titulo || r.descricao}`, r => r.prazoImplementacao, 'GCM');
  addItems('validacoes', r => `${r.numero} — ${r.descricao}`, r => r.prazo, 'VAL');
  addItems('tecno', r => `${r.numero} — ${r.descricao}`, r => r.prazoAnvisa, 'TECNO');
  addItems('atividades', r => r.titulo, r => r.prazo, 'ATIV');
  addItems('obrigacoes', r => r.nome, r => r.proximoVencimento, 'OBR');

  items.sort((a, b) => a.date.localeCompare(b.date));

  if (!items.length) return emptyState('Nenhum prazo entre 31 e 90 dias.');

  return items.map(r => `
    <div class="upcoming-item">
      <span class="upcoming-type-tag">${r.type}</span>
      <span class="upcoming-desc" title="${r.label}">${r.label}</span>
      ${deadlineCell(r.date)}
    </div>
  `).join('');
}

function renderPanorama() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const CAPA_CLOSED = ['Encerrada', 'Não Procedente'];
  const RNC_CLOSED  = ['Encerrada', 'Cancelada'];
  const GCM_CLOSED  = ['Concluída', 'Rejeitada', 'Cancelada'];

  const capas = db.get('capa');
  const rncs  = db.get('rnc');
  const gcms  = db.get('gcm');

  const capaOpen    = capas.filter(r => !CAPA_CLOSED.includes(r.status));
  const capaAtraso  = capaOpen.filter(r => r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje).length;
  const rncOpen     = rncs.filter(r => !RNC_CLOSED.includes(r.status));
  const rncAtraso   = rncOpen.filter(r => r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje).length;
  const gcmOpen     = gcms.filter(r => !GCM_CLOSED.includes(r.status));
  const gcmAtraso   = gcmOpen.filter(r => r.prazoImplementacao && new Date(r.prazoImplementacao + 'T00:00:00') < hoje).length;

  const row = (label, open, atraso, color) => `
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="width:4px;height:36px;border-radius:2px;background:${color};flex-shrink:0"></div>
      <div style="flex:1;font-weight:600;font-size:0.85rem">${label}</div>
      <div style="text-align:center;min-width:48px">
        <div style="font-size:1.2rem;font-weight:700;color:${open.length > 0 ? 'var(--amber)' : 'var(--green)'}">${open.length}</div>
        <div style="font-size:0.68rem;color:var(--muted)">em aberto</div>
      </div>
      <div style="text-align:center;min-width:48px">
        <div style="font-size:1.2rem;font-weight:700;color:${atraso > 0 ? 'var(--red)' : 'var(--green)'}">${atraso}</div>
        <div style="font-size:0.68rem;color:var(--muted)">em atraso</div>
      </div>
    </div>
  `;

  return `
    ${row('CAPA', capaOpen, capaAtraso, 'var(--red)')}
    ${row('RNC', rncOpen, rncAtraso, 'var(--purple)')}
    <div style="display:flex;align-items:center;gap:12px;padding:10px 0">
      <div style="width:4px;height:36px;border-radius:2px;background:var(--blue);flex-shrink:0"></div>
      <div style="flex:1;font-weight:600;font-size:0.85rem">Controle de Mudanças</div>
      <div style="text-align:center;min-width:48px">
        <div style="font-size:1.2rem;font-weight:700;color:${gcmOpen.length > 0 ? 'var(--amber)' : 'var(--green)'}">${gcmOpen.length}</div>
        <div style="font-size:0.68rem;color:var(--muted)">em aberto</div>
      </div>
      <div style="text-align:center;min-width:48px">
        <div style="font-size:1.2rem;font-weight:700;color:${gcmAtraso > 0 ? 'var(--red)' : 'var(--green)'}">${gcmAtraso}</div>
        <div style="font-size:0.68rem;color:var(--muted)">em atraso</div>
      </div>
    </div>
  `;
}

function renderWorkload() {
  const equipe = db.get('equipe');
  if (!equipe.length) return emptyState('Nenhuma colaboradora cadastrada.');

  const openItems = [
    ...db.get('capa').filter(r => !['Encerrada', 'Não Procedente', 'Concluída', 'Cancelada'].includes(r.status)),
    ...db.get('rnc').filter(r => r.status !== 'Encerrada' && r.status !== 'Cancelada'),
    ...db.get('validacoes').filter(r => r.status !== 'Aprovada' && r.status !== 'Reprovada' && r.status !== 'Cancelada'),
    ...db.get('tecno').filter(r => r.status !== 'Concluído' && r.status !== 'Cancelado'),
    ...db.get('gcm').filter(r => !['Concluída', 'Rejeitada', 'Cancelada'].includes(r.status)),
    ...db.get('reclamacoes').filter(r => !['Concluída', 'Cancelada'].includes(r.status)),
    ...db.get('obrigacoes').filter(r => r.status !== 'Suspenso'),
    ...db.get('atividades').filter(r => r.status !== 'Concluída' && r.status !== 'Cancelada'),
    ...db.get('auditorias').filter(r => ['Planejada', 'Em Execução'].includes(r.status))
      .map(r => ({ ...r, responsavel: r.auditorLider || r.responsavel })),
    ...db.get('projetos').filter(r => ['Planejamento', 'Desenvolvimento', 'Verificação', 'Validação'].includes(r.status))
      .map(r => ({ ...r, responsavel: r.responsavelGQ })),
  ];

  const counts = {};
  equipe.forEach(m => { counts[m.nome] = 0; });
  openItems.forEach(item => {
    const resp = item.responsavelAbertura || item.responsavel;
    if (resp && counts[resp] !== undefined) counts[resp]++;
  });

  // Documentos: elaborador/revisores/aprovadores podem ser várias pessoas no mesmo campo
  db.get('documentos')
    .filter(d => ['Em Elaboração', 'Em Revisão', 'Em Aprovação'].includes(d.status))
    .forEach(d => {
      const membros = [d.elaboradores, d.revisores, d.aprovadores].filter(Boolean).join(', ');
      equipe.forEach(m => { if (membros.includes(m.nome)) counts[m.nome]++; });
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
          <div class="card-header"><h3>Planejamento — 31 a 90 Dias</h3></div>
          <div class="card-body">${renderNext90Days()}</div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Workload por Colaboradora</h3></div>
          <div class="card-body">${renderWorkload()}</div>
        </div>
        <div class="card">
          <div class="card-header"><h3>Panorama NC / CAPA / CM</h3></div>
          <div class="card-body">${renderPanorama()}</div>
        </div>
      </div>
    `;
  },

  async init(_container) {
    // Update sidebar badges via router
    const r = await getRouter();
    const capaOpen = db.get('capa').filter(r => !['Encerrada', 'Não Procedente'].includes(r.status)).length;
    const rncOpen  = db.get('rnc').filter(r => r.status !== 'Encerrada' && r.status !== 'Cancelada').length;
    r.updateBadge('capaGerencial', capaOpen);
    r.updateBadge('rnc', rncOpen);
  },
};
