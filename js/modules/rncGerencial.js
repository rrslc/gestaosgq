/**
 * @fileoverview RNC — Gerencial: painel panorâmico e acompanhamento de ações.
 */

import { db } from '../db.js';
import { formatDate, deadlineCell, statusPill, emptyState } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { ETAPAS_ACAO } from '../constants.js';
import { getSession } from '../session.js';
import { can, A } from '../permissions.js';

const ACAO_STATUS = ['Pendente', 'Em Andamento', 'Concluída'];

const CLOSED = ['Encerrada', 'Cancelada', 'Não Procedente'];

const PIPELINE_STEPS = [
  { key: 'Aberta',                  label: 'Abertura',        color: '#ef4444' },
  { key: 'Em Avaliação',            label: 'Avaliação GQ',    color: '#9333ea' },
  { key: 'Em Investigação',         label: 'Investigação',    color: '#3b82f6' },
  { key: 'Em Plano de Ação',        label: 'Plano de Ação',   color: '#f59e0b' },
  { key: 'Verificação de Eficácia', label: 'Verif. Eficácia', color: '#14b8a6' },
  { key: 'Encerrada',               label: 'Encerrada',       color: '#22c55e' },
];

function canEditAcao(acao, session = getSession()) {
  if (!session || !can(session, 'rnc', A.EDIT)) return false;
  if (session.perfil === 'Executor') return acao?.responsavel === session.nome;
  return true;
}
function canManageAcoes(session = getSession()) {
  return can(session, 'rnc', A.MANAGE);
}

function miniPipeline(status) {
  const idx = PIPELINE_STEPS.findIndex(p => p.key === status);
  if (idx < 0) return `<div style="font-size:0.68rem;color:#94a3b8;margin-top:3px">${status}</div>`;
  return `<div style="display:flex;gap:1px;height:5px;margin-top:4px;border-radius:3px;overflow:hidden">
    ${PIPELINE_STEPS.map((p, i) => `<div style="flex:1;background:${i < idx ? '#22c55e' : i === idx ? p.color : 'var(--border)'}" title="${p.label}"></div>`).join('')}
  </div>`;
}

function renderAcompanhamento() {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const open = db.get('rnc').filter(r => !CLOSED.includes(r.status));
  if (!open.length) return '';
  const RISK_COLOR = { 'Menor': '#3b82f6', 'Maior': '#f59e0b', 'Crítica': '#ef4444' };
  return `
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:600;font-size:0.9rem;margin-bottom:14px">Acompanhamento por Etapa</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:10px">
        ${open.map(r => {
          const idx = PIPELINE_STEPS.findIndex(p => p.key === r.status);
          const step = idx >= 0 ? PIPELINE_STEPS[idx] : { label: r.status, color: '#94a3b8' };
          const rc = RISK_COLOR[r.classificacaoRisco] || '#94a3b8';
          const emAtraso = r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje;
          return `<div style="border:1px solid var(--border);border-left:3px solid ${step.color};border-radius:8px;padding:11px 12px;background:var(--surface)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong style="font-size:0.84rem">${r.numero}</strong>
              <div style="display:flex;gap:5px;align-items:center">
                ${r.classificacaoRisco ? `<span style="font-size:0.68rem;padding:1px 5px;border-radius:3px;background:${rc}1a;color:${rc};font-weight:700">${r.classificacaoRisco}</span>` : ''}
                ${emAtraso ? `<span style="font-size:0.68rem;color:#ef4444;font-weight:700">⚠ atraso</span>` : ''}
              </div>
            </div>
            <div style="font-size:0.75rem;color:var(--muted);margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</div>
            <div style="display:flex;gap:1px;height:6px;margin-bottom:5px;border-radius:3px;overflow:hidden">
              ${PIPELINE_STEPS.map((p, i) => `<div style="flex:1;background:${i < idx ? '#22c55e' : i === idx ? p.color : 'var(--border)'}" title="${p.label}"></div>`).join('')}
            </div>
            <div style="display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:0.72rem;font-weight:600;color:${step.color}">${step.label}</span>
              ${r.responsavel ? `<span style="font-size:0.7rem;color:var(--muted)">${r.responsavel}</span>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

function renderFluxoProcesso() {
  const all = db.get('rnc');
  const cnt = k => all.filter(r => r.status === k).length;

  // Lane Y centers
  const AREA_Y = 60, GQ_Y = 250, TH = 44;
  const AREA_TY = AREA_Y - TH / 2; // 38
  const AREA_BY = AREA_Y + TH / 2; // 82
  const GQ_TY   = GQ_Y   - TH / 2; // 228
  const GQ_BY   = GQ_Y   + TH / 2; // 272

  const RED = '#ef4444', PURPLE = '#9333ea', BLUE = '#3b82f6', AMBER = '#f59e0b';
  const TEAL = '#14b8a6', GREEN = '#22c55e', ORANGE = '#c2410c', GRAY = '#94a3b8';
  const TEXT = '#1e293b', MUTED = '#64748b', ARR = '#475569', GW_BG = '#fefce8', GW_BD = '#d97706';

  // Task specs {x, w}  —  cx = x + w/2
  const T = {
    reg:   { x: 103, w: 88  },  // Registro RNC      (Área lane)  cx=147
    aval:  { x: 242, w: 96  },  // Análise de Risco  (GQ lane)    cx=290
    class: { x: 386, w: 78  },  // Classifica NC     (GQ lane)    cx=425
    inv:   { x: 512, w: 96  },  // Investigação       (GQ lane)    cx=560
    disp:  { x: 616, w: 74  },  // Disposição         (GQ lane)    cx=653
    pa:    { x: 698, w: 96  },  // Plano de Ação      (GQ lane)    cx=746
    impl:  { x: 858, w: 92  },  // Implementação      (Área lane)  cx=904  ↕ stacked
    verif: { x: 858, w: 92  },  // Verif. de Eficácia (GQ lane)    cx=904  ↕ stacked
    enc:   { x: 998, w: 90  },  // Encerramento       (GQ lane)    cx=1043
  };
  const GW = { g1: 220, g2: 364, g3: 490, g4: 822, g5: 975 };
  const END_CX = 1116;
  const SVG_W = 1200, SVG_H = 450;

  const mcx = t => t.x + t.w / 2;

  function taskRect(t, centerY, label, sub, color, count) {
    const ty = centerY - TH / 2;
    const mx = mcx(t);
    const bx = t.x + t.w - 7, by = ty + 7;
    const badge = count > 0
      ? `<circle cx="${bx}" cy="${by}" r="9" fill="${color}"/><text x="${bx}" y="${by+4}" text-anchor="middle" font-size="8.5" font-weight="700" fill="white" font-family="system-ui">${count}</text>`
      : '';
    return `
      <rect x="${t.x}" y="${ty}" width="${t.w}" height="${TH}" rx="5" fill="white" stroke="${color}" stroke-width="1.7"/>
      <text x="${mx}" y="${ty+(sub?TH/2-3:TH/2+5)}" text-anchor="middle" font-size="8.5" font-weight="700" fill="${TEXT}" font-family="system-ui">${label}</text>
      ${sub?`<text x="${mx}" y="${ty+TH/2+11}" text-anchor="middle" font-size="7" fill="${MUTED}" font-family="system-ui">${sub}</text>`:''}
      ${badge}`;
  }

  function gwShape(x, l1, l2) {
    return `
      <polygon points="${x},${GQ_Y-20} ${x+20},${GQ_Y} ${x},${GQ_Y+20} ${x-20},${GQ_Y}" fill="${GW_BG}" stroke="${GW_BD}" stroke-width="1.6"/>
      <text x="${x}" y="${GQ_Y-6}" text-anchor="middle" font-size="7" font-weight="700" fill="#92400e" font-family="system-ui">${l1}</text>
      ${l2?`<text x="${x}" y="${GQ_Y+8}" text-anchor="middle" font-size="7" font-weight="700" fill="#92400e" font-family="system-ui">${l2}</text>`:''}`;
  }

  function arrow(x1, y1, x2, y2, color) {
    const mid = color===GREEN?'g':color===RED?'r':'d';
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.4" marker-end="url(#ma-${mid})"/>`;
  }

  function fpath(d, color, dashed) {
    const mid = color===GREEN?'g':color===RED?'r':color===GRAY?'gr':'d';
    return `<path d="${d}" stroke="${color}" stroke-width="1.3" fill="none"${dashed?' stroke-dasharray="4,3"':''} marker-end="url(#ma-${mid})"/>`;
  }

  const enc = cnt('Encerrada');

  return `
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:600;font-size:0.9rem;margin-bottom:2px">Fluxo do Processo — Gestão de Desvios / RNC (POP-GQ-008)</div>
      <div style="font-size:0.74rem;color:var(--muted);margin-bottom:12px">Processo conforme POP-GQ-008 · Números = RNCs atualmente em cada etapa</div>
      <div style="overflow-x:auto;padding-bottom:4px">
        <svg viewBox="0 0 ${SVG_W} ${SVG_H}" width="${SVG_W}" height="${SVG_H}" xmlns="http://www.w3.org/2000/svg" style="display:block">
          <defs>
            <marker id="ma-d" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5z" fill="${ARR}"/></marker>
            <marker id="ma-g" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5z" fill="${GREEN}"/></marker>
            <marker id="ma-r" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5z" fill="${RED}"/></marker>
            <marker id="ma-or" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto"><path d="M0,1 L7,4 L0,7" fill="none" stroke="${ORANGE}" stroke-width="1.4"/></marker>
            <marker id="ma-gr" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5z" fill="${GRAY}"/></marker>
          </defs>

          <!-- ══ SWIM LANE BANDS ══ -->
          <rect x="0" y="0"   width="${SVG_W}" height="120" fill="#f0f9ff"/>
          <rect x="0" y="120" width="${SVG_W}" height="260" fill="#faf5ff"/>
          <rect x="0" y="380" width="${SVG_W}" height="70"  fill="#fff7ed"/>
          <line x1="0" y1="120" x2="${SVG_W}" y2="120" stroke="#cbd5e1" stroke-width="1"/>
          <line x1="0" y1="380" x2="${SVG_W}" y2="380" stroke="#cbd5e1" stroke-width="1"/>
          <rect x="0" y="0"   width="${SVG_W}" height="${SVG_H}" fill="none" stroke="#cbd5e1" stroke-width="1"/>

          <!-- ══ LANE LABELS ══ -->
          <rect x="0" y="0"   width="82" height="120" fill="#dbeafe" opacity=".65"/>
          <rect x="0" y="120" width="82" height="260" fill="#ede9fe" opacity=".65"/>
          <rect x="0" y="380" width="82" height="70"  fill="#fed7aa" opacity=".65"/>
          <line x1="82" y1="0" x2="82" y2="${SVG_H}" stroke="#94a3b8" stroke-width="1"/>
          <text transform="translate(41,60) rotate(-90)"  text-anchor="middle" font-size="8.5" font-weight="700" fill="#1d4ed8" font-family="system-ui">Área / Colaborador</text>
          <text transform="translate(41,250) rotate(-90)" text-anchor="middle" font-size="8.5" font-weight="700" fill="#6d28d9" font-family="system-ui">Garantia da Qualidade (GQ)</text>
          <text transform="translate(41,415) rotate(-90)" text-anchor="middle" font-size="8.5" font-weight="700" fill="#9a3412" font-family="system-ui">Melhoria Contínua</text>

          <!-- ══ CONNECTIONS ══ -->

          <!-- START → T.reg -->
          ${arrow(101, AREA_Y, T.reg.x, AREA_Y, ARR)}

          <!-- T.reg → GW1 (cross-lane: Área ↓ GQ) -->
          ${fpath(`M${mcx(T.reg)},${AREA_BY} L${mcx(T.reg)},${GQ_Y} L${GW.g1-20},${GQ_Y}`, ARR)}
          <text x="${mcx(T.reg)+5}" y="${(AREA_BY+GQ_Y)/2+2}" font-size="7" fill="${MUTED}" font-family="system-ui">envia p/</text>
          <text x="${mcx(T.reg)+5}" y="${(AREA_BY+GQ_Y)/2+12}" font-size="7" fill="${MUTED}" font-family="system-ui">avaliação</text>

          <!-- GW1 Sim → T.aval -->
          ${arrow(GW.g1+20, GQ_Y, T.aval.x, GQ_Y, GREEN)}
          <text x="${(GW.g1+20+T.aval.x)/2}" y="${GQ_Y-6}" text-anchor="middle" font-size="7" fill="${GREEN}" font-weight="600" font-family="system-ui">Sim</text>

          <!-- GW1 Não → T.reg top (retornar p/ ajustes, dashed red) -->
          ${fpath(`M${GW.g1},${GQ_TY} L${GW.g1},25 L${mcx(T.reg)},25 L${mcx(T.reg)},${AREA_TY}`, RED, true)}
          <text x="${(GW.g1+mcx(T.reg))/2}" y="19" text-anchor="middle" font-size="7" fill="${RED}" font-family="system-ui">Não — retornar p/ ajustes</text>

          <!-- T.aval → GW2 -->
          ${arrow(T.aval.x+T.aval.w, GQ_Y, GW.g2-20, GQ_Y, ARR)}

          <!-- GW2 Sim → T.class -->
          ${arrow(GW.g2+20, GQ_Y, T.class.x, GQ_Y, GREEN)}
          <text x="${(GW.g2+20+T.class.x)/2}" y="${GQ_Y-6}" text-anchor="middle" font-size="7" fill="${GREEN}" font-weight="600" font-family="system-ui">Sim</text>

          <!-- GW2 Não → NP End -->
          ${fpath(`M${GW.g2},${GQ_BY} L${GW.g2},368`, RED)}
          <text x="${GW.g2+5}" y="${(GQ_BY+340)/2}" font-size="7" fill="${RED}" font-weight="600" font-family="system-ui">Não</text>
          <text x="${GW.g2+5}" y="${(GQ_BY+340)/2+10}" font-size="7" fill="${RED}" font-family="system-ui">procedente</text>

          <!-- T.class → GW3 -->
          ${arrow(T.class.x+T.class.w, GQ_Y, GW.g3-20, GQ_Y, ARR)}

          <!-- GW3 Crít./Maior → T.inv -->
          ${arrow(GW.g3+20, GQ_Y, T.inv.x, GQ_Y, ARR)}
          <text x="${(GW.g3+20+T.inv.x)/2}" y="${GQ_Y-6}" text-anchor="middle" font-size="6.5" fill="${MUTED}" font-family="system-ui">Crít./Maior</text>

          <!-- GW3 Menor → T.disp (skip investigação, gray dashed) -->
          ${fpath(`M${GW.g3},${GQ_BY} L${GW.g3},345 L${T.disp.x-5},345 L${T.disp.x-5},${GQ_Y} L${T.disp.x},${GQ_Y}`, GRAY, true)}
          <text x="${(GW.g3+mcx(T.disp))/2}" y="358" text-anchor="middle" font-size="7" fill="${GRAY}" font-family="system-ui">Menor → disposição direta</text>

          <!-- T.inv → T.disp -->
          ${arrow(T.inv.x+T.inv.w, GQ_Y, T.disp.x, GQ_Y, ARR)}

          <!-- T.disp → T.pa -->
          ${arrow(T.disp.x+T.disp.w, GQ_Y, T.pa.x, GQ_Y, ARR)}

          <!-- T.pa → GW4 -->
          ${arrow(T.pa.x+T.pa.w, GQ_Y, GW.g4-20, GQ_Y, ARR)}

          <!-- T.pa → MC (dashed orange association) -->
          <line x1="${mcx(T.pa)}" y1="${GQ_BY}" x2="${mcx(T.pa)}" y2="390" stroke="${ORANGE}" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#ma-or)"/>

          <!-- GW4 Não → loop back to T.pa (revisar plano) -->
          ${fpath(`M${GW.g4},${GQ_BY} L${GW.g4},350 L${T.pa.x-7},350 L${T.pa.x-7},${GQ_Y} L${T.pa.x},${GQ_Y}`, RED, true)}
          <text x="${(GW.g4+T.pa.x)/2}" y="363" text-anchor="middle" font-size="7" fill="${RED}" font-family="system-ui">Não — revisar plano</text>

          <!-- GW4 Sim → T.impl (cross-lane: GQ ↑ Área) -->
          ${fpath(`M${GW.g4+20},${GQ_Y} L${GW.g4+28},${GQ_Y} L${GW.g4+28},30 L${mcx(T.impl)},30 L${mcx(T.impl)},${AREA_TY}`, GREEN)}
          <text x="${GW.g4+32}" y="155" font-size="7" fill="${GREEN}" font-weight="600" font-family="system-ui">Aprovado →</text>
          <text x="${GW.g4+32}" y="165" font-size="7" fill="${GREEN}" font-family="system-ui">implementação</text>

          <!-- T.impl → T.verif (cross-lane: Área ↓ GQ) -->
          ${fpath(`M${mcx(T.impl)},${AREA_BY} L${mcx(T.impl)},${GQ_TY}`, ARR)}

          <!-- T.verif → GW5 -->
          ${arrow(T.verif.x+T.verif.w, GQ_Y, GW.g5-20, GQ_Y, ARR)}

          <!-- GW5 Sim → T.enc -->
          ${arrow(GW.g5+20, GQ_Y, T.enc.x, GQ_Y, GREEN)}
          <text x="${(GW.g5+20+T.enc.x)/2}" y="${GQ_Y-6}" text-anchor="middle" font-size="7" fill="${GREEN}" font-weight="600" font-family="system-ui">Sim</text>

          <!-- GW5 Não → CAPA -->
          ${fpath(`M${GW.g5},${GQ_BY} L${GW.g5},368`, RED)}
          <text x="${GW.g5+5}" y="${(GQ_BY+340)/2}" font-size="7" fill="${RED}" font-weight="600" font-family="system-ui">Não</text>
          <text x="${GW.g5+5}" y="${(GQ_BY+340)/2+10}" font-size="7" fill="${RED}" font-family="system-ui">eficaz</text>

          <!-- T.enc → END -->
          ${arrow(T.enc.x+T.enc.w, GQ_Y, END_CX-15, GQ_Y, GREEN)}

          <!-- ══ TASKS ══ -->
          ${taskRect(T.reg,   AREA_Y, 'Registro RNC',       '≤D+5  ·  §7.1',        RED,    cnt('Aberta'))}
          ${taskRect(T.aval,  GQ_Y,   'Análise de Risco',   'Prob×Sev  ·  §7.2',    PURPLE, cnt('Em Avaliação'))}
          ${taskRect(T.class, GQ_Y,   'Classifica NC',      '§7.3',                 BLUE,   0)}
          ${taskRect(T.inv,   GQ_Y,   'Investigação',       '5 Porquês  ·  §7.4.1', BLUE,   cnt('Em Investigação'))}
          ${taskRect(T.disp,  GQ_Y,   'Disposição',         '§7.4.2',               AMBER,  0)}
          ${taskRect(T.pa,    GQ_Y,   'Plano de Ação',      'GQ + MC  ·  §7.4.3',   AMBER,  cnt('Em Plano de Ação'))}
          ${taskRect(T.impl,  AREA_Y, 'Implementação',      'Responsáveis',         TEAL,   0)}
          ${taskRect(T.verif, GQ_Y,   'Verif. de Eficácia', '3–12m  ·  §7.4.4',    TEAL,   cnt('Verificação de Eficácia'))}
          ${taskRect(T.enc,   GQ_Y,   'Encerramento',       null,                   GREEN,  cnt('Encerrada'))}

          <!-- ══ GATEWAYS ══ -->
          ${gwShape(GW.g1, 'Info', 'sufic.?')}
          ${gwShape(GW.g2, 'Proce-', 'dente?')}
          ${gwShape(GW.g3, 'Nível', 'NC?')}
          ${gwShape(GW.g4, 'Aprov.?', '≤2d')}
          ${gwShape(GW.g5, 'Eficaz?', '')}

          <!-- ══ START EVENT ══ -->
          <circle cx="88" cy="${AREA_Y}" r="13" fill="white" stroke="#1e40af" stroke-width="2.3"/>
          <circle cx="88" cy="${AREA_Y}" r="5.5" fill="#1e40af"/>
          <text x="88" y="${AREA_Y+22}" text-anchor="middle" font-size="7.5" fill="#1e40af" font-weight="600" font-family="system-ui">Início</text>

          <!-- ══ NP END EVENT ══ -->
          <circle cx="${GW.g2}" cy="381" r="13" fill="white" stroke="${RED}" stroke-width="3.5"/>
          <circle cx="${GW.g2}" cy="381" r="5.5" fill="${RED}"/>
          <text x="${GW.g2}" y="402" text-anchor="middle" font-size="7.5" fill="${RED}" font-weight="700" font-family="system-ui">Não Procedente</text>

          <!-- ══ CAPA EVENT ══ -->
          <rect x="${GW.g5-50}" y="368" width="100" height="34" rx="4" fill="white" stroke="${RED}" stroke-width="1.5"/>
          <text x="${GW.g5}" y="382" text-anchor="middle" font-size="8" font-weight="700" fill="${RED}" font-family="system-ui">Abre CAPA</text>
          <text x="${GW.g5}" y="394" text-anchor="middle" font-size="7" fill="${MUTED}" font-family="system-ui">POP-GQ-009</text>

          <!-- ══ MC TASK ══ -->
          <rect x="${T.pa.x}" y="390" width="${T.pa.w}" height="34" rx="5" fill="white" stroke="${ORANGE}" stroke-width="1.5"/>
          <text x="${mcx(T.pa)}" y="404" text-anchor="middle" font-size="8" font-weight="700" fill="${ORANGE}" font-family="system-ui">Reunião PA</text>
          <text x="${mcx(T.pa)}" y="416" text-anchor="middle" font-size="7" fill="#9a3412" font-family="system-ui">valida ações · alinha metas</text>

          <!-- ══ END EVENT ══ -->
          <circle cx="${END_CX}" cy="${GQ_Y}" r="15" fill="white" stroke="${GREEN}" stroke-width="4"/>
          <circle cx="${END_CX}" cy="${GQ_Y}" r="6.5" fill="${GREEN}"/>
          <text x="${END_CX}" y="${GQ_Y+25}" text-anchor="middle" font-size="7.5" fill="${GREEN}" font-weight="700" font-family="system-ui">Encerrada</text>
          ${enc>0?`<circle cx="${END_CX+13}" cy="${GQ_Y-14}" r="9" fill="${GREEN}"/><text x="${END_CX+13}" y="${GQ_Y-10}" text-anchor="middle" font-size="8.5" font-weight="700" fill="white" font-family="system-ui">${enc}</text>`:''}

          <!-- ══ LEGEND ══ -->
          <rect x="88" y="424" width="640" height="22" rx="4" fill="white" stroke="#e2e8f0" stroke-width="1" opacity=".95"/>
          <text x="98"  y="439" font-size="7.5" font-weight="700" fill="${MUTED}" font-family="system-ui">Legenda:</text>
          <rect x="148" y="430" width="22" height="12" rx="2" fill="white" stroke="${ARR}" stroke-width="1"/>
          <text x="174" y="440" font-size="7" fill="${MUTED}" font-family="system-ui">Tarefa</text>
          <polygon points="220,430 227,436 220,442 213,436" fill="${GW_BG}" stroke="${GW_BD}" stroke-width="1"/>
          <text x="232" y="440" font-size="7" fill="${MUTED}" font-family="system-ui">Gateway</text>
          <circle cx="283" cy="436" r="5" fill="white" stroke="#1e40af" stroke-width="1.5"/>
          <circle cx="283" cy="436" r="2" fill="#1e40af"/>
          <text x="292" y="440" font-size="7" fill="${MUTED}" font-family="system-ui">Início</text>
          <circle cx="336" cy="436" r="5" fill="white" stroke="${GREEN}" stroke-width="2.5"/>
          <circle cx="336" cy="436" r="2" fill="${GREEN}"/>
          <text x="345" y="440" font-size="7" fill="${MUTED}" font-family="system-ui">Encerramento</text>
          <line x1="400" y1="436" x2="420" y2="436" stroke="${RED}" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#ma-r)"/>
          <text x="425" y="440" font-size="7" fill="${MUTED}" font-family="system-ui">Retorno/ajuste</text>
          <line x1="495" y1="436" x2="515" y2="436" stroke="${ORANGE}" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#ma-or)"/>
          <text x="520" y="440" font-size="7" fill="${MUTED}" font-family="system-ui">Assoc. MC</text>
          <line x1="575" y1="436" x2="595" y2="436" stroke="${GRAY}" stroke-width="1.2" stroke-dasharray="4,3" marker-end="url(#ma-gr)"/>
          <text x="600" y="440" font-size="7" fill="${MUTED}" font-family="system-ui">Bypass menor</text>
        </svg>
      </div>
    </div>
  `;
}

function kpiCard(value, label, color, highlight = false, sub = '') {
  const empty = value === 0;
  const border = highlight && value > 0
    ? `border:1px solid ${color}50;box-shadow:0 0 0 2px ${color}14`
    : 'border:1px solid var(--border)';
  return `<div style="padding:16px 10px 13px;background:var(--surface);${border};border-radius:10px;text-align:center">
    <div style="font-size:1.75rem;font-weight:800;color:${empty ? 'var(--muted)' : color};line-height:1;font-variant-numeric:tabular-nums">${value}</div>
    <div style="font-size:0.7rem;color:var(--muted);margin-top:5px;line-height:1.3">${label}</div>
    ${sub ? `<div style="font-size:0.65rem;margin-top:3px;color:${color};font-weight:600;opacity:${empty?0.35:0.8}">${sub}</div>` : ''}
  </div>`;
}

// ── Painel tab ──────────────────────────────────────────────────────────────

function renderPainel() {
  const all  = db.get('rnc');
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);

  const kpis = {
    total:      all.length,
    abertas:    all.filter(r => r.status === 'Aberta').length,
    andamento:  all.filter(r => ['Em Avaliação', 'Em Investigação', 'Em Plano de Ação', 'Verificação de Eficácia'].includes(r.status)).length,
    encerradas: all.filter(r => r.status === 'Encerrada').length,
    emAtraso:   all.filter(r => !CLOSED.includes(r.status) && r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje).length,
    comCapa:    all.filter(r => r.necessitaCapa === 'Sim').length,
  };

  const PIPELINE = [
    { key: 'Aberta',                   color: 'var(--red)',    n: kpis.abertas },
    { key: 'Em Avaliação',             color: 'var(--purple)', n: all.filter(r => r.status === 'Em Avaliação').length },
    { key: 'Em Investigação',          color: 'var(--blue)',   n: all.filter(r => r.status === 'Em Investigação').length },
    { key: 'Em Plano de Ação',        color: 'var(--amber)',  n: all.filter(r => r.status === 'Em Plano de Ação').length },
    { key: 'Verificação de Eficácia', color: 'var(--teal)',   n: all.filter(r => r.status === 'Verificação de Eficácia').length },
    { key: 'Encerrada',               color: 'var(--green)',  n: kpis.encerradas },
  ];

  function diasAberto(r) {
    if (!r.dataAbertura) return '—';
    const ini = new Date(r.dataAbertura + 'T00:00:00');
    const fim = r.dataFechamento ? new Date(r.dataFechamento + 'T00:00:00') : hoje;
    const dias = Math.round((fim - ini) / 86400000);
    const emAtraso = !CLOSED.includes(r.status) && r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje;
    return `<span style="color:${emAtraso ? 'var(--red)' : 'inherit'};font-weight:${emAtraso ? '600' : 'normal'}">${dias}d</span>`;
  }

  const tableHtml = all.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Número</th><th>Tipo</th><th>Descrição</th><th>Área</th>
          <th>Risco</th><th>Responsável</th><th>Abertura</th><th>T. Aberto</th><th>Status</th><th>CAPA</th>
        </tr></thead>
        <tbody>
          ${all.map(r => {
            const risco = r.classificacaoRisco;
            const RISK_PILL = { 'Menor': 'pill-blue', 'Maior': 'pill-amber', 'Crítica': 'pill-red' };
            const riscoHtml = risco
              ? `<span class="pill ${RISK_PILL[risco] ?? 'pill-gray'}">${risco}</span>`
              : '—';
            return `<tr>
            <td><strong>${r.numero}</strong></td>
            <td style="font-size:0.8rem;white-space:nowrap">${r.tipo || '—'}</td>
            <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
            <td>${r.area || '—'}</td>
            <td>${riscoHtml}</td>
            <td>${r.responsavel || '—'}</td>
            <td>${formatDate(r.dataAbertura)}</td>
            <td style="text-align:center">${diasAberto(r)}</td>
            <td>
              ${statusPill(r.encerradoStatus || r.status)}
              ${!CLOSED.includes(r.status) ? miniPipeline(r.status) : ''}
            </td>
            <td>${r.necessitaCapa === 'Sim'
              ? (r.capaAberta ? '<span style="color:var(--green);font-size:0.75rem">✓ Aberta</span>' : '<span style="color:var(--amber);font-size:0.75rem">Pendente</span>')
              : '<span style="color:var(--muted);font-size:0.75rem">—</span>'}</td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : emptyState('Nenhuma RNC registrada.');

  // Tempo médio de resolução
  const fechadas = all.filter(r => r.dataAbertura && r.dataFechamento);
  const tmr = fechadas.length
    ? Math.round(fechadas.reduce((s, r) => {
        const ini = new Date(r.dataAbertura + 'T00:00:00');
        const fim = new Date(r.dataFechamento + 'T00:00:00');
        return s + (fim - ini) / 86400000;
      }, 0) / fechadas.length)
    : null;

  const totalAll = PIPELINE.reduce((s, p) => s + p.n, 0);

  return `
    ${renderAcompanhamento()}

    <!-- Pipeline -->
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:18px">
      <div style="padding:12px 16px 10px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:0.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.09em;color:var(--muted)">Pipeline — RNCs por etapa</span>
        <span style="font-size:0.72rem;color:var(--muted)">${totalAll} total</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(6,1fr)">
        ${PIPELINE.map((p, i) => {
          const pct = totalAll ? Math.round(p.n / totalAll * 100) : 0;
          const active = p.n > 0;
          return `<div style="padding:14px 10px 13px;text-align:center;${i > 0 ? 'border-left:1px solid var(--border)' : ''};position:relative">
            ${i < PIPELINE.length - 1 ? `<div style="position:absolute;right:0;top:50%;transform:translateY(-50%);font-size:0.6rem;color:var(--border);line-height:1;pointer-events:none;z-index:1">▶</div>` : ''}
            <div style="font-size:1.75rem;font-weight:800;color:${active ? p.color : 'var(--border)'};line-height:1;margin-bottom:8px;font-variant-numeric:tabular-nums">${p.n}</div>
            <div style="height:3px;border-radius:2px;background:var(--border);margin:0 4px 8px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:${p.color};border-radius:2px"></div>
            </div>
            <div style="font-size:0.67rem;color:${active ? 'var(--fg)' : 'var(--muted)'};line-height:1.3;font-weight:${active ? '600' : '400'}">${p.key}</div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <!-- KPIs -->
    <div style="display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:20px">
      ${kpiCard(kpis.total,     'Total de RNCs',  'var(--blue)')}
      ${kpiCard(kpis.abertas,   'Aguardando GQ',  'var(--red)')}
      ${kpiCard(kpis.andamento, 'Em Andamento',   'var(--amber)')}
      ${kpiCard(kpis.emAtraso,  'Em Atraso',      'var(--red)',   true,  kpis.emAtraso > 0 ? '⚠ requer atenção' : '')}
      ${kpiCard(kpis.encerradas,'Encerradas',     'var(--green)', false, tmr !== null ? `TMR: ${tmr}d` : '')}
      ${kpiCard(kpis.comCapa,   'Geram CAPA',     'var(--amber)', true,  kpis.comCapa > 0 ? 'verificar CAPAs' : '')}
    </div>

    <div class="card">
      <div style="font-weight:600;margin-bottom:12px;font-size:0.9rem">Todas as RNCs</div>
      ${tableHtml}
    </div>
  `;
}

// ── Ações helpers ────────────────────────────────────────────────────────────

function isAtrasada(a, today) {
  return a.status !== 'Concluída' && a.prazo && new Date(a.prazo + 'T00:00:00') < today;
}

function renderAcoesDashboard(acoes) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const total = acoes.length;
  const pend  = acoes.filter(a => a.status === 'Pendente').length;
  const anda  = acoes.filter(a => a.status === 'Em Andamento').length;
  const conc  = acoes.filter(a => a.status === 'Concluída').length;
  const atra  = acoes.filter(a => isAtrasada(a, today)).length;
  const pctOk = total ? Math.round(conc / total * 100) : 0;
  const pctOf = n => total ? (n / total * 100).toFixed(1) : 0;

  const BARS = [
    { label: 'Concluídas',   n: conc, color: '#22c55e' },
    { label: 'Em Andamento', n: anda, color: '#f59e0b' },
    { label: 'Pendentes',    n: pend, color: '#94a3b8' },
    { label: 'Atrasadas',    n: atra, color: '#ef4444' },
  ];

  const concNoPrazo = acoes.filter(a =>
    a.status === 'Concluída' && a.dataConclusao && a.prazo && a.dataConclusao <= a.prazo
  ).length;
  const pctNoPrazo = conc ? Math.round(concNoPrazo / conc * 100) : null;

  const rankMap = {};
  acoes.forEach(a => {
    if (isAtrasada(a, today)) rankMap[a.responsavel] = (rankMap[a.responsavel] || 0) + 1;
  });
  const rank = Object.entries(rankMap).sort((a, b) => b[1] - a[1]).slice(0, 6);

  const barSegments = BARS.filter(b => b.n).map(b =>
    `<div style="height:100%;width:${pctOf(b.n)}%;background:${b.color}" title="${b.label}: ${b.n}"></div>`
  ).join('');
  const pctColor = pctOk >= 70 ? '#22c55e' : pctOk >= 40 ? '#f59e0b' : '#ef4444';

  const rankHtml = rank.length ? `
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="font-size:0.75rem;font-weight:600;color:var(--muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Ações em atraso por responsável</div>
      ${rank.map(([nome, n], i) => {
        const pct = Math.round(n / (rank[0][1] || 1) * 100);
        const cor = i === 0 ? '#ef4444' : i <= 1 ? '#f59e0b' : '#94a3b8';
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
          <span style="font-size:0.78rem;min-width:120px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nome}</span>
          <div style="flex:1;height:6px;border-radius:3px;background:var(--border)">
            <div style="height:100%;width:${pct}%;background:${cor};border-radius:3px"></div>
          </div>
          <span style="font-size:0.75rem;font-weight:700;color:${cor};min-width:16px;text-align:right">${n}</span>
        </div>`;
      }).join('')}
    </div>
  ` : '';

  return `
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px">
      ${kpiCard(total, 'Total',        'var(--blue)', false)}
      ${kpiCard(pend,  'Pendentes',    '#94a3b8', false)}
      ${kpiCard(anda,  'Em Andamento', '#f59e0b', false)}
      ${kpiCard(conc,  'Concluídas',   '#22c55e', false)}
      ${kpiCard(atra,  'Atrasadas',    '#ef4444', atra > 0)}
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:0.72rem;color:var(--muted)">
      <span>Distribuição por status</span>
      <span style="display:flex;gap:12px;align-items:center">
        ${pctNoPrazo !== null ? `<span style="color:${pctNoPrazo >= 70 ? '#22c55e' : '#f59e0b'};font-weight:600">${pctNoPrazo}% concluído no prazo</span>` : ''}
        <span style="color:${pctColor};font-weight:600">${pctOk}% concluído</span>
      </span>
    </div>
    <div style="height:10px;border-radius:5px;overflow:hidden;display:flex;background:var(--border);margin-bottom:6px">
      ${total ? barSegments : ''}
    </div>
    <div style="display:flex;gap:14px;font-size:0.7rem;color:var(--muted);flex-wrap:wrap">
      ${BARS.map(b =>
        `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${b.color};margin-right:3px;vertical-align:middle"></span>${b.label}: <strong>${b.n}</strong></span>`
      ).join('')}
    </div>
    ${rankHtml}
  `;
}

// ── Filter bar ───────────────────────────────────────────────────────────────

const SEL_STYLE = 'padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:0.82rem;background:var(--surface);color:var(--fg)';
const INP_STYLE = `${SEL_STYLE};flex:1;min-width:160px;max-width:260px`;

function renderFiltrosBar(acoes) {
  const responsaveis = [...new Set(acoes.map(a => a.responsavel).filter(Boolean))].sort();
  const rncNums      = [...new Set(acoes.map(a => a.rncNumero).filter(Boolean))].sort();
  const hasFilter    = acaoFiltros.busca || acaoFiltros.status || acaoFiltros.responsavel || acaoFiltros.rnc || acaoFiltros.etapa;

  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input id="acao-busca" type="text" placeholder="Buscar ação ou Nº RNC…" style="${INP_STYLE}" value="${acaoFiltros.busca}">
      <select id="acao-etapa" style="${SEL_STYLE}">
        <option value="">Todas as etapas</option>
        ${['Ação Imediata','Ação','Verificação de Eficácia','Planejamento'].map(s =>
          `<option value="${s}" ${acaoFiltros.etapa === s ? 'selected' : ''}>${s}</option>`
        ).join('')}
      </select>
      <select id="acao-status" style="${SEL_STYLE}">
        <option value="">Todos os status</option>
        ${['Pendente','Em Andamento','Concluída','Atrasada'].map(s =>
          `<option value="${s}" ${acaoFiltros.status === s ? 'selected' : ''}>${s}</option>`
        ).join('')}
      </select>
      <select id="acao-responsavel" style="${SEL_STYLE}">
        <option value="">Todos os responsáveis</option>
        ${responsaveis.map(r => `<option value="${r}" ${acaoFiltros.responsavel === r ? 'selected' : ''}>${r}</option>`).join('')}
      </select>
      <select id="acao-rnc" style="${SEL_STYLE}">
        <option value="">Todas as RNCs</option>
        ${rncNums.map(n => `<option value="${n}" ${acaoFiltros.rnc === n ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      ${hasFilter ? `<button class="btn btn-secondary btn-sm" data-action="limpar-filtros">✕ Limpar</button>` : ''}
    </div>
  `;
}

function applyFiltros(acoes) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return acoes.filter(a => {
    if (acaoFiltros.busca) {
      const q = acaoFiltros.busca.toLowerCase();
      if (!a.acao.toLowerCase().includes(q) && !(a.rncNumero || '').toLowerCase().includes(q)) return false;
    }
    if (acaoFiltros.status) {
      if (acaoFiltros.status === 'Atrasada') { if (!isAtrasada(a, today)) return false; }
      else if (a.status !== acaoFiltros.status) return false;
    }
    if (acaoFiltros.etapa       && a.etapa       !== acaoFiltros.etapa)       return false;
    if (acaoFiltros.responsavel && a.responsavel !== acaoFiltros.responsavel) return false;
    if (acaoFiltros.rnc         && a.rncNumero   !== acaoFiltros.rnc)         return false;
    return true;
  });
}

function renderAcoesTableBody(allAcoes, session = getSession()) {
  const filtered  = applyFiltros(allAcoes);
  const hasFilter = acaoFiltros.busca || acaoFiltros.status || acaoFiltros.responsavel || acaoFiltros.rnc || acaoFiltros.etapa;
  const countLabel = hasFilter
    ? `<span style="font-size:0.74rem;color:var(--muted);margin-left:8px">${filtered.length} de ${allAcoes.length} exibidas</span>`
    : '';

  const tableHtml = filtered.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Nº RNC</th><th>Etapa</th><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>Conclusão</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${filtered.map(a => {
            const etapaColor = { 'Ação Imediata': '#ef4444', 'Verificação de Eficácia': '#f59e0b', 'Planejamento': '#94a3b8', 'Ação': '#3b82f6' };
            const ec = etapaColor[a.etapa] || '#94a3b8';
            const etapaBadge = a.etapa
              ? `<span style="font-size:0.65rem;padding:1px 6px;border-radius:3px;background:${ec}18;color:${ec};font-weight:700;white-space:nowrap">${a.etapa}</span>`
              : '—';
            const canEdit = canEditAcao(a, session);
            const canDel  = canManageAcoes(session);
            const editBtn = canEdit ? `<button class="btn btn-secondary btn-sm" data-action="edit-acao" data-id="${a.id}" title="Editar">✏</button>` : '';
            const delBtn  = canDel  ? `<button class="btn btn-danger btn-sm" data-action="delete-acao" data-id="${a.id}" title="Excluir">🗑</button>` : '';
            const acoesCel = (canEdit || canDel) ? `<div class="td-actions">${editBtn}${delBtn}</div>` : '—';
            return `<tr>
              <td><strong>${a.rncNumero}</strong></td>
              <td>${etapaBadge}</td>
              <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.acao}">${a.acao}</td>
              <td>${a.responsavel}</td>
              <td>${deadlineCell(a.prazo)}</td>
              <td>${statusPill(a.status)}</td>
              <td>${a.dataConclusao ? formatDate(a.dataConclusao) : '—'}</td>
              <td>${acoesCel}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : emptyState(hasFilter ? 'Nenhuma ação encontrada com os filtros selecionados.' : 'Nenhuma ação registrada.');

  return `<div id="acoes-count-label" style="margin-bottom:4px">${countLabel}</div>${tableHtml}`;
}

function renderPrazos(rncs) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const open = rncs.filter(r => !CLOSED.includes(r.status));

  if (!open.length) return emptyState('Nenhuma RNC em aberto.');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Nº RNC</th><th>Produto</th><th>Status</th><th>Data Abertura</th>
          <th>Prazo de Finalização</th><th>Situação</th>
        </tr></thead>
        <tbody>
          ${open.map(r => {
            const prazo = r.prazoFinalizacao;
            const emAtraso = prazo && new Date(prazo + 'T00:00:00') < hoje;
            const situacaoHtml = emAtraso
              ? `<span style="color:var(--red);font-weight:600">⚠ Em atraso</span>`
              : prazo
                ? '<span style="color:var(--green)">✓ Em dia</span>'
                : '<span style="color:var(--muted)">—</span>';
            return `<tr>
              <td><strong>${r.numero}</strong></td>
              <td>${r.produto || '—'}</td>
              <td>${statusPill(r.status)}</td>
              <td>${formatDate(r.dataAbertura)}</td>
              <td>${prazo ? deadlineCell(prazo) : '<span style="color:var(--muted)">—</span>'}</td>
              <td>${situacaoHtml}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAcoesPrazos() {
  const session  = getSession();
  const allAcoes = db.get('rncAcoes');
  const rncs     = db.get('rnc');

  return `
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:600;font-size:0.9rem;margin-bottom:14px">Dashboard de Ações</div>
      ${renderAcoesDashboard(allAcoes)}
    </div>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:600;font-size:0.9rem">Ações</span>
        ${canManageAcoes(session) ? `<button class="btn btn-primary btn-sm" data-action="new-acao">+ Nova Ação</button>` : ''}
      </div>
      ${renderFiltrosBar(allAcoes)}
      <div id="acoes-table-wrap">${renderAcoesTableBody(allAcoes, session)}</div>
    </div>
    <div class="card">
      <div style="font-weight:600;margin-bottom:12px;font-size:0.9rem">Prazos de Finalização</div>
      ${renderPrazos(rncs)}
    </div>
  `;
}

function buildTabBar(active) {
  return [
    { key: 'painel',      label: 'Painel' },
    { key: 'acoesPrazos', label: 'Ações & Prazos' },
    { key: 'fluxo',       label: 'Fluxo do Processo' },
  ].map(t => {
    const isActive = t.key === active;
    return `<button class="tab-btn" data-tab="${t.key}" style="padding:8px 22px;border:none;background:none;cursor:pointer;font-size:0.875rem;border-bottom:2px solid ${isActive ? 'var(--blue)' : 'transparent'};color:${isActive ? 'var(--blue)' : 'var(--muted)'};font-weight:${isActive ? '600' : '400'}">${t.label}</button>`;
  }).join('');
}

function fieldsAcao(rncs) {
  const equipe = db.get('equipe').map(m => m.nome);
  return [
    { id: 'rncRef',        label: 'RNC',         type: 'select',   required: true,  span: 2, options: rncs.map(r => `${r.numero} — ${r.descricao.slice(0, 40)}`) },
    { id: 'etapa',         label: 'Etapa',        type: 'select',   required: true,  span: 1, options: ETAPAS_ACAO },
    { id: 'acao',          label: 'Ação',         type: 'textarea', required: true,  span: 2 },
    { id: 'responsavel',   label: 'Responsável',  type: 'select',   required: true,  span: 1, options: equipe },
    { id: 'prazo',         label: 'Prazo',        type: 'date',     required: true,  span: 1 },
    { id: 'status',        label: 'Status',       type: 'select',   required: true,  span: 1, options: ACAO_STATUS },
    { id: 'evidencia',     label: 'Evidência',    type: 'text',     required: false, span: 1 },
    { id: 'dataConclusao', label: 'Data Conclusão', type: 'date',   required: false, span: 1 },
  ];
}

let activeTab   = 'painel';
let acaoFiltros = { busca: '', status: '', responsavel: '', rnc: '', etapa: '' };
let _searchTimer;

const TABS = ['painel', 'acoesPrazos', 'fluxo'];

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>RNC — Gerencial</h2>
      </div>
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:20px">
        ${buildTabBar(activeTab)}
      </div>
      <div id="tab-painel"      ${activeTab !== 'painel'      ? 'style="display:none"' : ''}>${renderPainel()}</div>
      <div id="tab-acoesPrazos" ${activeTab !== 'acoesPrazos' ? 'style="display:none"' : ''}>${renderAcoesPrazos()}</div>
      <div id="tab-fluxo"       ${activeTab !== 'fluxo'       ? 'style="display:none"' : ''}>${renderFluxoProcesso()}</div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) {
        activeTab = tabBtn.dataset.tab;
        container.querySelectorAll('[data-tab]').forEach(b => {
          const a = b.dataset.tab === activeTab;
          b.style.borderBottomColor = a ? 'var(--blue)' : 'transparent';
          b.style.color      = a ? 'var(--blue)' : 'var(--muted)';
          b.style.fontWeight = a ? '600' : '400';
        });
        TABS.forEach(t => {
          const el = container.querySelector(`#tab-${t}`);
          if (el) el.style.display = t === activeTab ? '' : 'none';
        });
        if (activeTab === 'fluxo') {
          const el = container.querySelector('#tab-fluxo');
          if (el) el.innerHTML = renderFluxoProcesso();
        }
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      if (action === 'limpar-filtros') {
        acaoFiltros = { busca: '', status: '', responsavel: '', rnc: '', etapa: '' };
        container.querySelector('#tab-acoesPrazos').innerHTML = renderAcoesPrazos();
        return;
      }

      if (action === 'new-acao') {
        if (!canManageAcoes()) return;
        const rncs = db.get('rnc');
        openModal({
          title: 'Nova Ação de RNC',
          fields: fieldsAcao(rncs),
          data: { status: 'Pendente' },
          onSave: data => {
            const rnc = rncs.find(r => r.numero === data.rncRef?.split(' — ')[0]) ?? rncs[0];
            db.add('rncAcoes', {
              rncId: rnc?.id ?? 0, rncNumero: rnc?.numero ?? '',
              acao: data.acao, responsavel: data.responsavel,
              prazo: data.prazo, status: data.status,
              etapa: data.etapa, evidencia: data.evidencia,
              dataConclusao: data.dataConclusao,
            });
            toast('Ação criada!');
            container.querySelector('#tab-acoesPrazos').innerHTML = renderAcoesPrazos();
          },
        });
      }

      if (action === 'edit-acao') {
        const record = db.getById('rncAcoes', numId);
        if (!record || !canEditAcao(record)) return;
        const rncs   = db.get('rnc');
        const fields = fieldsAcao(rncs).filter(f => f.id !== 'rncRef');
        openModal({
          title: 'Editar Ação',
          fields,
          data: record,
          onSave: data => {
            db.update('rncAcoes', numId, data);
            toast('Ação atualizada!');
            container.querySelector('#tab-acoesPrazos').innerHTML = renderAcoesPrazos();
          },
        });
      }

      if (action === 'delete-acao') {
        if (!canManageAcoes()) return;
        showConfirm('Deseja excluir esta ação?').then(ok => {
          if (!ok) return;
          db.remove('rncAcoes', numId);
          toast('Ação excluída.', 'warning');
          container.querySelector('#tab-acoesPrazos').innerHTML = renderAcoesPrazos();
        });
      }
    });

    container.addEventListener('change', e => {
      if      (e.target.id === 'acao-status')      acaoFiltros.status      = e.target.value;
      else if (e.target.id === 'acao-etapa')       acaoFiltros.etapa       = e.target.value;
      else if (e.target.id === 'acao-responsavel') acaoFiltros.responsavel = e.target.value;
      else if (e.target.id === 'acao-rnc')         acaoFiltros.rnc         = e.target.value;
      else return;
      const bar = container.querySelector('#tab-acoesPrazos');
      if (bar) bar.innerHTML = renderAcoesPrazos();
    });

    container.addEventListener('input', e => {
      if (e.target.id !== 'acao-busca') return;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        acaoFiltros.busca = e.target.value;
        const wrap = container.querySelector('#acoes-table-wrap');
        if (wrap) wrap.innerHTML = renderAcoesTableBody(db.get('rncAcoes'), getSession());
      }, 280);
    });
  },
};
