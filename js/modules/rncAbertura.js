/**
 * @fileoverview RNC — Fluxo de Trabalho (POP-GQ-008)
 * Workflow QMS com controle de acesso por etapa e área.
 */

import { db } from '../db.js';
import { formatDate, deadlineCell, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, TIPOS_NC, FERRAMENTAS_INVEST, DISPOSICOES_NC } from '../constants.js';

const AREAS     = ['GQ', 'Produção', 'P&D', 'Regulatório', 'Logística', 'Compras', 'RH', 'TI', 'Fábrica', 'Outros'];
const RISK_LVL  = ['Baixa', 'Média', 'Alta'];
const PERIOD_VER = ['3 meses', '6 meses', '9 meses', '12 meses'];
const CLOSED    = ['Encerrada', 'Cancelada', 'Não Procedente'];

// ── Workflow stages ──────────────────────────────────────────────────────────

const STAGE_ORDER = [
  'Aberta', 'Em Avaliação', 'Em Investigação',
  'Em Plano de Ação', 'Verificação de Eficácia', 'Encerrada',
];

const PIPELINE = [
  { key: 'Aberta',                  label: 'Abertura',        color: 'var(--red)'    },
  { key: 'Em Avaliação',            label: 'Avaliação GQ',    color: 'var(--purple)' },
  { key: 'Em Investigação',         label: 'Investigação',    color: 'var(--blue)'   },
  { key: 'Em Plano de Ação',        label: 'Plano de Ação',   color: 'var(--amber)'  },
  { key: 'Verificação de Eficácia', label: 'Verif. Eficácia', color: 'var(--teal)'   },
  { key: 'Encerrada',               label: 'Encerramento',    color: 'var(--green)'  },
];

const NEXT_STATUS = {
  'Aberta':                   'Em Avaliação',
  'Em Avaliação':             'Em Investigação',
  'Em Investigação':          'Em Plano de Ação',
  'Em Plano de Ação':         'Verificação de Eficácia',
  'Verificação de Eficácia':  'Encerrada',
};

// Matriz de responsabilidade por etapa (POP-GQ-008)
const STAGE_OWNER = {
  'Aberta':                   { label: 'Área de Origem',            color: '#3b82f6' },
  'Em Avaliação':             { label: 'Garantia da Qualidade',     color: '#9333ea' },
  'Em Investigação':          { label: 'Equipe / GQ',               color: '#3b82f6' },
  'Em Plano de Ação':         { label: 'GQ · Melhoria Contínua',    color: '#f59e0b' },
  'Verificação de Eficácia':  { label: 'Garantia da Qualidade',     color: '#14b8a6' },
  'Encerrada':                { label: 'Garantia da Qualidade',     color: '#22c55e' },
};

// ── Permission logic ─────────────────────────────────────────────────────────

const USER_KEY = 'sgq_rnc_user';
let _user = (() => {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
})();

function getUser()  { return _user; }
function setUser(u) { _user = u; u ? localStorage.setItem(USER_KEY, JSON.stringify(u)) : localStorage.removeItem(USER_KEY); }

function canAct(record, user = getUser()) {
  if (!user) return true;
  const s = record?.status;
  if (s === 'Aberta')                   return !record.area || record.area === user.area || user.area === 'GQ';
  if (s === 'Em Avaliação')             return user.area === 'GQ';
  if (s === 'Em Investigação')          return user.area === 'GQ' || user.nome === record.liderInvestigacao;
  if (s === 'Em Plano de Ação')         return user.area === 'GQ' || user.area === 'MC';
  if (s === 'Verificação de Eficácia')  return user.area === 'GQ';
  if (s === 'Encerrada')                return user.area === 'GQ';
  return false;
}

function ownerLabel(record) {
  const o = STAGE_OWNER[record.status];
  if (!o) return record.status;
  return record.status === 'Aberta' && record.area ? `Área: ${record.area}` : o.label;
}

function pendingCount(user) {
  if (!user) return 0;
  return db.get('rnc').filter(r => !CLOSED.includes(r.status) && canAct(r, user)).length;
}

// ── Risk matrix ───────────────────────────────────────────────────────────────

const RISK_MATRIX = {
  'Alta':  { 'Baixa': 'Maior',  'Média': 'Crítica', 'Alta': 'Crítica' },
  'Média': { 'Baixa': 'Menor',  'Média': 'Maior',   'Alta': 'Crítica' },
  'Baixa': { 'Baixa': 'Menor',  'Média': 'Menor',   'Alta': 'Maior'   },
};
const calcRisco = (prob, sev) => RISK_MATRIX[prob]?.[sev] ?? '';

function stageIdx(status) {
  const i = STAGE_ORDER.indexOf(status);
  return i >= 0 ? i : status === 'Não Procedente' ? 1 : STAGE_ORDER.length;
}

function generateNumero() {
  const yy = String(new Date().getFullYear()).slice(2);
  const n  = db.get('rnc').filter(r => (r.numero || '').endsWith(`/${yy}`)).length + 1;
  return `RNC.${String(n).padStart(3, '0')}/${yy}`;
}

// ── UI: user bar ─────────────────────────────────────────────────────────────

function renderUserBar() {
  const u = getUser();
  const n = pendingCount(u);
  return u
    ? `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;margin-bottom:16px;flex-wrap:wrap">
        <span style="font-size:0.78rem;color:var(--muted)">Operando como:</span>
        <strong style="font-size:0.84rem">${u.nome}</strong>
        <span class="pill ${u.area === 'GQ' ? 'pill-purple' : 'pill-blue'}" style="font-size:0.72rem">${u.area}</span>
        ${n > 0 ? `<span style="font-size:0.78rem;color:var(--amber);font-weight:600">· ${n} ${n > 1 ? 'ações' : 'ação'} pendente${n > 1 ? 's' : ''}</span>` : '<span style="font-size:0.78rem;color:var(--green)">· fila em dia ✓</span>'}
        <button class="btn btn-secondary btn-sm" data-action="trocar-user" style="margin-left:auto">Trocar perfil</button>
        <button class="btn btn-secondary btn-sm" data-action="limpar-user" style="color:var(--muted)">× Sair</button>
      </div>`
    : `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--surface);border:1px dashed var(--border);border-radius:8px;margin-bottom:16px;flex-wrap:wrap">
        <span style="font-size:0.82rem;color:var(--muted)">🔓 Nenhum perfil selecionado — acesso irrestrito (modo admin)</span>
        <button class="btn btn-primary btn-sm" data-action="trocar-user" style="margin-left:auto">Selecionar Perfil</button>
      </div>`;
}

function openUserSelector(onDone) {
  const nomes = db.get('equipe').map(m => m.nome);
  openModal({
    title: 'Selecionar Perfil de Acesso',
    fields: [
      { id: 'nome', label: 'Seu nome',              type: 'select', required: true, span: 2, options: nomes.length ? nomes : ['—'] },
      { id: 'area', label: 'Sua área / departamento', type: 'select', required: true, span: 2, options: AREAS },
    ],
    data: getUser() ?? {},
    onSave: data => { setUser({ nome: data.nome, area: data.area }); onDone(); },
  });
}

// ── UI: stage stepper ─────────────────────────────────────────────────────────

function renderStepper(status) {
  if (['Não Procedente', 'Cancelada'].includes(status)) {
    return `<div style="display:flex;align-items:center;justify-content:center;padding:10px 0 14px">
      <span class="pill pill-red">${status}</span></div>`;
  }
  const cur = stageIdx(status);
  return `<div style="display:flex;align-items:center;gap:0;padding:10px 0 14px;overflow-x:auto">
    ${PIPELINE.map((p, i) => {
      const done   = i < cur;
      const active = i === cur;
      const bdCol  = done ? '#22c55e' : active ? p.color : 'var(--border)';
      const bgFill = done ? '#22c55e' : active ? p.color : 'var(--surface)';
      const textC  = active ? p.color : done ? '#22c55e' : 'var(--muted)';
      return `${i > 0 ? `<div style="flex:1;height:2px;background:${done ? '#22c55e' : 'var(--border)'};min-width:10px"></div>` : ''}
        <div style="display:flex;flex-direction:column;align-items:center;gap:3px;min-width:56px">
          <div style="width:24px;height:24px;border-radius:50%;background:${bgFill};border:2px solid ${bdCol};display:flex;align-items:center;justify-content:center;font-size:0.7rem;font-weight:700;color:${done ? 'white' : active ? 'white' : 'var(--muted)'}">
            ${done ? '✓' : i + 1}
          </div>
          <span style="font-size:0.61rem;text-align:center;line-height:1.2;color:${textC};font-weight:${active ? '700' : '400'};max-width:56px">${p.label}</span>
        </div>`;
    }).join('')}
  </div>`;
}

// ── UI: minha fila ────────────────────────────────────────────────────────────

const RISK_PILL = { 'Menor': 'pill-blue', 'Maior': 'pill-amber', 'Crítica': 'pill-red' };

function renderMinhaFila() {
  const user = getUser();
  if (!user) {
    return `<div style="text-align:center;padding:48px 24px">
      <div style="font-size:2.5rem;margin-bottom:12px">🔐</div>
      <div style="font-size:0.95rem;font-weight:600;margin-bottom:6px">Selecione seu perfil</div>
      <div style="font-size:0.82rem;color:var(--muted);margin-bottom:20px">Cada área vê apenas as RNCs que requerem sua ação</div>
      <button class="btn btn-primary" data-action="trocar-user">Selecionar Perfil</button>
    </div>`;
  }

  const hoje    = new Date(); hoje.setHours(0, 0, 0, 0);
  const pending = db.get('rnc').filter(r => !CLOSED.includes(r.status) && canAct(r, user));

  if (!pending.length) {
    return `<div style="text-align:center;padding:48px 24px">
      <div style="font-size:2.5rem;margin-bottom:12px">✅</div>
      <div style="font-size:0.95rem;font-weight:600;margin-bottom:6px">Fila em dia!</div>
      <div style="font-size:0.82rem;color:var(--muted)">Nenhuma RNC aguarda ação de ${user.area}</div>
    </div>`;
  }

  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
    ${pending.map(r => {
      const stage    = PIPELINE.find(p => p.key === r.status) ?? PIPELINE[0];
      const si       = stageIdx(r.status);
      const owner    = STAGE_OWNER[r.status];
      const emAtraso = r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje;
      const nextSt   = NEXT_STATUS[r.status];
      const dias     = r.dataAbertura
        ? Math.round((hoje - new Date(r.dataAbertura + 'T00:00:00')) / 86400000) + 'd'
        : '';
      return `<div style="border:1px solid var(--border);border-top:3px solid ${stage.color};border-radius:8px;padding:14px;background:var(--surface);display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-weight:700;font-size:0.9rem">${r.numero}</div>
            <div style="font-size:0.71rem;color:var(--muted);margin-top:2px">${r.area || '—'} · ${r.tipo || '—'}</div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
            ${r.classificacaoRisco ? `<span class="pill ${RISK_PILL[r.classificacaoRisco] ?? 'pill-gray'}" style="font-size:0.67rem">${r.classificacaoRisco}</span>` : ''}
            ${emAtraso ? `<span style="font-size:0.67rem;color:var(--red);font-weight:700">⚠ atraso</span>` : ''}
          </div>
        </div>
        <div style="font-size:0.8rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden" title="${r.descricao}">${r.descricao}</div>
        <div style="display:flex;gap:1px;height:4px;border-radius:2px;overflow:hidden">
          ${PIPELINE.map((p, i) => `<div style="flex:1;background:${i < si ? '#22c55e' : i === si ? p.color : 'var(--border)'}"></div>`).join('')}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:0.72rem;font-weight:700;color:${stage.color}">${stage.label}</span>
          ${dias ? `<span style="font-size:0.7rem;color:var(--muted)">${dias} aberta</span>` : ''}
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-primary btn-sm" data-action="edit" data-id="${r.id}" style="flex:1">✏ Preencher Etapa</button>
          ${nextSt ? `<button class="btn btn-secondary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nextSt}" title="Encaminhar para: ${STAGE_OWNER[nextSt]?.label ?? nextSt}">▶</button>` : ''}
        </div>
      </div>`;
    }).join('')}
  </div>`;
}

// ── UI: pipeline bar ──────────────────────────────────────────────────────────

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

// ── UI: full table ────────────────────────────────────────────────────────────

function renderTable(items) {
  if (!items.length) return emptyState('Nenhuma RNC encontrada.');
  const user = getUser();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  function diasAberto(r) {
    if (!r.dataAbertura) return '—';
    const ini = new Date(r.dataAbertura + 'T00:00:00');
    const fim = r.dataFechamento ? new Date(r.dataFechamento + 'T00:00:00') : hoje;
    const d   = Math.round((fim - ini) / 86400000);
    const atrasado = !CLOSED.includes(r.status) && r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje;
    return `<span style="color:${atrasado ? 'var(--red)' : 'inherit'};font-weight:${atrasado ? '600' : 'normal'}">${d}d</span>`;
  }

  return `<div class="table-wrap"><table>
    <thead><tr>
      <th>Número</th><th>Tipo</th><th>Descrição</th><th>Área</th>
      <th>T. Aberto</th><th>Risco</th><th>Status</th><th>Responsável p/ Etapa</th><th>Ações</th>
    </tr></thead>
    <tbody>
      ${items.map(r => {
        const auth     = canAct(r, user);
        const nextSt   = NEXT_STATUS[r.status];
        const own      = STAGE_OWNER[r.status];
        const ownLbl   = ownerLabel(r);
        const ownColor = own?.color ?? '#94a3b8';
        const risco    = r.classificacaoRisco
          ? `<span class="pill ${RISK_PILL[r.classificacaoRisco] ?? 'pill-gray'}">${r.classificacaoRisco}</span>` : '—';
        const capaBtn  = r.necessitaCapa === 'Sim' && !r.capaAberta
          ? `<button class="btn btn-secondary btn-sm" data-action="abrir-capa" data-id="${r.id}" title="Abrir CAPA">📋</button>` : '';
        const npBtn    = r.status === 'Em Avaliação' && auth
          ? `<button class="btn btn-secondary btn-sm" data-action="nao-procedente" data-id="${r.id}" title="Marcar Não Procedente" style="color:var(--muted)">✕ NP</button>` : '';
        const advBtn   = nextSt
          ? auth
            ? `<button class="btn btn-secondary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nextSt}" title="Avançar para ${nextSt}">▶</button>`
            : `<button class="btn btn-secondary btn-sm" disabled title="Pertence a: ${ownLbl}" style="opacity:0.35;cursor:not-allowed">▶</button>`
          : '';
        return `<tr>
          <td><strong>${r.numero}</strong></td>
          <td style="white-space:nowrap;font-size:0.8rem">${r.tipo || '—'}</td>
          <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
          <td>${r.area || '—'}</td>
          <td style="text-align:center">${diasAberto(r)}</td>
          <td>${risco}</td>
          <td>${statusPill(r.encerradoStatus || r.status)}</td>
          <td style="white-space:nowrap">
            <span style="font-size:0.71rem;padding:2px 7px;border-radius:4px;background:${ownColor}18;color:${ownColor};font-weight:600">${ownLbl}</span>
            ${auth && !CLOSED.includes(r.status) ? '<span title="Você pode agir nesta etapa" style="margin-left:4px;color:var(--green);font-size:0.72rem">✓</span>' : ''}
          </td>
          <td>
            <div class="td-actions">
              ${advBtn}
              ${npBtn}
              <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="${auth ? 'Editar' : 'Visualizar — etapa pertence a ' + ownLbl}">${auth ? '✏' : '👁'}</button>
              ${capaBtn}
              <button class="btn btn-danger btn-sm" data-action="delete" data-id="${r.id}">🗑</button>
            </div>
          </td>
        </tr>`;
      }).join('')}
    </tbody>
  </table></div>`;
}

// ── Build form fields ─────────────────────────────────────────────────────────

function buildFields(record = null) {
  const resp    = db.get('equipe').map(m => m.nome);
  const status  = record?.status ?? 'Aberta';
  const cur     = stageIdx(status);
  const isTerminal = ['Não Procedente', 'Cancelada'].includes(status);

  function f(stg, def) {
    const si = STAGE_ORDER.indexOf(stg);
    return (isTerminal || si < cur) ? { ...def, readonly: true } : def;
  }
  function h(label, stg) {
    const si = STAGE_ORDER.indexOf(stg);
    const own = STAGE_OWNER[stg];
    const sublabel = own ? ` — ${own.label}` : '';
    return { id: `_h_${stg}`, type: 'heading', label: label + sublabel, locked: isTerminal || si < cur, span: 2 };
  }

  const base = [
    f('Aberta', { id: 'numero',              label: '1.1  Nº RNC',                                              type: 'text',        required: true,  span: 1, readonly: true }),
    f('Aberta', { id: 'dataAbertura',        label: '1.2  Data de Abertura',                                    type: 'date',        required: true,  span: 1 }),
    f('Aberta', { id: 'responsavel',         label: '1.3  Responsável pela Abertura',                           type: 'select',      required: true,  span: 1, options: resp.length ? resp : ['—'] }),
    f('Aberta', { id: 'area',               label: '1.4  Área',                                                type: 'select',      required: true,  span: 1, options: AREAS }),
    f('Aberta', { id: 'tipo',               label: '1.5  Tipo de NC',                                          type: 'select',      required: true,  span: 2, options: TIPOS_NC }),
    f('Aberta', { id: 'produto',            label: 'Nome / Produto / Processo / Equipamento',                   type: 'text',        required: false, span: 2 }),
    f('Aberta', { id: 'lote',              label: 'Lote',                                                      type: 'text',        required: false, span: 1 }),
    f('Aberta', { id: 'dataFabricacao',    label: 'Data de Fabricação',                                        type: 'date',        required: false, span: 1 }),
    f('Aberta', { id: 'dataValidade',      label: 'Data de Validade',                                          type: 'date',        required: false, span: 1 }),
    f('Aberta', { id: 'codigoEquipamento', label: 'Código do Equipamento',                                      type: 'text',        required: false, span: 1 }),
    f('Aberta', { id: 'numeroREC',         label: 'Nº REC  (Reclamação de Cliente)',                            type: 'text',        required: false, span: 1 }),
    f('Aberta', { id: 'especificar',       label: 'Especificar  (Processos / Docs / Outros)',                   type: 'text',        required: false, span: 2 }),
    f('Aberta', { id: 'descricao',         label: '1.6  Descrição da Ocorrência / Identificação do Problema',  type: 'textarea',    required: true,  span: 2 }),
    f('Aberta', { id: 'abrangencia',       label: '2.  Abrangência',                                           type: 'select',      required: false, span: 2,
      options: ['Outro(s) Produto(s)', 'Outro(s) Lote(s)', 'Outra(s) Máquina(s)', 'Outro(s) Dispositivo(s) de Medição', 'Outro(s) Documento(s)', 'Não se aplica', 'Outro(s)'] }),
    f('Aberta', { id: 'abrangenciaEspecificar', label: '    Especificar Abrangência',                           type: 'text',        required: false, span: 2 }),
    f('Aberta', { id: 'acoesImediatas',    label: '3.  Ações de Contenção / Imediatas',                         type: 'acoes-table', required: false, span: 2 }),
  ];

  if (!record) return base;

  const fields = [h('ETAPA 1 — ABERTURA', 'Aberta'), ...base];

  if (cur >= 1) {
    fields.push(
      h('ETAPA 2 — AVALIAÇÃO', 'Em Avaliação'),
      f('Em Avaliação', { id: 'recorrencia',        label: '4.1  Recorrência (últimos 2 anos)?',      type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Em Avaliação', { id: 'rncAnterior',        label: '      RNCs anteriores (se recorrente)',   type: 'text',     required: false, span: 2 }),
      f('Em Avaliação', { id: 'severidade',         label: '4.2  Severidade',                         type: 'select',   required: false, span: 1, options: RISK_LVL }),
      f('Em Avaliação', { id: 'probabilidade',      label: '      Probabilidade',                     type: 'select',   required: false, span: 1, options: RISK_LVL }),
      f('Em Avaliação', { id: 'classificacaoRisco', label: '      Risco  (Prob × Sev)',               type: 'text',     required: false, span: 1, readonly: true }),
      f('Em Avaliação', { id: 'procedente',         label: '5.   Procedente?',                        type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Em Avaliação', { id: 'classificacao',      label: '      Classificação',                     type: 'select',   required: false, span: 1, options: ['Menor', 'Maior', 'Crítica'] }),
      f('Em Avaliação', { id: 'justificativaNP',    label: '      Justificativa (Não Procedente)',    type: 'textarea', required: false, span: 2 }),
      f('Em Avaliação', { id: 'prazoInvestigacao',  label: '      Prazo Investigação (D+15)',         type: 'date',     required: false, span: 1 }),
    );
  }

  if (cur >= 2) {
    fields.push(
      h('ETAPA 3 — INVESTIGAÇÃO', 'Em Investigação'),
      f('Em Investigação', { id: 'liderInvestigacao',       label: '6.   Líder da Investigação',          type: 'select',   required: false, span: 1, options: resp.length ? resp : ['—'] }),
      f('Em Investigação', { id: 'equipeInvestigacao',      label: '      Equipe de Investigação',        type: 'text',     required: false, span: 2 }),
      f('Em Investigação', { id: 'fontesInformacao',        label: '7.   Fonte de Informações / Dados',   type: 'text',     required: false, span: 2 }),
      f('Em Investigação', { id: 'resumoInvestigacao',      label: '8.   Resumo da Investigação',         type: 'textarea', required: false, span: 2 }),
      f('Em Investigação', { id: 'porques',                 label: '9.1  5 Porquês',                      type: 'textarea', required: false, span: 2 }),
      f('Em Investigação', { id: 'ferramentasInvestigacao', label: '9.2  Outras Ferramentas da Qualidade',type: 'select',   required: false, span: 1, options: FERRAMENTAS_INVEST }),
      f('Em Investigação', { id: 'causaRaiz',               label: '9.3  Causa(s) Raiz(ízes)',            type: 'textarea', required: false, span: 2 }),
      f('Em Investigação', { id: 'observacoes',             label: '10.  Observação',                      type: 'textarea', required: false, span: 2 }),
    );
  }

  if (cur >= 3) {
    fields.push(
      h('ETAPA 4 — PLANO DE AÇÃO', 'Em Plano de Ação'),
      f('Em Plano de Ação', { id: 'disposicao',              label: 'Disposição',                      type: 'select',   required: false, span: 1, options: DISPOSICOES_NC }),
      f('Em Plano de Ação', { id: 'numFormularioRetrabalho', label: 'Nº Formulário de Retrabalho',     type: 'text',     required: false, span: 1 }),
      f('Em Plano de Ação', { id: 'necessitaCapa',           label: 'Necessita CAPA?',                 type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] }),
      f('Em Plano de Ação', { id: 'prazoFinalizacao',        label: 'Prazo de Finalização do Plano',   type: 'date',     required: false, span: 1 }),
    );
  }

  if (cur >= 4) {
    fields.push(
      h('ETAPA 5 — VERIFICAÇÃO DE EFICÁCIA', 'Verificação de Eficácia'),
      f('Verificação de Eficácia', { id: 'periodoVerificacao',    label: 'Período de Verificação',   type: 'select',   required: false, span: 1, options: PERIOD_VER }),
      f('Verificação de Eficácia', { id: 'dataInicioVerificacao', label: 'Início da Verificação',    type: 'date',     required: false, span: 1 }),
      f('Verificação de Eficácia', { id: 'resultadoVerificacao',  label: 'Resultado da Verificação', type: 'textarea', required: false, span: 2 }),
      f('Verificação de Eficácia', { id: 'foiEficaz',             label: 'Foi Eficaz?',              type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] }),
    );
  }

  if (cur >= 5) {
    fields.push(
      h('ETAPA 6 — ENCERRAMENTO', 'Encerrada'),
      f('Encerrada', { id: 'alteracaoDocumentos', label: 'Houve alteração de docs. do SGQ?',    type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Encerrada', { id: 'codigosDocumentos',   label: 'Códigos dos documentos alterados',     type: 'text',     required: false, span: 2 }),
      f('Encerrada', { id: 'impactoMSB',          label: 'Houve impacto das ações para a MSB?', type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Encerrada', { id: 'descricaoImpacto',    label: 'Descrever o impacto',                  type: 'textarea', required: false, span: 2 }),
      f('Encerrada', { id: 'dataFechamento',       label: 'Data de Fechamento',                   type: 'date',     required: false, span: 1 }),
    );
  }

  return fields;
}

// ── Refresh ───────────────────────────────────────────────────────────────────

function refresh(container) {
  const search = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
  const status = container.querySelector('[data-filter="status"]')?.value ?? '';
  const tipo   = container.querySelector('[data-filter="tipo"]')?.value ?? '';
  const area   = container.querySelector('[data-filter="area"]')?.value ?? '';
  let items = db.get('rnc');
  if (search) items = items.filter(r =>
    (r.numero || '').toLowerCase().includes(search) ||
    (r.descricao || '').toLowerCase().includes(search) ||
    (r.produto || '').toLowerCase().includes(search)
  );
  if (status) items = items.filter(r => r.status === status);
  if (tipo)   items = items.filter(r => r.tipo === tipo);
  if (area)   items = items.filter(r => r.area === area);

  const el = id => container.querySelector(id);
  if (el('#rnc-user-bar'))   el('#rnc-user-bar').innerHTML   = renderUserBar();
  if (el('#rnc-pipeline'))   el('#rnc-pipeline').innerHTML   = renderPipelineBar(db.get('rnc'));
  if (el('#rnc-queue-wrap')) el('#rnc-queue-wrap').innerHTML = renderMinhaFila();
  if (el('#rnc-table-wrap')) el('#rnc-table-wrap').innerHTML = renderTable(items);

  // Update tab badge
  const user = getUser();
  const n    = pendingCount(user);
  const tab  = el('[data-tab="fila"]');
  if (tab) tab.textContent = n > 0 ? `Minha Fila (${n})` : 'Minha Fila';
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

let _activeTab = 'fila';

function buildTabBar(active) {
  const user = getUser();
  const n    = pendingCount(user);
  return [
    { key: 'fila',  label: n > 0 ? `Minha Fila (${n})` : 'Minha Fila', urgent: n > 0 },
    { key: 'todas', label: 'Todas as RNCs', urgent: false },
  ].map(t => {
    const on    = t.key === active;
    const color = on ? 'var(--blue)' : t.urgent ? 'var(--amber)' : 'var(--muted)';
    const fw    = on || t.urgent ? '600' : '400';
    return `<button class="tab-btn" data-tab="${t.key}" style="padding:8px 22px;border:none;background:none;cursor:pointer;font-size:0.875rem;border-bottom:2px solid ${on ? 'var(--blue)' : 'transparent'};color:${color};font-weight:${fw}">${t.label}</button>`;
  }).join('');
}

// ── Export ────────────────────────────────────────────────────────────────────

export default {
  render(container) {
    const allRnc = db.get('rnc');
    container.innerHTML = `
      <div class="page-header">
        <h2>RNC — Fluxo de Trabalho</h2>
        <button class="btn btn-primary" data-action="new">+ Nova RNC</button>
      </div>
      <div id="rnc-user-bar">${renderUserBar()}</div>
      <div id="rnc-pipeline">${renderPipelineBar(allRnc)}</div>
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:20px">
        ${buildTabBar(_activeTab)}
      </div>
      <div id="tab-fila"  ${_activeTab !== 'fila'  ? 'style="display:none"' : ''}>
        <div id="rnc-queue-wrap">${renderMinhaFila()}</div>
      </div>
      <div id="tab-todas" ${_activeTab !== 'todas' ? 'style="display:none"' : ''}>
        <div class="toolbar">
          <input class="toolbar-search" type="text" placeholder="Buscar por número, produto ou descrição…" data-filter="search">
          <select class="toolbar-select" data-filter="status">
            <option value="">Todos os status</option>
            ${selectOptions(STATUS.RNC)}
          </select>
          <select class="toolbar-select" data-filter="tipo">
            <option value="">Todos os tipos</option>
            ${TIPOS_NC.map(t => `<option value="${t}">${t}</option>`).join('')}
          </select>
          <select class="toolbar-select" data-filter="area">
            <option value="">Todas as áreas</option>
            ${AREAS.map(a => `<option value="${a}">${a}</option>`).join('')}
          </select>
        </div>
        <div class="card">
          <div id="rnc-table-wrap">${renderTable(allRnc)}</div>
        </div>
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      // Tab switching
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        _activeTab = tabBtn.dataset.tab;
        container.querySelectorAll('[data-tab]').forEach(b => {
          const on = b.dataset.tab === _activeTab;
          b.style.borderBottomColor = on ? 'var(--blue)' : 'transparent';
          b.style.color      = on ? 'var(--blue)' : 'var(--muted)';
          b.style.fontWeight = on ? '600' : '400';
        });
        ['fila', 'todas'].forEach(t => {
          const el = container.querySelector(`#tab-${t}`);
          if (el) el.style.display = t === _activeTab ? '' : 'none';
        });
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, next } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;
      const user  = getUser();

      if (action === 'trocar-user') { openUserSelector(() => refresh(container)); return; }
      if (action === 'limpar-user') { setUser(null); refresh(container); return; }

      if (action === 'new') {
        openModal({
          title: 'Nova RNC',
          fields: buildFields(null),
          data: { numero: generateNumero(), dataAbertura: today(), status: 'Aberta' },
          onSave: data => {
            db.add('rnc', { ...data, status: 'Aberta' });
            toast('RNC criada com sucesso!');
            refresh(container);
          },
        });
        return;
      }

      if (action === 'edit') {
        const record = db.getById('rnc', numId);
        if (!record) return;
        const auth = canAct(record, user);
        openModal({
          title: `${auth ? 'Editar' : '👁 Visualizar'} RNC ${record.numero} — ${record.status}`,
          fields: auth ? buildFields(record) : buildFields(record).map(f => f.type !== 'heading' ? { ...f, readonly: true } : f),
          data: record,
          setup(form) {
            // Inject stepper
            const stepperDiv = document.createElement('div');
            stepperDiv.style.cssText = 'border-bottom:1px solid var(--border);margin-bottom:14px';
            stepperDiv.innerHTML = renderStepper(record.status);
            form.insertBefore(stepperDiv, form.firstChild);

            // Permission notice
            if (!auth && !CLOSED.includes(record.status)) {
              const notice = document.createElement('div');
              notice.style.cssText = 'padding:10px 14px;background:#f59e0b18;border:1px solid #f59e0b40;border-radius:6px;margin-bottom:14px;font-size:0.8rem;color:#92400e';
              notice.innerHTML = `🔒 <strong>Somente leitura.</strong> Esta etapa pertence a: <strong>${ownerLabel(record)}</strong>`;
              form.insertBefore(notice, form.children[1]);
            }

            // Risk matrix live update
            if (auth) {
              const sevEl   = form.querySelector('#field-severidade');
              const probEl  = form.querySelector('#field-probabilidade');
              const riscoEl = form.querySelector('#field-classificacaoRisco');
              const clasEl  = form.querySelector('#field-classificacao');
              if (sevEl && probEl) {
                const update = () => {
                  const r = calcRisco(probEl.value, sevEl.value);
                  if (riscoEl) riscoEl.value = r;
                  if (clasEl && clasEl.getAttribute('tabindex') !== '-1') clasEl.value = r;
                };
                sevEl.addEventListener('change', update);
                probEl.addEventListener('change', update);
              }
            }
          },
          onSave: data => {
            if (!auth) return;
            const risco = calcRisco(data.probabilidade, data.severidade);
            db.update('rnc', numId, { ...data, classificacaoRisco: risco || data.classificacaoRisco });
            toast('RNC atualizada!');
            refresh(container);
          },
        });
        return;
      }

      if (action === 'advance') {
        const record = db.getById('rnc', numId);
        if (!record) return;
        if (!canAct(record, user)) { toast('Sem permissão para avançar esta etapa.', 'error'); return; }
        const nextOwner = STAGE_OWNER[next];
        showConfirm(`Encaminhar "${record.numero}" para "${next}"?\n\nPróximo responsável: ${nextOwner?.label ?? next}`).then(ok => {
          if (!ok) return;
          const updates = { status: next };
          if (next === 'Encerrada') {
            const dtFech = today();
            updates.dataFechamento = dtFech;
            if (record.prazoFinalizacao) {
              updates.encerradoStatus = dtFech <= record.prazoFinalizacao ? 'Finalizado no prazo' : 'Finalizado em atraso';
            }
          }
          db.update('rnc', numId, updates);
          toast(`✅ Encaminhado para "${next}" → ${nextOwner?.label ?? next}`);
          refresh(container);
        });
        return;
      }

      if (action === 'nao-procedente') {
        const record = db.getById('rnc', numId);
        if (!record || !canAct(record, user)) { toast('Sem permissão para esta ação.', 'error'); return; }
        showConfirm('Marcar esta RNC como Não Procedente e encerrá-la?').then(ok => {
          if (!ok) return;
          db.update('rnc', numId, { status: 'Não Procedente', dataFechamento: today() });
          toast('RNC encerrada como Não Procedente.');
          refresh(container);
        });
        return;
      }

      if (action === 'abrir-capa') {
        const record = db.getById('rnc', numId);
        if (!record) return;
        showConfirm(`Abrir uma CAPA a partir de ${record.numero}?`).then(async ok => {
          if (!ok) return;
          window._capaFromRNC = { origem: 'RNC/CAPA', descricao: `[RNC ${record.numero}] ${record.descricao}`, area: record.area || '' };
          db.update('rnc', numId, { capaAberta: true });
          const m = await import('../app.js');
          m.router.navigate('capaAbertura');
        });
        return;
      }

      if (action === 'delete') {
        showConfirm('Deseja excluir esta RNC?').then(ok => {
          if (!ok) return;
          db.remove('rnc', numId);
          toast('RNC excluída.', 'warning');
          refresh(container);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) refresh(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) refresh(container); });
  },
};
