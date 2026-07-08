/**
 * @fileoverview Documentos Administrativos — gestão de licenças, alvarás e certidões.
 */

import { db } from '../db.js';
import { toast } from '../toast.js';
import { openModal, showConfirm } from '../modal.js';
import { formatDate, daysLeft } from '../utils.js';

const COLLECTION = 'docsAdmin';

const PERIODOS = ['3 meses', '6 meses', '1 ano', '2 anos', '3 anos', '5 anos', 'Indeterminado'];

const STATUS_CFG = {
  'Vencido':       { color: '#991B1B', bg: '#FEE2E2', priority: 6 },
  'Atrasado':      { color: '#9A3412', bg: '#FFEDD5', priority: 5 },
  'Crítico':       { color: '#C2410C', bg: '#FEF3C7', priority: 4 },
  'Atenção':       { color: '#B45309', bg: '#FFFBEB', priority: 3 },
  'Alerta':        { color: '#1D4ED8', bg: '#EFF6FF', priority: 2 },
  'Regular':       { color: '#15803D', bg: '#F0FDF4', priority: 1 },
  'Automático':    { color: '#6B7280', bg: '#F3F4F6', priority: 0 },
  'Indeterminado': { color: '#6B7280', bg: '#F3F4F6', priority: 0 },
};

function computedStatus(doc) {
  if (!doc.dataValidade) {
    return doc.renovacaoAutomatica ? 'Automático' : 'Indeterminado';
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const validade = new Date(doc.dataValidade + 'T00:00:00');
  const prazo = doc.prazoAntecedenciaDias ?? 60;
  const solicitacao = new Date(validade);
  solicitacao.setDate(solicitacao.getDate() - prazo);

  const diasValidade    = Math.ceil((validade    - today) / 86400000);
  const diasSolicitacao = Math.ceil((solicitacao - today) / 86400000);

  if (diasValidade    < 0)  return 'Vencido';
  if (diasSolicitacao < 0)  return 'Atrasado';
  if (diasSolicitacao < 30) return 'Crítico';
  if (diasSolicitacao < 60) return 'Atenção';
  if (diasSolicitacao < 90) return 'Alerta';
  return 'Regular';
}

function prazoSolicitacaoISO(doc) {
  if (!doc.dataValidade) return null;
  const d = new Date(doc.dataValidade + 'T00:00:00');
  d.setDate(d.getDate() - (doc.prazoAntecedenciaDias ?? 60));
  return d.toISOString().slice(0, 10);
}

// ── KPIs ──────────────────────────────────────────────────────────────────────

function renderKpis(docs, statuses) {
  const acaoImediata  = statuses.filter(s => ['Vencido', 'Atrasado', 'Crítico'].includes(s)).length;
  const requerAtencao = statuses.filter(s => ['Atenção', 'Alerta'].includes(s)).length;
  const regulares     = statuses.filter(s => s === 'Regular').length;
  const semVencimento = statuses.filter(s => ['Automático', 'Indeterminado'].includes(s)).length;
  const total = docs.length;

  const kpi = (label, value, color, bg, filterKey, sub) => `
    <div data-filter="${filterKey}" style="cursor:pointer;background:${bg};border:1.5px solid ${color}33;border-radius:10px;padding:14px 16px;flex:1;min-width:110px">
      <div style="font-size:0.7rem;font-weight:700;color:${color};letter-spacing:.06em;text-transform:uppercase;margin-bottom:5px">${label}</div>
      <div style="font-size:1.85rem;font-weight:700;color:${color};line-height:1">${value}</div>
      <div style="font-size:0.7rem;color:${color};opacity:.75;margin-top:4px">${sub}</div>
    </div>`;

  return `
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">
      ${kpi('Total',          total,        '#1e3a5f', '#EFF6FF', 'all',     'cadastrados')}
      ${kpi('Ação Imediata',  acaoImediata, '#991B1B', '#FEE2E2', 'critico', 'vencidos e em atraso')}
      ${kpi('Requer Atenção', requerAtencao,'#B45309', '#FEF3C7', 'atencao', 'dentro do prazo de renovação')}
      ${kpi('Regulares',      regulares,    '#15803D', '#F0FDF4', 'regular', 'dentro da validade')}
      ${kpi('Sem Vencimento', semVencimento,'#6B7280', '#F3F4F6', 'semvenc', 'automáticos ou indeterminados')}
    </div>`;
}

// ── Painel de alertas ─────────────────────────────────────────────────────────

function renderAlerts(docs, statuses) {
  const urgent = docs
    .map((d, i) => ({ doc: d, status: statuses[i] }))
    .filter(({ status }) => ['Vencido', 'Atrasado', 'Crítico', 'Atenção'].includes(status))
    .sort((a, b) => (STATUS_CFG[b.status]?.priority ?? 0) - (STATUS_CFG[a.status]?.priority ?? 0));

  if (!urgent.length) return '';

  const rows = urgent.map(({ doc, status }) => {
    const cfg = STATUS_CFG[status];
    const dias = daysLeft(doc.dataValidade);
    const diasLabel = dias === null ? '' : dias < 0
      ? `venceu há ${Math.abs(dias)}d`
      : `vence em ${dias}d`;
    return `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;border-bottom:1px solid var(--border)">
        <span style="background:${cfg.bg};color:${cfg.color};padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:700;min-width:70px;text-align:center;flex-shrink:0">${status}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:0.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${doc.descricao}</div>
          <div style="font-size:0.73rem;color:var(--muted)">${doc.orgao}${diasLabel ? ' · ' + diasLabel : ''}</div>
        </div>
        <span style="font-size:0.75rem;color:var(--muted);flex-shrink:0">${formatDate(doc.dataValidade)}</span>
      </div>`;
  }).join('');

  return `
    <div id="alerts-panel" style="background:var(--surface);border:1px solid #FECACA;border-radius:10px;margin-bottom:16px;overflow:hidden">
      <div id="alerts-header" style="display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;background:#FEF2F2;user-select:none">
        <span style="color:#991B1B">⚠</span>
        <span style="font-weight:600;font-size:0.83rem;color:#991B1B">${urgent.length} documento${urgent.length !== 1 ? 's' : ''} requer${urgent.length !== 1 ? 'em' : ''} atenção</span>
        <span id="alerts-chevron" style="margin-left:auto;font-size:0.7rem;color:#991B1B">▲</span>
      </div>
      <div id="alerts-body">${rows}</div>
    </div>`;
}

// ── Tabela ────────────────────────────────────────────────────────────────────

function renderTable(docs, statuses, filterKey) {
  let rows = docs.map((d, i) => ({ doc: d, status: statuses[i] }));

  if (filterKey === 'critico') rows = rows.filter(r => ['Vencido', 'Atrasado', 'Crítico'].includes(r.status));
  else if (filterKey === 'atencao') rows = rows.filter(r => ['Atenção', 'Alerta'].includes(r.status));
  else if (filterKey === 'regular') rows = rows.filter(r => r.status === 'Regular');
  else if (filterKey === 'semvenc') rows = rows.filter(r => ['Automático', 'Indeterminado'].includes(r.status));

  if (!rows.length) {
    return `<div class="empty-state"><span class="empty-icon">📋</span><p>Nenhum documento encontrado.</p></div>`;
  }

  const tableRows = rows.map(({ doc, status }) => {
    const cfg = STATUS_CFG[status] ?? STATUS_CFG['Indeterminado'];
    const prazoDate = prazoSolicitacaoISO(doc);
    const dias = daysLeft(doc.dataValidade);
    const diasHtml = dias === null
      ? '—'
      : dias < 0
        ? `<span style="color:#991B1B;font-weight:700">${dias}d</span>`
        : dias <= 30
          ? `<span style="color:#C2410C;font-weight:600">${dias}d</span>`
          : `${dias}d`;

    return `
      <tr>
        <td>
          <div style="font-weight:600;font-size:0.83rem">${doc.descricao}</div>
          ${doc.legislacaoBase ? `<div style="font-size:0.71rem;color:var(--muted);margin-top:1px">${doc.legislacaoBase}</div>` : ''}
        </td>
        <td style="font-size:0.81rem">${doc.orgao ?? '—'}</td>
        <td style="font-size:0.81rem">${formatDate(doc.dataEmissao)}</td>
        <td style="font-size:0.81rem">${formatDate(doc.dataValidade)}</td>
        <td style="font-size:0.81rem">${formatDate(prazoDate)}</td>
        <td style="text-align:right;font-size:0.81rem">${diasHtml}</td>
        <td><span style="background:${cfg.bg};color:${cfg.color};padding:2px 8px;border-radius:4px;font-size:0.7rem;font-weight:700">${status}</span></td>
        <td>
          <div style="display:flex;gap:5px">
            <button class="btn btn-sm btn-secondary" data-action="view"   data-id="${doc.id}" title="Detalhes">👁</button>
            <button class="btn btn-sm btn-secondary" data-action="edit"   data-id="${doc.id}" title="Editar">✎</button>
            <button class="btn btn-sm btn-secondary" data-action="delete" data-id="${doc.id}" title="Excluir" style="color:var(--red)">✕</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <div style="overflow-x:auto">
      <table class="data-table">
        <thead>
          <tr>
            <th>Documento / Base Legal</th>
            <th>Órgão</th>
            <th>Emissão</th>
            <th>Validade</th>
            <th>Prazo Solicitação</th>
            <th style="text-align:right">Dias</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>`;
}

// ── Campos do formulário ──────────────────────────────────────────────────────

const FIELDS = [
  { id: 'descricao',             label: 'Documento',                                    type: 'text',     required: true, span: 2 },
  { id: 'orgao',                 label: 'Órgão',                                        type: 'text',     required: true },
  { id: 'legislacaoBase',        label: 'Base Legal',                                   type: 'text' },
  { id: 'dataEmissao',           label: 'Data de Emissão',                              type: 'date' },
  { id: 'dataValidade',          label: 'Data de Validade',                             type: 'date' },
  { id: 'prazoAntecedenciaDias', label: 'Prazo de Antecedência (dias)',                 type: 'number',   min: 0 },
  { id: 'renovacaoPeriodo',      label: 'Período de Renovação',                         type: 'select',   options: PERIODOS },
  { id: 'renovacaoAutomatica',   label: 'Renovação Automática',                         type: 'select',   options: ['Não', 'Sim'] },
  { id: 'link',                  label: 'Link do Portal',                               type: 'text',     span: 2 },
  { id: 'observacao',            label: 'Observações',                                  type: 'textarea', span: 2 },
  { id: 'checklistRenovacao',    label: 'Checklist de Renovação (um passo por linha)',  type: 'textarea', span: 2 },
];

function toFormData(doc) {
  return {
    ...doc,
    renovacaoAutomatica: doc.renovacaoAutomatica ? 'Sim' : 'Não',
    checklistRenovacao: Array.isArray(doc.checklistRenovacao)
      ? doc.checklistRenovacao.join('\n')
      : (doc.checklistRenovacao ?? ''),
  };
}

function fromFormData(raw) {
  return {
    ...raw,
    prazoAntecedenciaDias: raw.prazoAntecedenciaDias !== '' ? Number(raw.prazoAntecedenciaDias) : 60,
    renovacaoAutomatica: raw.renovacaoAutomatica === 'Sim',
    checklistRenovacao: raw.checklistRenovacao
      ? raw.checklistRenovacao.split('\n').map(s => s.trim()).filter(Boolean)
      : [],
  };
}

// ── Modal de detalhes ─────────────────────────────────────────────────────────

function openViewModal(doc, status) {
  const cfg = STATUS_CFG[status] ?? STATUS_CFG['Indeterminado'];
  const prazoDate = prazoSolicitacaoISO(doc);
  const checklist = Array.isArray(doc.checklistRenovacao) && doc.checklistRenovacao.length
    ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border)">
        <div style="font-weight:600;font-size:0.8rem;margin-bottom:6px">Checklist de Renovação</div>
        <ol style="margin:0;padding-left:18px;font-size:0.8rem;line-height:1.8;color:var(--text)">
          ${doc.checklistRenovacao.map(item => `<li>${item}</li>`).join('')}
        </ol>
      </div>`
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:540px">
      <div class="modal-header">
        <h3 style="font-size:0.92rem;line-height:1.3">${doc.descricao}</h3>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.82rem">
          <div>
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Status</div>
            <span style="background:${cfg.bg};color:${cfg.color};padding:2px 10px;border-radius:4px;font-size:0.72rem;font-weight:700">${status}</span>
          </div>
          <div>
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Órgão</div>
            <strong>${doc.orgao || '—'}</strong>
          </div>
          <div>
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Emissão</div>
            <strong>${formatDate(doc.dataEmissao)}</strong>
          </div>
          <div>
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Validade</div>
            <strong>${formatDate(doc.dataValidade)}</strong>
          </div>
          <div>
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Prazo p/ Solicitar</div>
            <strong>${formatDate(prazoDate)}</strong>
          </div>
          <div>
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Antecedência</div>
            <strong>${doc.prazoAntecedenciaDias ?? 60} dias</strong>
          </div>
          <div>
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Período Renovação</div>
            <strong>${doc.renovacaoPeriodo || '—'}</strong>
          </div>
          <div>
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Renovação Automática</div>
            <strong>${doc.renovacaoAutomatica ? 'Sim' : 'Não'}</strong>
          </div>
          ${doc.legislacaoBase ? `<div style="grid-column:span 2">
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Base Legal</div>
            <strong>${doc.legislacaoBase}</strong>
          </div>` : ''}
          ${doc.link ? `<div style="grid-column:span 2">
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Portal</div>
            <a href="${doc.link}" target="_blank" rel="noopener" style="color:var(--accent);font-size:0.81rem;word-break:break-all">${doc.link}</a>
          </div>` : ''}
          ${doc.observacao ? `<div style="grid-column:span 2">
            <div style="color:var(--muted);font-size:0.71rem;margin-bottom:2px">Observações</div>
            <div style="font-size:0.8rem;line-height:1.6;color:var(--text)">${doc.observacao.replace(/\n/g, '<br>')}</div>
          </div>` : ''}
        </div>
        ${checklist}
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="view-close-btn">Fechar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('#view-close-btn').addEventListener('click', close);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

// ── Render principal ──────────────────────────────────────────────────────────

let _filter = 'all';

function renderMain(container) {
  const docs = db.get(COLLECTION);
  const statuses = docs.map(computedStatus);

  const filterLabels = {
    all:     'Todos',
    critico: 'Ação Imediata',
    atencao: 'Requer Atenção',
    regular: 'Regulares',
    semvenc: 'Sem Vencimento',
  };

  const filterBar = Object.entries(filterLabels).map(([key, label]) => {
    const active = _filter === key;
    return `<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}" data-filter="${key}" style="border-radius:20px">${label}</button>`;
  }).join('');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Documentos Administrativos</h2>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:2px">Licenças · Alvarás · Certidões · Registros regulatórios</div>
      </div>
      <button class="btn btn-primary" data-action="new">+ Novo Documento</button>
    </div>

    ${renderKpis(docs, statuses)}
    ${renderAlerts(docs, statuses)}

    <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <span style="font-size:0.78rem;color:var(--muted)">Filtrar:</span>
      ${filterBar}
    </div>

    <div id="docs-admin-table">
      ${renderTable(docs, statuses, _filter)}
    </div>

    <div style="margin-top:16px;font-size:0.71rem;color:var(--muted);line-height:1.6">
      Referências: CONAMA 237/97 Art. 18 · RDC 665/2022 · RDC 848/2024 · VISA Municipal
    </div>`;

  // Painel de alertas — toggle
  const alertsHeader  = container.querySelector('#alerts-header');
  const alertsBody    = container.querySelector('#alerts-body');
  const alertsChevron = container.querySelector('#alerts-chevron');
  if (alertsHeader && alertsBody) {
    alertsHeader.addEventListener('click', () => {
      const open = alertsBody.style.display !== 'none';
      alertsBody.style.display = open ? 'none' : '';
      if (alertsChevron) alertsChevron.textContent = open ? '▼' : '▲';
    });
  }
}

// ── Event handling ────────────────────────────────────────────────────────────

function initEvents(container) {
  container.addEventListener('click', async e => {
    // KPI cards e filter buttons
    const filterEl = e.target.closest('[data-filter]');
    if (filterEl) {
      _filter = filterEl.dataset.filter;
      renderMain(container);
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id ? Number(btn.dataset.id) : null;

    if (action === 'new') {
      openModal({
        title: 'Novo Documento Administrativo',
        fields: FIELDS,
        data: { prazoAntecedenciaDias: 60, renovacaoAutomatica: 'Não', renovacaoPeriodo: '1 ano' },
        onSave: raw => {
          db.add(COLLECTION, fromFormData(raw));
          toast('Documento cadastrado.');
          renderMain(container);
        },
      });
      return;
    }

    if (action === 'edit' && id !== null) {
      const doc = db.getById(COLLECTION, id);
      if (!doc) return;
      openModal({
        title: 'Editar Documento',
        fields: FIELDS,
        data: toFormData(doc),
        onSave: raw => {
          db.update(COLLECTION, id, fromFormData(raw));
          toast('Documento atualizado.');
          renderMain(container);
        },
      });
      return;
    }

    if (action === 'view' && id !== null) {
      const doc = db.getById(COLLECTION, id);
      if (!doc) return;
      openViewModal(doc, computedStatus(doc));
      return;
    }

    if (action === 'delete' && id !== null) {
      const ok = await showConfirm('Excluir este documento? Esta ação não pode ser desfeita.');
      if (!ok) return;
      db.remove(COLLECTION, id);
      toast('Documento excluído.');
      renderMain(container);
    }
  });
}

// ── Exportação ────────────────────────────────────────────────────────────────

export default {
  render(container) { renderMain(container); },
  init(container)   { initEvents(container); },
};
