/**
 * @fileoverview CAPA — Gerencial: painel panorâmico e acompanhamento de ações/prazos.
 */

import { db } from '../db.js';
import { formatDate, deadlineCell, statusPill, emptyState } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { ETAPAS_ACAO } from '../constants.js';

const RISK_PILL   = { 'Menor': 'pill-blue', 'Maior': 'pill-amber', 'Crítica': 'pill-red' };
const ACAO_STATUS = ['Pendente', 'Em Andamento', 'Concluída'];

function riskPill(risco) {
  return risco
    ? `<span class="pill ${RISK_PILL[risco] ?? 'pill-gray'}">${risco}</span>`
    : '<span style="color:var(--muted)">—</span>';
}

function kpiCard(value, label, color, highlight) {
  return `<div style="padding:12px;background:var(--surface);border:1px solid ${highlight ? color : 'var(--border)'};border-left:3px solid ${color};border-radius:8px;text-align:center">
    <div style="font-size:1.6rem;font-weight:700;color:${color};line-height:1.1">${value}</div>
    <div style="font-size:0.71rem;color:var(--muted);margin-top:4px">${label}</div>
  </div>`;
}

// ── Painel tab ──────────────────────────────────────────────────────────────

function renderPainel() {
  const all = db.get('capa');
  const kpis = {
    total:      all.length,
    abertas:    all.filter(r => r.status === 'Aberta').length,
    andamento:  all.filter(r => ['Em Investigação', 'Em Plano de Ação', 'Em Verificação de Eficácia'].includes(r.status)).length,
    encerradas: all.filter(r => r.status === 'Encerrada').length,
  };

  const hoje = new Date(); hoje.setHours(0,0,0,0);
  function diasAberto(r) {
    if (!r.dataAbertura) return '—';
    const ini = new Date(r.dataAbertura + 'T00:00:00');
    const fim = r.dataFechamento ? new Date(r.dataFechamento + 'T00:00:00') : hoje;
    const dias = Math.round((fim - ini) / 86400000);
    const aberto = !['Encerrada','Não Procedente'].includes(r.status);
    const cor = aberto && r.prazoFinalizacao && new Date(r.prazoFinalizacao + 'T00:00:00') < hoje ? 'var(--red)' : 'inherit';
    return `<span style="color:${cor};font-weight:${cor !== 'inherit' ? '600' : 'normal'}">${dias}d</span>`;
  }

  const tableHtml = all.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Número</th><th>Descrição</th><th>Origem</th><th>Área</th>
          <th>Responsável</th><th>Abertura</th><th>T. Aberto</th><th>Risco</th><th>Status</th><th>Eficácia</th>
        </tr></thead>
        <tbody>
          ${all.map(r => `<tr>
            <td><strong>${r.numero}</strong></td>
            <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.descricao}">${r.descricao}</td>
            <td>${r.origem || '—'}</td>
            <td>${r.area || '—'}</td>
            <td>${r.responsavelAbertura || '—'}</td>
            <td>${formatDate(r.dataAbertura)}</td>
            <td style="text-align:center">${diasAberto(r)}</td>
            <td>${riskPill(r.classificacaoRisco)}</td>
            <td>${statusPill(r.encerradoStatus || r.status)}</td>
            <td>${r.foiEficaz ? statusPill(r.foiEficaz === 'Sim' ? 'Eficaz' : r.foiEficaz === 'Não' ? 'Ineficaz' : 'Em Avaliação') : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>
  ` : emptyState('Nenhuma CAPA registrada.');

  return `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px">
      ${kpiCard(kpis.total, 'Total', 'var(--blue)')}
      ${kpiCard(kpis.abertas, 'Abertas', 'var(--red)')}
      ${kpiCard(kpis.andamento, 'Em Andamento', 'var(--amber)')}
      ${kpiCard(kpis.encerradas, 'Encerradas', 'var(--green)')}
    </div>
    <div class="card">
      <div style="font-weight:600;margin-bottom:12px;font-size:0.9rem">Todas as CAPAs</div>
      ${tableHtml}
    </div>
  `;
}

// ── Ações & Prazos helpers ──────────────────────────────────────────────────

function addDaysDate(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d;
}

function deadlineAlert(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const isLate = d < today;
  const isNear = !isLate && (d - today) / 86400000 <= 2;
  const color  = isLate ? 'var(--red)' : isNear ? 'var(--amber)' : 'inherit';
  const weight = (isLate || isNear) ? '600' : 'normal';
  return `<span style="color:${color};font-weight:${weight}">${d.toLocaleDateString('pt-BR')}${isLate ? ' ⚠' : ''}</span>`;
}

function isAtrasada(a, today) {
  return a.status !== 'Concluída' && a.prazo && new Date(a.prazo + 'T00:00:00') < today;
}

// ── Dashboard de ações ──────────────────────────────────────────────────────

function renderAcoesDashboard(acoes) {
  const today   = new Date(); today.setHours(0, 0, 0, 0);
  const total   = acoes.length;
  const pend    = acoes.filter(a => a.status === 'Pendente').length;
  const anda    = acoes.filter(a => a.status === 'Em Andamento').length;
  const conc    = acoes.filter(a => a.status === 'Concluída').length;
  const atra    = acoes.filter(a => isAtrasada(a, today)).length;
  const pctOk   = total ? Math.round(conc / total * 100) : 0;
  const pctOf   = n => total ? (n / total * 100).toFixed(1) : 0;

  const BARS = [
    { label: 'Concluídas',   n: conc, color: '#22c55e' },
    { label: 'Em Andamento', n: anda, color: '#f59e0b' },
    { label: 'Pendentes',    n: pend, color: '#94a3b8' },
    { label: 'Atrasadas',    n: atra, color: '#ef4444' },
  ];

  // % concluídas no prazo (dataConclusao <= prazo)
  const concNoPrazo = acoes.filter(a =>
    a.status === 'Concluída' && a.dataConclusao && a.prazo && a.dataConclusao <= a.prazo
  ).length;
  const pctNoPrazo = conc ? Math.round(concNoPrazo / conc * 100) : null;

  // Ações em atraso por responsável
  const rankMap = {};
  acoes.forEach(a => {
    if (isAtrasada(a, today)) {
      rankMap[a.responsavel] = (rankMap[a.responsavel] || 0) + 1;
    }
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

// ── Filter bar ──────────────────────────────────────────────────────────────

const SEL_STYLE = 'padding:6px 10px;border:1px solid var(--border);border-radius:6px;font-size:0.82rem;background:var(--surface);color:var(--fg)';
const INP_STYLE = `${SEL_STYLE};flex:1;min-width:160px;max-width:260px`;

function renderFiltrosBar(acoes) {
  const responsaveis = [...new Set(acoes.map(a => a.responsavel).filter(Boolean))].sort();
  const capaNums     = [...new Set(acoes.map(a => a.capaNumero).filter(Boolean))].sort();
  const hasFilter    = acaoFiltros.busca || acaoFiltros.status || acaoFiltros.responsavel || acaoFiltros.capa || acaoFiltros.etapa;

  return `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:12px">
      <input id="acao-busca" type="text" placeholder="Buscar ação ou Nº CAPA…"
        style="${INP_STYLE}" value="${acaoFiltros.busca}">
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
      <select id="acao-capa" style="${SEL_STYLE}">
        <option value="">Todas as CAPAs</option>
        ${capaNums.map(n => `<option value="${n}" ${acaoFiltros.capa === n ? 'selected' : ''}>${n}</option>`).join('')}
      </select>
      ${hasFilter ? `<button class="btn btn-secondary btn-sm" data-action="limpar-filtros">✕ Limpar</button>` : ''}
    </div>
  `;
}

// ── Filtered table ──────────────────────────────────────────────────────────

function applyFiltros(acoes) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return acoes.filter(a => {
    if (acaoFiltros.busca) {
      const q = acaoFiltros.busca.toLowerCase();
      if (!a.acao.toLowerCase().includes(q) && !(a.capaNumero || '').toLowerCase().includes(q)) return false;
    }
    if (acaoFiltros.status) {
      if (acaoFiltros.status === 'Atrasada') {
        if (!isAtrasada(a, today)) return false;
      } else if (a.status !== acaoFiltros.status) return false;
    }
    if (acaoFiltros.etapa && a.etapa !== acaoFiltros.etapa) return false;
    if (acaoFiltros.responsavel && a.responsavel !== acaoFiltros.responsavel) return false;
    if (acaoFiltros.capa && a.capaNumero !== acaoFiltros.capa) return false;
    return true;
  });
}

function renderAcoesTableBody(allAcoes) {
  const filtered = applyFiltros(allAcoes);
  const hasFilter = acaoFiltros.busca || acaoFiltros.status || acaoFiltros.responsavel || acaoFiltros.capa;
  const countLabel = hasFilter
    ? `<span style="font-size:0.74rem;color:var(--muted);margin-left:8px">${filtered.length} de ${allAcoes.length} exibidas</span>`
    : '';

  const tableHtml = filtered.length ? `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Nº CAPA</th><th>Etapa</th><th>Ação</th><th>Responsável</th><th>Prazo</th><th>Status</th><th>Conclusão</th><th>Ações</th>
        </tr></thead>
        <tbody>
          ${filtered.map(a => {
            const etapaColor = { 'Ação Imediata': '#ef4444', 'Verificação de Eficácia': '#f59e0b', 'Planejamento': '#94a3b8', 'Ação': '#3b82f6' };
            const ec = etapaColor[a.etapa] || '#94a3b8';
            const etapaBadge = a.etapa
              ? `<span style="font-size:0.65rem;padding:1px 6px;border-radius:3px;background:${ec}18;color:${ec};font-weight:700;white-space:nowrap">${a.etapa}</span>`
              : '—';
            return `<tr>
            <td><strong>${a.capaNumero}</strong></td>
            <td>${etapaBadge}</td>
            <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${a.acao}">${a.acao}</td>
            <td>${a.responsavel}</td>
            <td>${deadlineCell(a.prazo)}</td>
            <td>${statusPill(a.status)}</td>
            <td>${a.dataConclusao ? formatDate(a.dataConclusao) : '—'}</td>
            <td>
              <div class="td-actions">
                <button class="btn btn-secondary btn-sm" data-action="edit-acao" data-id="${a.id}" title="Editar">✏</button>
                <button class="btn btn-danger btn-sm" data-action="delete-acao" data-id="${a.id}" title="Excluir">🗑</button>
              </div>
            </td>
          </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  ` : emptyState(hasFilter ? 'Nenhuma ação encontrada com os filtros selecionados.' : 'Nenhuma ação registrada.');

  return `<div id="acoes-count-label" style="margin-bottom:4px">${countLabel}</div>${tableHtml}`;
}

// ── Process deadlines ───────────────────────────────────────────────────────

function renderPrazos(capas) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const openCapas = capas.filter(r => !['Encerrada', 'Não Procedente'].includes(r.status));

  if (!openCapas.length) return emptyState('Nenhuma CAPA em aberto.');

  return `
    <div class="table-wrap">
      <table>
        <thead><tr>
          <th>Nº CAPA</th><th>Status</th><th>Data Abertura</th>
          <th>Prazo Retorno Área (D+5)</th><th>Prazo Investigação (D+15)</th><th>Situação</th>
        </tr></thead>
        <tbody>
          ${openCapas.map(r => {
            if (!r.dataAbertura) return `<tr><td>${r.numero}</td><td colspan="5" style="color:var(--muted)">Data de abertura não informada</td></tr>`;
            const d5  = addDaysDate(r.dataAbertura, 5);
            const d15 = addDaysDate(r.dataAbertura, 15);
            const alertas = [];
            if (r.status === 'Aberta' && d5 < today) alertas.push('Retorno em atraso');
            if (r.status === 'Em Investigação' && d15 < today) alertas.push('Investigação em atraso');
            return `<tr>
              <td><strong>${r.numero}</strong></td>
              <td>${statusPill(r.status)}</td>
              <td>${formatDate(r.dataAbertura)}</td>
              <td>${deadlineAlert(d5)}</td>
              <td>${deadlineAlert(d15)}</td>
              <td>${alertas.length
                ? `<span style="color:var(--red);font-weight:600">⚠ ${alertas.join('; ')}</span>`
                : '<span style="color:var(--green)">✓ Em dia</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Ações & Prazos tab full render ──────────────────────────────────────────

function renderAcoesPrazos() {
  const allAcoes = db.get('capaAcoes');
  const capas    = db.get('capa');

  return `
    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:600;font-size:0.9rem;margin-bottom:14px">Dashboard de Ações</div>
      ${renderAcoesDashboard(allAcoes)}
    </div>
    <div class="card" style="margin-bottom:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <span style="font-weight:600;font-size:0.9rem">Ações</span>
        <button class="btn btn-primary btn-sm" data-action="new-acao">+ Nova Ação</button>
      </div>
      ${renderFiltrosBar(allAcoes)}
      <div id="acoes-table-wrap">${renderAcoesTableBody(allAcoes)}</div>
    </div>
    <div class="card">
      <div style="font-weight:600;margin-bottom:12px;font-size:0.9rem">Prazos do Processo CAPA</div>
      ${renderPrazos(capas)}
    </div>
  `;
}

// ── Tab bar ─────────────────────────────────────────────────────────────────

function buildTabBar(active) {
  return [
    { key: 'painel',      label: 'Painel' },
    { key: 'acoesPrazos', label: 'Ações & Prazos' },
  ].map(t => {
    const isActive = t.key === active;
    return `<button class="tab-btn" data-tab="${t.key}" style="padding:8px 22px;border:none;background:none;cursor:pointer;font-size:0.875rem;border-bottom:2px solid ${isActive ? 'var(--blue)' : 'transparent'};color:${isActive ? 'var(--blue)' : 'var(--muted)'};font-weight:${isActive ? '600' : '400'}">${t.label}</button>`;
  }).join('');
}

// ── Modal fields ─────────────────────────────────────────────────────────────

function fieldsAcao(capas) {
  const equipe = db.get('equipe').map(m => m.nome);
  return [
    { id: 'capaRef',       label: 'CAPA',         type: 'select',   required: true,  span: 2, options: capas.map(c => `${c.numero} — ${c.descricao.slice(0, 40)}`) },
    { id: 'etapa',         label: 'Etapa',         type: 'select',   required: true,  span: 1, options: ETAPAS_ACAO },
    { id: 'acao',          label: 'Ação',          type: 'textarea', required: true,  span: 2 },
    { id: 'responsavel',   label: 'Responsável',   type: 'select',   required: true,  span: 1, options: equipe },
    { id: 'prazo',         label: 'Prazo',         type: 'date',     required: true,  span: 1 },
    { id: 'status',        label: 'Status',        type: 'select',   required: true,  span: 1, options: ACAO_STATUS },
    { id: 'evidencia',     label: 'Evidência',     type: 'text',     required: false, span: 1 },
    { id: 'dataConclusao', label: 'Data Conclusão',type: 'date',     required: false, span: 1 },
  ];
}

// ── Module state ─────────────────────────────────────────────────────────────

let activeTab   = 'painel';
let acaoFiltros = { busca: '', status: '', responsavel: '', capa: '', etapa: '' };
let _searchTimer;

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>CAPA — Gerencial</h2>
      </div>
      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:20px">
        ${buildTabBar(activeTab)}
      </div>
      <div id="tab-painel"      ${activeTab !== 'painel'      ? 'style="display:none"' : ''}>${renderPainel()}</div>
      <div id="tab-acoesPrazos" ${activeTab !== 'acoesPrazos' ? 'style="display:none"' : ''}>${renderAcoesPrazos()}</div>
    `;
  },

  init(container) {
    // ── Tab switching
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
        container.querySelector('#tab-painel').style.display      = activeTab === 'painel'      ? '' : 'none';
        container.querySelector('#tab-acoesPrazos').style.display = activeTab === 'acoesPrazos' ? '' : 'none';
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      // ── Filters
      if (action === 'limpar-filtros') {
        acaoFiltros = { busca: '', status: '', responsavel: '', capa: '', etapa: '' };
        container.querySelector('#tab-acoesPrazos').innerHTML = renderAcoesPrazos();
        return;
      }

      // ── CRUD
      if (action === 'new-acao') {
        const capas = db.get('capa');
        openModal({
          title: 'Nova Ação',
          fields: fieldsAcao(capas),
          data: { status: 'Pendente' },
          onSave: data => {
            const capa = capas.find(c => c.numero === data.capaRef?.split(' — ')[0]) ?? capas[0];
            db.add('capaAcoes', {
              capaId: capa?.id ?? 0, capaNumero: capa?.numero ?? '',
              acao: data.acao, responsavel: data.responsavel,
              prazo: data.prazo, status: data.status,
              evidencia: data.evidencia, dataConclusao: data.dataConclusao,
            });
            toast('Ação criada!');
            container.querySelector('#tab-acoesPrazos').innerHTML = renderAcoesPrazos();
          },
        });
      }

      if (action === 'edit-acao') {
        const record = db.getById('capaAcoes', numId);
        if (!record) return;
        const capas  = db.get('capa');
        const fields = fieldsAcao(capas).filter(f => f.id !== 'capaRef');
        openModal({
          title: 'Editar Ação',
          fields,
          data: record,
          onSave: data => {
            db.update('capaAcoes', numId, data);
            toast('Ação atualizada!');
            container.querySelector('#tab-acoesPrazos').innerHTML = renderAcoesPrazos();
          },
        });
      }

      if (action === 'delete-acao') {
        showConfirm('Deseja excluir esta ação? A operação não poderá ser desfeita.').then(ok => {
          if (!ok) return;
          db.remove('capaAcoes', numId);
          toast('Ação excluída.', 'warning');
          container.querySelector('#tab-acoesPrazos').innerHTML = renderAcoesPrazos();
        });
      }
    });

    // ── Filter selects (change event)
    container.addEventListener('change', e => {
      if      (e.target.id === 'acao-status')      acaoFiltros.status      = e.target.value;
      else if (e.target.id === 'acao-etapa')       acaoFiltros.etapa       = e.target.value;
      else if (e.target.id === 'acao-responsavel') acaoFiltros.responsavel = e.target.value;
      else if (e.target.id === 'acao-capa')        acaoFiltros.capa        = e.target.value;
      else return;
      // Re-render only the table part to keep selects in place
      const wrap = container.querySelector('#acoes-table-wrap');
      if (wrap) wrap.innerHTML = renderAcoesTableBody(db.get('capaAcoes'));
      // Also refresh filter bar to show/hide "Limpar" button
      const bar = container.querySelector('#tab-acoesPrazos');
      if (bar) bar.innerHTML = renderAcoesPrazos();
    });

    // ── Search input (debounced, only updates table — keeps focus)
    container.addEventListener('input', e => {
      if (e.target.id !== 'acao-busca') return;
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        acaoFiltros.busca = e.target.value;
        const wrap = container.querySelector('#acoes-table-wrap');
        if (wrap) wrap.innerHTML = renderAcoesTableBody(db.get('capaAcoes'));
      }, 280);
    });
  },
};
