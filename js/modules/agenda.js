/**
 * @fileoverview Agenda da Equipe GQ — visão consolidada de todas as atividades por colaboradora.
 * Agrega Validações, CAPA, Obrigações Regulatórias, Documentos (A Vencer/Em Revisão) e Fornecedores.
 */

import { db } from '../db.js';
import { statusPill, formatDate } from '../utils.js';
import { ROUTES } from '../constants.js';

// ── Helpers de documento ────────────────────────────────────────────────────

const SEM_VALIDADE_DOC = ['PR', 'RE'];

function docExpiry(doc) {
  if (SEM_VALIDADE_DOC.includes(doc.tipo) || !doc.dataHomologacao) return null;
  const d = new Date(doc.dataHomologacao);
  d.setFullYear(d.getFullYear() + 3);
  return d.toISOString().substring(0, 10);
}

function docStatus(doc) {
  if (['Em Elaboração', 'Em Revisão', 'Cancelado', 'Suspenso'].includes(doc.status)) return doc.status;
  if (SEM_VALIDADE_DOC.includes(doc.tipo)) return 'Vigente';
  if (!doc.dataHomologacao) return 'Em Elaboração';
  const exp = new Date(doc.dataHomologacao);
  exp.setFullYear(exp.getFullYear() + 3);
  const diff = (exp - new Date()) / 86400000;
  if (diff < 0) return 'Vencido';
  if (diff <= 90) return 'A Vencer';
  return 'Vigente';
}

// ── Metadados de fonte ─────────────────────────────────────────────────────

const FONTE_META = {
  'Validação':  { cor: '#059669', sigla: 'Val'   },
  'CAPA':       { cor: '#dc2626', sigla: 'CAPA'  },
  'Obrigação':  { cor: '#2563eb', sigla: 'Obrig' },
  'Documento':  { cor: '#7c3aed', sigla: 'Doc'   },
  'Fornecedor': { cor: '#0891b2', sigla: 'Forn'  },
};

function fonteBadge(fonte) {
  const m = FONTE_META[fonte] || { cor: '#6b7280', sigla: fonte };
  return `<span style="display:inline-flex;align-items:center;justify-content:center;width:46px;height:20px;border-radius:3px;background:${m.cor}18;color:${m.cor};font-size:0.65rem;font-weight:800;letter-spacing:.05em;flex-shrink:0">${m.sigla}</span>`;
}

// ── Urgência ───────────────────────────────────────────────────────────────

function urgenciaNivel(prazoStr) {
  if (!prazoStr) return 4;
  const d = new Date(prazoStr + 'T00:00:00');
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const diff = (d - hoje) / 86400000;
  if (diff < 0)  return 0;   // vencida
  if (diff <= 15) return 1;  // urgente
  if (diff <= 60) return 2;  // próxima
  return 3;                  // futura
}

const GRUPOS = [
  { nivel: 0, label: 'Vencidas',              cor: '#dc2626' },
  { nivel: 1, label: 'Urgentes (até 15 dias)', cor: '#f59e0b' },
  { nivel: 2, label: 'Próximas (16–60 dias)',  cor: '#2563eb' },
  { nivel: 3, label: 'Futuras (> 60 dias)',    cor: '#6b7280' },
  { nivel: 4, label: 'Sem prazo definido',     cor: '#9ca3af' },
];

// ── Agregação de atividades ────────────────────────────────────────────────

function getAtividades(filtro) {
  const items = [];

  // Validações (ativas)
  db.get('validacoes')
    .filter(v => !['Qualificado/Validado', 'Descontinuado', 'Cancelada'].includes(v.status))
    .filter(v => !filtro || v.responsavel === filtro)
    .forEach(v => items.push({
      fonte: 'Validação', codigo: v.numero,
      descricao: v.tipo + (v.fase ? ` · ${v.fase}` : ''),
      prazo: v.prazo || null, status: v.status,
      responsavel: v.responsavel, route: ROUTES.VALIDACOES,
    }));

  // CAPA (abertas)
  db.get('capa')
    .filter(c => !['Encerrada', 'Não Procedente', 'Concluída', 'Cancelada'].includes(c.status))
    .filter(c => !filtro || c.responsavelAbertura === filtro || c.responsavel === filtro)
    .forEach(c => items.push({
      fonte: 'CAPA', codigo: c.numero,
      descricao: c.descricao,
      prazo: c.dataInicioVerificacao || null, status: c.status,
      responsavel: c.responsavelAbertura || c.responsavel, route: ROUTES.CAPA_ABERTURA,
    }));

  // Obrigações Regulatórias (ativas)
  db.get('obrigacoes')
    .filter(o => o.status !== 'Suspenso')
    .filter(o => !filtro || o.responsavel === filtro)
    .forEach(o => items.push({
      fonte: 'Obrigação', codigo: o.numero,
      descricao: o.nome,
      prazo: o.proximoVencimento || null, status: o.status,
      responsavel: o.responsavel, route: ROUTES.OBRIGACOES,
    }));

  // Documentos que precisam de ação (Em Elaboração, Em Revisão, A Vencer, Vencido)
  db.get('documentos')
    .filter(d => ['Em Elaboração', 'Em Revisão', 'A Vencer', 'Vencido'].includes(docStatus(d)))
    .filter(d => {
      if (!filtro) return true;
      return [d.elaboradores, d.revisores, d.aprovadores].join(' ').includes(filtro);
    })
    .forEach(d => {
      const s = docStatus(d);
      const exp = docExpiry(d);
      items.push({
        fonte: 'Documento', codigo: d.numero,
        descricao: d.titulo,
        prazo: (s === 'Em Elaboração' || s === 'Em Revisão') ? null : exp,
        status: s,
        responsavel: d.revisores || d.elaboradores || '—',
        route: ROUTES.DOCUMENTOS,
      });
    });

  // Fornecedores Em Qualificação
  db.get('fornecedores')
    .filter(f => f.status === 'Em Qualificação')
    .filter(f => !filtro || f.responsavel === filtro)
    .forEach(f => items.push({
      fonte: 'Fornecedor', codigo: f.nome,
      descricao: `Qualificação — ${f.categoria} · criticidade ${f.criticidade}`,
      prazo: f.validade || null, status: f.status,
      responsavel: f.responsavel, route: ROUTES.FORNECEDORES,
    }));

  return items;
}

// ── Render ─────────────────────────────────────────────────────────────────

function renderItem(it) {
  const m = FONTE_META[it.fonte] || { cor: '#6b7280' };
  return `
    <div data-action="ir" data-route="${it.route}"
         style="display:flex;align-items:flex-start;gap:10px;padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${m.cor};border-radius:6px;margin-bottom:6px;cursor:pointer"
         title="Abrir módulo ${it.fonte}">
      <div style="padding-top:1px">${fonteBadge(it.fonte)}</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <code style="font-size:0.78rem;font-weight:700;color:var(--fg)">${it.codigo}</code>
          <span style="font-size:0.72rem;color:var(--muted)">${it.prazo ? formatDate(it.prazo) : 'sem prazo'}</span>
          ${statusPill(it.status)}
        </div>
        <div style="font-size:0.81rem;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:420px;color:var(--fg)">${it.descricao}</div>
      </div>
      <div style="flex-shrink:0;font-size:0.71rem;color:var(--muted);text-align:right;padding-top:2px;min-width:90px;white-space:nowrap">${it.responsavel}</div>
    </div>`;
}

function renderGrupos(filtro) {
  const items = getAtividades(filtro);
  if (!items.length) return `
    <div style="padding:32px;text-align:center;color:var(--muted);font-size:0.88rem">
      Nenhuma atividade pendente${filtro ? ` para <strong>${filtro}</strong>` : ''}.
    </div>`;

  const sorted = [...items].sort((a, b) => {
    const ua = urgenciaNivel(a.prazo), ub = urgenciaNivel(b.prazo);
    return ua !== ub ? ua - ub : (a.prazo || '9').localeCompare(b.prazo || '9');
  });

  return GRUPOS.map(g => {
    const grupo = sorted.filter(i => urgenciaNivel(i.prazo) === g.nivel);
    if (!grupo.length) return '';
    return `
      <div style="margin-bottom:22px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
          <span style="width:8px;height:8px;border-radius:50%;background:${g.cor};display:inline-block"></span>
          <span style="font-weight:700;font-size:0.78rem;color:${g.cor};text-transform:uppercase;letter-spacing:.07em">${g.label}</span>
          <span class="pill pill-gray">${grupo.length}</span>
        </div>
        ${grupo.map(renderItem).join('')}
      </div>`;
  }).join('');
}

function renderCards(equipe, filtroAtual) {
  return equipe.map(m => {
    const items = getAtividades(m.nome);
    const n0 = items.filter(i => urgenciaNivel(i.prazo) === 0).length;
    const n1 = items.filter(i => urgenciaNivel(i.prazo) === 1).length;
    const n2 = items.filter(i => urgenciaNivel(i.prazo) === 2).length;
    const ativo = filtroAtual === m.nome;
    return `
      <div data-action="filtrar" data-nome="${m.nome}"
           style="padding:14px 16px;background:var(--surface);border:1px solid ${ativo ? m.cor : 'var(--border)'};border-left:4px solid ${m.cor};border-radius:8px;cursor:pointer${ativo ? ';box-shadow:0 0 0 2px ' + m.cor + '33' : ''}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div style="width:34px;height:34px;border-radius:50%;background:${m.cor};color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:0.82rem;flex-shrink:0">${m.iniciais}</div>
          <div>
            <div style="font-weight:600;font-size:0.87rem;line-height:1.2">${m.nome}</div>
            <div style="font-size:0.69rem;color:var(--muted)">${m.cargo}</div>
          </div>
        </div>
        <div style="display:flex;gap:5px;flex-wrap:wrap">
          ${n0 ? `<span class="pill pill-red">${n0} vencida${n0 > 1 ? 's' : ''}</span>` : ''}
          ${n1 ? `<span class="pill pill-amber">${n1} urgente${n1 > 1 ? 's' : ''}</span>` : ''}
          ${n2 ? `<span class="pill pill-blue">${n2} próxima${n2 > 1 ? 's' : ''}</span>` : ''}
          ${!n0 && !n1 && !n2 ? `<span class="pill pill-green">Em dia</span>` : ''}
        </div>
        <div style="font-size:0.69rem;color:var(--muted);margin-top:8px">${items.length} atividade${items.length !== 1 ? 's' : ''} ativa${items.length !== 1 ? 's' : ''}</div>
      </div>`;
  }).join('');
}

let _filtro = '';

function rebuild(container) {
  const equipe = db.get('equipe');
  container.querySelector('#ag-cards').innerHTML  = renderCards(equipe, _filtro);
  container.querySelector('#ag-filtro').innerHTML = _filtro
    ? `<button class="btn btn-secondary btn-sm" data-action="limpar">✕ &nbsp;${_filtro}</button>`
    : '<span style="font-size:0.79rem;color:var(--muted)">Clique em um card para filtrar por colaboradora</span>';
  container.querySelector('#ag-grupos').innerHTML = renderGrupos(_filtro);
}

// ── Módulo ─────────────────────────────────────────────────────────────────

export default {
  render(container) {
    const equipe = db.get('equipe');
    container.innerHTML = `
      <div class="page-header">
        <h2>Agenda da Equipe GQ</h2>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:20px" id="ag-cards">
        ${renderCards(equipe, _filtro)}
      </div>
      <div class="card">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid var(--border)">
          <strong style="font-size:0.85rem">Atividades programadas</strong>
          <div id="ag-filtro">
            ${_filtro
              ? `<button class="btn btn-secondary btn-sm" data-action="limpar">✕ &nbsp;${_filtro}</button>`
              : '<span style="font-size:0.79rem;color:var(--muted)">Clique em um card para filtrar por colaboradora</span>'}
          </div>
        </div>
        <div id="ag-grupos">${renderGrupos(_filtro)}</div>
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action } = btn.dataset;
      if (action === 'filtrar') { _filtro = btn.dataset.nome; rebuild(container); }
      if (action === 'limpar')  { _filtro = '';                rebuild(container); }
      if (action === 'ir')      { window.location.hash = '#' + btn.dataset.route; }
    });
  },
};
