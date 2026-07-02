/**
 * @fileoverview Controle de Documentos SGQ — POP-GQ-002/003 · CFR 21 Part 11 · ANVISA RDC 27/2011.
 * Fluxo: Elaboração → Revisão → Aprovação → Homologação → Vigente
 */

import { db } from '../db.js';
import { statusPill, emptyState, selectOptions, formatDate } from '../utils.js';
import { openModal, showConfirm, closeModal } from '../modal.js';
import { toast } from '../toast.js';
import { STATUS, ETAPAS_DOC } from '../constants.js';

const TIPOS_DOC = ['MA', 'PL', 'POP', 'IT', 'ESP', 'DT', 'PR', 'RE', 'RMP'];
const AREAS_DOC = ['GQ', 'RH', 'MT', 'PR', 'CQ', 'AR', 'LOG', 'ADM'];

const TIPO_META = {
  MA:  { label: 'Manual',        color: '#7c3aed' },
  PL:  { label: 'Plano',         color: '#2563eb' },
  POP: { label: 'POP',           color: '#059669' },
  IT:  { label: 'Instr. Trab.',  color: '#0891b2' },
  ESP: { label: 'Especificação', color: '#dc2626' },
  DT:  { label: 'Dossiê Téc.',   color: '#9333ea' },
  PR:  { label: 'Protocolo',     color: '#d97706' },
  RE:  { label: 'Relatório',     color: '#65a30d' },
  RMP: { label: 'Reg. Mestre',   color: '#334155' },
};

const SEM_VALIDADE = ['PR', 'RE'];

const CAMPOS_REVISAO = [
  { id: 'tipoSolic',       label: 'Tipo de solicitação',                    type: 'select',   required: true,  span: 2, options: ['Elaboração', 'Revisão', 'Cancelamento', 'Alteração de Distribuição'] },
  { id: 'numSolic',        label: 'Nº Solicitação (GQ preenche)',           type: 'text',     required: false, span: 1 },
  { id: 'dataSolic',       label: 'Data da solicitação',                    type: 'date',     required: true,  span: 1 },
  { id: 'solicitante',     label: 'Solicitante',                            type: 'text',     required: true,  span: 1 },
  { id: 'areaSolic',       label: 'Área solicitante',                       type: 'text',     required: true,  span: 1 },
  { id: 'revisaoProposta', label: 'Revisão proposta',                       type: 'text',     required: false, span: 1 },
  { id: 'elaboradorProp',  label: 'Elaborador proposto (máx. 1)',           type: 'text',     required: false, span: 1 },
  { id: 'revisoresProp',   label: 'Revisores propostos (máx. 3)',           type: 'text',     required: false, span: 1 },
  { id: 'aprovadoresProp', label: 'Aprovadores propostos (máx. 2)',         type: 'text',     required: false, span: 1 },
  { id: 'justificativa',   label: 'Descrição da alteração / justificativa', type: 'textarea', required: true,  span: 2 },
  { id: 'docsImpactados',  label: 'Documentos/procedimentos impactados',    type: 'text',     required: false, span: 2 },
  { id: 'impactoQualidade',label: 'Impacto na Qualidade do Produto?',       type: 'select',   required: true,  span: 1, options: ['Não', 'Sim'] },
  { id: 'impactoProcesso', label: 'Impacto em Processos e Procedimentos?',  type: 'select',   required: true,  span: 1, options: ['Não', 'Sim'] },
  { id: 'impactoTreino',   label: 'Impacto em Treinamentos?',               type: 'select',   required: true,  span: 1, options: ['Não', 'Sim'] },
  { id: 'areasTreinar',    label: 'Áreas a serem treinadas',                type: 'text',     required: false, span: 2 },
];

const FIELDS = [
  { id: 'numero',          label: 'Código (ex: POP-GQ-002)',    type: 'text',     required: true,  span: 1 },
  { id: 'tipo',            label: 'Tipo de documento',          type: 'select',   required: true,  span: 1, options: TIPOS_DOC },
  { id: 'area',            label: 'Área emitente',              type: 'select',   required: true,  span: 1, options: AREAS_DOC },
  { id: 'revisao',         label: 'Revisão atual',              type: 'text',     required: true,  span: 1 },
  { id: 'titulo',          label: 'Título completo',            type: 'text',     required: true,  span: 2 },
  { id: 'dataHomologacao', label: 'Data de homologação',        type: 'date',     required: false, span: 1 },
  { id: 'status',          label: 'Status / Etapa',             type: 'select',   required: true,  span: 1, options: STATUS.DOC },
  { id: 'elaboradores',    label: 'Elaborado por (máx. 1)',     type: 'text',     required: false, span: 1 },
  { id: 'revisores',       label: 'Revisado por (máx. 3)',      type: 'text',     required: false, span: 1 },
  { id: 'aprovadores',     label: 'Aprovado por (máx. 2)',      type: 'text',     required: false, span: 1 },
  { id: 'homologador',     label: 'Homologado por (Gestor GQ)', type: 'text',     required: false, span: 1 },
  { id: 'descricao',       label: 'Objetivo / Descrição',       type: 'textarea', required: false, span: 2 },
];

function tipoBadge(tipo) {
  const m = TIPO_META[tipo] || { label: tipo, color: '#6b7280' };
  return `<span style="display:inline-block;padding:1px 8px;border-radius:3px;background:${m.color}1a;color:${m.color};font-size:0.72rem;font-weight:700">${m.label}</span>`;
}

function computedStatus(doc) {
  const manualStates = ['Em Elaboração','Em Revisão','Em Aprovação','Em Homologação','Cancelado','Suspenso'];
  if (manualStates.includes(doc.status)) return doc.status;
  if (SEM_VALIDADE.includes(doc.tipo)) return 'Vigente';
  if (!doc.dataHomologacao) return doc.status || 'Em Elaboração';
  const expiry = new Date(doc.dataHomologacao);
  expiry.setFullYear(expiry.getFullYear() + 3);
  const diff = (expiry - new Date()) / 86400000;
  if (diff < 0) return 'Vencido';
  if (diff <= 90) return 'A Vencer';
  return 'Vigente';
}

function expiryDate(doc) {
  if (SEM_VALIDADE.includes(doc.tipo) || !doc.dataHomologacao) return null;
  const d = new Date(doc.dataHomologacao);
  d.setFullYear(d.getFullYear() + 3);
  return d.toISOString().substring(0, 10);
}

// ── Assinatura Eletrônica (CFR 21 Part 11 §11.100) ─────────────────────────

function showSignatureModal(titulo, significado, onConfirm) {
  const equipe = db.get('equipe');
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'display:flex;';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:480px">
      <div class="modal-header">
        <h3>Assinatura Eletrônica</h3>
        <button class="modal-close" aria-label="Fechar">✕</button>
      </div>
      <div class="modal-body">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:0.82rem">
          <strong>📋 CFR 21 Part 11 / ANVISA RDC 27/2011</strong><br>
          Esta assinatura eletrônica é legalmente vinculante e será registrada na trilha de auditoria com data, hora e identificação do signatário.
        </div>
        <div style="font-size:0.82rem;color:#374151;margin-bottom:14px"><strong>Ação:</strong> ${titulo}</div>
        <div class="form-grid">
          <div class="form-group span-2">
            <label>Signatário <span style="color:var(--red)">*</span></label>
            <select id="sig-usuario">
              <option value="">Selecione seu nome...</option>
              ${equipe.map(m => `<option value="${m.nome}">${m.nome} — ${m.cargo}</option>`).join('')}
            </select>
          </div>
          <div class="form-group span-2">
            <label>Data/hora da assinatura</label>
            <input type="text" value="${new Date().toLocaleString('pt-BR')}" readonly style="background:var(--bg);color:var(--muted)">
          </div>
          <div class="form-group span-2">
            <label>Significado da assinatura</label>
            <input type="text" value="${significado}" readonly style="background:var(--bg);color:var(--muted)">
          </div>
          <div class="form-group span-2">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer">
              <input type="checkbox" id="sig-confirm" style="width:16px;height:16px">
              Confirmo que estou ciente do significado desta assinatura eletrônica e que ela é de minha autoria.
            </label>
          </div>
        </div>
        <div id="sig-error" style="display:none;margin-top:8px;padding:8px;background:#fee2e2;border-radius:6px;font-size:0.78rem;color:#991b1b"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="sig-cancel">Cancelar</button>
        <button class="btn btn-primary" id="sig-ok">✍ Assinar e Confirmar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.querySelector('.modal-close').onclick = () => overlay.remove();
  overlay.querySelector('#sig-cancel').onclick   = () => overlay.remove();
  overlay.querySelector('#sig-ok').onclick = () => {
    const usuario = overlay.querySelector('#sig-usuario').value;
    const confirmado = overlay.querySelector('#sig-confirm').checked;
    const errEl = overlay.querySelector('#sig-error');
    if (!usuario) { errEl.textContent = 'Selecione o signatário.'; errEl.style.display='block'; return; }
    if (!confirmado) { errEl.textContent = 'Marque a caixa de confirmação.'; errEl.style.display='block'; return; }
    db.setSessionUser(usuario);
    overlay.remove();
    onConfirm(usuario);
  };
}

// ── Vista Lista ──────────────────────────────────────────────────────────────

function renderTable(items, container) {
  if (!items.length) return emptyState('Nenhum documento SGQ cadastrado.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Código</th>
            <th>Título</th>
            <th>Tipo</th>
            <th>Rev.</th>
            <th>Homologação</th>
            <th>Validade</th>
            <th>Status</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(doc => {
            const s = computedStatus(doc);
            const exp = expiryDate(doc);
            const etapaInfo = ETAPAS_DOC.find(e => e.key === s);
            const prox = etapaInfo?.prox;
            return `
              <tr>
                <td><strong style="font-family:monospace">${doc.numero}</strong></td>
                <td>
                  <div style="font-weight:500;max-width:260px">${doc.titulo}</div>
                  ${doc.elaboradores ? `<div style="font-size:0.72rem;color:var(--muted)">Elab.: ${doc.elaboradores}</div>` : ''}
                </td>
                <td>${tipoBadge(doc.tipo)}</td>
                <td style="text-align:center;font-family:monospace;font-size:0.8rem">Rev.${doc.revisao || '00'}</td>
                <td style="font-size:0.8rem">${doc.dataHomologacao ? formatDate(doc.dataHomologacao) : '<span style="color:var(--muted)">—</span>'}</td>
                <td style="font-size:0.8rem">${exp ? formatDate(exp) : '<span style="color:var(--muted)">—</span>'}</td>
                <td>${statusPill(s)}</td>
                <td>
                  <div class="td-actions">
                    ${prox ? `<button class="btn btn-sm" style="background:${etapaInfo.cor}15;color:${etapaInfo.cor};border:1px solid ${etapaInfo.cor}40" data-action="avancar" data-id="${doc.id}" title="Avançar para: ${prox}">→ ${etapaInfo.label.split(' ')[0] === 'Aprov' ? 'Aprovar' : prox.replace('Em ','')}</button>` : ''}
                    <button class="btn btn-secondary btn-sm" data-action="solicitar" data-id="${doc.id}" title="Solicitar revisão (POP-GQ-002-01)">↻ Solicitar</button>
                    <button class="btn btn-secondary btn-sm" data-action="edit" data-id="${doc.id}">✏</button>
                    <button class="btn btn-danger btn-sm" data-action="delete" data-id="${doc.id}">🗑</button>
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Vista Fluxo (Kanban) ────────────────────────────────────────────────────

function renderFluxo() {
  const docs = db.get('documentos');
  const colunas = ETAPAS_DOC.map(etapa => {
    const items = docs.filter(d => d.status === etapa.key);
    return { etapa, items };
  });

  return `
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;min-height:400px">
      ${colunas.map(({ etapa, items }) => `
        <div style="min-width:240px;flex:1;background:var(--bg);border-radius:8px;border:1px solid var(--border);display:flex;flex-direction:column">
          <div style="padding:10px 12px;border-bottom:3px solid ${etapa.cor};border-radius:8px 8px 0 0">
            <div style="font-size:0.78rem;font-weight:700;color:${etapa.cor};text-transform:uppercase;letter-spacing:.05em">${etapa.label}</div>
            <div style="font-size:0.72rem;color:var(--muted);margin-top:2px">${etapa.ator}</div>
            <span style="display:inline-block;background:${etapa.cor};color:#fff;border-radius:10px;padding:1px 8px;font-size:0.72rem;font-weight:700;margin-top:4px">${items.length}</span>
          </div>
          <div style="padding:8px;display:flex;flex-direction:column;gap:6px;flex:1">
            ${items.length === 0 ? `<div style="text-align:center;color:var(--muted);font-size:0.78rem;padding:20px 8px">Nenhum documento</div>` : ''}
            ${items.map(doc => `
              <div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px;border-left:3px solid ${etapa.cor}">
                <div style="font-family:monospace;font-size:0.78rem;font-weight:700;color:${etapa.cor}">${doc.numero}</div>
                <div style="font-size:0.8rem;font-weight:500;margin:3px 0;line-height:1.3">${doc.titulo.length > 50 ? doc.titulo.substring(0,50)+'…' : doc.titulo}</div>
                ${tipoBadge(doc.tipo)}
                ${doc.elaboradores ? `<div style="font-size:0.7rem;color:var(--muted);margin-top:4px">Elab.: ${doc.elaboradores}</div>` : ''}
                ${doc.revisores ? `<div style="font-size:0.7rem;color:var(--muted)">Rev.: ${doc.revisores}</div>` : ''}
                <div style="margin-top:8px;display:flex;gap:4px">
                  <button class="btn btn-sm" style="flex:1;background:${etapa.cor}15;color:${etapa.cor};border:1px solid ${etapa.cor}40;font-size:0.72rem" data-action="avancar" data-id="${doc.id}">→ ${etapa.prox === 'Vigente' ? 'Homologar' : etapa.prox.replace('Em ','')}</button>
                  <button class="btn btn-secondary btn-sm" style="font-size:0.72rem" data-action="edit" data-id="${doc.id}">✏</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}

      <div style="min-width:220px;flex:1;background:var(--bg);border-radius:8px;border:1px solid var(--border);display:flex;flex-direction:column;opacity:0.8">
        <div style="padding:10px 12px;border-bottom:3px solid #16a34a;border-radius:8px 8px 0 0">
          <div style="font-size:0.78rem;font-weight:700;color:#16a34a;text-transform:uppercase;letter-spacing:.05em">Publicados</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px">Vigente / A Vencer / Vencido</div>
          <span style="display:inline-block;background:#16a34a;color:#fff;border-radius:10px;padding:1px 8px;font-size:0.72rem;font-weight:700;margin-top:4px">${docs.filter(d => ['Vigente','A Vencer','Vencido'].includes(computedStatus(d))).length}</span>
        </div>
        <div style="padding:8px;display:flex;flex-direction:column;gap:6px;flex:1;overflow-y:auto;max-height:400px">
          ${docs.filter(d => ['Vigente','A Vencer','Vencido'].includes(computedStatus(d))).map(doc => {
            const s = computedStatus(doc);
            return `
              <div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;border-left:3px solid #16a34a">
                <div style="font-family:monospace;font-size:0.75rem;font-weight:700;color:#16a34a">${doc.numero}</div>
                <div style="font-size:0.78rem;margin:2px 0">${doc.titulo.length > 45 ? doc.titulo.substring(0,45)+'…' : doc.titulo}</div>
                <div style="display:flex;gap:4px;align-items:center;margin-top:4px">
                  ${statusPill(s)}
                  ${doc.dataHomologacao ? `<span style="font-size:0.7rem;color:var(--muted)">Rev.${doc.revisao}</span>` : ''}
                </div>
                <div style="margin-top:6px">
                  <button class="btn btn-secondary btn-sm" style="font-size:0.7rem" data-action="solicitar" data-id="${doc.id}">↻ Solicitar revisão</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

// ── Vista Trilha ─────────────────────────────────────────────────────────────

function renderTrilha() {
  const trilha = db.get('trilha').filter(e => e.modulo === 'documentos').reverse().slice(0, 100);
  if (!trilha.length) return `<div style="text-align:center;padding:30px;color:var(--muted);font-size:0.85rem">Nenhum evento registrado ainda. As ações nos documentos serão registradas aqui.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Data/Hora</th><th>Usuário</th><th>Ação</th><th>Documento</th><th>Detalhe</th></tr></thead>
        <tbody>
          ${trilha.map(e => `
            <tr>
              <td style="font-size:0.75rem;white-space:nowrap">${new Date(e.dataHora).toLocaleString('pt-BR')}</td>
              <td style="font-size:0.78rem">${e.usuario}</td>
              <td>${statusPill(e.acao) || e.acao}</td>
              <td style="font-family:monospace;font-size:0.78rem">${e.registro}</td>
              <td style="font-size:0.78rem;max-width:240px;color:var(--muted)">${e.detalhe}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Filtros / rebuild ────────────────────────────────────────────────────────

function applyFilters(container) {
  const search = container.querySelector('[data-filter="search"]')?.value?.toLowerCase() ?? '';
  const tipo   = container.querySelector('[data-filter="tipo"]')?.value ?? '';
  const status = container.querySelector('[data-filter="status"]')?.value ?? '';
  let items = db.get('documentos');
  if (search) items = items.filter(d => d.numero?.toLowerCase().includes(search) || d.titulo?.toLowerCase().includes(search));
  if (tipo)   items = items.filter(d => d.tipo === tipo);
  if (status) items = items.filter(d => computedStatus(d) === status);
  const wrap = container.querySelector('#docs-content-wrap');
  if (wrap) wrap.innerHTML = renderTable(items);
}

function switchTab(container, tab) {
  container.querySelectorAll('[data-tab-btn]').forEach(b => {
    b.style.fontWeight = b.dataset.tabBtn === tab ? '700' : '400';
    b.style.borderBottom = b.dataset.tabBtn === tab ? '2px solid var(--blue-light)' : '2px solid transparent';
    b.style.color = b.dataset.tabBtn === tab ? 'var(--blue-light)' : 'var(--muted)';
  });
  const filterBar = container.querySelector('#filter-bar');
  const content   = container.querySelector('#docs-content-wrap');
  if (!content) return;

  if (tab === 'lista') {
    if (filterBar) filterBar.style.display = '';
    content.innerHTML = renderTable(db.get('documentos'));
  } else if (tab === 'fluxo') {
    if (filterBar) filterBar.style.display = 'none';
    content.innerHTML = renderFluxo();
  } else if (tab === 'trilha') {
    if (filterBar) filterBar.style.display = 'none';
    content.innerHTML = renderTrilha();
  }
}

// ── Avançar etapa (com assinatura eletrônica para Aprovar/Homologar) ─────────

function avancarEtapa(doc, container, tabAtual) {
  const statusAtual = computedStatus(doc);
  const etapaAtual  = ETAPAS_DOC.find(e => e.key === statusAtual);
  if (!etapaAtual) return;
  const prox = etapaAtual.prox;

  const precisaSig = ['Em Aprovação', 'Em Homologação'].includes(statusAtual);

  const doAvancar = (usuario) => {
    const patch = { status: prox };
    if (prox === 'Vigente') {
      patch.dataHomologacao = patch.dataHomologacao || new Date().toISOString().substring(0, 10);
      patch.homologador = usuario || db.getSessionUser();
    }
    db.update('documentos', doc.id, patch);
    db.addAudit(
      prox === 'Vigente' ? 'Homologação' : `Avançou para ${prox}`,
      'documentos', doc.numero,
      `Documento ${doc.numero} avançado de "${statusAtual}" para "${prox}"${usuario ? ` — assinado por ${usuario}` : ''}`
    );
    toast(`${doc.numero} avançado para "${prox}"${prox === 'Vigente' ? ' ✓ Publicado!' : ''}`);
    switchTab(container, tabAtual);
  };

  if (precisaSig) {
    const acaoLabel = statusAtual === 'Em Aprovação'
      ? `Aprovar o documento ${doc.numero} Rev.${doc.revisao} — "${doc.titulo}"`
      : `Homologar e publicar o documento ${doc.numero} Rev.${doc.revisao} — "${doc.titulo}"`;
    showSignatureModal(
      statusAtual === 'Em Aprovação' ? `Aprovar ${doc.numero}` : `Homologar ${doc.numero}`,
      acaoLabel,
      doAvancar
    );
  } else {
    doAvancar(db.getSessionUser());
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

let _tabAtual = 'lista';

export default {
  render(container) {
    const emWorkflow = db.get('documentos').filter(d => ETAPAS_DOC.some(e => e.key === d.status)).length;
    container.innerHTML = `
      <div class="page-header">
        <h2>Controle de Documentos SGQ</h2>
        <div style="display:flex;gap:8px;align-items:center">
          ${emWorkflow > 0 ? `<span style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:6px;padding:3px 10px;font-size:0.75rem;font-weight:600">${emWorkflow} em fluxo</span>` : ''}
          <button class="btn btn-primary" data-action="new">+ Novo Documento</button>
        </div>
      </div>

      <div style="font-size:0.78rem;color:var(--muted);margin:-6px 0 12px">
        POP-GQ-002 · Validade: 3 anos · Fluxo: Elaboração → Revisão → Aprovação → Homologação (assinatura eletrônica)
      </div>

      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:14px">
        <button data-tab-btn="lista"   style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid var(--blue-light);color:var(--blue-light);font-weight:700">Lista</button>
        <button data-tab-btn="fluxo"   style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid transparent;color:var(--muted)">Fluxo de Processo</button>
        <button data-tab-btn="trilha"  style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid transparent;color:var(--muted)">Trilha de Auditoria</button>
      </div>

      <div id="filter-bar" class="toolbar">
        <input class="toolbar-search" type="text" placeholder="Buscar por código ou título…" data-filter="search">
        <select class="toolbar-select" data-filter="tipo">
          <option value="">Todos os tipos</option>
          ${TIPOS_DOC.map(t => `<option value="${t}">${t} — ${TIPO_META[t]?.label || t}</option>`).join('')}
        </select>
        <select class="toolbar-select" data-filter="status">
          <option value="">Todos os status</option>
          ${selectOptions(STATUS.DOC)}
        </select>
      </div>

      <div class="card" style="padding:14px">
        <div id="docs-content-wrap">
          ${renderTable(db.get('documentos'))}
        </div>
      </div>
    `;
  },

  init(container) {
    _tabAtual = 'lista';

    container.addEventListener('click', e => {
      const tabBtn = e.target.closest('[data-tab-btn]');
      if (tabBtn) {
        _tabAtual = tabBtn.dataset.tabBtn;
        switchTab(container, _tabAtual);
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      if (action === 'new') {
        openModal({
          title: 'Novo Documento SGQ',
          fields: FIELDS,
          data: { revisao: '00', status: 'Em Elaboração' },
          onSave: data => {
            const item = db.add('documentos', data);
            db.addAudit('Criou', 'documentos', data.numero || item.id, `Documento "${data.titulo}" criado com status "${data.status}"`);
            toast('Documento cadastrado!');
            switchTab(container, _tabAtual);
          },
        });
      }

      if (action === 'edit') {
        const record = db.getById('documentos', numId);
        if (!record) return;
        openModal({
          title: `Editar — ${record.numero}`,
          fields: FIELDS,
          data: record,
          onSave: data => {
            db.update('documentos', numId, data);
            db.addAudit('Editou', 'documentos', record.numero, `Campos atualizados — status: "${data.status}"`);
            toast('Documento atualizado!');
            switchTab(container, _tabAtual);
          },
        });
      }

      if (action === 'solicitar') {
        const doc = db.getById('documentos', numId);
        if (!doc) return;
        openModal({
          title: `POP-GQ-002-01 — Solicitação: ${doc.numero}`,
          fields: CAMPOS_REVISAO,
          data: { dataSolic: new Date().toISOString().substring(0, 10), solicitante: db.getSessionUser() },
          onSave: (data) => {
            const novoStatus = data.tipoSolic === 'Cancelamento' ? 'Cancelado' : 'Em Elaboração';
            db.update('documentos', numId, { status: novoStatus, elaboradores: data.elaboradorProp || doc.elaboradores, revisores: data.revisoresProp || doc.revisores, aprovadores: data.aprovadoresProp || doc.aprovadores });
            db.addAudit('Solicitação', 'documentos', doc.numero, `${data.tipoSolic} solicitada por ${data.solicitante} (${data.areaSolic}): ${data.justificativa.substring(0, 100)}`);
            toast(`Solicitação registrada. ${doc.numero} → "${novoStatus}".`);
            switchTab(container, _tabAtual);
          },
        });
      }

      if (action === 'avancar') {
        const doc = db.getById('documentos', numId);
        if (!doc) return;
        avancarEtapa(doc, container, _tabAtual);
      }

      if (action === 'delete') {
        showConfirm('Deseja remover este documento do controle?').then(ok => {
          if (!ok) return;
          const doc = db.getById('documentos', numId);
          db.remove('documentos', numId);
          db.addAudit('Excluiu', 'documentos', doc?.numero || numId, 'Documento removido do sistema');
          toast('Documento removido.', 'warning');
          switchTab(container, _tabAtual);
        });
      }
    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
