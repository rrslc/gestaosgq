/**
 * @fileoverview Projetos — Gerencial (P-PJ-001).
 * Painel panorâmico de todos os projetos com progresso das atividades GQ.
 */

import { db } from '../db.js';
import { statusPill, emptyState, formatDate, today } from '../utils.js';

const ACTIVE = ['Planejamento', 'Desenvolvimento', 'Verificação', 'Validação'];

const PIPELINE_STEPS = [
  { key: 'Planejamento',    label: 'Planejamento',  color: 'var(--blue)'   },
  { key: 'Desenvolvimento', label: 'Desenvolv.',    color: 'var(--purple)' },
  { key: 'Verificação',     label: 'Verificação',   color: 'var(--amber)'  },
  { key: 'Validação',       label: 'Validação',     color: 'var(--teal)'   },
  { key: 'Liberado',        label: 'Liberado',      color: 'var(--green)'  },
];

const ATIV_KEYS = [
  'f1_analiseReg', 'f1_requisitosEntrada',
  'f2_especProduto', 'f2_especProcesso', 'f2_checklistSaida',
  'f3_planoVerif', 'f3_protocoloSegBio', 'f3_relatorioSegBio',
  'f3_protocoloClinico', 'f3_relatorioClinico', 'f3_checklistVerif',
  'f4_planoValid', 'f4_checklistValid', 'f4_lotePiloto',
  'f5_registroHistorico', 'f5_efetividade', 'f5_termoLiberacao',
];

const ATIV_LABELS = {
  f1_analiseReg:          'Análise Regulatória',
  f1_requisitosEntrada:   'Requisitos de Entrada',
  f2_especProduto:        'Especif. do Produto',
  f2_especProcesso:       'Especif. do Processo',
  f2_checklistSaida:      'Checklist Dados de Saída',
  f3_planoVerif:          'Plano de Verificação',
  f3_protocoloSegBio:     'Protocolo Seg. Biológica',
  f3_relatorioSegBio:     'Relatório Seg. Biológica',
  f3_protocoloClinico:    'Protocolo Av. Clínica',
  f3_relatorioClinico:    'Relatório Av. Clínica',
  f3_checklistVerif:      'Checklist de Verificação',
  f4_planoValid:          'Plano de Validação',
  f4_checklistValid:      'Checklist de Validação',
  f4_lotePiloto:          'Aprovação do Lote Piloto',
  f5_registroHistorico:   'Registro Histórico',
  f5_efetividade:         'Efetividade do Projeto',
  f5_termoLiberacao:      'Termo de Liberação',
};

const STATUS_COLOR = {
  'Planejamento':    'var(--blue)',
  'Desenvolvimento': 'var(--purple)',
  'Verificação':     'var(--amber)',
  'Validação':       'var(--teal)',
  'Liberado':        'var(--green)',
  'Cancelado':       'var(--muted)',
};

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

let _router = null;
async function getRouter() {
  if (!_router) { const m = await import('../app.js'); _router = m.router; }
  return _router;
}

function calcProgress(r) {
  const applicable = ATIV_KEYS.filter(k => (r[k] || 'Pendente') !== 'N/A');
  const done = applicable.filter(k => r[k] === 'Concluído');
  return applicable.length ? Math.round(done.length / applicable.length * 100) : 0;
}

function kpiCard(value, label, color) {
  return `<div style="padding:14px;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${color};border-radius:8px;text-align:center">
    <div style="font-size:1.7rem;font-weight:700;color:${color};line-height:1.1">${value}</div>
    <div style="font-size:0.72rem;color:var(--muted);margin-top:4px">${label}</div>
  </div>`;
}

function renderPipelineBar(all) {
  const counts = {};
  PIPELINE_STEPS.forEach(p => { counts[p.key] = 0; });
  all.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });
  return `<div style="display:flex;gap:0;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
    ${PIPELINE_STEPS.map((p, i) => `
      <div style="flex:1;padding:12px 8px;text-align:center;background:var(--surface);${i > 0 ? 'border-left:1px solid var(--border)' : ''}">
        <div style="font-size:1.4rem;font-weight:700;color:${p.color}">${counts[p.key]}</div>
        <div style="font-size:0.72rem;color:var(--muted);margin-top:2px">${p.label}</div>
      </div>`).join('')}
  </div>`;
}

function progressBar(pct) {
  const color = pct === 100 ? 'var(--green)' : pct >= 50 ? 'var(--blue)' : 'var(--amber)';
  return `<div style="display:flex;align-items:center;gap:6px">
    <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:${color};border-radius:4px"></div>
    </div>
    <span style="font-size:0.74rem;color:var(--muted);white-space:nowrap;min-width:28px">${pct}%</span>
  </div>`;
}

function renderCards(active) {
  if (!active.length) return emptyState('Nenhum projeto ativo no momento.');
  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px;margin-bottom:1.5rem">
    ${active.map(r => {
      const pct = calcProgress(r);
      const pending = ATIV_KEYS.filter(k => {
        const v = r[k] || 'Pendente';
        return v !== 'N/A' && v !== 'Concluído';
      });
      const pendingShown = pending.slice(0, 3);
      const extra = pending.length - pendingShown.length;
      return `
        <div style="background:var(--surface);border:1px solid var(--border);border-left:4px solid ${STATUS_COLOR[r.status] || 'var(--border)'};border-radius:8px;padding:14px">
          <div style="font-weight:600;font-size:0.9rem;margin-bottom:2px">${r.produto || '—'}</div>
          <div style="font-size:0.74rem;color:var(--muted);margin-bottom:8px">${[r.codigoProjeto, r.versao ? 'v' + r.versao : ''].filter(Boolean).join(' · ')}</div>
          <div style="margin-bottom:8px">${statusPill(r.status)}</div>
          <div style="margin-bottom:10px">${progressBar(pct)}</div>
          ${pending.length === 0
            ? `<div style="font-size:0.73rem;color:var(--green)">✓ Todas atividades GQ concluídas</div>`
            : `<div style="font-size:0.73rem;color:var(--muted);margin-bottom:4px">Pendências GQ:</div>
               <ul style="margin:0;padding-left:16px">
                 ${pendingShown.map(k => `<li style="font-size:0.73rem;color:var(--text)">${ATIV_LABELS[k]}</li>`).join('')}
                 ${extra > 0 ? `<li style="font-size:0.73rem;color:var(--muted)">+ ${extra} mais...</li>` : ''}
               </ul>`}
          <div style="margin-top:10px;text-align:right">
            <button class="btn btn-xs btn-secondary" data-action="goto-detalhe">Ver / Editar →</button>
          </div>
        </div>`;
    }).join('')}
  </div>`;
}

function renderAgendaGQ(all) {
  const todayStr = today();
  const in7      = addDays(todayStr, 7);
  const in30     = addDays(todayStr, 30);

  const items = [];
  all.filter(r => ACTIVE.includes(r.status)).forEach(proj => {
    ATIV_KEYS.forEach(key => {
      const status = proj[key] || 'Pendente';
      if (status === 'N/A' || status === 'Concluído') return;
      const prazo = proj[`${key}Prazo`];
      if (!prazo || prazo > in30) return;
      items.push({
        projId:      proj.id,
        produto:     proj.produto       || '—',
        numero:      proj.numero        || '—',
        responsavel: proj.responsavelGQ || '—',
        label:       ATIV_LABELS[key],
        status,
        prazo,
        overdue: prazo < todayStr,
        soon:    prazo >= todayStr && prazo <= in7,
      });
    });
  });

  if (!items.length) return '';

  items.sort((a, b) => a.prazo.localeCompare(b.prazo));

  const overdue = items.filter(i => i.overdue);
  const soon    = items.filter(i => i.soon);
  const later   = items.filter(i => !i.overdue && !i.soon);

  function section(title, list, accent, bg) {
    if (!list.length) return '';
    const rows = list.map(i => `
      <tr>
        <td style="white-space:nowrap">
          <code style="font-size:0.71rem">${i.numero}</code>
          <div style="font-size:0.78rem;font-weight:500;color:var(--text)">${i.produto}</div>
        </td>
        <td style="font-size:0.8rem">${i.label}</td>
        <td style="white-space:nowrap;font-size:0.8rem;font-weight:600;color:${accent}">${formatDate(i.prazo)}</td>
        <td>${statusPill(i.status)}</td>
        <td style="font-size:0.8rem;white-space:nowrap;color:var(--muted)">${i.responsavel}</td>
      </tr>`).join('');
    return `
      <div style="margin-bottom:14px">
        <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:${bg};border-left:3px solid ${accent};border-radius:4px;margin-bottom:8px">
          <span style="font-size:0.68rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${accent}">${title}</span>
          <span style="font-size:0.7rem;background:${accent};color:#fff;padding:1px 7px;border-radius:10px;font-weight:700">${list.length}</span>
        </div>
        <div class="table-wrapper" style="margin:0">
          <table class="data-table" style="margin:0">
            <thead><tr>
              <th>Projeto</th><th>Atividade GQ</th><th>Prazo</th><th>Status</th><th>Responsável</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;
  }

  return `
    <h3 style="font-size:0.82rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">
      Agenda GQ — Próximos 30 dias
    </h3>
    ${section('Atividades atrasadas', overdue, 'var(--red,#dc2626)', 'color-mix(in srgb,var(--red,#dc2626) 10%,var(--surface))')}
    ${section('Vencem esta semana',   soon,    'var(--amber,#d97706)', 'color-mix(in srgb,var(--amber,#d97706) 10%,var(--surface))')}
    ${section('Próximos 30 dias',     later,   'var(--blue,#2563eb)',  'color-mix(in srgb,var(--blue,#2563eb) 10%,var(--surface))')}`;
}

function render(container) {
  const all = db.get('projetos');
  const active   = all.filter(r => ACTIVE.includes(r.status));
  const liberados  = all.filter(r => r.status === 'Liberado').length;
  const cancelados = all.filter(r => r.status === 'Cancelado').length;

  container.innerHTML = `
    <div class="page-header">
      <h2>Projetos — Gerencial</h2>
      <button class="btn btn-primary" data-action="nova">+ Novo Projeto</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
      ${kpiCard(all.length,      'Total de Projetos',  'var(--blue)')}
      ${kpiCard(active.length,   'Em Andamento',       'var(--amber)')}
      ${kpiCard(liberados,       'Liberados',          'var(--green)')}
      ${kpiCard(cancelados,      'Cancelados',         'var(--muted)')}
    </div>
    ${renderPipelineBar(all)}
    <h3 style="font-size:0.82rem;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;margin-bottom:12px">Projetos em Andamento</h3>
    ${renderCards(active)}
    ${renderAgendaGQ(all)}`;
}

function init(container) {
  container.querySelector('[data-action="nova"]')?.addEventListener('click', async () => {
    (await getRouter()).navigate('projetosAbertura');
  });
  container.querySelectorAll('[data-action="goto-detalhe"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      (await getRouter()).navigate('projetosAbertura');
    });
  });
}

export default { render, init };
