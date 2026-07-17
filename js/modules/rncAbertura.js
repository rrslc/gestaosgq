/**
 * @fileoverview RNC — Fluxo de Trabalho (POP-GQ-008)
 * Workflow QMS com controle de acesso por etapa e área.
 */

import { db } from '../db.js';
import { formatDate, deadlineCell, statusPill, emptyState, selectOptions, today } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, TIPOS_NC, FERRAMENTAS_INVEST, DISPOSICOES_NC, AREAS_MSB } from '../constants.js';
import { getSession } from '../session.js';
import { can, A } from '../permissions.js';

const AREAS     = AREAS_MSB;
const RISK_LVL  = ['Baixa', 'Média', 'Alta'];
const PERIOD_VER = ['3 meses', '6 meses', '9 meses', '12 meses'];
const CLOSED    = ['Encerrada', 'Cancelada', 'Não Procedente'];

// ── Workflow stages (conforme fluxograma POP-GQ-008) ─────────────────────────

const STAGE_ORDER = [
  'Aberta', 'Em Avaliação', 'Em Investigação', 'Em Disposição',
  'Em Plano de Ação', 'Verificação de Eficácia', 'Encerrada',
];

const PIPELINE = [
  { key: 'Aberta',                  label: 'Abertura',        color: 'var(--red)'    },
  { key: 'Em Avaliação',            label: 'Avaliação GQ',    color: 'var(--purple)' },
  { key: 'Em Investigação',         label: 'Investigação',    color: 'var(--blue)'   },
  { key: 'Em Disposição',           label: 'Disposição',      color: 'var(--orange,#ea580c)' },
  { key: 'Em Plano de Ação',        label: 'Plano de Ação',   color: 'var(--amber)'  },
  { key: 'Verificação de Eficácia', label: 'Verif. Eficácia', color: 'var(--teal)'   },
  { key: 'Encerrada',               label: 'Encerramento',    color: 'var(--green)'  },
];

// Próxima etapa "padrão". A saída de "Em Avaliação" é dinâmica (ver nextStatusFor):
// NC Menor pula a Investigação e vai direto para Disposição (bypass do fluxograma).
const NEXT_STATUS = {
  'Aberta':                   'Em Avaliação',
  'Em Avaliação':             'Em Investigação',
  'Em Investigação':          'Em Disposição',
  'Em Disposição':            'Em Plano de Ação',
  'Em Plano de Ação':         'Verificação de Eficácia',
  'Verificação de Eficácia':  'Encerrada',
};

/** Próxima etapa considerando o bypass de NC Menor (pula Investigação). */
function nextStatusFor(record) {
  if (record.status === 'Em Avaliação' && record.classificacao === 'Menor') {
    return 'Em Disposição';
  }
  return NEXT_STATUS[record.status];
}

// Matriz de responsabilidade por etapa (POP-GQ-008)
const STAGE_OWNER = {
  'Aberta':                   { label: 'Área de Origem',            color: '#3b82f6' },
  'Em Avaliação':             { label: 'Garantia da Qualidade',     color: '#9333ea' },
  'Em Investigação':          { label: 'Equipe / GQ',               color: '#3b82f6' },
  'Em Disposição':            { label: 'Garantia da Qualidade',     color: '#ea580c' },
  'Em Plano de Ação':         { label: 'GQ · Engenharia',           color: '#f59e0b' },
  'Verificação de Eficácia':  { label: 'Garantia da Qualidade',     color: '#14b8a6' },
  'Encerrada':                { label: 'Garantia da Qualidade',     color: '#22c55e' },
};

// ── Perfis e etapas GQ ───────────────────────────────────────────────────────

const GQ_PERFIS  = new Set(['GQ Administrador', 'GQ Analista']);
const GQ_STAGES  = ['Aberta', 'Em Avaliação', 'Em Investigação', 'Em Disposição', 'Em Plano de Ação', 'Verificação de Eficácia'];
const STAGE_PILL = {
  'Em Avaliação':            'purple',
  'Em Investigação':         'blue',
  'Em Disposição':           'orange',
  'Em Plano de Ação':        'amber',
  'Verificação de Eficácia': 'teal',
};

// ── Permission logic ─────────────────────────────────────────────────────────

/**
 * Verifica se o usuário pode agir (editar/avançar) em um registro RNC.
 *
 * Adm / GQ Apoio + Manager → pode avançar qualquer etapa.
 * Executor + Manager        → pode apenas editar RNCs na etapa Aberta.
 * Licença View              → nunca pode agir.
 */
function canAct(record, user = getSession()) {
  if (!user || !can(user, 'rncAbertura', A.EDIT)) return false;
  if (user.perfil === 'GQ Administrador' || user.perfil === 'GQ Analista') return true;
  // Demais perfis: só podem interagir com RNCs ainda abertas (etapa de origem)
  return record?.status === 'Aberta';
}

/**
 * A aprovação do Plano de Ação (avanço de "Em Plano de Ação" → "Verificação
 * de Eficácia") é restrita ao Gerente/Coordenador da GQ, conforme
 * POP-GQ-008 §7.4.3.2. Demais etapas seguem a regra geral de canAct.
 */
function canApproveStage(record, user) {
  if (record?.status === 'Em Plano de Ação') return user?.perfil === 'GQ Administrador';
  return true;
}

function canAdvance(record, user = getSession()) {
  return canAct(record, user) && canApproveStage(record, user);
}

function ownerLabel(record) {
  const o = STAGE_OWNER[record.status];
  if (!o) return record.status;
  return record.status === 'Aberta' && record.area ? `Área: ${record.area}` : o.label;
}

function pendingCount() {
  const user = getSession();
  const rncs = db.get('rnc');
  if (user && GQ_PERFIS.has(user.perfil)) {
    return rncs.filter(r => GQ_STAGES.includes(r.status)).length;
  }
  return rncs.filter(r => r.status === 'Aberta').length;
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
  const user = getSession();
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const isGQ = user && GQ_PERFIS.has(user.perfil);

  const items = isGQ
    ? db.get('rnc').filter(r => GQ_STAGES.includes(r.status))
    : db.get('rnc').filter(r => r.status === 'Aberta');

  if (!items.length) {
    const [msg, sub] = isGQ
      ? ['Nenhuma RNC aguarda ação da GQ.', 'Todas as RNCs foram encerradas ou estão em etapas de área.']
      : ['Sem RNCs em aberto!', 'Todas as RNCs registradas foram encaminhadas à Garantia da Qualidade.'];
    return `<div style="text-align:center;padding:48px 24px">
      <div style="font-size:2.5rem;margin-bottom:12px">✅</div>
      <div style="font-size:0.95rem;font-weight:600;margin-bottom:6px">${msg}</div>
      <div style="font-size:0.82rem;color:var(--muted)">${sub}</div>
    </div>`;
  }

  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
    ${items.map(r => {
      const stage    = PIPELINE.find(p => p.key === r.status);
      const cor      = stage?.color ?? 'var(--border)';
      const own      = STAGE_OWNER[r.status];
      const nxt      = nextStatusFor(r);
      const act      = canAct(r, user);
      const emAtraso = r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje;
      const dias     = r.dataAbertura
        ? Math.round((hoje - new Date(r.dataAbertura + 'T00:00:00')) / 86400000) + 'd'
        : '';

      if (isGQ) {
        const pillColor = STAGE_PILL[r.status] ?? 'gray';
        const nxtLabel  = PIPELINE.find(p => p.key === nxt)?.label ?? nxt;
        const canAdv    = canAdvance(r, user);
        const showNaoProcedente  = act && r.status === 'Em Avaliação';
        const showAjustes        = act && r.status === 'Em Avaliação';
        const showReprovarPlano  = r.status === 'Em Plano de Ação' && user?.perfil === 'GQ Administrador';
        const showAbrirCapa      = act && !r.capaAberta && !CLOSED.includes(r.status);
        return `<div style="border:1px solid var(--border);border-top:3px solid ${cor};border-radius:8px;padding:14px;background:var(--surface);display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div>
              <div style="font-weight:700;font-size:0.9rem">${r.numero}</div>
              <div style="font-size:0.71rem;color:var(--muted);margin-top:2px">${r.area || '—'}${r.tipo ? ' · ' + r.tipo : ''}</div>
            </div>
            <span class="pill pill-${pillColor}" style="white-space:nowrap;font-size:0.65rem">${stage?.label ?? r.status}</span>
          </div>
          <div style="font-size:0.8rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden" title="${r.descricao}">${r.descricao}</div>
          <div style="display:flex;align-items:center;justify-content:space-between">
            <span style="font-size:0.72rem;color:var(--muted)">${own?.label ?? r.status}</span>
            ${emAtraso ? `<span style="font-size:0.67rem;color:var(--red);font-weight:700">⚠ atraso</span>` : (dias ? `<span style="font-size:0.7rem;color:var(--muted)">${dias}</span>` : '')}
          </div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">✏ Editar</button>
            ${canAdv && nxt ? `<button class="btn btn-primary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nxt}" style="flex:1">→ ${nxtLabel}</button>` : ''}
          </div>
          ${(showNaoProcedente || showAjustes || showReprovarPlano || showAbrirCapa) ? `<div style="display:flex;gap:6px;flex-wrap:wrap">
            ${showAjustes ? `<button class="btn btn-secondary btn-sm" data-action="solicitar-ajustes" data-id="${r.id}" style="border-color:var(--amber,#f59e0b);color:var(--amber,#f59e0b)">↩ Solicitar Ajustes</button>` : ''}
            ${showNaoProcedente ? `<button class="btn btn-secondary btn-sm" data-action="nao-procedente" data-id="${r.id}" style="border-color:var(--red,#ef4444);color:var(--red,#ef4444)">✕ Não Procedente</button>` : ''}
            ${showReprovarPlano ? `<button class="btn btn-secondary btn-sm" data-action="reprovar-plano" data-id="${r.id}" style="border-color:var(--red,#ef4444);color:var(--red,#ef4444)">✕ Reprovar Plano</button>` : ''}
            ${showAbrirCapa ? `<button class="btn btn-secondary btn-sm" data-action="abrir-capa" data-id="${r.id}" style="border-color:var(--purple,#9333ea);color:var(--purple,#9333ea)">📋 Abrir CAPA</button>` : ''}
          </div>` : ''}
        </div>`;
      }

      // Área: cards de abertura pendente
      return `<div style="border:1px solid var(--border);border-top:3px solid ${cor};border-radius:8px;padding:14px;background:var(--surface);display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <div style="font-weight:700;font-size:0.9rem">${r.numero}</div>
            <div style="font-size:0.71rem;color:var(--muted);margin-top:2px">${r.area || '—'}${r.tipo ? ' · ' + r.tipo : ''}</div>
          </div>
          ${emAtraso ? `<span style="font-size:0.67rem;color:var(--red);font-weight:700">⚠ atraso</span>` : ''}
        </div>
        <div style="font-size:0.8rem;line-height:1.4;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden" title="${r.descricao}">${r.descricao}</div>
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:0.72rem;color:var(--muted)">Abertura pendente · aguarda GQ</span>
          ${dias ? `<span style="font-size:0.7rem;color:var(--muted)">${dias}</span>` : ''}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}">✏ Preencher</button>
          ${act ? `<button class="btn btn-primary btn-sm" data-action="advance" data-id="${r.id}" data-next="Em Avaliação" style="flex:1">→ Enviar à GQ</button>` : ''}
          ${act ? `<button class="btn btn-secondary btn-sm" data-action="close-direct" data-id="${r.id}" style="width:100%;margin-top:2px;border-color:var(--green,#22c55e);color:var(--green,#22c55e)">✓ Já corrigido — Encerrar</button>` : ''}
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
  const user  = getSession();
  const isGQU = user && GQ_PERFIS.has(user.perfil);
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
        const own      = STAGE_OWNER[r.status];
        const ownLbl   = ownerLabel(r);
        const ownColor = own?.color ?? '#94a3b8';
        const risco    = r.classificacaoRisco
          ? `<span class="pill ${RISK_PILL[r.classificacaoRisco] ?? 'pill-gray'}">${r.classificacaoRisco}</span>` : '—';
        const nxt      = nextStatusFor(r);
        const act      = canAct(r, user);
        const canAdv   = canAdvance(r, user);
        const extras   = [];
        if (isGQU && act && r.status === 'Em Avaliação') {
          extras.push(`<button class="btn btn-secondary btn-sm" data-action="solicitar-ajustes" data-id="${r.id}" title="Solicitar Ajustes" style="border-color:var(--amber,#f59e0b);color:var(--amber,#f59e0b)">↩</button>`);
          extras.push(`<button class="btn btn-secondary btn-sm" data-action="nao-procedente" data-id="${r.id}" title="Marcar Não Procedente" style="border-color:var(--red,#ef4444);color:var(--red,#ef4444)">✕</button>`);
        }
        if (isGQU && r.status === 'Em Plano de Ação' && user?.perfil === 'GQ Administrador') {
          extras.push(`<button class="btn btn-secondary btn-sm" data-action="reprovar-plano" data-id="${r.id}" title="Reprovar Plano" style="border-color:var(--red,#ef4444);color:var(--red,#ef4444)">✕</button>`);
        }
        if (isGQU && act && !r.capaAberta && !CLOSED.includes(r.status)) {
          extras.push(`<button class="btn btn-secondary btn-sm" data-action="abrir-capa" data-id="${r.id}" title="Abrir CAPA" style="border-color:var(--purple,#9333ea);color:var(--purple,#9333ea)">📋</button>`);
        }
        const actBtn   = `<div class="td-actions">
          ${canAdv && nxt ? `<button class="btn btn-primary btn-sm" data-action="advance" data-id="${r.id}" data-next="${nxt}" title="Avançar para ${nxt}">→</button>` : ''}
          <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${r.id}" title="${act ? 'Editar' : 'Visualizar'}">${act ? '✏' : '👁'}</button>
          ${extras.join('')}
        </div>`;
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
          </td>
          <td>${actBtn}</td>
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
    record?.motivoAjuste ? { id: 'motivoAjuste', label: '⚠ Ajustes solicitados pela GQ', type: 'textarea', required: false, span: 2, readonly: true } : null,
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
    f('Aberta', { id: 'abrangencia',       label: '2.  Abrangência  (marque todas as aplicáveis)',             type: 'checkboxgroup', required: false, span: 2,
      options: ['Outro(s) Produto(s)', 'Outro(s) Lote(s)', 'Outra(s) Máquina(s)', 'Outro(s) Dispositivo(s) de Medição', 'Outro(s) Documento(s)', 'Não se aplica', 'Outro(s)'] }),
    f('Aberta', { id: 'abrangenciaEspecificar', label: '    Especificar Abrangência',                           type: 'text',        required: false, span: 2 }),
    // Exceção à trava por etapa: a conclusão da contenção (Data Realizada/Evidência)
    // costuma vir depois do envio à GQ, então o campo segue editável até a RNC
    // entrar em Verificação de Eficácia, quando então passa a ser somente leitura.
    { id: 'acoesImediatas', label: '3.  Ações de Contenção / Imediatas', type: 'acoes-table', required: false, span: 2,
      readonly: isTerminal || cur >= STAGE_ORDER.indexOf('Verificação de Eficácia') },
  ];

  if (!record) return base.filter(Boolean);

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
      f('Em Investigação', { id: 'porque1',              label: '9.1.1  Por que 1 — qual é o desvio observado?',  type: 'text',     required: false, span: 2 }),
      f('Em Investigação', { id: 'porque2',              label: '9.1.2  Por que 2',                               type: 'text',     required: false, span: 2 }),
      f('Em Investigação', { id: 'porque3',              label: '9.1.3  Por que 3',                               type: 'text',     required: false, span: 2 }),
      f('Em Investigação', { id: 'porque4',              label: '9.1.4  Por que 4',                               type: 'text',     required: false, span: 2 }),
      f('Em Investigação', { id: 'porque5',              label: '9.1.5  Por que 5 — causa raiz identificada',     type: 'text',     required: false, span: 2 }),
      f('Em Investigação', { id: 'ferramentasInvestigacao', label: '9.2  Ferramenta Complementar',                type: 'select',   required: false, span: 1, options: FERRAMENTAS_INVEST }),
      f('Em Investigação', { id: 'ishikawaMaterial',     label: '6M · Material / Matéria-prima',                  type: 'textarea', required: false, span: 1 }),
      f('Em Investigação', { id: 'ishikawaMetodo',       label: '6M · Método / Processo',                         type: 'textarea', required: false, span: 1 }),
      f('Em Investigação', { id: 'ishikawaMaquina',      label: '6M · Máquina / Equipamento',                     type: 'textarea', required: false, span: 1 }),
      f('Em Investigação', { id: 'ishikawaMaoDeObra',    label: '6M · Mão de Obra',                               type: 'textarea', required: false, span: 1 }),
      f('Em Investigação', { id: 'ishikawaMeioAmbiente', label: '6M · Meio Ambiente',                             type: 'textarea', required: false, span: 1 }),
      f('Em Investigação', { id: 'ishikawaMedicao',      label: '6M · Medição / Monitoramento',                   type: 'textarea', required: false, span: 1 }),
      f('Em Investigação', { id: 'causaRaiz',            label: '9.3  Causa(s) Raiz(ízes)',                       type: 'textarea', required: false, span: 2 }),
      f('Em Investigação', { id: 'observacoes',             label: '10.  Observação',                      type: 'textarea', required: false, span: 2 }),
    );
  }

  if (cur >= 3) {
    fields.push(
      h('ETAPA 4 — DISPOSIÇÃO', 'Em Disposição'),
      f('Em Disposição', { id: 'disposicao',              label: 'Disposição (SGQ)',                       type: 'select',        required: false, span: 2, options: DISPOSICOES_NC }),
      f('Em Disposição', { id: 'numFormularioRetrabalho', label: 'Nº Formulário de Retrabalho',            type: 'text',          required: false, span: 1 }),
      f('Em Disposição', { id: 'disposicaoJustificativa', label: 'Justificativa (Não aplicável)',          type: 'text',          required: false, span: 2 }),
      f('Em Disposição', { id: 'disposicaoAprovadaPor',   label: 'Disposição aprovada por',               type: 'select',        required: false, span: 1, options: resp.length ? resp : ['—'] }),
      f('Em Disposição', { id: 'dataAprovacaoDisposicao', label: 'Data de Aprovação da Disposição',       type: 'date',          required: false, span: 1 }),
    );
  }

  if (cur >= 4) {
    fields.push(
      h('ETAPA 5 — PLANO DE AÇÃO', 'Em Plano de Ação'),
      record?.planoRevisao ? { id: 'planoRevisao', label: '⚠ Motivo da reprovação anterior', type: 'textarea', required: false, span: 2, readonly: true } : null,
      f('Em Plano de Ação', { id: 'planoCorretivoAcoes',     label: 'Plano de Ação Corretivo',               type: 'plano-acao-table', required: false, span: 2 }),
      f('Em Plano de Ação', { id: 'prazoFinalizacao',        label: 'Prazo de Finalização do Plano',         type: 'date',          required: false, span: 1 }),
    );
  }

  if (cur >= 5) {
    fields.push(
      h('ETAPA 6 — VERIFICAÇÃO DE EFICÁCIA', 'Verificação de Eficácia'),
      f('Verificação de Eficácia', { id: 'periodoVerificacao',    label: 'Período de Verificação',   type: 'select',   required: false, span: 1, options: PERIOD_VER }),
      f('Verificação de Eficácia', { id: 'dataInicioVerificacao', label: 'Início da Verificação',    type: 'date',     required: false, span: 1 }),
      f('Verificação de Eficácia', { id: 'resultadoVerificacao',  label: 'Resultado da Verificação', type: 'textarea', required: false, span: 2 }),
      f('Verificação de Eficácia', { id: 'foiEficaz',             label: 'Foi Eficaz?',              type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] }),
      // A necessidade de CAPA só é avaliada após a Verificação de Eficácia (POP-GQ-008 §7.4.5).
      f('Verificação de Eficácia', { id: 'necessitaCapa',         label: 'Necessita CAPA?',           type: 'select',   required: false, span: 1, options: ['Sim', 'Não', 'Em Avaliação'] }),
    );
  }

  if (cur >= 6) {
    fields.push(
      h('ETAPA 7 — ENCERRAMENTO', 'Encerrada'),
      f('Encerrada', { id: 'alteracaoDocumentos', label: 'Houve alteração de docs. do SGQ?',    type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Encerrada', { id: 'codigosDocumentos',   label: 'Códigos dos documentos alterados',     type: 'text',     required: false, span: 2 }),
      f('Encerrada', { id: 'impactoMSB',          label: 'Houve impacto das ações para a MSB?', type: 'select',   required: false, span: 1, options: ['Sim', 'Não'] }),
      f('Encerrada', { id: 'descricaoImpacto',    label: 'Descrever o impacto',                  type: 'textarea', required: false, span: 2 }),
      f('Encerrada', { id: 'dataFechamento',       label: 'Data de Fechamento',                   type: 'date',     required: false, span: 1 }),
    );
  }

  return fields.filter(Boolean);
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
  if (el('#rnc-pipeline'))   el('#rnc-pipeline').innerHTML   = renderPipelineBar(db.get('rnc'));
  if (el('#rnc-queue-wrap')) el('#rnc-queue-wrap').innerHTML = renderMinhaFila();
  if (el('#rnc-table-wrap')) el('#rnc-table-wrap').innerHTML = renderTable(items);

  // Update tab badge
  const n   = pendingCount();
  const tab = el('[data-tab="fila"]');
  if (tab) tab.textContent = n > 0 ? `Minha Fila (${n})` : 'Minha Fila';
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

let _activeTab = 'fila';

function buildTabBar(active) {
  const n = pendingCount();
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
        <h2>Registro de RNC</h2>
        ${can(getSession(), 'rncAbertura', A.CREATE) ? `<button class="btn btn-primary" data-action="new">+ Nova RNC</button>` : ''}
      </div>
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
      const user  = getSession();

      if (action === 'new') {
        if (!can(user, 'rncAbertura', A.CREATE)) return;
        const fields = buildFields(null).map(f =>
          f.id === 'responsavel' || f.id === 'dataAbertura' ? { ...f, type: 'text', readonly: true } : f
        );
        openModal({
          title: 'Nova RNC',
          fields,
          data: { numero: generateNumero(), dataAbertura: today().split('-').reverse().join('-'), status: 'Aberta', responsavel: user?.nome ?? '' },
          onSave: data => {
            db.add('rnc', { ...data, dataAbertura: today(), status: 'Aberta' });
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
        // Área que abriu a RNC mantém acesso apenas à tabela de Ações de Contenção
        // após o envio à GQ, até a Verificação de Eficácia (POP-GQ-008 §3).
        const canEditContencao = auth || (
          user && !GQ_PERFIS.has(user.perfil) &&
          can(user, 'rncAbertura', A.EDIT) &&
          !CLOSED.includes(record.status) &&
          stageIdx(record.status) < STAGE_ORDER.indexOf('Verificação de Eficácia')
        );
        const rawFields = buildFields(record);
        openModal({
          title: `${auth ? 'Editar' : canEditContencao ? '✏ Editar (Ações de Contenção)' : '👁 Visualizar'} RNC ${record.numero} — ${record.status}`,
          fields: auth ? rawFields : rawFields.map(f =>
            f.type === 'heading' || (f.id === 'acoesImediatas' && canEditContencao) ? f : { ...f, readonly: true }
          ),
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
              notice.innerHTML = canEditContencao
                ? `🔓 <strong>Edição parcial liberada.</strong> Esta etapa pertence a <strong>${ownerLabel(record)}</strong> — você ainda pode atualizar a tabela "3. Ações de Contenção / Imediatas" (Data Realizada / Evidência).`
                : `🔒 <strong>Somente leitura.</strong> Esta etapa pertence a: <strong>${ownerLabel(record)}</strong>`;
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

              // 5 Porquês — placeholders em cascata
              ['Qual é o desvio observado?', 'Por que isso ocorreu?', 'Por que? (aprofunde)', 'Por que? (continue)', 'Por que? — tende a ser a causa raiz'].forEach((ph, i) => {
                const el = form.querySelector(`#field-porque${i + 1}`);
                if (el) el.placeholder = ph;
              });

              // CAPA obrigatória quando a Verificação de Eficácia não for eficaz (POP-GQ-008 §7.4.5)
              const eficazEl = form.querySelector('#field-foiEficaz');
              if (eficazEl) {
                const checkCapaWarning = () => {
                  form.querySelector('#capa-warning')?.remove();
                  if (eficazEl.value === 'Não') {
                    const warn = document.createElement('div');
                    warn.id = 'capa-warning';
                    warn.style.cssText = 'grid-column:1/-1;padding:8px 12px;background:#fee2e2;border:1px solid #fca5a5;border-radius:6px;font-size:0.78rem;color:#991b1b';
                    warn.innerHTML = '⚠ <strong>Ações ineficazes exigem abertura de CAPA</strong>, refazendo o ciclo de investigação conforme POP-GQ-009 (POP-GQ-008 §7.4.5). Use o botão "📋 Abrir CAPA" na fila ou na tabela de RNCs.';
                    eficazEl.closest('.form-group')?.insertAdjacentElement('afterend', warn);
                  }
                };
                checkCapaWarning();
                eficazEl.addEventListener('change', checkCapaWarning);
              }
            }

            // Justificativa (Não Procedente) — só aparece quando Procedente = Não
            const procedenteEl = form.querySelector('#field-procedente');
            const justNPGroup  = form.querySelector('#field-justificativaNP')?.closest('.form-group');
            if (procedenteEl && justNPGroup) {
              const toggleJustNP = () => {
                justNPGroup.style.display = procedenteEl.value === 'Não' ? '' : 'none';
              };
              toggleJustNP();
              procedenteEl.addEventListener('change', toggleJustNP);
            }

            // Ishikawa 6M — show/hide baseado na ferramenta selecionada
            const ferramEl2 = form.querySelector('#field-ferramentasInvestigacao');
            const ishIds = ['ishikawaMaterial','ishikawaMetodo','ishikawaMaquina','ishikawaMaoDeObra','ishikawaMeioAmbiente','ishikawaMedicao'];
            const ishGrps = ishIds.map(id => form.querySelector(`#field-${id}`)?.closest('.form-group')).filter(Boolean);
            if (ferramEl2 && ishGrps.length) {
              const ishHd = document.createElement('div');
              ishHd.style.cssText = 'grid-column:1/-1;padding:6px 0 4px;border-bottom:1px dashed var(--border);margin-top:2px;display:flex;align-items:center;gap:8px';
              ishHd.innerHTML = '<span style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#9333ea">Ishikawa — 6M (Espinha de Peixe)</span>';
              form.insertBefore(ishHd, ishGrps[0]);
              const allIsh = [ishHd, ...ishGrps];
              const toggleIsh = () => {
                const show = ferramEl2.value === 'Diagrama de Ishikawa';
                allIsh.forEach(el => { el.style.display = show ? '' : 'none'; });
              };
              toggleIsh();
              ferramEl2.addEventListener('change', toggleIsh);
            }

            // Nota de dados legados (campo 'porques' anterior ao redesign)
            if (record.porques) {
              const firstPq = form.querySelector('#field-porque1')?.closest('.form-group');
              if (firstPq) {
                const legDiv = document.createElement('div');
                legDiv.style.cssText = 'grid-column:1/-1;padding:10px 12px;border:1px solid var(--border);border-left:3px solid #f59e0b;border-radius:6px;font-size:0.78rem;color:var(--muted);background:var(--surface)';
                legDiv.innerHTML = '<div style="font-weight:600;color:var(--text);margin-bottom:6px">📋 Análise anterior registrada</div><div style="white-space:pre-wrap;line-height:1.5">' + record.porques.replace(/</g, '&lt;') + '</div>';
                form.insertBefore(legDiv, firstPq);
              }
            }
          },
          onSave: data => {
            if (!auth && !canEditContencao) return;
            if (!auth) {
              // Área sem permissão de edição geral: persiste apenas a tabela de contenção
              db.update('rnc', numId, { acoesImediatas: data.acoesImediatas });
              toast('Ações de contenção atualizadas!');
              refresh(container);
              return;
            }
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
        if (!canAdvance(record, user)) {
          const msg = record.status === 'Em Plano de Ação'
            ? 'Apenas o GQ Administrador pode aprovar o Plano de Ação (POP-GQ-008 §7.4.3.2).'
            : 'Sem permissão para avançar esta etapa.';
          toast(msg, 'error');
          return;
        }
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

      if (action === 'close-direct') {
        const record = db.getById('rnc', numId);
        if (!record || !canAct(record, user)) { toast('Sem permissão para esta ação.', 'error'); return; }
        showConfirm('Encerrar esta RNC como já corrigida?\n\nUse esta opção apenas quando a correção foi imediata e documentada no formulário de abertura.').then(ok => {
          if (!ok) return;
          db.update('rnc', numId, { status: 'Encerrada', dataFechamento: today(), encerradoStatus: 'Correção imediata' });
          toast('RNC encerrada como correção imediata.');
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

      if (action === 'solicitar-ajustes') {
        const record = db.getById('rnc', numId);
        if (!record || !canAct(record, user)) { toast('Sem permissão para esta ação.', 'error'); return; }
        openModal({
          title: `Solicitar Ajustes — ${record.numero}`,
          fields: [{ id: 'motivo', label: 'O que precisa ser ajustado ou complementado pela área?', type: 'textarea', required: true, span: 2 }],
          data: {},
          onSave: data => {
            db.update('rnc', numId, { status: 'Aberta', motivoAjuste: data.motivo });
            toast(`${record.numero} devolvida à área para ajustes.`);
            refresh(container);
          },
        });
        return;
      }

      if (action === 'reprovar-plano') {
        const record = db.getById('rnc', numId);
        if (!record || user?.perfil !== 'GQ Administrador') { toast('Apenas o GQ Administrador pode reprovar o Plano de Ação.', 'error'); return; }
        openModal({
          title: `Reprovar Plano de Ação — ${record.numero}`,
          fields: [{ id: 'motivo', label: 'Motivo da reprovação (o que precisa ser revisado)', type: 'textarea', required: true, span: 2 }],
          data: {},
          onSave: data => {
            db.update('rnc', numId, { planoRevisao: data.motivo });
            toast(`Plano de Ação de ${record.numero} devolvido para revisão.`);
            refresh(container);
          },
        });
        return;
      }

      if (action === 'abrir-capa') {
        const record = db.getById('rnc', numId);
        if (!record || !canAct(record, user)) { toast('Sem permissão para esta ação.', 'error'); return; }
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
        if (!can(user, 'rnc', A.DELETE)) { toast('Sem permissão para excluir.', 'error'); return; }
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
