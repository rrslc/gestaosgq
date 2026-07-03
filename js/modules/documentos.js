/**
 * @fileoverview Módulo Controle de Documentos — POP-GQ-002/003 · CFR 21 Part 11.
 * Duas áreas: Gestão GQ (controle completo) | Solicitar Elaboração (por área)
 */

import { db } from '../db.js';
import { statusPill, emptyState, selectOptions, formatDate } from '../utils.js';
import { showConfirm } from '../modal.js';
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

// ── helpers ───────────────────────────────────────────────────────────────────

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

// ── Auto-numeração ────────────────────────────────────────────────────────────

function nextCode(tipo, area) {
  if (!tipo || !area) return '';
  const docs = db.get('documentos');
  const pattern = new RegExp(`^${tipo}-${area}-(\\d+)$`);
  const nums = docs
    .map(d => { const m = d.numero?.match(pattern); return m ? parseInt(m[1]) : 0; })
    .filter(n => n > 0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${tipo}-${area}-${String(next).padStart(3, '0')}`;
}

// ── Assinatura Eletrônica (CFR 21 Part 11 §11.100) ───────────────────────────

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
          <strong>CFR 21 Part 11 / ANVISA RDC 27/2011</strong><br>
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
    const usuario    = overlay.querySelector('#sig-usuario').value;
    const confirmado = overlay.querySelector('#sig-confirm').checked;
    const errEl      = overlay.querySelector('#sig-error');
    if (!usuario)    { errEl.textContent = 'Selecione o signatário.';          errEl.style.display = 'block'; return; }
    if (!confirmado) { errEl.textContent = 'Marque a caixa de confirmação.';   errEl.style.display = 'block'; return; }
    db.setSessionUser(usuario);
    overlay.remove();
    onConfirm(usuario);
  };
}

// ── Modal GQ: Novo / Editar Documento ────────────────────────────────────────

function showDocModal(existing, onSave) {
  const nomes = db.get('equipe').map(m => m.nome);
  const nomesOpts = nomes.map(n => `<option value="${n}">${n}</option>`).join('');
  const isEdit = !!existing;

  const defaultTipo = existing?.tipo || 'POP';
  const defaultArea = existing?.area || 'GQ';
  const previewCode = isEdit ? existing.numero : nextCode(defaultTipo, defaultArea);

  const revList = (existing?.revisores  || '').split(',').map(s => s.trim()).filter(Boolean);
  const aprList = (existing?.aprovadores || '').split(',').map(s => s.trim()).filter(Boolean);
  const elab    = existing?.elaboradores || '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'display:flex;';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:640px;max-height:90vh;overflow-y:auto">
      <div class="modal-header">
        <h3>${isEdit ? 'Editar — ' + existing.numero : 'Novo Documento SGQ'}</h3>
        <button class="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-grid">

          ${!isEdit ? `
          <div class="form-group">
            <label>Tipo <span style="color:var(--red)">*</span></label>
            <select id="doc-tipo">
              ${TIPOS_DOC.map(t => `<option value="${t}"${t === defaultTipo ? ' selected' : ''}>${t} — ${TIPO_META[t]?.label || t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Área emitente <span style="color:var(--red)">*</span></label>
            <select id="doc-area">
              ${AREAS_DOC.map(a => `<option value="${a}"${a === defaultArea ? ' selected' : ''}>${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group span-2">
            <label>Código (gerado automaticamente)</label>
            <div style="display:flex;align-items:center;gap:8px">
              <input type="text" id="doc-numero" value="${previewCode}" readonly
                style="font-family:monospace;font-size:1rem;font-weight:700;background:var(--bg);flex:1;color:var(--blue-light)">
              <span style="font-size:0.72rem;color:var(--muted);white-space:nowrap">auto-gerado</span>
            </div>
          </div>
          ` : `
          <div class="form-group span-2">
            <label>Código</label>
            <input type="text" value="${existing.numero}" readonly
              style="font-family:monospace;font-weight:700;background:var(--bg);color:var(--blue-light)">
          </div>
          `}

          <div class="form-group span-2">
            <label>Título completo <span style="color:var(--red)">*</span></label>
            <input type="text" id="doc-titulo" value="${existing?.titulo || ''}"
              placeholder="Ex: Procedimento Operacional Padrão de Limpeza">
          </div>

          <div class="form-group">
            <label>Revisão</label>
            <input type="text" id="doc-revisao" value="${existing?.revisao || '00'}" placeholder="00">
          </div>
          <div class="form-group">
            <label>Status / Etapa</label>
            <select id="doc-status">
              ${STATUS.DOC.map(s => `<option value="${s}"${s === (existing?.status || 'Em Elaboração') ? ' selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Data de homologação</label>
            <input type="date" id="doc-dataHomologacao" value="${existing?.dataHomologacao || ''}">
          </div>
          <div class="form-group">
            <label>Homologado por</label>
            <select id="doc-homologador">
              <option value="">—</option>
              ${nomes.map(n => `<option value="${n}"${n === existing?.homologador ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>

          <div class="form-group" style="grid-column:1/-1;border-top:1px solid var(--border);padding-top:10px;margin-top:4px">
            <div style="font-size:0.8rem;font-weight:600;color:var(--text);margin-bottom:8px">Equipe de elaboração</div>
          </div>

          <div class="form-group">
            <label>Elaborador (máx. 1)</label>
            <select id="doc-elab">
              <option value="">—</option>
              ${nomes.map(n => `<option value="${n}"${n === elab ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"></div>

          <div class="form-group">
            <label>Revisor 1</label>
            <select id="doc-rev1">
              <option value="">— opcional —</option>
              ${nomes.map(n => `<option value="${n}"${n === revList[0] ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Revisor 2</label>
            <select id="doc-rev2">
              <option value="">— opcional —</option>
              ${nomes.map(n => `<option value="${n}"${n === revList[1] ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Revisor 3</label>
            <select id="doc-rev3">
              <option value="">— opcional —</option>
              ${nomes.map(n => `<option value="${n}"${n === revList[2] ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-group"></div>

          <div class="form-group">
            <label>Aprovador 1</label>
            <select id="doc-apr1">
              <option value="">— opcional —</option>
              ${nomes.map(n => `<option value="${n}"${n === aprList[0] ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Aprovador 2</label>
            <select id="doc-apr2">
              <option value="">— opcional —</option>
              ${nomes.map(n => `<option value="${n}"${n === aprList[1] ? ' selected' : ''}>${n}</option>`).join('')}
            </select>
          </div>

          <div class="form-group span-2">
            <label>Objetivo / Descrição</label>
            <textarea id="doc-descricao" rows="2">${existing?.descricao || ''}</textarea>
          </div>
        </div>
        <div id="doc-modal-error" style="display:none;margin-top:8px;padding:8px 10px;background:#fee2e2;border-radius:6px;font-size:0.78rem;color:#991b1b"></div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="doc-cancel">Cancelar</button>
        <button class="btn btn-primary" id="doc-save">Salvar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  if (!isEdit) {
    const updateCode = () => {
      const t = overlay.querySelector('#doc-tipo')?.value;
      const a = overlay.querySelector('#doc-area')?.value;
      const el = overlay.querySelector('#doc-numero');
      if (el) el.value = nextCode(t, a);
    };
    overlay.querySelector('#doc-tipo')?.addEventListener('change', updateCode);
    overlay.querySelector('#doc-area')?.addEventListener('change', updateCode);
  }

  overlay.querySelector('.modal-close').onclick = () => overlay.remove();
  overlay.querySelector('#doc-cancel').onclick   = () => overlay.remove();
  overlay.querySelector('#doc-save').onclick = () => {
    const errEl = overlay.querySelector('#doc-modal-error');
    const titulo = overlay.querySelector('#doc-titulo')?.value.trim();
    if (!titulo) { errEl.textContent = '"Título" é obrigatório.'; errEl.style.display = 'block'; return; }

    const tipo   = isEdit ? existing.tipo : overlay.querySelector('#doc-tipo')?.value;
    const area   = isEdit ? existing.area : overlay.querySelector('#doc-area')?.value;
    const numero = isEdit ? existing.numero : overlay.querySelector('#doc-numero')?.value;

    const data = {
      numero,
      tipo,
      area,
      titulo,
      revisao:         overlay.querySelector('#doc-revisao')?.value || '00',
      status:          overlay.querySelector('#doc-status')?.value || 'Em Elaboração',
      dataHomologacao: overlay.querySelector('#doc-dataHomologacao')?.value || '',
      homologador:     overlay.querySelector('#doc-homologador')?.value || '',
      elaboradores:    overlay.querySelector('#doc-elab')?.value || '',
      revisores:       [overlay.querySelector('#doc-rev1')?.value, overlay.querySelector('#doc-rev2')?.value, overlay.querySelector('#doc-rev3')?.value].filter(Boolean).join(', '),
      aprovadores:     [overlay.querySelector('#doc-apr1')?.value, overlay.querySelector('#doc-apr2')?.value].filter(Boolean).join(', '),
      descricao:       overlay.querySelector('#doc-descricao')?.value || '',
    };

    overlay.remove();
    onSave(data);
  };
}

// ── GQ: Lista ────────────────────────────────────────────────────────────────

function renderTable(items) {
  if (!items.length) return emptyState('Nenhum documento SGQ cadastrado.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Código</th><th>Título</th><th>Tipo</th><th>Rev.</th>
            <th>Homologação</th><th>Validade</th><th>Status</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(doc => {
            const s        = computedStatus(doc);
            const exp      = expiryDate(doc);
            const etapaInfo = ETAPAS_DOC.find(e => e.key === s);
            const prox     = etapaInfo?.prox;
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
                    ${prox ? `<button class="btn btn-sm" style="background:${etapaInfo.cor}15;color:${etapaInfo.cor};border:1px solid ${etapaInfo.cor}40" data-action="avancar" data-id="${doc.id}">→ ${prox === 'Vigente' ? 'Homologar' : prox.replace('Em ', '')}</button>` : ''}
                    <button class="btn btn-secondary btn-sm" data-action="edit"   data-id="${doc.id}">✏</button>
                    <button class="btn btn-danger    btn-sm" data-action="delete" data-id="${doc.id}">🗑</button>
                  </div>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── GQ: Fluxo de Processo (Kanban) ────────────────────────────────────────────

function renderFluxo() {
  const docs = db.get('documentos');
  const colunas = ETAPAS_DOC.map(etapa => ({ etapa, items: docs.filter(d => d.status === etapa.key) }));
  const vigentes = docs.filter(d => ['Vigente', 'A Vencer', 'Vencido'].includes(computedStatus(d)));

  return `
    <div style="display:flex;gap:12px;overflow-x:auto;padding-bottom:8px;min-height:400px">
      ${colunas.map(({ etapa, items }) => `
        <div style="min-width:220px;flex:1;background:var(--bg);border-radius:8px;border:1px solid var(--border);display:flex;flex-direction:column">
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
                <div style="font-size:0.8rem;font-weight:500;margin:3px 0;line-height:1.3">${doc.titulo.length > 50 ? doc.titulo.substring(0, 50) + '…' : doc.titulo}</div>
                ${tipoBadge(doc.tipo)}
                ${doc.elaboradores ? `<div style="font-size:0.7rem;color:var(--muted);margin-top:4px">Elab.: ${doc.elaboradores}</div>` : ''}
                <div style="margin-top:8px;display:flex;gap:4px">
                  <button class="btn btn-sm" style="flex:1;background:${etapa.cor}15;color:${etapa.cor};border:1px solid ${etapa.cor}40;font-size:0.72rem" data-action="avancar" data-id="${doc.id}">→ ${etapa.prox === 'Vigente' ? 'Homologar' : etapa.prox.replace('Em ', '')}</button>
                  <button class="btn btn-secondary btn-sm" style="font-size:0.72rem" data-action="edit" data-id="${doc.id}">✏</button>
                </div>
              </div>`).join('')}
          </div>
        </div>`).join('')}

      <div style="min-width:200px;flex:1;background:var(--bg);border-radius:8px;border:1px solid var(--border);opacity:0.85">
        <div style="padding:10px 12px;border-bottom:3px solid #16a34a;border-radius:8px 8px 0 0">
          <div style="font-size:0.78rem;font-weight:700;color:#16a34a;text-transform:uppercase">Publicados</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px">Vigente · A Vencer · Vencido</div>
          <span style="display:inline-block;background:#16a34a;color:#fff;border-radius:10px;padding:1px 8px;font-size:0.72rem;font-weight:700;margin-top:4px">${vigentes.length}</span>
        </div>
        <div style="padding:8px;display:flex;flex-direction:column;gap:6px;max-height:400px;overflow-y:auto">
          ${vigentes.map(doc => `
            <div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:8px;border-left:3px solid #16a34a">
              <div style="font-family:monospace;font-size:0.75rem;font-weight:700;color:#16a34a">${doc.numero}</div>
              <div style="font-size:0.78rem;margin:2px 0">${doc.titulo.length > 45 ? doc.titulo.substring(0, 45) + '…' : doc.titulo}</div>
              <div style="display:flex;gap:4px;align-items:center;margin-top:4px">
                ${statusPill(computedStatus(doc))}
                ${doc.revisao ? `<span style="font-size:0.7rem;color:var(--muted)">Rev.${doc.revisao}</span>` : ''}
              </div>
            </div>`).join('')}
        </div>
      </div>
    </div>`;
}

// ── GQ: Solicitações Pendentes ────────────────────────────────────────────────

function renderSolicitacoesPendentes() {
  const solics = db.get('solicitacoes')
    .filter(s => s.status === 'Pendente' || s.status === 'Em Análise')
    .reverse();

  if (!solics.length) return `
    <div style="text-align:center;padding:48px;color:var(--muted)">
      <div style="font-size:2.5rem;margin-bottom:8px">✓</div>
      <div style="font-weight:500">Nenhuma solicitação pendente</div>
      <div style="font-size:0.8rem;margin-top:4px">As solicitações enviadas pelas áreas aparecerão aqui.</div>
    </div>`;

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Nº Solic.</th><th>Data</th><th>Tipo</th><th>Área / Solicitante</th>
            <th>Documento Proposto</th><th>Equipe Proposta</th><th>Status</th><th>Ações GQ</th>
          </tr>
        </thead>
        <tbody>
          ${solics.map(s => `
            <tr>
              <td style="font-family:monospace;font-weight:700;font-size:0.82rem">${s.numSolic}</td>
              <td style="font-size:0.78rem;white-space:nowrap">${formatDate(s.dataSolic)}</td>
              <td>${statusPill(s.tipoSolic)}</td>
              <td>
                <div style="font-weight:500;font-size:0.82rem">${s.solicitante}</div>
                <div style="font-size:0.72rem;color:var(--muted)">${s.areaSolic}</div>
              </td>
              <td>
                <div style="font-size:0.82rem;font-weight:500">${s.tituloDoc || '—'}</div>
                ${s.docExistente
                  ? `<div style="font-size:0.72rem;color:var(--muted)">Revisão de: <span style="font-family:monospace;color:var(--blue-light)">${s.docExistente}</span></div>`
                  : (s.tipoDoc && s.areaDoc ? `<div style="font-size:0.72rem;color:var(--blue-light);font-family:monospace">${s.numeroGerado}</div>` : '')}
                <div style="font-size:0.72rem;color:var(--muted);max-width:200px;margin-top:2px">${(s.justificativa || '').substring(0, 80)}${(s.justificativa || '').length > 80 ? '…' : ''}</div>
              </td>
              <td style="font-size:0.78rem">
                <div>Elab.: ${s.elaboradorProp || '—'}</div>
                ${s.revisoresProp ? `<div style="color:var(--muted)">Rev.: ${s.revisoresProp}</div>` : ''}
                ${s.aprovadoresProp ? `<div style="color:var(--muted)">Apr.: ${s.aprovadoresProp}</div>` : ''}
                ${s.qtdAnexos && s.qtdAnexos !== '0' ? `<div style="color:var(--muted);margin-top:3px">📎 ${s.qtdAnexos} anexo(s)${s.distAnexos ? ` → ${s.distAnexos}` : ''}</div>` : ''}
              </td>
              <td>${statusPill(s.status)}</td>
              <td>
                <div class="td-actions">
                  <button class="btn btn-sm" style="background:#ecfdf5;color:#059669;border:1px solid #6ee7b7;white-space:nowrap"
                    data-action="solic-aprovar" data-id="${s.id}">✓ Criar Doc.</button>
                  <button class="btn btn-danger btn-sm" data-action="solic-rejeitar" data-id="${s.id}">✕</button>
                </div>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ── GQ: Trilha de Auditoria ───────────────────────────────────────────────────

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
              <td style="font-size:0.78rem">${e.acao}</td>
              <td style="font-family:monospace;font-size:0.78rem">${e.registro}</td>
              <td style="font-size:0.78rem;max-width:240px;color:var(--muted)">${e.detalhe}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderFormSolicitar_REMOVED(container) { // moved to elaboracao.js
  const nomes    = db.get('equipe').map(m => m.nome);
  const nomesOpts = nomes.map(n => `<option value="${n}">${n}</option>`).join('');
  const numSolic = nextSolicNum();
  const hoje     = new Date().toISOString().substring(0, 10);

  container.querySelector('#docs-content-wrap').innerHTML = `
    <div style="max-width:800px;margin:0 auto">
      <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:0.82rem;color:#166534">
        Preencha este formulário para solicitar a elaboração ou revisão de um documento SGQ.
        A Garantia da Qualidade irá analisar e iniciar o processo formal.
        <strong>Nº desta solicitação: ${numSolic}</strong>
      </div>

      <div class="card" style="padding:20px">
        <div style="font-size:0.88rem;font-weight:700;color:var(--text);margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--border)">
          Identificação da Solicitação
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Tipo de solicitação <span style="color:var(--red)">*</span></label>
            <select id="solic-tipo">
              <option value="Elaboração">Elaboração — novo documento</option>
              <option value="Revisão">Revisão — documento existente</option>
              <option value="Cancelamento">Cancelamento</option>
              <option value="Alteração de Distribuição">Alteração de Distribuição</option>
            </select>
          </div>
          <div class="form-group">
            <label>Data da solicitação</label>
            <input type="date" id="solic-data" value="${hoje}" readonly style="background:var(--bg)">
          </div>
          <div class="form-group">
            <label>Solicitante <span style="color:var(--red)">*</span></label>
            <select id="solic-solicitante">
              <option value="">Selecione seu nome...</option>
              ${nomesOpts}
            </select>
          </div>
          <div class="form-group">
            <label>Área solicitante <span style="color:var(--red)">*</span></label>
            <select id="solic-area">
              ${AREAS_DOC.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="card" style="padding:20px;margin-top:12px">
        <div style="font-size:0.88rem;font-weight:700;color:var(--text);margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid var(--border)">
          Documento
        </div>
        <div class="form-grid">
          <div class="form-group span-2" id="solic-doc-revisao-wrap" style="display:none">
            <label>Documento a ser revisado <span style="color:var(--red)">*</span></label>
            <select id="solic-docExistente">
              <option value="">Selecione o documento...</option>
              ${db.get('documentos').map(d => `<option value="${d.id}">${d.numero} — ${d.titulo.length > 65 ? d.titulo.substring(0, 65) + '…' : d.titulo}</option>`).join('')}
            </select>
            <div style="font-size:0.72rem;color:var(--muted);margin-top:4px">Tipo, área e título serão preenchidos automaticamente ao selecionar o documento.</div>
          </div>
          <div class="form-group">
            <label>Tipo do documento <span style="color:var(--red)">*</span></label>
            <select id="solic-tipoDoc">
              <option value="">Selecione...</option>
              ${TIPOS_DOC.map(t => `<option value="${t}">${t} — ${TIPO_META[t]?.label || t}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Área emitente <span style="color:var(--red)">*</span></label>
            <select id="solic-areaDoc">
              <option value="">Selecione...</option>
              ${AREAS_DOC.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div class="form-group span-2">
            <label>Código que será gerado</label>
            <input type="text" id="solic-codigo-preview" value="Selecione tipo e área acima" readonly
              style="font-family:monospace;font-weight:700;background:var(--bg);color:var(--blue-light)">
          </div>
          <div class="form-group span-2">
            <label>Título proposto <span style="color:var(--red)">*</span></label>
            <input type="text" id="solic-titulo" placeholder="Ex: Procedimento de Controle de Temperatura de Armazenamento">
          </div>
          <div class="form-group span-2">
            <label>Justificativa / Descrição da alteração <span style="color:var(--red)">*</span></label>
            <textarea id="solic-justificativa" rows="3"
              placeholder="Descreva o motivo da solicitação e o que deve ser elaborado ou alterado..."></textarea>
          </div>
          <div class="form-group span-2">
            <label>Documentos / procedimentos impactados</label>
            <input type="text" id="solic-docsImpactados" placeholder="Ex: POP-GQ-001, POP-GQ-003">
          </div>
          <div class="form-group">
            <label>Impacto na Qualidade do Produto?</label>
            <select id="solic-impactoQualidade"><option value="Não">Não</option><option value="Sim">Sim</option></select>
          </div>
          <div class="form-group">
            <label>Impacto em Processos / Procedimentos?</label>
            <select id="solic-impactoProcesso"><option value="Não">Não</option><option value="Sim">Sim</option></select>
          </div>
          <div class="form-group">
            <label>Impacto em Treinamentos?</label>
            <select id="solic-impactoTreino"><option value="Não">Não</option><option value="Sim">Sim</option></select>
          </div>
          <div class="form-group">
            <label>Áreas a serem treinadas</label>
            <input type="text" id="solic-areasTreinar" placeholder="Ex: RH, CQ, MT">
          </div>
          <div class="form-group">
            <label>Quantidade de anexos (cópias controladas)</label>
            <input type="number" id="solic-qtdAnexos" min="0" max="99" placeholder="0"
              style="max-width:120px">
          </div>
          <div class="form-group">
            <label>Áreas para distribuição dos anexos</label>
            <input type="text" id="solic-distAnexos" placeholder="Ex: Produção, CQ, RH">
          </div>
        </div>
      </div>

      <div class="card" style="padding:20px;margin-top:12px">
        <div style="font-size:0.88rem;font-weight:700;color:var(--text);margin-bottom:4px;padding-bottom:8px;border-bottom:1px solid var(--border)">
          Equipe Proposta para Elaboração
        </div>
        <div style="font-size:0.78rem;color:var(--muted);margin-bottom:12px">
          Indique as pessoas propostas para cada etapa do fluxo. A GQ poderá ajustar antes de iniciar o processo.
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Elaborador proposto <span style="color:var(--red)">*</span></label>
            <select id="solic-elab">
              <option value="">Selecione...</option>
              ${nomesOpts}
            </select>
          </div>
          <div class="form-group"></div>
          <div class="form-group">
            <label>Revisor 1</label>
            <select id="solic-rev1"><option value="">— opcional —</option>${nomesOpts}</select>
          </div>
          <div class="form-group">
            <label>Revisor 2</label>
            <select id="solic-rev2"><option value="">— opcional —</option>${nomesOpts}</select>
          </div>
          <div class="form-group">
            <label>Revisor 3</label>
            <select id="solic-rev3"><option value="">— opcional —</option>${nomesOpts}</select>
          </div>
          <div class="form-group"></div>
          <div class="form-group">
            <label>Aprovador 1</label>
            <select id="solic-apr1"><option value="">— opcional —</option>${nomesOpts}</select>
          </div>
          <div class="form-group">
            <label>Aprovador 2</label>
            <select id="solic-apr2"><option value="">— opcional —</option>${nomesOpts}</select>
          </div>
        </div>
      </div>

      <div id="solic-error" style="display:none;margin-top:10px;padding:8px 10px;background:#fee2e2;border-radius:6px;font-size:0.78rem;color:#991b1b"></div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;padding-bottom:8px">
        <button class="btn btn-secondary" data-action="solic-cancelar">Cancelar</button>
        <button class="btn btn-primary" data-action="solic-enviar">Enviar Solicitação</button>
      </div>
    </div>`;

  // Preview do código ao mudar tipo/área
  const updatePreview = () => {
    const t = container.querySelector('#solic-tipoDoc')?.value;
    const a = container.querySelector('#solic-areaDoc')?.value;
    const el = container.querySelector('#solic-codigo-preview');
    if (el) el.value = (t && a) ? nextCode(t, a) : 'Selecione tipo e área acima';
  };
  container.querySelector('#solic-tipoDoc')?.addEventListener('change', updatePreview);
  container.querySelector('#solic-areaDoc')?.addEventListener('change', updatePreview);

  const tipoSolicSel = container.querySelector('#solic-tipo');
  const docRevWrap   = container.querySelector('#solic-doc-revisao-wrap');
  const docExtSel    = container.querySelector('#solic-docExistente');

  tipoSolicSel?.addEventListener('change', () => {
    const isRev = tipoSolicSel.value === 'Revisão';
    if (docRevWrap) docRevWrap.style.display = isRev ? '' : 'none';
    if (!isRev && docExtSel) {
      docExtSel.value = '';
      updatePreview();
    }
  });

  docExtSel?.addEventListener('change', () => {
    const docId = Number(docExtSel.value);
    if (!docId) return;
    const doc = db.get('documentos').find(d => d.id === docId);
    if (!doc) return;
    const tipoSel  = container.querySelector('#solic-tipoDoc');
    const areaSel  = container.querySelector('#solic-areaDoc');
    const tituloEl = container.querySelector('#solic-titulo');
    const codigoEl = container.querySelector('#solic-codigo-preview');
    if (tipoSel)  tipoSel.value  = doc.tipo;
    if (areaSel)  areaSel.value  = doc.area;
    if (tituloEl && !tituloEl.value) tituloEl.value = doc.titulo;
    if (codigoEl) codigoEl.value = doc.numero;
  });
}

// ── Avançar etapa (com assinatura eletrônica) ────────────────────────────────

function avancarEtapa(doc, container, tabAtual) {
  const statusAtual = computedStatus(doc);
  const etapaAtual  = ETAPAS_DOC.find(e => e.key === statusAtual);
  if (!etapaAtual) return;
  const prox = etapaAtual.prox;

  const doAvancar = (usuario) => {
    const patch = { status: prox };
    if (prox === 'Vigente') {
      patch.dataHomologacao = new Date().toISOString().substring(0, 10);
      patch.homologador = usuario || db.getSessionUser();
    }
    db.update('documentos', doc.id, patch);
    db.addAudit(
      prox === 'Vigente' ? 'Homologação' : `Avançou para ${prox}`,
      'documentos', doc.numero,
      `${doc.numero} avançado de "${statusAtual}" para "${prox}"${usuario ? ` — assinado por ${usuario}` : ''}`
    );
    toast(`${doc.numero} → "${prox}"${prox === 'Vigente' ? ' ✓ Publicado!' : ''}`);
    switchTab(container, tabAtual);
  };

  if (['Em Aprovação', 'Em Homologação'].includes(statusAtual)) {
    showSignatureModal(
      statusAtual === 'Em Aprovação' ? `Aprovar ${doc.numero}` : `Homologar ${doc.numero}`,
      statusAtual === 'Em Aprovação'
        ? `Aprovar o documento ${doc.numero} Rev.${doc.revisao} — "${doc.titulo}"`
        : `Homologar e publicar o documento ${doc.numero} Rev.${doc.revisao} — "${doc.titulo}"`,
      doAvancar
    );
  } else {
    doAvancar(db.getSessionUser());
  }
}

// ── Sub-tabs GQ ───────────────────────────────────────────────────────────────

function switchTab(container, tab) {
  _tabAtual = tab;
  container.querySelectorAll('[data-tab-btn]').forEach(b => {
    const active = b.dataset.tabBtn === tab;
    b.style.fontWeight   = active ? '700' : '400';
    b.style.borderBottom = active ? '2px solid var(--blue-light)' : '2px solid transparent';
    b.style.color        = active ? 'var(--blue-light)' : 'var(--muted)';
  });
  const filterBar = container.querySelector('#filter-bar');
  const wrap      = container.querySelector('#docs-content-wrap');
  if (!wrap) return;

  const solicsCount = db.get('solicitacoes').filter(s => s.status === 'Pendente' || s.status === 'Em Análise').length;
  const solicsBtn   = container.querySelector('[data-tab-btn="solics"]');
  if (solicsBtn) solicsBtn.textContent = `Solicitações${solicsCount > 0 ? ` (${solicsCount})` : ''}`;

  if (tab === 'lista') {
    if (filterBar) filterBar.style.display = '';
    wrap.innerHTML = renderTable(db.get('documentos'));
  } else if (tab === 'fluxo') {
    if (filterBar) filterBar.style.display = 'none';
    wrap.innerHTML = renderFluxo();
  } else if (tab === 'solics') {
    if (filterBar) filterBar.style.display = 'none';
    wrap.innerHTML = renderSolicitacoesPendentes();
  } else if (tab === 'trilha') {
    if (filterBar) filterBar.style.display = 'none';
    wrap.innerHTML = renderTrilha();
  }
}

// ── Render principal ──────────────────────────────────────────────────────────

let _tabAtual = 'lista';

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

function renderMain(container) {
  const emWorkflow  = db.get('documentos').filter(d => ETAPAS_DOC.some(e => e.key === d.status)).length;
  const solicsCount = db.get('solicitacoes').filter(s => s.status === 'Pendente' || s.status === 'Em Análise').length;

  const tabStyle = (tab) => {
    const active = _tabAtual === tab;
    return `padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid ${active ? 'var(--blue-light)' : 'transparent'};color:${active ? 'var(--blue-light)' : 'var(--muted)'};font-weight:${active ? '700' : '400'}`;
  };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Controle de Documentos</h2>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:2px">
          POP-GQ-002 · Gestão GQ · Validade: 3 anos · Fluxo: Elaboração → Revisão → Aprovação → Homologação
        </div>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        ${emWorkflow > 0 ? `<span style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:6px;padding:3px 10px;font-size:0.75rem;font-weight:600">${emWorkflow} em fluxo</span>` : ''}
        <button class="btn btn-primary" data-action="new">+ Novo Documento</button>
      </div>
    </div>

    <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:14px">
      <button data-tab-btn="lista"   style="${tabStyle('lista')}">Lista</button>
      <button data-tab-btn="fluxo"   style="${tabStyle('fluxo')}">Fluxo de Processo</button>
      <button data-tab-btn="solics"  style="${tabStyle('solics')}">Solicitações${solicsCount > 0 ? ` (${solicsCount})` : ''}</button>
      <button data-tab-btn="trilha"  style="${tabStyle('trilha')}">Trilha de Auditoria</button>
    </div>
    <div id="filter-bar" class="toolbar" style="${_tabAtual === 'lista' ? '' : 'display:none'}">
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
}

// ── Export ────────────────────────────────────────────────────────────────────

export default {
  render(container) {
    _tabAtual = 'lista';
    renderMain(container);
  },

  init(container) {
    container.addEventListener('click', e => {
      const tabBtn = e.target.closest('[data-tab-btn]');
      if (tabBtn) {
        switchTab(container, tabBtn.dataset.tabBtn);
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      // ── GQ: criar ──
      if (action === 'new') {
        showDocModal(null, data => {
          db.add('documentos', data);
          db.addAudit('Criou', 'documentos', data.numero, `Documento "${data.titulo}" criado`);
          toast('Documento cadastrado!');
          switchTab(container, _tabAtual);
        });
      }

      // ── GQ: editar ──
      if (action === 'edit') {
        const record = db.getById('documentos', numId);
        if (!record) return;
        showDocModal(record, data => {
          db.update('documentos', numId, data);
          db.addAudit('Editou', 'documentos', record.numero, 'Campos atualizados');
          toast('Documento atualizado!');
          switchTab(container, _tabAtual);
        });
      }

      // ── GQ: excluir ──
      if (action === 'delete') {
        showConfirm('Deseja remover este documento do controle?').then(ok => {
          if (!ok) return;
          const doc = db.getById('documentos', numId);
          db.remove('documentos', numId);
          db.addAudit('Excluiu', 'documentos', doc?.numero || numId, 'Documento removido');
          toast('Documento removido.', 'warning');
          switchTab(container, _tabAtual);
        });
      }

      // ── GQ: avançar etapa ──
      if (action === 'avancar') {
        const doc = db.getById('documentos', numId);
        if (!doc) return;
        avancarEtapa(doc, container, _tabAtual);
      }

      // ── GQ: aprovar solicitação (criar documento) ──
      if (action === 'solic-aprovar') {
        const solic = db.getById('solicitacoes', numId);
        if (!solic) return;

        if (solic.tipoSolic === 'Revisão' && solic.docExistente) {
          const existente = db.get('documentos').find(d => d.numero === solic.docExistente);
          if (existente) {
            db.update('documentos', existente.id, {
              status:       'Em Revisão',
              elaboradores: solic.elaboradorProp || existente.elaboradores,
              revisores:    solic.revisoresProp  || existente.revisores,
              aprovadores:  solic.aprovadoresProp || existente.aprovadores,
            });
            db.update('solicitacoes', numId, { status: 'Aprovada' });
            db.addAudit('Revisão', 'documentos', existente.numero, `Revisão iniciada a partir da solicitação ${solic.numSolic} de ${solic.solicitante}`);
            toast(`${existente.numero} → Revisão iniciada!`);
            switchTab(container, 'solics');
            return;
          }
        }

        const docData = {
          numero:        solic.numeroGerado || nextCode(solic.tipoDoc, solic.areaDoc),
          tipo:          solic.tipoDoc,
          area:          solic.areaDoc,
          titulo:        solic.tituloDoc,
          revisao:       '00',
          status:        'Em Elaboração',
          elaboradores:  solic.elaboradorProp || '',
          revisores:     solic.revisoresProp  || '',
          aprovadores:   solic.aprovadoresProp || '',
          descricao:     solic.justificativa  || '',
        };
        db.add('documentos', docData);
        db.update('solicitacoes', numId, { status: 'Aprovada' });
        db.addAudit('Criou', 'documentos', docData.numero, `Documento criado a partir da solicitação ${solic.numSolic} de ${solic.solicitante}`);
        toast(`${docData.numero} criado e em Elaboração!`);
        switchTab(container, 'solics');
      }

      // ── GQ: rejeitar solicitação ──
      if (action === 'solic-rejeitar') {
        showConfirm('Rejeitar esta solicitação?').then(ok => {
          if (!ok) return;
          const solic = db.getById('solicitacoes', numId);
          db.update('solicitacoes', numId, { status: 'Rejeitada' });
          db.addAudit('Rejeitou', 'documentos', solic?.numSolic || numId, `Solicitação ${solic?.numSolic} rejeitada pela GQ`);
          toast('Solicitação rejeitada.', 'warning');
          switchTab(container, 'solics');
        });
      }

    });

    container.addEventListener('input',  e => { if (e.target.dataset.filter) applyFilters(container); });
    container.addEventListener('change', e => { if (e.target.dataset.filter) applyFilters(container); });
  },
};
