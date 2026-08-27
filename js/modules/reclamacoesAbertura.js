/**
 * @fileoverview Reclamações — Registro/Fluxo de Trabalho (POP-GQ-010, rev.00).
 * Espelha o módulo RNC com as etapas do Gerenciamento de Reclamações:
 *  Aberta → Em Avaliação (Criticidade/NOTIVISA) → Aguardando Retorno
 *         → Em Investigação → Em Resposta → Encerrada.
 * Campos mapeados do formulário POP-GQ-010-02 (Controle de Ocorrência).
 */

import { db } from '../db.js';
import { formatDate, statusPill, emptyState, selectOptions, today, deadlineCell } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { getSession } from '../session.js';
import { can, A } from '../permissions.js';
import { TIPOS_TECNO, STATUS, AREAS_MSB } from '../constants.js';
import { openImportFormReclamacaoModal } from './importFormReclamacao.js';

const AREAS = AREAS_MSB;
const CLOSED = ['Encerrada', 'Cancelada', 'Não Procedente'];

// ── Domínios do formulário POP-GQ-010-02 ────────────────────────────────────────
const ORIGENS        = ['Cliente direto', 'Comercial/KAM', 'NOTIVISA', 'Ofício Anvisa', 'Outro'];
const FORMAS_CONTATO = ['E-mail', 'Telefone', 'Atendimento presencial', 'Carta/Ofício', 'Pesquisa de satisfação', 'Outro'];
const MOTIVOS        = ['Reclamação', 'Queixa Técnica', 'Evento Adverso', 'Solicitação de Informação Técnica', 'Solicitação de Informação Não Técnica'];
const COMUNICACOES   = ['Solicitação de Informação Técnica', 'Solicitação de Informação Não Técnica'];
const RESULTADOS     = ['Procedente', 'Não Procede', 'Inconclusiva'];
const CLASSIF_NOTIVISA = ['Confirmada', 'Provável', 'Inconclusiva', 'Descartada'];
const SETORES_INVEST = ['Engenharia', 'Controle de Qualidade', 'Logística', 'Garantia da Qualidade', 'Outro'];

// Tipos de criticidade / prazo de notificação ao SNVS (POP-GQ-010 §7.8)
const CRIT_TIPOS = [
  { key: 'Tipo 1',     prazoDias: 3,    label: 'Tipo 1 — Óbito / séria ameaça / falsificação (72h)', cor: '#dc2626' },
  { key: 'Tipo 2',     prazoDias: 10,   label: 'Tipo 2 — EA grave / recorrência (10 dias)',          cor: '#ea580c' },
  { key: 'Tipo 3',     prazoDias: 30,   label: 'Tipo 3 — Queixa técnica com risco (30 dias)',        cor: '#f59e0b' },
  { key: 'Tipo 4',     prazoDias: 10,   label: 'Tipo 4 — Ocorrência no exterior (10 dias)',          cor: '#f59e0b' },
  { key: 'Dispensada', prazoDias: null, label: 'Dispensada de notificação',                          cor: '#64748b' },
];
const critPrazo = tipo => (CRIT_TIPOS.find(t => t.key === tipo)?.prazoDias ?? null);

// ── Etapas do fluxo (POP-GQ-010) ────────────────────────────────────────────────
const STAGE_ORDER = [
  'Aberta', 'Aguardando Retorno',
  'Em Investigação', 'Em Resposta', 'Encerrada',
];

const PIPELINE = [
  { key: 'Aberta',              label: 'Registro',      color: 'var(--red)'    },
  { key: 'Aguardando Retorno',  label: 'Ag. Retorno',   color: 'var(--orange,#ea580c)' },
  { key: 'Em Investigação',     label: 'Investigação',  color: 'var(--blue)'   },
  { key: 'Em Resposta',         label: 'Resposta',      color: 'var(--teal)'   },
  { key: 'Encerrada',           label: 'Encerramento',  color: 'var(--green)'  },
];

const NEXT_STATUS = {
  'Aberta':             'Aguardando Retorno',
  'Aguardando Retorno': 'Em Investigação',
  'Em Investigação':    'Em Resposta',
  'Em Resposta':        'Encerrada',
};

/** Comunicações (solicitação de informação) podem pular direto para Resposta. */
function nextStatusFor(record) {
  if (record.status === 'Aberta' && COMUNICACOES.includes(record.motivo)) {
    return 'Em Resposta';
  }
  return NEXT_STATUS[record.status];
}

const STAGE_OWNER = {
  'Aberta':             { label: 'Garantia da Qualidade', color: '#9333ea' },
  'Aguardando Retorno': { label: 'GQ · Cliente',          color: '#ea580c' },
  'Em Investigação':    { label: 'Eng · CQ · Log · GQ',   color: '#3b82f6' },
  'Em Resposta':        { label: 'Garantia da Qualidade', color: '#14b8a6' },
  'Encerrada':          { label: 'Garantia da Qualidade', color: '#22c55e' },
};

const STAGE_PILL = {
  'Aguardando Retorno': 'orange',
  'Em Investigação':    'blue',
  'Em Resposta':        'teal',
};

// ── Perfis e etapas GQ ───────────────────────────────────────────────────────
const GQ_PERFIS = new Set(['GQ Administrador', 'GQ Analista']);
const GQ_STAGES = ['Aberta', 'Aguardando Retorno', 'Em Investigação', 'Em Resposta'];

/** Importar Formulário é exclusivo da Garantia da Qualidade. */
function canImportForm(user = getSession()) {
  return !!user && GQ_PERFIS.has(user.perfil) && can(user, 'reclamacoesAbertura', A.CREATE);
}

/** Migra status legado para o fluxo atual (5 etapas). */
export function migrateLegacyReclamStatus() {
  db.get('reclamacoes').forEach(r => {
    if (r.status === 'Concluída') db.update('reclamacoes', r.id, { status: 'Encerrada' });
    else if (r.status === 'Em Avaliação') db.update('reclamacoes', r.id, { status: 'Aberta' });
  });
}

// ── Permissões ────────────────────────────────────────────────────────────────
function canAct(record, user = getSession()) {
  if (!user || !can(user, 'reclamacoesAbertura', A.EDIT)) return false;
  if (GQ_PERFIS.has(user.perfil)) return true;
  return record?.status === 'Aberta';
}
function canAdvance(record, user = getSession()) {
  return canAct(record, user);
}
function ownerLabel(record) {
  const o = STAGE_OWNER[record.status];
  if (!o) return record.status;
  return record.status === 'Aberta' && record.area ? `Área: ${record.area}` : o.label;
}
function pendingCount() {
  const user = getSession();
  const recs = db.get('reclamacoes');
  if (user && GQ_PERFIS.has(user.perfil)) return recs.filter(r => GQ_STAGES.includes(r.status)).length;
  return recs.filter(r => r.status === 'Aberta').length;
}

/** CAPA é aberta a partir de uma reclamação procedente ainda não tratada. */
function canOpenCapa(record, user = getSession()) {
  return canAct(record, user) && !record.capaAberta && record.resultado === 'Procedente';
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function stageIdx(status) {
  const i = STAGE_ORDER.indexOf(status);
  return i >= 0 ? i : status === 'Não Procedente' ? 3 : STAGE_ORDER.length;
}
function addDays(isoDate, days) {
  if (!isoDate || days == null) return '';
  const d = new Date(isoDate + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function generateNumero() {
  const yy  = String(new Date().getFullYear()).slice(2);
  const seq = db.get('reclamacoes').filter(r => (r.numero || '').endsWith(`/${yy}`)).length + 1;
  return `REC.${String(seq).padStart(3, '0')}/${yy}`;
}

/** Resumo do 1º produto (para exibir na lista/quadro) a partir da tabela de produtos. */
function resumoProduto(data) {
  const p = Array.isArray(data.produtos) && data.produtos[0];
  return { produto: p ? (p.produto || '') : (data.produto || ''), lote: p ? (p.lote || '') : (data.lote || '') };
}

/** Converte campos de produto legado (registro antigo, produto único) em linha da tabela. */
function legacyToProdutos(record) {
  if (Array.isArray(record.produtos)) return record.produtos;
  if (record.produto || record.produtoCodigo || record.lote) {
    return [{ codigo: record.produtoCodigo || '', produto: record.produto || '', lote: record.lote || '',
      quantidade: record.quantidade || '', fabricacao: record.dataFabricacao || '', validade: record.dataValidade || '' }];
  }
  return [];
}

// Prazo geral de fechamento (90 dias) vencido, ou prazo de notificação SNVS vencido sem notificar.
function isOverdue(r, hoje) {
  if (CLOSED.includes(r.status)) return false;
  const fech = r.prazoFechamento && new Date(r.prazoFechamento + 'T00:00:00') < hoje;
  const snvs = r.prazoNotificacao && !r.dataNotificacao && new Date(r.prazoNotificacao + 'T00:00:00') < hoje;
  return !!(fech || snvs);
}

const RISK_RANK = { 'Tipo 1': 0, 'Tipo 2': 1, 'Tipo 4': 2, 'Tipo 3': 3, 'Dispensada': 4 };
const CRIT_PILL = { 'Tipo 1': 'pill-red', 'Tipo 2': 'pill-orange', 'Tipo 3': 'pill-amber', 'Tipo 4': 'pill-amber', 'Dispensada': 'pill-gray' };

function sortForDisplay(items, hoje) {
  return [...items].sort((a, b) => {
    const oa = isOverdue(a, hoje) ? 0 : 1, ob = isOverdue(b, hoje) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const ra = RISK_RANK[a.criticidadeTipo] ?? 5, rb = RISK_RANK[b.criticidadeTipo] ?? 5;
    if (ra !== rb) return ra - rb;
    return (a.dataAbertura || '').localeCompare(b.dataAbertura || '');
  });
}

// Ordenação por coluna clicável na tabela "Todas".
let _sortCol = '';
let _sortDir = 1;
function sortByColumn(items, col, dir, hoje) {
  const val = {
    numero:    r => r.numero || '',
    motivo:    r => r.motivo || '',
    cliente:   r => r.clienteInstituicao || '',
    produto:   r => r.produto || '',
    tAberto:   r => r.dataAbertura ? (hoje - new Date(r.dataAbertura + 'T00:00:00')) : -Infinity,
    crit:      r => RISK_RANK[r.criticidadeTipo] ?? 99,
    status:    r => stageIdx(r.status),
    responsavel: r => ownerLabel(r) || '',
  }[col];
  if (!val) return items;
  return [...items].sort((a, b) => {
    const va = val(a), vb = val(b);
    const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
    return cmp * dir;
  });
}

// ── Stepper ─────────────────────────────────────────────────────────────────
function renderStepper(status) {
  if (['Não Procedente', 'Cancelada'].includes(status)) {
    return `<div style="display:flex;align-items:center;justify-content:center;padding:10px 0 14px">
      <span class="pill pill-red">${status}</span></div>`;
  }
  const cur = stageIdx(status);
  return `<div style="display:flex;align-items:center;gap:0;padding:10px 0 14px;overflow-x:auto">
    ${PIPELINE.map((p, i) => {
      const done = i < cur, active = i === cur;
      const bdCol = done ? '#22c55e' : active ? p.color : 'var(--border)';
      const bgFill = done ? '#22c55e' : active ? p.color : 'var(--surface)';
      const textC = active ? p.color : done ? '#22c55e' : 'var(--muted)';
      return `${i > 0 ? `<div style="flex:1;height:2px;background:${done ? '#22c55e' : 'var(--border)'};min-width:10px"></div>` : ''}
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:56px">
          <div style="width:24px;height:24px;border-radius:50%;background:${bgFill};border:2px solid ${bdCol};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:${done || active ? 'white' : 'var(--muted)'}">${done ? '✓' : i + 1}</div>
          <span style="font-size:0.61rem;text-align:center;line-height:1.2;color:${textC};font-weight:${active ? '700' : '400'};max-width:56px">${p.label}</span>
        </div>`;
    }).join('')}
  </div>`;
}

// ── Minha Fila ────────────────────────────────────────────────────────────────
function renderMinhaFila() {
  const user = getSession();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const isGQ = user && GQ_PERFIS.has(user.perfil);

  const items = sortForDisplay(isGQ
    ? db.get('reclamacoes').filter(r => GQ_STAGES.includes(r.status))
    : db.get('reclamacoes').filter(r => r.status === 'Aberta'), hoje);

  if (!items.length) {
    const [msg, sub] = isGQ
      ? ['Nenhuma reclamação aguarda ação da GQ.', 'Tudo encerrado ou em etapas de área.']
      : ['Sem reclamações em aberto!', 'Nada pendente de registro pela sua área.'];
    return `<div style="text-align:center;padding:48px 24px">
      <div style="font-size:2.5rem;margin-bottom:12px">✅</div>
      <div style="font-size:0.95rem;font-weight:600;margin-bottom:6px">${msg}</div>
      <div style="font-size:0.82rem;color:var(--muted)">${sub}</div>
    </div>`;
  }

  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
    ${items.map(r => {
      const stage = PIPELINE.find(p => p.key === r.status);
      const cor   = stage?.color ?? 'var(--border)';
      const own   = STAGE_OWNER[r.status];
      const nxt   = nextStatusFor(r);
      const act   = canAct(r, user);
      const emAtraso = isOverdue(r, hoje);
      const dias  = r.dataAbertura ? Math.round((hoje - new Date(r.dataAbertura + 'T00:00:00')) / 86400000) + 'd' : '';
      const pillColor = STAGE_PILL[r.status] ?? 'gray';
      const nxtLabel  = PIPELINE.find(p => p.key === nxt)?.label ?? nxt;
      const showComunic = act && r.status === 'Aberta' && COMUNICACOES.includes(r.motivo);
      const showAbrirCapa = isGQ && canOpenCapa(r, user);
      return `<div style="border:1px solid var(--border);border-top:3px solid ${cor};border-radius:8px;padding:14px;background:var(--surface);display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
          <div>
            <div style="font-weight:700;font-size:0.9rem">${r.numero}</div>
            <div style="font-size:0.71rem;color:var(--muted);margin-top:2px">${r.clienteInstituicao || '—'}${r.motivo ? ' · ' + r.motivo : ''}</div>
          </div>
          <span class="pill pill-${pillColor}" style="white-space:nowrap;font-size:0.65rem">${stage?.label ?? r.status}</span>
        </div>
        <div style="font-size:0.8rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden" title="${(r.descricao || '').replace(/"/g, '&quot;')}">${r.descricao || '—'}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:0.72rem;color:var(--muted)">${own?.label ?? r.status}</span>
          ${emAtraso ? `<span style="font-size:0.67rem;color:var(--red);font-weight:700">⚠ atraso</span>` : (dias ? `<span style="font-size:0.7rem;color:var(--muted)">${dias}</span>` : '')}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">✏ ${act ? 'Editar' : 'Ver'}</button>
          ${act && nxt ? `<button class="btn btn-primary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nxt}" style="flex:1">→ ${nxtLabel}</button>` : ''}
        </div>
        ${(showComunic || showAbrirCapa) ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
          ${showComunic ? `<button class="btn btn-secondary btn-sm" data-action="close-direct" data-id="${r.id}" style="border-color:var(--green,#22c55e);color:var(--green,#22c55e)">✓ Encerrar comunicação</button>` : ''}
          ${showAbrirCapa ? `<button class="btn btn-secondary btn-sm" data-action="abrir-capa" data-id="${r.id}" style="border-color:var(--purple,#9333ea);color:var(--purple,#9333ea)">📋 Abrir CAPA</button>` : ''}
        </div>` : ''}
      </div>`;
    }).join('')}
  </div>`;
}

// ── Quadro (Kanban) ──────────────────────────────────────────────────────────
function kanbanCard(r, user, hoje) {
  const own = STAGE_OWNER[r.status];
  const nxt = nextStatusFor(r);
  const canAdv = canAdvance(r, user);
  const nxtLabel = PIPELINE.find(p => p.key === nxt)?.label ?? nxt;
  const emAtraso = isOverdue(r, hoje);
  const dias = r.dataAbertura ? Math.round((hoje - new Date(r.dataAbertura + 'T00:00:00')) / 86400000) + 'd' : '';
  const crit = r.criticidadeTipo ? `<span class="pill ${CRIT_PILL[r.criticidadeTipo] ?? 'pill-gray'}" style="font-size:0.58rem">${r.criticidadeTipo}</span>` : '';
  const descSafe = String(r.descricao || '').replace(/"/g, '&quot;');
  return `<div class="kanban-card" data-action="edit" data-id="${r.id}" title="Abrir ${r.numero}"
       style="border:1px solid ${emAtraso ? 'var(--red)' : 'var(--border)'};border-left:3px solid ${emAtraso ? 'var(--red)' : 'var(--border)'};border-radius:8px;padding:10px;background:${emAtraso ? 'color-mix(in srgb, var(--red) 6%, var(--bg))' : 'var(--bg)'};display:flex;flex-direction:column;gap:6px;cursor:pointer">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
      <span style="font-weight:700;font-size:0.78rem">${r.numero}</span>
      ${crit}
    </div>
    <div style="font-size:0.7rem;color:var(--muted)">${r.clienteInstituicao || '—'}${r.motivo ? ' · ' + r.motivo : ''}</div>
    <div style="font-size:0.74rem;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden" title="${descSafe}">${r.descricao || '—'}</div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:0.64rem;color:var(--muted)">${own?.label ?? ''}</span>
      ${emAtraso ? `<span style="font-size:0.63rem;color:var(--red);font-weight:700">⚠ atraso</span>` : (dias ? `<span style="font-size:0.65rem;color:var(--muted)">${dias}</span>` : '')}
    </div>
    ${canAdv && nxt ? `<button class="btn btn-primary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nxt}" style="font-size:0.68rem;padding:4px 6px">→ ${nxtLabel}</button>` : ''}
  </div>`;
}

function renderKanban(items) {
  const user = getSession();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const byStage = {};
  PIPELINE.forEach(p => { byStage[p.key] = []; });
  const naoProc = [];
  items.forEach(r => {
    if (byStage[r.status]) byStage[r.status].push(r);
    else if (r.status === 'Não Procedente' || r.status === 'Cancelada') naoProc.push(r);
  });
  const cols = [...PIPELINE];
  if (naoProc.length) cols.push({ key: '__np', label: 'Não Procedente', color: '#94a3b8', _items: naoProc });

  return `<div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:10px;align-items:flex-start">
    ${cols.map(p => {
      const list = p._items ?? byStage[p.key];
      const sorted = sortForDisplay(list, hoje);
      return `<div style="flex:0 0 258px;display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;border-radius:8px;background:var(--surface);border:1px solid var(--border);border-top:3px solid ${p.color}">
          <span style="font-size:0.76rem;font-weight:700;color:${p.color}">${p.label}</span>
          <span style="font-size:0.7rem;font-weight:600;color:var(--muted);background:var(--bg);border-radius:10px;padding:1px 9px">${list.length}</span>
        </div>
        ${sorted.length ? sorted.map(r => kanbanCard(r, user, hoje)).join('')
          : `<div style="font-size:0.7rem;color:var(--muted);text-align:center;padding:16px 6px;border:1px dashed var(--border);border-radius:8px">—</div>`}
      </div>`;
    }).join('')}
  </div>`;
}

// ── Pipeline bar ──────────────────────────────────────────────────────────────
function renderPipelineBar(items) {
  const cnt = {};
  PIPELINE.forEach(p => { cnt[p.key] = 0; });
  const np = items.filter(r => r.status === 'Não Procedente').length;
  items.forEach(r => { if (cnt[r.status] !== undefined) cnt[r.status]++; });
  return `
    <div style="display:flex;gap:0;margin-bottom:${np ? '8px' : '16px'};border-radius:8px;overflow:hidden;border:1px solid var(--border)">
      ${PIPELINE.map((p, i) => `
        <div style="flex:1;padding:12px 8px;text-align:center;background:var(--surface);${i > 0 ? 'border-left:1px solid var(--border)' : ''}">
          <div style="font-size:1.4rem;font-weight:700;color:${p.color}">${cnt[p.key]}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;line-height:1.3">${p.label}</div>
        </div>`).join('')}
    </div>
    ${np ? `<div style="margin-bottom:12px"><span style="font-size:0.78rem;padding:3px 12px;border-radius:12px;background:var(--border);color:var(--muted)">+ ${np} Não Procedente${np > 1 ? 's' : ''}</span></div>` : ''}`;
}

// ── Tabela "Todas" (ordenável) ─────────────────────────────────────────────────
function renderTable(items) {
  if (!items.length) return emptyState('Nenhuma reclamação encontrada.');
  const user = getSession();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  function diasAberto(r) {
    if (!r.dataAbertura) return '—';
    const ini = new Date(r.dataAbertura + 'T00:00:00');
    const fim = r.dataFechamento ? new Date(r.dataFechamento + 'T00:00:00') : hoje;
    return `${Math.round((fim - ini) / 86400000)}d`;
  }
  const th = (label, col) => col
    ? `<th data-sort="${col}" title="Ordenar por ${label}" style="cursor:pointer;user-select:none;white-space:nowrap">${label}${_sortCol === col ? (_sortDir > 0 ? ' ▲' : ' ▼') : '<span style="opacity:.28">↕</span>'}</th>`
    : `<th>${label}</th>`;
  const ordered = _sortCol ? sortByColumn(items, _sortCol, _sortDir, hoje) : sortForDisplay(items, hoje);

  return `<div class="table-wrap"><table>
    <thead><tr>
      ${th('Número', 'numero')}${th('Motivo', 'motivo')}${th('Cliente', 'cliente')}${th('Produto', 'produto')}
      ${th('T. Aberto', 'tAberto')}${th('Criticidade', 'crit')}${th('Status', 'status')}${th('Responsável p/ Etapa', 'responsavel')}${th('Ações', '')}
    </tr></thead>
    <tbody>
      ${ordered.map(r => {
        const atrasada = isOverdue(r, hoje);
        const own      = STAGE_OWNER[r.status];
        const ownLbl   = ownerLabel(r);
        const ownColor = own?.color ?? '#94a3b8';
        const crit     = r.criticidadeTipo
          ? `<span class="pill ${CRIT_PILL[r.criticidadeTipo] ?? 'pill-gray'}">${r.criticidadeTipo}</span>` : '—';
        const nxt      = nextStatusFor(r);
        const act      = canAct(r, user);
        const canAdv   = canAdvance(r, user);
        const extras   = [];
        if (canOpenCapa(r, user)) {
          extras.push(`<button class="btn btn-secondary btn-sm" data-action="abrir-capa" data-id="${r.id}" title="Abrir CAPA (procedente)" style="border-color:var(--purple,#9333ea);color:var(--purple,#9333ea)">📋</button>`);
        }
        if (act && r.geraTecnovig === 'Sim' && !r.numeroTecnovig) {
          extras.push(`<button class="btn btn-secondary btn-sm" data-action="notificar-anvisa" data-id="${r.id}" title="Notificar ANVISA (NOTIVISA)" style="border-color:var(--red,#ef4444);color:var(--red,#ef4444)">🔔</button>`);
        }
        return `<tr style="${atrasada ? 'background:color-mix(in srgb, var(--red) 5%, transparent)' : ''}">
          <td><strong>${r.numero}</strong>${atrasada ? ' <span title="Em atraso" style="color:var(--red)">⚠</span>' : ''}</td>
          <td style="white-space:nowrap;font-size:0.8rem">${r.motivo || '—'}</td>
          <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.clienteInstituicao || ''}">${r.clienteInstituicao || '—'}</td>
          <td>${r.produto || '—'}</td>
          <td style="text-align:center">${diasAberto(r)}</td>
          <td>${crit}</td>
          <td>${statusPill(r.status)}</td>
          <td style="white-space:nowrap"><span style="font-size:0.71rem;padding:2px 7px;border-radius:4px;background:${ownColor}18;color:${ownColor};font-weight:600">${ownLbl}</span></td>
          <td><div class="td-actions">
            ${canAdv && nxt ? `<button class="btn btn-primary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nxt}" title="Avançar para ${nxt}">→</button>` : ''}
            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="${act ? 'Editar' : 'Visualizar'}">${act ? '✏' : '👁'}</button>
            <button class="btn btn-secondary btn-sm" data-action="print-rec" data-id="${r.id}" title="Gerar PDF">🖨</button>
            ${extras.join('')}
          </div></td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

// ── Formulário por etapas (POP-GQ-010-02) ──────────────────────────────────────
function buildFields(record = null) {
  const resp = db.get('equipe').map(m => m.nome);
  const respOpt = resp.length ? resp : ['—'];
  const status = record?.status ?? 'Aberta';
  const cur = stageIdx(status);
  const isTerminal = ['Não Procedente', 'Cancelada'].includes(status);

  const f = (stg, def) => {
    const si = STAGE_ORDER.indexOf(stg);
    return (isTerminal || si < cur) ? { ...def, readonly: true } : def;
  };
  const h = (label, stg) => {
    const si = STAGE_ORDER.indexOf(stg);
    return { id: `_h_${stg}`, type: 'heading', label, locked: isTerminal || si < cur, span: 2 };
  };

  const base = [
    record?.motivoAjuste ? { id: 'motivoAjuste', label: '⚠ Ajustes solicitados pela GQ', type: 'textarea', required: false, span: 2, readonly: true } : null,
    f('Aberta', { id: 'numero',            label: '1.1  Nº Reclamação',                 type: 'text',   required: true,  span: 1, readonly: true }),
    f('Aberta', { id: 'dataRecebimento',   label: '1.2  Data de Recebimento',           type: 'date',   required: false, span: 1 }),
    f('Aberta', { id: 'dataAbertura',      label: '1.3  Data de Abertura',              type: 'date',   required: true,  span: 1 }),
    f('Aberta', { id: 'area',              label: '1.4  Área Demandante',               type: 'select', required: false, span: 1, options: AREAS }),
    f('Aberta', { id: 'origem',            label: '1.5  Origem',                        type: 'select', required: false, span: 1, options: ORIGENS }),
    f('Aberta', { id: 'formaContato',      label: '1.6  Forma de Contato',              type: 'select', required: false, span: 1, options: FORMAS_CONTATO }),
    f('Aberta', { id: 'motivo',            label: '1.7  Motivo do Contato',             type: 'select', required: true,  span: 1, options: MOTIVOS }),
    f('Aberta', { id: 'numeroNotivisa',    label: '     Nº NOTIVISA (se aplicável)',    type: 'text',   required: false, span: 1 }),
    // Notificante
    f('Aberta', { id: 'notificanteNome',   label: '2.1  Nome do Notificante',           type: 'text',   required: false, span: 1 }),
    f('Aberta', { id: 'clienteInstituicao',label: '2.2  Cliente / Instituição',         type: 'text',   required: true,  span: 1 }),
    f('Aberta', { id: 'email',             label: '2.3  E-mail para Contato',           type: 'text',   required: false, span: 1 }),
    f('Aberta', { id: 'telefone',          label: '2.4  Telefone',                      type: 'text',   required: false, span: 1 }),
    f('Aberta', { id: 'cidade',            label: '     Cidade',                        type: 'text',   required: false, span: 1 }),
    f('Aberta', { id: 'uf',                label: '     UF',                            type: 'text',   required: false, span: 1 }),
    // Produto
    f('Aberta', { id: 'produtos',          label: '3.  Identificação do(s) Produto(s)', type: 'produtos-table', required: false, span: 2 }),
    f('Aberta', { id: 'rastreabilidadeD365', label: '3.4  Rastreabilidade no D365?',    type: 'select', required: false, span: 1, options: ['Sim', 'Não'] }),
    f('Aberta', { id: 'numeroPedidoNF',    label: '     Nº Pedido / NF de Venda',       type: 'text',   required: false, span: 1 }),
    f('Aberta', { id: 'descricao',         label: '4.  Descrição da Ocorrência',        type: 'textarea', required: true, span: 2 }),
    h('5.  AVALIAÇÃO DE CRITICIDADE E NOTIFICAÇÃO AO SNVS  (§7.8)', 'Aberta'),
    f('Aberta', { id: 'criticidadeTipo',  label: '5.1  Tipo de Ocorrência / Criticidade', type: 'select', required: false, span: 2, options: CRIT_TIPOS.map(t => t.label) }),
    f('Aberta', { id: 'prazoNotificacao', label: '     Data-limite p/ Notificação SNVS',  type: 'date',   required: false, span: 1, readonly: true }),
    f('Aberta', { id: 'dataNotificacao',  label: '     Data da Notificação Realizada',    type: 'date',   required: false, span: 1 }),
    f('Aberta', { id: 'protocoloNotivisa',label: '     Protocolo / Nº NOTIVISA',          type: 'text',   required: false, span: 2 }),
  ].filter(Boolean);

  if (!record) return base;

  const fields = [h('ETAPA 1 — REGISTRO / TRIAGEM / CRITICIDADE  (GQ)', 'Aberta'), ...base];

  if (cur >= 1) {
    fields.push(
      h('ETAPA 2 — MONITORAMENTO DE DOCUMENTOS / PRODUTO  (GQ · Cliente)', 'Aguardando Retorno'),
      f('Aguardando Retorno', { id: 'docsRecebidos',   label: '6.1  Documentos / Evidências Recebidos', type: 'checkboxgroup', required: false, span: 2, options: ['Questionário respondido', 'Relatório médico detalhado', 'Relatório do cliente', 'Produto recebido para análise', 'Nota fiscal de análise'] }),
      f('Aguardando Retorno', { id: 'dataChegadaProduto', label: '     Data de Chegada do Produto',      type: 'date', required: false, span: 1 }),
      f('Aguardando Retorno', { id: 'cobranca1',       label: '6.2  1ª Cobrança',                       type: 'date', required: false, span: 1 }),
      f('Aguardando Retorno', { id: 'cobranca2',       label: '     2ª Cobrança',                       type: 'date', required: false, span: 1 }),
      f('Aguardando Retorno', { id: 'cobranca3',       label: '     3ª Cobrança',                       type: 'date', required: false, span: 1 }),
      f('Aguardando Retorno', { id: 'semRetorno',      label: '     Sem retorno do cliente?',           type: 'select', required: false, span: 1, options: ['Não', 'Sim'] }),
    );
  }

  if (cur >= 2) {
    fields.push(
      h('ETAPA 3 — INVESTIGAÇÃO  (Eng · CQ · Log · GQ)', 'Em Investigação'),
      f('Em Investigação', { id: 'recorrente',        label: '7.1  Ocorrência Recorrente?',            type: 'select', required: false, span: 1, options: ['Não', 'Sim'] }),
      f('Em Investigação', { id: 'reclamacoesAnteriores', label: '     Referenciar reclamações anteriores', type: 'text', required: false, span: 1 }),
      f('Em Investigação', { id: 'setorInvestigacao', label: '7.2  Setor(es) Responsável(eis) pela Investigação  (marque todos os aplicáveis)', type: 'checkboxgroup', required: false, span: 2, options: SETORES_INVEST }),
      f('Em Investigação', { id: 'dataEntregaCompilado', label: '     Data de Entrega do Compilado',    type: 'date',   required: false, span: 1 }),
      f('Em Investigação', { id: 'resumoInvestigacao',label: '     Resumo da Investigação',             type: 'textarea', required: false, span: 2 }),
      f('Em Investigação', { id: 'resultado',         label: '7.3  Resultado da Investigação',         type: 'select', required: false, span: 1, options: RESULTADOS }),
      f('Em Investigação', { id: 'responsavelInvestigacao', label: '7.4  Responsável(eis) pela Investigação', type: 'text', required: false, span: 2 }),
      h('8.  CODIFICAÇÃO IMDRF / ISO 19218   (obrigatória p/ Evento Adverso ou Queixa Técnica)', 'Em Investigação'),
      f('Em Investigação', { id: 'codProblema',   label: '8.1  Cód. Problema do Dispositivo', type: 'text', required: false, span: 1 }),
      f('Em Investigação', { id: 'codCausa',      label: '8.2  Cód. Causa Provável',          type: 'text', required: false, span: 1 }),
      f('Em Investigação', { id: 'codEfeito',     label: '8.3  Cód. Efeito à Saúde',          type: 'text', required: false, span: 1 }),
      f('Em Investigação', { id: 'codComponente', label: '8.4  Cód. Componente / Parte',      type: 'text', required: false, span: 1 }),
    );
  }

  if (cur >= 3) {
    fields.push(
      h('ETAPA 4 — CONCLUSÃO / CARTA RESPOSTA  (GQ)', 'Em Resposta'),
      f('Em Resposta', { id: 'classificacaoNotivisa', label: '9.1  Classificação NOTIVISA',          type: 'select', required: false, span: 1, options: CLASSIF_NOTIVISA }),
      f('Em Resposta', { id: 'acaoCampo',            label: '9.2  Necessária Ação de Campo?',        type: 'select', required: false, span: 1, options: ['Não', 'Sim'] }),
      f('Em Resposta', { id: 'numeroAcaoCampo',      label: '     Nº da Ação de Campo',              type: 'text',   required: false, span: 1 }),
      f('Em Resposta', { id: 'cartaResposta',        label: '9.3  Carta Resposta ao Cliente',        type: 'textarea', required: false, span: 2 }),
      f('Em Resposta', { id: 'dataEnvioResposta',    label: '     Data de Envio da Resposta',         type: 'date',   required: false, span: 1 }),
      f('Em Resposta', { id: 'geraCAPA',             label: '9.4  Gera CAPA?  (procedente → Sim)',    type: 'select', required: false, span: 1, options: ['Não', 'Sim', 'Em Avaliação'] }),
      f('Em Resposta', { id: 'capaTratadaAntes',     label: '     CAPA — nova ou referência?',        type: 'select', required: false, span: 1, options: ['Nova (não tratada antes)', 'Referência (tratada antes)'] }),
      f('Em Resposta', { id: 'numeroCAPA',           label: '     Nº da CAPA',                        type: 'text',   required: false, span: 2 }),
      f('Em Resposta', { id: 'geraTecnovig',         label: '     Gera Notificação Tecnovigilância?', type: 'select', required: false, span: 1, options: ['Não', 'Sim', 'Em Avaliação'] }),
      f('Em Resposta', { id: 'numeroTecnovig',       label: '     Nº da Notificação ANVISA',          type: 'text',   required: false, span: 1, readonly: true }),
    );
  }

  if (cur >= 4) {
    fields.push(
      h('ETAPA 5 — ENCERRAMENTO  (GQ)', 'Encerrada'),
      f('Encerrada', { id: 'preenchidoPor',   label: '10.1  Preenchido por',   type: 'select', required: false, span: 1, options: respOpt }),
      f('Encerrada', { id: 'aprovadoPor',     label: '10.2  Aprovado por',     type: 'select', required: false, span: 1, options: respOpt }),
      f('Encerrada', { id: 'dataFechamento',  label: '     Data de Fechamento', type: 'date',   required: false, span: 1 }),
    );
  }

  return fields;
}

// ── Impressão / PDF ─────────────────────────────────────────────────────────
function printHtmlDocument(html) {
  const win = window.open('', '_blank');
  if (!win) { toast('Permita pop-ups para gerar o PDF.', 'warning'); return; }
  win.document.open(); win.document.write(html); win.document.close();
  const doPrint = () => { try { win.focus(); win.print(); } catch { /* noop */ } };
  win.addEventListener('load', doPrint);
  setTimeout(doPrint, 400);
}
const PRINT_STYLE = `
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 8px; margin-bottom: 14px; }
  header h1 { font-size: 15px; margin: 0 0 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #999; padding: 4px 6px; text-align: left; font-size: 9.5px; vertical-align: top; }
  th { background: #f1f5f9; }
`;
function buildRecListPrintHtml(items) {
  const cfg = db.getConfig();
  const esc = s => String(s ?? '').replace(/</g, '&lt;');
  const rows = items.map(r => `<tr>
    <td>${esc(r.numero)}</td><td>${esc(r.motivo) || '—'}</td><td>${esc(r.clienteInstituicao) || '—'}</td>
    <td>${esc(r.produto) || '—'}</td><td>${esc(r.criticidadeTipo) || '—'}</td>
    <td>${r.dataAbertura ? formatDate(r.dataAbertura) : '—'}</td><td>${esc(r.status)}</td>
  </tr>`).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Reclamações</title>
    <style>@page { size: A4 landscape; margin: 15mm; } ${PRINT_STYLE}</style></head><body>
    <header><div><h1>${esc(cfg.empresa) || 'MSB Medical System do Brasil'}</h1>
      <div style="font-size:10px;color:#444">CNPJ: ${esc(cfg.cnpj) || '—'} · AFE: ${esc(cfg.afe) || '—'}</div></div>
      <div style="text-align:right"><strong>Relatório de Reclamações (POP-GQ-010)</strong><br>
      ${items.length} registro${items.length !== 1 ? 's' : ''} · ${new Date().toLocaleString('pt-BR')}</div></header>
    <table><thead><tr><th>Número</th><th>Motivo</th><th>Cliente</th><th>Produto</th><th>Criticidade</th><th>Abertura</th><th>Status</th></tr></thead>
    <tbody>${rows}</tbody></table></body></html>`;
}
function buildRecPrintHtml(r) {
  const cfg = db.getConfig();
  const esc = s => String(s ?? '').replace(/</g, '&lt;');
  const linha = (l, v) => `<tr><th style="width:34%">${l}</th><td>${esc(v) || '—'}</td></tr>`;
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(r.numero)}</title>
    <style>@page { size: A4; margin: 15mm; } ${PRINT_STYLE}</style></head><body>
    <header><div><h1>${esc(cfg.empresa) || 'MSB Medical System do Brasil'}</h1>
      <div style="font-size:10px;color:#444">Controle de Ocorrência — POP-GQ-010-02</div></div>
      <div style="text-align:right"><strong>${esc(r.numero)}</strong><br>${esc(r.status)}</div></header>
    <table><tbody>
      ${linha('Data de Abertura', r.dataAbertura ? formatDate(r.dataAbertura) : '')}
      ${linha('Origem', r.origem)}${linha('Motivo do Contato', r.motivo)}
      ${linha('Cliente / Instituição', r.clienteInstituicao)}${linha('Produto', r.produto)}${linha('Lote', r.lote)}
      ${linha('Descrição', r.descricao)}
      ${linha('Criticidade', r.criticidadeTipo)}${linha('Protocolo NOTIVISA', r.protocoloNotivisa)}
      ${linha('Resultado da Investigação', r.resultado)}
      ${linha('Classificação NOTIVISA', r.classificacaoNotivisa)}
      ${linha('Status', r.status)}
    </tbody></table></body></html>`;
}

// ── Filtros / refresh / abas ────────────────────────────────────────────────
let _activeTab = 'quadro';
let _extraFilter = '';
const EXTRA_FILTER_LABEL = { atraso: 'Em atraso', andamento: 'Em andamento', snvs: 'Notificação SNVS' };

function getFilteredItems(container) {
  const search = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
  const status = container.querySelector('[data-filter="status"]')?.value ?? '';
  const motivo = container.querySelector('[data-filter="motivo"]')?.value ?? '';
  let items = db.get('reclamacoes');
  if (search) items = items.filter(r =>
    (r.numero || '').toLowerCase().includes(search) ||
    (r.clienteInstituicao || '').toLowerCase().includes(search) ||
    (r.descricao || '').toLowerCase().includes(search) ||
    (r.produto || '').toLowerCase().includes(search));
  if (status) items = items.filter(r => r.status === status);
  if (motivo) items = items.filter(r => r.motivo === motivo);
  if (_extraFilter === 'atraso') {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    items = items.filter(r => isOverdue(r, hoje));
  } else if (_extraFilter === 'andamento') {
    items = items.filter(r => r.status !== 'Aberta' && !CLOSED.includes(r.status));
  } else if (_extraFilter === 'snvs') {
    items = items.filter(r => r.criticidadeTipo && r.criticidadeTipo !== 'Dispensada' && !r.dataNotificacao);
  }
  return items;
}

function refresh(container) {
  const items = getFilteredItems(container);
  const el = id => container.querySelector(id);
  if (el('#rec-pipeline'))    el('#rec-pipeline').innerHTML    = renderPipelineBar(db.get('reclamacoes'));
  if (el('#rec-queue-wrap'))  el('#rec-queue-wrap').innerHTML  = renderMinhaFila();
  if (el('#rec-kanban-wrap')) el('#rec-kanban-wrap').innerHTML = renderKanban(items);
  if (el('#rec-table-wrap'))  el('#rec-table-wrap').innerHTML  = renderTable(items);
  const n = pendingCount();
  const tab = el('[data-tab="fila"]');
  if (tab) tab.textContent = n > 0 ? `Minha Fila (${n})` : 'Minha Fila';
  const chip = el('#rec-extra-chip');
  if (chip) chip.innerHTML = _extraFilter
    ? `<span style="display:inline-flex;align-items:center;gap:6px;font-size:0.74rem;padding:4px 10px;border-radius:14px;background:var(--blue)18;color:var(--blue);font-weight:600">${EXTRA_FILTER_LABEL[_extraFilter] || _extraFilter}
        <button data-action="clear-extra" title="Limpar filtro" style="border:none;background:none;color:inherit;cursor:pointer;font-size:0.85rem;line-height:1;padding:0">✕</button></span>`
    : '';
}

function buildTabBar(active) {
  const n = pendingCount();
  return [
    { key: 'quadro', label: '▦ Quadro', urgent: false },
    { key: 'fila',   label: n > 0 ? `Minha Fila (${n})` : 'Minha Fila', urgent: n > 0 },
    { key: 'todas',  label: 'Todas', urgent: false },
  ].map(t => {
    const on = t.key === active;
    const color = on ? 'var(--blue)' : t.urgent ? 'var(--amber)' : 'var(--muted)';
    const fw = on || t.urgent ? '600' : '400';
    return `<button class="tab-btn" data-tab="${t.key}" style="padding:8px 22px;border:none;background:none;cursor:pointer;font-size:0.875rem;border-bottom:2px solid ${on ? 'var(--blue)' : 'transparent'};color:${color};font-weight:${fw}">${t.label}</button>`;
  }).join('');
}

// ── Módulo ────────────────────────────────────────────────────────────────────
export default {
  render(container) {
    const all = db.get('reclamacoes');
    container.innerHTML = `
      <div class="page-header">
        <h2>Reclamações — Registro</h2>
        ${can(getSession(), 'reclamacoesAbertura', A.CREATE) ? `<button class="btn btn-primary" data-action="new">+ Nova Reclamação</button>` : ''}
      </div>
      <div id="rec-pipeline">${renderPipelineBar(all)}</div>
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:20px">
        ${buildTabBar(_activeTab)}
      </div>
      <div id="rec-toolbar" class="toolbar" ${_activeTab === 'fila' ? 'style="display:none"' : ''}>
        <input class="toolbar-search" type="text" placeholder="Buscar por número, cliente, produto ou descrição…" data-filter="search">
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions([...STAGE_ORDER, 'Não Procedente', 'Cancelada'])}
        </select>
        <select class="toolbar-select" data-filter="motivo">
          <option value="">Todos os motivos</option>
          ${MOTIVOS.map(m => `<option value="${m}">${m}</option>`).join('')}
        </select>
        <button class="btn btn-secondary btn-sm" data-action="print-list" style="white-space:nowrap">🖨 Exportar Lista (PDF)</button>
        ${canImportForm() ? `<button class="btn btn-secondary btn-sm" data-action="import-rec" style="white-space:nowrap">⬆ Importar Formulário</button>` : ''}
        <span id="rec-extra-chip"></span>
      </div>
      <div id="tab-quadro" ${_activeTab !== 'quadro' ? 'style="display:none"' : ''}>
        <div id="rec-kanban-wrap">${renderKanban(all)}</div>
      </div>
      <div id="tab-fila" ${_activeTab !== 'fila' ? 'style="display:none"' : ''}>
        <div id="rec-queue-wrap">${renderMinhaFila()}</div>
      </div>
      <div id="tab-todas" ${_activeTab !== 'todas' ? 'style="display:none"' : ''}>
        <div class="card"><div id="rec-table-wrap">${renderTable(all)}</div></div>
      </div>
    `;
  },

  init(container) {
    // Recorte vindo de um KPI clicado na Gerencial.
    const preset = window._recPreset;
    if (preset) {
      delete window._recPreset;
      _extraFilter = (preset.startsWith('status:') || preset === 'all') ? '' : preset;
      const statusVal = preset.startsWith('status:') ? preset.slice(7) : '';
      _activeTab = 'todas';
      const set = (sel, val) => { const el = container.querySelector(sel); if (el) el.value = val; };
      set('[data-filter="status"]', statusVal);
      set('[data-filter="search"]', '');
      container.querySelectorAll('[data-tab]').forEach(b => {
        const on = b.dataset.tab === 'todas';
        b.style.borderBottomColor = on ? 'var(--blue)' : 'transparent';
        b.style.color = on ? 'var(--blue)' : 'var(--muted)';
        b.style.fontWeight = on ? '600' : '400';
      });
      ['fila', 'quadro', 'todas'].forEach(t => { const el = container.querySelector(`#tab-${t}`); if (el) el.style.display = t === 'todas' ? '' : 'none'; });
      const tb = container.querySelector('#rec-toolbar'); if (tb) tb.style.display = '';
    }
    if (preset || _extraFilter) refresh(container);

    container.addEventListener('click', e => {
      if (e.target.closest('[data-action="clear-extra"]')) { _extraFilter = ''; refresh(container); return; }
      const sortTh = e.target.closest('[data-sort]');
      if (sortTh) {
        const col = sortTh.dataset.sort;
        if (_sortCol === col) _sortDir = -_sortDir; else { _sortCol = col; _sortDir = 1; }
        refresh(container);
        return;
      }
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        _activeTab = tabBtn.dataset.tab;
        container.querySelectorAll('[data-tab]').forEach(b => {
          const on = b.dataset.tab === _activeTab;
          b.style.borderBottomColor = on ? 'var(--blue)' : 'transparent';
          b.style.color = on ? 'var(--blue)' : 'var(--muted)';
          b.style.fontWeight = on ? '600' : '400';
        });
        ['fila', 'quadro', 'todas'].forEach(t => { const el = container.querySelector(`#tab-${t}`); if (el) el.style.display = t === _activeTab ? '' : 'none'; });
        const toolbar = container.querySelector('#rec-toolbar');
        if (toolbar) toolbar.style.display = _activeTab === 'fila' ? 'none' : '';
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, next } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;
      const user = getSession();

      if (action === 'print-list') { printHtmlDocument(buildRecListPrintHtml(getFilteredItems(container))); return; }
      if (action === 'print-rec') { const r = db.getById('reclamacoes', numId); if (r) printHtmlDocument(buildRecPrintHtml(r)); return; }
      if (action === 'import-rec') {
        if (!canImportForm(user)) { toast('Importação de formulário é exclusiva da Garantia da Qualidade.', 'error'); return; }
        openImportFormReclamacaoModal(() => refresh(container));
        return;
      }

      if (action === 'new') {
        if (!can(user, 'reclamacoesAbertura', A.CREATE)) return;
        const dataHoje = today();
        openModal({
          title: 'Nova Reclamação',
          fields: buildFields(null),
          data: { numero: generateNumero(), dataAbertura: dataHoje, dataRecebimento: dataHoje, status: 'Aberta' },
          onSave: data => {
            const prazoFechamento = addDays(data.dataAbertura, 90);
            const { produto, lote } = resumoProduto(data);
            db.add('reclamacoes', { ...data, produto, lote, status: 'Aberta', prazoFechamento });
            toast('Reclamação registrada!');
            refresh(container);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('reclamacoes', numId);
        if (!record) return;
        const auth = canAct(record, user);
        openModal({
          title: `${auth ? 'Editar' : '👁 Visualizar'} Reclamação ${record.numero} — ${record.status}`,
          fields: auth ? buildFields(record) : buildFields(record).map(f => f.type !== 'heading' ? { ...f, readonly: true } : f),
          data: { ...record, produtos: legacyToProdutos(record), geraCAPA: record.geraCAPA || (record.resultado === 'Procedente' ? 'Sim' : '') },
          setup(form) {
            // Data-limite de notificação recalcula ao escolher a criticidade.
            const critEl = form.querySelector('#field-criticidadeTipo');
            const prazoEl = form.querySelector('#field-prazoNotificacao');
            if (critEl && prazoEl) {
              critEl.addEventListener('change', () => {
                const tipoKey = (CRIT_TIPOS.find(t => t.label === critEl.value) || {}).key;
                const base = form.querySelector('#field-dataAbertura')?.value || record.dataAbertura;
                prazoEl.value = (tipoKey && critPrazo(tipoKey) != null) ? addDays(base, critPrazo(tipoKey)) : '';
              });
            }
          },
          onSave: data => {
            if (!auth) return;
            // Deriva a chave da criticidade (armazena "Tipo N" a partir do rótulo escolhido).
            if (data.criticidadeTipo) {
              const hit = CRIT_TIPOS.find(t => t.label === data.criticidadeTipo || t.key === data.criticidadeTipo);
              if (hit) { data.criticidadeTipo = hit.key; if (critPrazo(hit.key) != null && !data.prazoNotificacao) data.prazoNotificacao = addDays(data.dataAbertura, critPrazo(hit.key)); }
            }
            const { produto, lote } = resumoProduto(data);
            db.update('reclamacoes', numId, { ...data, produto, lote });
            toast('Reclamação atualizada!');
            refresh(container);
          },
        });
      }

      if (action === 'advance') {
        const record = db.getById('reclamacoes', numId);
        if (!record || !canAdvance(record, user)) return;
        showConfirm(`Avançar ${record.numero} para "${next}"?`).then(ok => {
          if (!ok) return;
          const updates = { status: next };
          if (next === 'Encerrada') updates.dataFechamento = today();
          db.update('reclamacoes', numId, updates);
          toast(`Reclamação avançada para "${next}".`);
          refresh(container);
        });
      }

      if (action === 'close-direct') {
        const record = db.getById('reclamacoes', numId);
        if (!record || !canAct(record, user)) return;
        showConfirm('Encerrar esta comunicação (sem investigação)?').then(ok => {
          if (!ok) return;
          db.update('reclamacoes', numId, { status: 'Encerrada', dataFechamento: today() });
          toast('Comunicação encerrada.');
          refresh(container);
        });
      }

      if (action === 'abrir-capa') {
        const record = db.getById('reclamacoes', numId);
        if (!record || !canOpenCapa(record, user)) return;
        window._capaFromRNC = {
          origem: 'Reclamação de Cliente',
          origemEspecificar: record.numero,
          descricao: `Originada da reclamação ${record.numero}: ${record.descricao || ''}`,
          area: record.area || '',
        };
        db.update('reclamacoes', numId, { capaAberta: true });
        toast('Redirecionando para abrir CAPA…');
        window.location.hash = '#capaAbertura';
      }

      if (action === 'delete') {
        const record = db.getById('reclamacoes', numId);
        if (!record || !can(user, 'reclamacoes', A.DELETE)) { toast('Sem permissão para excluir.', 'error'); return; }
        showConfirm('Deseja excluir esta reclamação?').then(ok => {
          if (!ok) return;
          db.remove('reclamacoes', numId);
          toast('Reclamação excluída.', 'warning');
          refresh(container);
        });
      }

      if (action === 'notificar-anvisa') {
        const rec = db.getById('reclamacoes', numId);
        if (!rec) return;
        const yy = String(new Date().getFullYear()).slice(2);
        const seqTecno = db.get('tecno').filter(t => (t.numero || '').includes(`/TEC/${yy}`)).length + 1;
        const novoNumero = `NOT.${String(seqTecno).padStart(3, '0')}/TEC/${yy}`;
        openModal({
          title: `Nova Notificação ANVISA — de ${rec.numero}`,
          fields: [
            { id: 'numero', label: 'Número', type: 'text', required: true, span: 1 },
            { id: 'tipo', label: 'Tipo', type: 'select', required: true, span: 1, options: TIPOS_TECNO },
            { id: 'produto', label: 'Produto', type: 'text', required: true, span: 2 },
            { id: 'descricao', label: 'Descrição', type: 'textarea', required: true, span: 2 },
            { id: 'data', label: 'Data de Abertura', type: 'date', required: true, span: 1 },
            { id: 'prazoAnvisa', label: 'Prazo ANVISA', type: 'date', required: false, span: 1 },
            { id: 'status', label: 'Status', type: 'select', required: true, span: 2, options: STATUS.TECNO },
            { id: 'reclamacaoOrigem', label: 'Reclamação de Origem', type: 'text', required: false, span: 1, readonly: true },
          ],
          data: {
            numero: novoNumero, tipo: 'Queixa Técnica', produto: rec.produto || '',
            descricao: rec.descricao || '', data: today(), status: 'Aberto',
            prazoAnvisa: rec.prazoNotificacao || '', reclamacaoOrigem: rec.numero,
          },
          onSave: data => {
            db.add('tecno', data);
            db.update('reclamacoes', numId, { numeroTecnovig: data.numero, geraTecnovig: 'Sim' });
            toast(`Notificação ${data.numero} criada e vinculada a ${rec.numero}!`);
            refresh(container);
          },
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) refresh(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) refresh(container); });
  },
};
