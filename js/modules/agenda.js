/**
 * @fileoverview Agenda GQ — calendário unificado de prazos de todos os módulos do SGQ.
 */

import { db } from '../db.js';
import { statusPill, formatDate } from '../utils.js';
import { ROUTES } from '../constants.js';

// ── Helpers ──────────────────────────────────────────────────────────────────

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

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

// ── Metadados de fonte ────────────────────────────────────────────────────────

const FONTES = {
  'CAPA':        { cor: '#dc2626', sigla: 'CAPA',   label: 'CAPA'            },
  'Ação CAPA':   { cor: '#f87171', sigla: 'AçCapa', label: 'Ações CAPA'      },
  'RNC':         { cor: '#9f1239', sigla: 'RNC',    label: 'RNC'             },
  'Ação RNC':    { cor: '#be123c', sigla: 'AçRNC',  label: 'Ações RNC'       },
  'GCM':         { cor: '#7c3aed', sigla: 'GCM',    label: 'Mudanças (GCM)'  },
  'Ação GCM':    { cor: '#a78bfa', sigla: 'AçGCM',  label: 'Ações GCM'       },
  'Reclamação':  { cor: '#0891b2', sigla: 'Reclam', label: 'Reclamações'     },
  'Auditoria':   { cor: '#065f46', sigla: 'Audit',  label: 'Auditorias'      },
  'Tecnovig':    { cor: '#b45309', sigla: 'Tecno',  label: 'Tecnovigilância' },
  'Validação':   { cor: '#059669', sigla: 'Val',    label: 'Validações'      },
  'Fornecedor':  { cor: '#0284c7', sigla: 'Forn',   label: 'Fornecedores'    },
  'Obrigação':   { cor: '#2563eb', sigla: 'Obrig',  label: 'Obrig. Reg.'     },
  'Documento':   { cor: '#6d28d9', sigla: 'Doc',    label: 'Documentos'      },
  'Doc Admin':   { cor: '#92400e', sigla: 'DocA',   label: 'Docs. Adm.'      },
  'Projeto':     { cor: '#1e40af', sigla: 'Proj',   label: 'Projetos GQ'     },
};

function fonteBadge(fonte) {
  const m = FONTES[fonte] || { cor: '#6b7280', sigla: fonte };
  return `<span style="display:inline-flex;align-items:center;justify-content:center;min-width:48px;height:20px;padding:0 5px;border-radius:3px;background:${m.cor}1a;color:${m.cor};font-size:0.63rem;font-weight:800;letter-spacing:.04em;flex-shrink:0">${m.sigla}</span>`;
}

// ── Projetos — atividades GQ ──────────────────────────────────────────────────

const PROJ_ACTIVE = ['Planejamento', 'Desenvolvimento', 'Verificação', 'Validação'];

const ATIV_KEYS = [
  'f1_analiseReg', 'f1_requisitosEntrada',
  'f2_especProduto', 'f2_especProcesso', 'f2_checklistSaida',
  'f3_planoVerif', 'f3_protocoloSegBio', 'f3_relatorioSegBio',
  'f3_protocoloClinico', 'f3_relatorioClinico', 'f3_checklistVerif',
  'f4_planoValid', 'f4_checklistValid', 'f4_lotePiloto',
  'f5_registroHistorico', 'f5_efetividade', 'f5_termoLiberacao',
];

const ATIV_LABELS = {
  f1_analiseReg:        'Análise Regulatória',
  f1_requisitosEntrada: 'Requisitos de Entrada',
  f2_especProduto:      'Especif. do Produto',
  f2_especProcesso:     'Especif. do Processo',
  f2_checklistSaida:    'Checklist Dados de Saída',
  f3_planoVerif:        'Plano de Verificação',
  f3_protocoloSegBio:   'Protocolo Seg. Biológica',
  f3_relatorioSegBio:   'Relatório Seg. Biológica',
  f3_protocoloClinico:  'Protocolo Av. Clínica',
  f3_relatorioClinico:  'Relatório Av. Clínica',
  f3_checklistVerif:    'Checklist de Verificação',
  f4_planoValid:        'Plano de Validação',
  f4_checklistValid:    'Checklist de Validação',
  f4_lotePiloto:        'Aprovação do Lote Piloto',
  f5_registroHistorico: 'Registro Histórico',
  f5_efetividade:       'Efetividade do Projeto',
  f5_termoLiberacao:    'Termo de Liberação',
};

// ── Urgência ──────────────────────────────────────────────────────────────────

function urgenciaNivel(prazoStr) {
  if (!prazoStr) return 4;
  const d = new Date(prazoStr + 'T00:00:00');
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
  const diff = (d - hoje) / 86400000;
  if (diff < 0)   return 0;
  if (diff <= 15) return 1;
  if (diff <= 60) return 2;
  return 3;
}

const GRUPOS = [
  { nivel: 0, label: 'Vencidas',               cor: '#dc2626' },
  { nivel: 1, label: 'Urgentes (até 15 dias)',  cor: '#f59e0b' },
  { nivel: 2, label: 'Próximas (16–60 dias)',   cor: '#2563eb' },
  { nivel: 3, label: 'Futuras (> 60 dias)',     cor: '#6b7280' },
  { nivel: 4, label: 'Sem prazo definido',      cor: '#9ca3af' },
];

// ── Agregação de atividades ───────────────────────────────────────────────────

function getAtividades(filtroMembro, filtroFonte) {
  const items = [];

  function push(item) {
    if (filtroFonte && item.fonte !== filtroFonte) return;
    if (filtroMembro) {
      const haystack = item._membros || item.responsavel || '';
      if (!haystack.includes(filtroMembro)) return;
    }
    items.push(item);
  }

  // ── CAPA (abertas)
  db.get('capa')
    .filter(c => !['Encerrada', 'Não Procedente'].includes(c.status))
    .forEach(c => push({
      fonte: 'CAPA', codigo: c.numero,
      descricao: c.descricao || '—',
      prazo: c.prazoFinalizacao || c.dataInicioVerificacao || null,
      status: c.status,
      responsavel: c.responsavelAbertura || c.responsavel || '—',
      route: ROUTES.CAPA_ABERTURA,
    }));

  // ── Ações de CAPA (pendentes)
  db.get('capaAcoes')
    .filter(a => !a.dataConclusao)
    .forEach(a => push({
      fonte: 'Ação CAPA', codigo: a.numero || a.capaId || '—',
      descricao: a.acao || a.descricao || '—',
      prazo: a.prazo || null,
      status: a.status || 'Pendente',
      responsavel: a.responsavel || '—',
      route: ROUTES.CAPA_ABERTURA,
    }));

  // ── RNC (abertas)
  db.get('rnc')
    .filter(r => !['Encerrada', 'Cancelada', 'Não Procedente'].includes(r.status))
    .forEach(r => push({
      fonte: 'RNC', codigo: r.numero,
      descricao: r.descricao || r.produto || '—',
      prazo: r.prazoFinalizacao || r.prazoInvestigacao || null,
      status: r.status,
      responsavel: r.responsavel || r.responsavelRNC || '—',
      route: ROUTES.RNC_GERENCIAL,
    }));

  // ── Ações de RNC (pendentes)
  db.get('rncAcoes')
    .filter(a => !a.dataConclusao)
    .forEach(a => push({
      fonte: 'Ação RNC', codigo: a.numero || a.rncId || '—',
      descricao: a.acao || a.descricao || '—',
      prazo: a.prazo || null,
      status: a.status || 'Pendente',
      responsavel: a.responsavel || '—',
      route: ROUTES.RNC_GERENCIAL,
    }));

  // ── GCM (ativas)
  db.get('gcm')
    .filter(g => !['Concluída', 'Rejeitada', 'Cancelada'].includes(g.status))
    .forEach(g => push({
      fonte: 'GCM', codigo: g.numero,
      descricao: g.titulo || g.descricao || '—',
      prazo: g.prazoImplementacao || null,
      status: g.status,
      responsavel: g.responsavel || '—',
      route: ROUTES.GCM_GERENCIAL,
    }));

  // ── Ações de GCM (pendentes)
  db.get('gcmAcoes')
    .filter(a => !a.dataConclusao)
    .forEach(a => push({
      fonte: 'Ação GCM', codigo: a.numero || a.gcmId || '—',
      descricao: a.acao || a.descricao || '—',
      prazo: a.prazo || null,
      status: a.status || 'Pendente',
      responsavel: a.responsavel || '—',
      route: ROUTES.GCM_ABERTURA,
    }));

  // ── Reclamações (abertas)
  db.get('reclamacoes')
    .filter(r => !['Concluída', 'Cancelada'].includes(r.status))
    .forEach(r => {
      const prazo = r.prazoFechamento || (r.dataAbertura ? addDays(r.dataAbertura, 90) : null);
      push({
        fonte: 'Reclamação', codigo: r.numero,
        descricao: r.produto || r.descricao || '—',
        prazo,
        status: r.status,
        responsavel: r.responsavel || '—',
        route: ROUTES.RECLAM_GERENCIAL,
      });
    });

  // ── Auditorias (planejadas / em execução)
  db.get('auditorias')
    .filter(a => ['Planejada', 'Em Execução'].includes(a.status))
    .forEach(a => push({
      fonte: 'Auditoria', codigo: a.numero,
      descricao: a.area || a.tipo || '—',
      prazo: a.dataPrevisao || null,
      status: a.status,
      responsavel: a.auditorLider || a.responsavel || '—',
      route: ROUTES.AUDIT_EXEC,
    }));

  // ── Tecnovigilância (abertas)
  db.get('tecno')
    .filter(t => !['Concluído', 'Cancelado'].includes(t.status))
    .forEach(t => push({
      fonte: 'Tecnovig', codigo: t.numero,
      descricao: t.produto || t.descricao || '—',
      prazo: t.prazoAnvisa || null,
      status: t.status,
      responsavel: t.responsavel || '—',
      route: ROUTES.TECNOVIG,
    }));

  // ── Validações (ativas)
  db.get('validacoes')
    .filter(v => !['Qualificado/Validado', 'Descontinuado', 'Cancelada'].includes(v.status))
    .forEach(v => push({
      fonte: 'Validação', codigo: v.numero,
      descricao: v.tipo + (v.fase ? ` · ${v.fase}` : ''),
      prazo: v.prazo || null,
      status: v.status,
      responsavel: v.responsavel || '—',
      route: ROUTES.VALIDACOES,
    }));

  // ── Fornecedores em qualificação
  db.get('fornecedores')
    .filter(f => f.status === 'Em Qualificação')
    .forEach(f => push({
      fonte: 'Fornecedor', codigo: f.nome || f.codigo,
      descricao: `Qualificação — ${f.categoria || '—'} · criticidade ${f.criticidade || '—'}`,
      prazo: f.validade || null,
      status: f.status,
      responsavel: f.responsavel || '—',
      route: ROUTES.FORNECEDORES,
    }));

  // ── Obrigações Regulatórias (ativas)
  db.get('obrigacoes')
    .filter(o => o.status !== 'Suspenso')
    .forEach(o => push({
      fonte: 'Obrigação', codigo: o.numero,
      descricao: o.nome,
      prazo: o.proximoVencimento || null,
      status: o.status,
      responsavel: o.responsavel || '—',
      route: ROUTES.OBRIGACOES,
    }));

  // ── Documentos que precisam de ação
  db.get('documentos')
    .filter(d => ['Em Elaboração', 'Em Revisão', 'A Vencer', 'Vencido'].includes(docStatus(d)))
    .forEach(d => {
      const s = docStatus(d);
      const exp = docExpiry(d);
      push({
        fonte: 'Documento', codigo: d.numero,
        descricao: d.titulo,
        prazo: (s === 'Em Elaboração' || s === 'Em Revisão') ? null : exp,
        status: s,
        responsavel: d.revisores || d.elaboradores || '—',
        _membros: [d.elaboradores, d.revisores, d.aprovadores].filter(Boolean).join(' '),
        route: ROUTES.DOCUMENTOS,
      });
    });

  // ── Documentos Administrativos (dentro do período de alerta)
  db.get('docsAdmin')
    .filter(d => d.dataValidade)
    .forEach(d => {
      const antecedencia = Number(d.prazoAntecedenciaDias) || 30;
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      const venc = new Date(d.dataValidade + 'T00:00:00');
      const alerta = new Date(venc); alerta.setDate(alerta.getDate() - antecedencia);
      if (hoje < alerta) return;
      push({
        fonte: 'Doc Admin', codigo: d.numero || '—',
        descricao: d.titulo || '—',
        prazo: d.dataValidade,
        status: d.status || (venc < hoje ? 'Vencido' : 'A Vencer'),
        responsavel: d.responsavel || '—',
        route: 'docsAdmin',
      });
    });

  // ── Projetos — atividades GQ pendentes com prazo
  db.get('projetos')
    .filter(p => PROJ_ACTIVE.includes(p.status))
    .forEach(proj => {
      ATIV_KEYS.forEach(key => {
        const status = proj[key] || 'Pendente';
        if (status === 'N/A' || status === 'Concluído') return;
        const prazo = proj[`${key}Prazo`];
        if (!prazo) return;
        push({
          fonte: 'Projeto', codigo: proj.numero || proj.codigoProjeto || '—',
          descricao: `${proj.produto || '—'} — ${ATIV_LABELS[key]}`,
          prazo,
          status,
          responsavel: proj.responsavelGQ || '—',
          route: ROUTES.PROJ_GERENCIAL,
        });
      });
    });

  return items;
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderItem(it) {
  const m = FONTES[it.fonte] || { cor: '#6b7280' };
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
        <div style="font-size:0.81rem;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:480px;color:var(--fg)">${it.descricao}</div>
      </div>
      <div style="flex-shrink:0;font-size:0.71rem;color:var(--muted);text-align:right;padding-top:2px;min-width:90px;white-space:nowrap">${it.responsavel}</div>
    </div>`;
}

function renderGrupos(filtroMembro, filtroFonte) {
  const items = getAtividades(filtroMembro, filtroFonte);
  if (!items.length) {
    const parts = [];
    if (filtroMembro) parts.push(`<strong>${filtroMembro}</strong>`);
    if (filtroFonte)  parts.push(`módulo <strong>${FONTES[filtroFonte]?.label || filtroFonte}</strong>`);
    return `
      <div style="padding:32px;text-align:center;color:var(--muted);font-size:0.88rem">
        Nenhuma atividade pendente${parts.length ? ` para ${parts.join(' · ')}` : ''}.
      </div>`;
  }

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

function renderKpis(items) {
  const n0 = items.filter(i => urgenciaNivel(i.prazo) === 0).length;
  const n1 = items.filter(i => urgenciaNivel(i.prazo) === 1).length;
  const n2 = items.filter(i => urgenciaNivel(i.prazo) === 2).length;
  const n3 = items.filter(i => urgenciaNivel(i.prazo) === 3).length;

  function kpi(val, label, cor) {
    return `<div style="padding:12px 16px;background:var(--surface);border:1px solid var(--border);border-left:3px solid ${cor};border-radius:8px;text-align:center">
      <div style="font-size:1.5rem;font-weight:700;color:${cor};line-height:1.1">${val}</div>
      <div style="font-size:0.69rem;color:var(--muted);margin-top:3px">${label}</div>
    </div>`;
  }

  return `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px">
    ${kpi(n0, 'Vencidas', '#dc2626')}
    ${kpi(n1, 'Urgentes ≤15d', '#f59e0b')}
    ${kpi(n2, 'Próximas 16–60d', '#2563eb')}
    ${kpi(n3, 'Futuras', '#6b7280')}
  </div>`;
}

function renderCards(equipe, filtroAtual) {
  return equipe.map(m => {
    const items = getAtividades(m.nome, '');
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

function renderFonteChips(filtroFonte) {
  const todosStyle = !filtroFonte
    ? 'background:var(--blue,#2563eb);color:#fff;border:1px solid var(--blue,#2563eb)'
    : 'background:var(--surface);color:var(--text);border:1px solid var(--border)';

  const chips = Object.entries(FONTES).map(([key, m]) => {
    const ativo = filtroFonte === key;
    const style = ativo
      ? `background:${m.cor};color:#fff;border:1px solid ${m.cor}`
      : 'background:var(--surface);color:var(--text);border:1px solid var(--border)';
    return `<button class="btn btn-xs" data-action="fonte" data-fonte="${key}" style="${style}">${m.label}</button>`;
  }).join('');

  return `<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center">
    <button class="btn btn-xs" data-action="fonte" data-fonte="" style="${todosStyle}">Todos os módulos</button>
    ${chips}
  </div>`;
}

let _filtroMembro = '';
let _filtroFonte  = '';

function rebuild(container) {
  const equipe = db.get('equipe');
  const allItems = getAtividades(_filtroMembro, _filtroFonte);

  container.querySelector('#ag-cards').innerHTML       = renderCards(equipe, _filtroMembro);
  container.querySelector('#ag-fonte-chips').innerHTML = renderFonteChips(_filtroFonte);
  container.querySelector('#ag-kpis').innerHTML        = renderKpis(allItems);

  const tags = [];
  if (_filtroMembro) tags.push(`<button class="btn btn-secondary btn-sm" data-action="limpar-membro">✕ ${_filtroMembro}</button>`);
  if (_filtroFonte)  tags.push(`<button class="btn btn-secondary btn-sm" data-action="limpar-fonte">✕ ${FONTES[_filtroFonte]?.label || _filtroFonte}</button>`);

  container.querySelector('#ag-filtro-ativo').innerHTML = tags.length
    ? `<span style="font-size:0.75rem;color:var(--muted);margin-right:4px">Filtros:</span>${tags.join('')}`
    : '<span style="font-size:0.79rem;color:var(--muted)">Todos os módulos · todos os responsáveis</span>';

  container.querySelector('#ag-grupos').innerHTML = renderGrupos(_filtroMembro, _filtroFonte);
}

// ── Módulo ────────────────────────────────────────────────────────────────────

export default {
  render(container) {
    const equipe   = db.get('equipe');
    const allItems = getAtividades('', '');

    container.innerHTML = `
      <div class="page-header">
        <h2>Agenda GQ — Calendário Unificado</h2>
      </div>

      <div id="ag-kpis">${renderKpis(allItems)}</div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px;margin-bottom:16px" id="ag-cards">
        ${renderCards(equipe, _filtroMembro)}
      </div>

      <div class="card">
        <div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid var(--border)">
          <div style="font-size:0.71rem;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">Filtrar por módulo</div>
          <div id="ag-fonte-chips">${renderFonteChips(_filtroFonte)}</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:16px">
          <strong style="font-size:0.85rem">Atividades programadas &nbsp;<span style="font-weight:400;color:var(--muted)">(${allItems.length} no total)</span></strong>
          <div id="ag-filtro-ativo" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
            <span style="font-size:0.79rem;color:var(--muted)">Todos os módulos · todos os responsáveis</span>
          </div>
        </div>
        <div id="ag-grupos">${renderGrupos(_filtroMembro, _filtroFonte)}</div>
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action } = btn.dataset;
      if (action === 'filtrar')       { _filtroMembro = btn.dataset.nome;  rebuild(container); }
      if (action === 'limpar-membro') { _filtroMembro = '';                rebuild(container); }
      if (action === 'fonte')         { _filtroFonte  = btn.dataset.fonte; rebuild(container); }
      if (action === 'limpar-fonte')  { _filtroFonte  = '';                rebuild(container); }
      if (action === 'ir')            { window.location.hash = '#' + btn.dataset.route; }
    });
  },
};
