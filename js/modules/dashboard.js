/**
 * @fileoverview Módulo Dashboard — KPIs, listas rápidas e workload.
 * Importa router de app.js — é seguro pois ES Modules resolvem circular refs pelo live binding.
 */

import { db } from '../db.js';
import { deadlineCell, progressBar, emptyState, statusPill } from '../utils.js';
import { getSession } from '../session.js';

const GQ_PERFIS = new Set(['GQ Administrador', 'GQ Analista']);
/** GQ vê o panorama geral; demais setores veem um dashboard pessoal. */
function isGQ(session) { return !session || GQ_PERFIS.has(session.perfil); }

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

// ── Cockpit (QMS) ───────────────────────────────────────────────────────────

function saudacao() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

const RNC_OPEN  = s => !['Encerrada', 'Cancelada', 'Não Procedente'].includes(s);
const CAPA_OPEN = s => !['Encerrada', 'Não Procedente', 'Cancelada'].includes(s);
const GCM_OPEN  = s => !['Concluída', 'Rejeitada', 'Cancelada'].includes(s);

/**
 * Calcula o que exige ação agora, do mais crítico ao menos. Reúne atrasos e as
 * situações cobertas pelos gates de conformidade (CAPA obrigatório, plano
 * aguardando aprovação, verificação de eficácia pendente).
 */
function computePendencias() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const atrasado = iso => iso && new Date(iso + 'T00:00:00') < hoje;
  const out = [];

  db.get('capa').filter(r => CAPA_OPEN(r.status) && atrasado(r.prazoFinalizacao))
    .forEach(r => out.push({ sev: 0, tipo: 'CAPA', num: r.numero, desc: r.descricao, motivo: 'Em atraso', rota: 'capaAbertura' }));
  db.get('rnc').filter(r => RNC_OPEN(r.status) && atrasado(r.prazoFinalizacao))
    .forEach(r => out.push({ sev: 0, tipo: 'RNC', num: r.numero, desc: r.descricao, motivo: 'Em atraso', rota: 'rncAbertura' }));
  db.get('gcm').filter(r => GCM_OPEN(r.status) && atrasado(r.prazoImplementacao))
    .forEach(r => out.push({ sev: 0, tipo: 'GCM', num: r.numero, desc: r.titulo || r.descricao, motivo: 'Em atraso', rota: 'gcmAbertura' }));

  // Gate §7.3.1 — CAPA obrigatório pendente (NC Crítica procedente sem CAPA)
  db.get('rnc').filter(r => r.necessitaCapa === 'Sim' && !r.capaAberta && RNC_OPEN(r.status))
    .forEach(r => out.push({ sev: 1, tipo: 'RNC', num: r.numero, desc: r.descricao, motivo: 'CAPA obrigatório', rota: 'rncAbertura' }));

  // Plano aguardando aprovação do Coordenador (§7.4.3.2 / §7.4.2.2)
  db.get('rnc').filter(r => r.status === 'Em Plano de Ação')
    .forEach(r => out.push({ sev: 2, tipo: 'RNC', num: r.numero, desc: r.descricao, motivo: 'Plano aguarda aprovação', rota: 'rncAbertura' }));
  db.get('capa').filter(r => r.status === 'Em Plano de Ação')
    .forEach(r => out.push({ sev: 2, tipo: 'CAPA', num: r.numero, desc: r.descricao, motivo: 'Plano aguarda aprovação', rota: 'capaAbertura' }));

  // Verificação de eficácia pendente de decisão
  const verifPend = r => r.status === 'Verificação de Eficácia' && r.foiEficaz !== 'Sim' && r.foiEficaz !== 'Não';
  db.get('rnc').filter(verifPend).forEach(r => out.push({ sev: 2, tipo: 'RNC', num: r.numero, desc: r.descricao, motivo: 'Verificação pendente', rota: 'rncAbertura' }));
  db.get('capa').filter(verifPend).forEach(r => out.push({ sev: 2, tipo: 'CAPA', num: r.numero, desc: r.descricao, motivo: 'Verificação pendente', rota: 'capaAbertura' }));

  return out.sort((a, b) => a.sev - b.sev);
}

const SEV_COR = ['var(--red)', 'var(--purple,#9333ea)', 'var(--amber)'];

function renderPendencias(pend) {
  if (!pend.length) {
    return `<div style="text-align:center;padding:30px 16px">
      <div style="font-size:2rem;margin-bottom:8px">✅</div>
      <div style="font-weight:600;font-size:0.9rem">Nada em atraso ou aguardando decisão.</div>
      <div style="font-size:0.8rem;color:var(--muted);margin-top:3px">O sistema não encontrou pendências que exijam sua ação agora.</div>
    </div>`;
  }
  return pend.slice(0, 10).map(p => `
    <div class="attn-item" data-goto="${p.rota}" title="Abrir ${p.num}">
      <span class="attn-dot" style="background:${SEV_COR[p.sev]}"></span>
      <span class="attn-type">${p.tipo}</span>
      <span class="attn-num">${p.num}</span>
      <span class="attn-desc">${p.desc || '—'}</span>
      <span class="attn-motivo" style="color:${SEV_COR[p.sev]}">${p.motivo}</span>
      <span class="attn-arrow">→</span>
    </div>`).join('') +
    (pend.length > 10 ? `<div style="font-size:0.74rem;color:var(--muted);padding-top:8px">+ ${pend.length - 10} outra(s) pendência(s)…</div>` : '');
}

const ACTION_TILES = [
  { rota: 'rncAbertura',          ic: '⚑', t: 'Registrar RNC',        s: 'Não conformidade' },
  { rota: 'capaAbertura',         ic: '📋', t: 'Abrir CAPA',           s: 'Ação corretiva/preventiva' },
  { rota: 'reclamacoesAbertura',  ic: '📩', t: 'Nova Reclamação',      s: 'Pós-mercado' },
  { rota: 'conformidade',         ic: '🛡', t: 'Conformidade',         s: 'POP × sistema' },
];

function renderActionTiles() {
  return `<div class="action-tiles">
    ${ACTION_TILES.map(a => `
      <button class="action-tile" data-goto="${a.rota}">
        <span class="ic">${a.ic}</span>
        <span class="tx"><span class="t">${a.t}</span><span class="s">${a.s}</span></span>
      </button>`).join('')}
  </div>`;
}

function renderCockpitHero(session, pend) {
  const primeiro = (session?.nome || '').split(' ')[0] || 'colaboradora';
  const atrasos = pend.filter(p => p.sev === 0).length;
  const data = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  return `<div class="cockpit-hero">
    <div>
      <div class="cockpit-hello">${saudacao()}, ${primeiro} 👋</div>
      <div class="cockpit-sub">${data.charAt(0).toUpperCase() + data.slice(1)} · Garantia da Qualidade</div>
    </div>
    <div class="cockpit-chips">
      <div class="cockpit-chip"><div class="n">${pend.length}</div><div class="l">Exigem ação</div></div>
      <div class="cockpit-chip"><div class="n" style="color:${atrasos ? '#fecaca' : '#fff'}">${atrasos}</div><div class="l">Em atraso</div></div>
    </div>
  </div>`;
}

/** Dashboard pessoal para usuários de área (fora da GQ): só o que é do próprio usuário. */
function renderPersonalDashboard(session) {
  const nome = session?.nome || '';
  const primeiro = nome.split(' ')[0] || 'colaborador(a)';
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const ATIV_DONE = ['Concluída', 'Cancelada'];
  const minhasAtiv = db.get('atividades')
    .filter(r => r.responsavel === nome && !ATIV_DONE.includes(r.status))
    .sort((a, b) => (a.prazo || '9999').localeCompare(b.prazo || '9999'));
  const ativAtrasadas = minhasAtiv.filter(r => r.prazo && new Date(r.prazo + 'T00:00:00') < hoje).length;

  const mine = r => (r.responsavelAbertura || r.responsavel) === nome;
  const meusRegistros = [
    ...db.get('capa').filter(r => mine(r) && !['Encerrada', 'Não Procedente', 'Cancelada'].includes(r.status)).map(r => ({ ...r, _tipo: 'CAPA', _rota: 'capaAbertura' })),
    ...db.get('rnc').filter(r => mine(r) && !['Encerrada', 'Cancelada', 'Não Procedente'].includes(r.status)).map(r => ({ ...r, _tipo: 'RNC', _rota: 'rncAbertura' })),
    ...db.get('gcm').filter(r => mine(r) && !['Concluída', 'Rejeitada', 'Cancelada'].includes(r.status)).map(r => ({ ...r, _tipo: 'GCM', _rota: 'gcmAbertura' })),
  ];

  const limite = new Date(hoje); limite.setDate(limite.getDate() + 30);
  const prazos = [];
  minhasAtiv.forEach(r => { if (r.prazo) { const d = new Date(r.prazo + 'T00:00:00'); if (d >= hoje && d <= limite) prazos.push({ label: r.titulo, date: r.prazo, tag: 'ATIV' }); } });
  meusRegistros.forEach(r => { const p = r.prazoFinalizacao || r.prazoImplementacao; if (p) { const d = new Date(p + 'T00:00:00'); if (d >= hoje && d <= limite) prazos.push({ label: `${r.numero} — ${r.descricao || ''}`, date: p, tag: r._tipo }); } });
  prazos.sort((a, b) => a.date.localeCompare(b.date));

  const ativList = minhasAtiv.length ? minhasAtiv.slice(0, 8).map(r => `
    <div class="upcoming-item" data-goto="atividades" style="cursor:pointer">
      <span class="upcoming-type-tag">${r.tipo || 'Atividade'}</span>
      <span class="upcoming-desc" title="${(r.titulo || '').replace(/"/g, '&quot;')}">${r.titulo || '—'}</span>
      ${r.prazo ? deadlineCell(r.prazo) : statusPill(r.status)}
    </div>`).join('') : emptyState('Você não tem atividades pendentes.');

  const regList = meusRegistros.length ? meusRegistros.slice(0, 8).map(r => `
    <div class="upcoming-item" data-goto="${r._rota}" style="cursor:pointer">
      <span class="upcoming-num">${r.numero}</span>
      <span class="upcoming-type-tag">${r._tipo}</span>
      <span class="upcoming-desc" title="${(r.descricao || '').replace(/"/g, '&quot;')}">${r.descricao || '—'}</span>
      ${statusPill(r.status)}
    </div>`).join('') : emptyState('Você não abriu registros em aberto.');

  const prazoList = prazos.length ? prazos.slice(0, 8).map(r => `
    <div class="upcoming-item">
      <span class="upcoming-type-tag">${r.tag}</span>
      <span class="upcoming-desc" title="${(r.label || '').replace(/"/g, '&quot;')}">${r.label}</span>
      ${deadlineCell(r.date)}
    </div>`).join('') : emptyState('Nenhum prazo seu nos próximos 30 dias.');

  return `
    <div style="margin-bottom:18px">
      <div style="font-size:1.2rem;font-weight:700;color:var(--navy)">Olá, ${primeiro} 👋</div>
      <div style="font-size:0.85rem;color:var(--muted);margin-top:2px">Suas atividades e registros — ${session?.area || 'sua área'}.</div>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-label">Minhas Atividades</div>
        <div class="kpi-value ${minhasAtiv.length > 0 ? 'kpi-amber' : 'kpi-green'}">${minhasAtiv.length}</div>
        <div class="kpi-sub">pendentes</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Atrasadas</div>
        <div class="kpi-value ${ativAtrasadas > 0 ? 'kpi-red' : 'kpi-green'}">${ativAtrasadas}</div>
        <div class="kpi-sub">requerem atenção</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Meus Registros</div>
        <div class="kpi-value kpi-blue">${meusRegistros.length}</div>
        <div class="kpi-sub">CAPA / RNC / GCM em aberto</div>
      </div>
    </div>
    <div class="dash-grid">
      <div class="card">
        <div class="card-header"><h3>Minhas Atividades</h3></div>
        <div class="card-body">${ativList}</div>
      </div>
      <div class="card">
        <div class="card-header"><h3>Meus Registros em Aberto</h3></div>
        <div class="card-body">${regList}</div>
      </div>
      <div class="card" style="grid-column:1/-1">
        <div class="card-header"><h3>Meus Próximos Prazos — 30 dias</h3></div>
        <div class="card-body">${prazoList}</div>
      </div>
    </div>
  `;
}

export default {
  render(container) {
    const session = getSession();
    if (!isGQ(session)) {
      container.innerHTML = renderPersonalDashboard(session);
      return;
    }
    const k = buildKpis();
    const pend = computePendencias();

    container.innerHTML = `
      ${renderCockpitHero(session, pend)}
      ${renderActionTiles()}

      <div class="card" style="margin-bottom:18px;border-left:4px solid ${pend.length ? 'var(--red)' : 'var(--green)'}">
        <div class="card-header"><h3>🎯 Precisa de atenção agora</h3>
          ${pend.length ? `<span class="pill pill-red" style="font-size:0.66rem">${pend.length}</span>` : ''}
        </div>
        <div class="card-body">${renderPendencias(pend)}</div>
      </div>

      <div class="kpi-grid">
        <div class="kpi-card" data-goto="capaGerencial" style="cursor:pointer">
          <div class="kpi-label">CAPAs em Aberto</div>
          <div class="kpi-value ${k.capaAberta > 0 ? 'kpi-amber' : 'kpi-green'}">${k.capaAberta}</div>
          <div class="kpi-sub">${k.capaUrgente} urgente(s) ≤7 dias</div>
        </div>
        <div class="kpi-card" data-goto="rncGerencial" style="cursor:pointer">
          <div class="kpi-label">RNCs Ativas</div>
          <div class="kpi-value ${k.rncAberta > 0 ? 'kpi-red' : 'kpi-green'}">${k.rncAberta}</div>
          <div class="kpi-sub">em andamento</div>
        </div>
        <div class="kpi-card" data-goto="fornecedores" style="cursor:pointer">
          <div class="kpi-label">Forn. Qualificados</div>
          <div class="kpi-value ${k.fornPct < 80 ? 'kpi-amber' : 'kpi-green'}">${k.fornPct}%</div>
          <div class="kpi-sub">do total de fornecedores</div>
        </div>
        <div class="kpi-card" data-goto="validacoes" style="cursor:pointer">
          <div class="kpi-label">Validações em Curso</div>
          <div class="kpi-value kpi-blue">${k.valAtivas}</div>
          <div class="kpi-sub">planejadas ou em execução</div>
        </div>
        <div class="kpi-card" data-goto="tecnovig" style="cursor:pointer">
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

  async init(container) {
    // Navegação a partir dos itens do dashboard pessoal.
    container?.addEventListener('click', e => {
      const el = e.target.closest('[data-goto]');
      if (el) window.location.hash = '#' + el.dataset.goto;
    });
    // Update sidebar badges via router
    const r = await getRouter();
    const capaOpen = db.get('capa').filter(r => !['Encerrada', 'Não Procedente'].includes(r.status)).length;
    const rncOpen  = db.get('rnc').filter(r => r.status !== 'Encerrada' && r.status !== 'Cancelada').length;
    r.updateBadge('capaGerencial', capaOpen);
    r.updateBadge('rnc', rncOpen);
  },
};
