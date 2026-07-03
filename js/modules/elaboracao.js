/**
 * @fileoverview Módulo Elaboração de Documentos — solicitação e acompanhamento por área.
 * Áreas: Solicitar Elaboração | Em Andamento
 */

import { db } from '../db.js';
import { statusPill, formatDate } from '../utils.js';
import { toast } from '../toast.js';
import { ETAPAS_DOC } from '../constants.js';

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

function tipoBadge(tipo) {
  const m = TIPO_META[tipo] || { label: tipo, color: '#6b7280' };
  return `<span style="display:inline-block;padding:1px 8px;border-radius:3px;background:${m.color}1a;color:${m.color};font-size:0.72rem;font-weight:700">${m.label}</span>`;
}

const SEM_VALIDADE = ['PR', 'RE'];

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

function renderListaMestra() {
  const docs = db.get('documentos').slice().sort((a, b) => (a.numero || '').localeCompare(b.numero || ''));
  if (!docs.length) return `<div style="text-align:center;padding:30px;color:var(--muted);font-size:0.85rem">Nenhum documento cadastrado ainda.</div>`;
  return `
    <div>
      <div style="font-size:0.78rem;color:var(--muted);margin-bottom:12px;padding:8px 12px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">
        Lista Mestra de Documentos SGQ · ${docs.length} documento(s) cadastrado(s) · Somente leitura
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Código</th><th>Título</th><th>Tipo</th><th>Área</th><th>Rev.</th><th>Status</th><th>Homologação</th><th>Validade</th></tr>
          </thead>
          <tbody>
            ${docs.map(doc => {
              const s   = computedStatus(doc);
              const exp = expiryDate(doc);
              return `
                <tr>
                  <td style="font-family:monospace;font-weight:700;font-size:0.82rem;white-space:nowrap">${doc.numero}</td>
                  <td style="max-width:260px">
                    <div style="font-weight:500">${doc.titulo}</div>
                    ${doc.elaboradores ? `<div style="font-size:0.72rem;color:var(--muted)">Elab.: ${doc.elaboradores}</div>` : ''}
                  </td>
                  <td>${tipoBadge(doc.tipo)}</td>
                  <td style="font-size:0.82rem">${doc.area || '—'}</td>
                  <td style="text-align:center;font-family:monospace;font-size:0.8rem">Rev.${doc.revisao || '00'}</td>
                  <td>${statusPill(s)}</td>
                  <td style="font-size:0.8rem">${doc.dataHomologacao ? formatDate(doc.dataHomologacao) : '<span style="color:var(--muted)">—</span>'}</td>
                  <td style="font-size:0.8rem">${exp ? formatDate(exp) : '<span style="color:var(--muted)">—</span>'}</td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function nextCode(tipo, area) {
  if (!tipo || !area) return '';
  const docs = db.get('documentos');
  const pattern = new RegExp(`^${tipo}-${area}-(\\d+)$`);
  const nums = docs.map(d => { const m = d.numero?.match(pattern); return m ? parseInt(m[1]) : 0; }).filter(n => n > 0);
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${tipo}-${area}-${String(next).padStart(3, '0')}`;
}

function nextSolicNum() {
  const year = new Date().getFullYear();
  const solics = db.get('solicitacoes').filter(s => (s.numSolic || '').startsWith(`SOL-${year}`));
  return `SOL-${year}-${String(solics.length + 1).padStart(3, '0')}`;
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
    if (!usuario)    { errEl.textContent = 'Selecione o signatário.';        errEl.style.display = 'block'; return; }
    if (!confirmado) { errEl.textContent = 'Marque a caixa de confirmação.'; errEl.style.display = 'block'; return; }
    db.setSessionUser(usuario);
    overlay.remove();
    onConfirm(usuario);
  };
}

// ── Em Andamento ──────────────────────────────────────────────────────────────

function renderEmAndamento(container) {
  const filtroNome = container.querySelector('#elab-filtro-nome')?.value || '';
  const emFluxo = db.get('documentos').filter(d => ETAPAS_DOC.some(e => e.key === d.status));

  const filtrado = filtroNome
    ? emFluxo.filter(d =>
        (d.elaboradores || '').includes(filtroNome) ||
        (d.revisores    || '').includes(filtroNome) ||
        (d.aprovadores  || '').includes(filtroNome) ||
        (d.homologador  || '').includes(filtroNome)
      )
    : emFluxo;

  const wrap = container.querySelector('#elab-andamento-wrap');
  if (!wrap) return;

  if (!filtrado.length) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:48px;color:var(--muted)">
        <div style="font-size:2.5rem;margin-bottom:8px">✓</div>
        <div style="font-weight:500">${filtroNome ? `Nenhum documento em andamento para "${filtroNome}"` : 'Nenhum documento em elaboração no momento'}</div>
        <div style="font-size:0.8rem;margin-top:4px">Os documentos aprovados pela GQ aparecerão aqui para elaboração.</div>
      </div>`;
    return;
  }

  wrap.innerHTML = ETAPAS_DOC.map(etapa => {
    const items = filtrado.filter(d => d.status === etapa.key);
    if (!items.length) return '';
    return `
      <div style="margin-bottom:24px">
        <div style="font-size:0.8rem;font-weight:700;color:${etapa.cor};text-transform:uppercase;letter-spacing:.05em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid ${etapa.cor}40;display:flex;align-items:center;gap:8px">
          ${etapa.label}
          <span style="background:${etapa.cor};color:#fff;border-radius:10px;padding:1px 8px;font-size:0.72rem">${items.length}</span>
          <span style="font-size:0.72rem;font-weight:400;color:var(--muted);text-transform:none">${etapa.ator}</span>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px">
          ${items.map(doc => {
            const responsavel = etapa.key === 'Em Elaboração' ? doc.elaboradores
                              : etapa.key === 'Em Revisão'    ? doc.revisores
                              : etapa.key === 'Em Aprovação'  ? doc.aprovadores
                              : doc.homologador || '—';
            const needsSig = ['Em Aprovação', 'Em Homologação'].includes(etapa.key);
            return `
              <div style="background:var(--surface);border:1px solid var(--border);border-radius:8px;padding:14px;border-left:4px solid ${etapa.cor}">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
                  <span style="font-family:monospace;font-size:0.82rem;font-weight:700;color:${etapa.cor}">${doc.numero}</span>
                  ${tipoBadge(doc.tipo)}
                </div>
                <div style="font-size:0.88rem;font-weight:500;margin-bottom:8px;line-height:1.3">${doc.titulo}</div>
                <div style="font-size:0.75rem;color:var(--muted);margin-bottom:10px;display:flex;flex-direction:column;gap:2px">
                  <div><strong>Responsável:</strong> ${responsavel || '—'}</div>
                  ${doc.elaboradores && etapa.key !== 'Em Elaboração' ? `<div>Elab.: ${doc.elaboradores}</div>` : ''}
                  ${doc.revisores && etapa.key === 'Em Aprovação' ? `<div>Rev.: ${doc.revisores}</div>` : ''}
                </div>
                <button class="btn btn-sm" style="width:100%;background:${etapa.cor}15;color:${etapa.cor};border:1px solid ${etapa.cor}40"
                  data-action="elab-avancar" data-id="${doc.id}">
                  ${needsSig ? '✍ ' : '→ '}${etapa.prox === 'Vigente' ? 'Concluir Homologação' : `Concluir ${etapa.label.replace('Em ', '')}`}
                </button>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }).join('');
}

// ── Minhas Solicitações ───────────────────────────────────────────────────────

function renderMinhasSolicitacoes() {
  const solics = db.get('solicitacoes').reverse();
  if (!solics.length) return '';
  return `
    <div style="margin-top:28px">
      <div style="font-size:0.88rem;font-weight:700;color:var(--text);margin-bottom:12px;padding-bottom:6px;border-bottom:1px solid var(--border)">
        Histórico de solicitações
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Nº</th><th>Data</th><th>Tipo</th><th>Documento</th><th>Solicitante</th><th>Status GQ</th><th></th></tr>
          </thead>
          <tbody>
            ${solics.map(s => `
              <tr>
                <td style="font-family:monospace;font-weight:700;font-size:0.8rem">${s.numSolic}</td>
                <td style="font-size:0.78rem">${formatDate(s.dataSolic)}</td>
                <td>${statusPill(s.tipoSolic)}</td>
                <td>
                  <div style="font-size:0.82rem;font-weight:500">${s.tituloDoc || '—'}</div>
                  ${s.docExistente
                    ? `<div style="font-size:0.72rem;color:var(--muted)">Revisão de: <span style="font-family:monospace;color:var(--blue-light)">${s.docExistente}</span></div>`
                    : (s.numeroGerado ? `<div style="font-size:0.72rem;font-family:monospace;color:var(--blue-light)">${s.numeroGerado}</div>` : '')}
                </td>
                <td style="font-size:0.78rem">${s.solicitante}<div style="color:var(--muted)">${s.areaSolic}</div></td>
                <td>${statusPill(s.status)}</td>
                <td>
                  <button class="btn btn-sm btn-secondary" data-action="solic-pdf" data-num-solic="${s.numSolic}"
                    title="Gerar PDF desta solicitação" style="font-size:0.72rem;padding:2px 8px">
                    📄 PDF
                  </button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

// ── Formulário de Solicitação ─────────────────────────────────────────────────

function renderFormSolicitar(container) {
  const nomes     = db.get('equipe').map(m => m.nome);
  const nomesOpts = nomes.map(n => `<option value="${n}">${n}</option>`).join('');
  const numSolic  = nextSolicNum();
  const hoje      = new Date().toISOString().substring(0, 10);

  container.querySelector('#elab-content-wrap').innerHTML = `
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
            <input type="number" id="solic-qtdAnexos" min="0" max="99" placeholder="0" style="max-width:120px">
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
        <button class="btn btn-primary" data-action="solic-enviar">Enviar Solicitação</button>
      </div>

      ${renderMinhasSolicitacoes()}
    </div>`;

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
    if (!isRev && docExtSel) { docExtSel.value = ''; updatePreview(); }
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
    const proxRev = String(parseInt(doc.revisao || '00', 10) + 1).padStart(2, '0');
    if (tipoSel)  tipoSel.value  = doc.tipo;
    if (areaSel)  areaSel.value  = doc.area;
    if (tituloEl && !tituloEl.value) tituloEl.value = doc.titulo;
    if (codigoEl) codigoEl.value = `${doc.numero} · Rev.${proxRev}`;
  });
}

// ── Geração de PDF ────────────────────────────────────────────────────────────

function gerarPDFSolicitacao(s) {
  const dataGeracao = new Date().toLocaleString('pt-BR');
  const dataSolicFmt = s.dataSolic
    ? new Date(s.dataSolic + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
  const impactoColor = v => v === 'Sim' ? '#dc2626' : '#059669';

  const secao = (titulo, conteudo) => `
    <div class="section">
      <div class="section-title">${titulo}</div>
      ${conteudo}
    </div>`;

  const campo = (label, valor, full) => `
    <div class="field${full ? ' full' : ''}">
      <label>${label}</label>
      <value>${valor || '—'}</value>
    </div>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Solicitação ${s.numSolic}</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box }
    body { font-family:Arial,sans-serif; font-size:11pt; color:#1a1a1a; padding:16mm }
    .header { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1d4ed8; padding-bottom:12px; margin-bottom:18px }
    .logo h1 { font-size:15pt; color:#1d4ed8; font-weight:700 }
    .logo p { font-size:9pt; color:#6b7280; margin-top:2px }
    .doc-id { text-align:right }
    .doc-id .num { font-size:14pt; font-weight:700; color:#1d4ed8; font-family:monospace }
    .doc-id .sub { font-size:8.5pt; color:#6b7280 }
    h2 { font-size:12pt; font-weight:700; color:#1e3a8a; margin-bottom:16px; text-align:center }
    .section { margin-bottom:14px }
    .section-title { font-size:9.5pt; font-weight:700; color:#1d4ed8; padding:4px 8px; background:#eff6ff; border-left:3px solid #1d4ed8; margin-bottom:8px }
    .grid { display:grid; grid-template-columns:1fr 1fr; gap:5px 20px }
    .field { margin-bottom:3px }
    .field.full { grid-column:1/-1 }
    label { font-size:8pt; color:#6b7280; display:block; margin-bottom:1px }
    value { font-size:10pt; font-weight:500; display:block }
    .badge { display:inline-block; padding:1px 8px; border-radius:3px; font-size:8.5pt; font-weight:700; background:#dbeafe; color:#1e40af }
    .impacts { display:grid; grid-template-columns:1fr 1fr 1fr; gap:6px }
    .impact-item { border:1px solid #e5e7eb; border-radius:4px; padding:6px 8px }
    .impact-item label { font-size:8pt; color:#6b7280 }
    .sig-area { display:grid; grid-template-columns:1fr 1fr; gap:40px; margin-top:28px; border-top:1px solid #d1d5db; padding-top:14px }
    .sig-box { border-top:1px solid #1a1a1a; padding-top:4px; margin-top:28px }
    .sig-box label { font-size:8pt; color:#6b7280 }
    .footer { margin-top:20px; border-top:1px solid #e5e7eb; padding-top:7px; font-size:7.5pt; color:#9ca3af; display:flex; justify-content:space-between }
    @page { margin:12mm }
    @media print { body { padding:0 } }
  </style>
</head>
<body>
  <div class="header">
    <div class="logo">
      <h1>SGQ — Sistema de Gestão da Qualidade</h1>
      <p>MSB Brasil Dispositivos Médicos</p>
    </div>
    <div class="doc-id">
      <div class="num">${s.numSolic}</div>
      <div class="sub">Solicitação de Elaboração de Documento</div>
    </div>
  </div>

  <h2>Formulário de Solicitação de Documento SGQ</h2>

  ${secao('Identificação da Solicitação', `
    <div class="grid">
      ${campo('Nº da Solicitação', `<span style="font-family:monospace;font-weight:700;color:#1d4ed8">${s.numSolic}</span>`)}
      ${campo('Data', dataSolicFmt)}
      ${campo('Tipo', `<span class="badge">${s.tipoSolic}</span>`)}
      ${campo('Status GQ', s.status)}
      ${campo('Solicitante', s.solicitante)}
      ${campo('Área Solicitante', s.areaSolic)}
    </div>`)}

  ${secao('Identificação do Documento', `
    <div class="grid">
      ${s.docExistente ? campo('Documento a ser revisado', `<span style="font-family:monospace;font-weight:700">${s.docExistente}</span>`) : ''}
      ${campo('Código Gerado / Proposto', `<span style="font-family:monospace;font-weight:700;color:#1d4ed8">${s.numeroGerado || '—'}</span>`)}
      ${campo('Tipo', s.tipoDoc)}
      ${campo('Área Emitente', s.areaDoc)}
      ${campo('Título Proposto', s.tituloDoc, true)}
      ${campo('Justificativa / Descrição da Alteração', s.justificativa, true)}
      ${s.docsImpactados ? campo('Documentos / Procedimentos Impactados', s.docsImpactados, true) : ''}
    </div>`)}

  ${secao('Análise de Impacto', `
    <div class="impacts">
      <div class="impact-item">
        <label>Qualidade do Produto</label>
        <div style="font-size:9.5pt;font-weight:600;color:${impactoColor(s.impactoQualidade)}">${s.impactoQualidade || 'Não'}</div>
      </div>
      <div class="impact-item">
        <label>Processos / Procedimentos</label>
        <div style="font-size:9.5pt;font-weight:600;color:${impactoColor(s.impactoProcesso)}">${s.impactoProcesso || 'Não'}</div>
      </div>
      <div class="impact-item">
        <label>Treinamentos</label>
        <div style="font-size:9.5pt;font-weight:600;color:${impactoColor(s.impactoTreino)}">${s.impactoTreino || 'Não'}</div>
      </div>
    </div>
    ${s.areasTreinar ? `<div class="field" style="margin-top:8px">${campo('Áreas a serem treinadas', s.areasTreinar)}</div>` : ''}`)}

  ${secao('Equipe Proposta para Elaboração', `
    <div class="grid">
      ${campo('Elaborador', s.elaboradorProp)}
      ${campo('Revisores', s.revisoresProp || '—')}
      ${campo('Aprovadores', s.aprovadoresProp || '—')}
    </div>`)}

  ${(s.qtdAnexos && s.qtdAnexos !== '0') || s.distAnexos ? secao('Cópias Controladas / Anexos', `
    <div class="grid">
      ${campo('Quantidade de cópias controladas', s.qtdAnexos || '0')}
      ${campo('Áreas de distribuição', s.distAnexos)}
    </div>`) : ''}

  <div class="sig-area">
    <div>
      <div class="sig-box"><label>Assinatura do Solicitante — ${s.solicitante}</label></div>
    </div>
    <div>
      <div class="sig-box"><label>Recebido pela GQ — Data e Assinatura</label></div>
    </div>
  </div>

  <div class="footer">
    <span>Gerado pelo SGQ em ${dataGeracao}</span>
    <span>${s.numSolic} · POP-GQ-002 · Somente para uso interno</span>
  </div>

  <script>window.print();<\/script>
</body>
</html>`;

  const win = window.open('', '_blank', 'width=920,height=720');
  if (!win) { toast('Permita pop-ups para gerar o PDF.', 'error'); return; }
  win.document.write(html);
  win.document.close();
}

// ── Render principal ──────────────────────────────────────────────────────────

let _areaAtual = 'solicitar';

function renderMain(container) {
  const emAndamento = db.get('documentos').filter(d => ETAPAS_DOC.some(e => e.key === d.status)).length;

  const areaStyle = a =>
    `padding:6px 20px;border-radius:6px;border:none;cursor:pointer;font-size:0.82rem;font-weight:600;` +
    (_areaAtual === a ? 'background:var(--blue-light);color:#fff;' : 'background:transparent;color:var(--muted);');

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Elaboração de Documentos</h2>
        <div style="font-size:0.78rem;color:var(--muted);margin-top:2px">
          Solicite elaboração ou revisão · Acompanhe documentos em andamento
        </div>
      </div>
      ${emAndamento > 0 ? `<span style="background:#fef3c7;color:#92400e;border:1px solid #fcd34d;border-radius:6px;padding:3px 10px;font-size:0.75rem;font-weight:600">${emAndamento} em fluxo</span>` : ''}
    </div>

    <div style="display:flex;gap:0;background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:3px;width:fit-content;margin-bottom:14px">
      <button data-area-btn="solicitar" style="${areaStyle('solicitar')}">Solicitar Elaboração</button>
      <button data-area-btn="andamento" style="${areaStyle('andamento')}">
        Em Andamento${emAndamento > 0 ? `&nbsp;<span style="background:${_areaAtual === 'andamento' ? 'rgba(255,255,255,0.3)' : '#9ca3af'};color:#fff;border-radius:10px;padding:0 6px;font-size:0.7rem">${emAndamento}</span>` : ''}
      </button>
      <button data-area-btn="mestra" style="${areaStyle('mestra')}">Lista Mestra</button>
    </div>

    ${_areaAtual === 'andamento' ? `
    <div class="toolbar" style="margin-bottom:12px">
      <select class="toolbar-select" id="elab-filtro-nome" style="min-width:240px">
        <option value="">Todos os documentos em andamento</option>
        ${db.get('equipe').map(m => `<option value="${m.nome}">${m.nome}</option>`).join('')}
      </select>
      <span style="font-size:0.78rem;color:var(--muted)">Filtre pelo seu nome para ver apenas os seus documentos</span>
    </div>
    ` : ''}

    <div class="card" style="padding:14px">
      <div id="elab-content-wrap">
        ${_areaAtual === 'andamento' ? '<div id="elab-andamento-wrap"></div>' : ''}
        ${_areaAtual === 'mestra' ? renderListaMestra() : ''}
      </div>
    </div>
  `;

  if (_areaAtual === 'solicitar') {
    renderFormSolicitar(container);
  } else if (_areaAtual === 'andamento') {
    renderEmAndamento(container);
  }
}

// ── Export ────────────────────────────────────────────────────────────────────

export default {
  render(container) {
    _areaAtual = 'solicitar';
    renderMain(container);
  },

  init(container) {
    container.addEventListener('click', e => {
      const areaBtn = e.target.closest('[data-area-btn]');
      if (areaBtn) {
        _areaAtual = areaBtn.dataset.areaBtn;
        renderMain(container);
        return;
      }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, numSolic: btnNumSolic } = btn.dataset;
      const numId = id !== undefined ? Number(id) : null;

      // ── PDF da solicitação ──
      if (action === 'solic-pdf') {
        const solic = db.get('solicitacoes').find(s => s.numSolic === btnNumSolic);
        if (solic) gerarPDFSolicitacao(solic);
        return;
      }

      // ── Avançar etapa ──
      if (action === 'elab-avancar') {
        const doc = db.getById('documentos', numId);
        if (!doc) return;
        const statusAtual = doc.status;
        const etapaAtual  = ETAPAS_DOC.find(e => e.key === statusAtual);
        if (!etapaAtual) return;
        const prox = etapaAtual.prox;

        const doAvancar = (usuario) => {
          const patch = { status: prox };
          if (prox === 'Vigente') {
            patch.dataHomologacao = new Date().toISOString().substring(0, 10);
            patch.homologador = usuario || db.getSessionUser();
          }
          db.update('documentos', numId, patch);
          db.addAudit(
            prox === 'Vigente' ? 'Homologação' : `Avançou para ${prox}`,
            'documentos', doc.numero,
            `${doc.numero} avançado de "${statusAtual}" para "${prox}"${usuario ? ` — assinado por ${usuario}` : ''}`
          );
          toast(`${doc.numero} → "${prox}"${prox === 'Vigente' ? ' ✓ Publicado!' : ''}`);
          renderEmAndamento(container);
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

      // ── Enviar solicitação ──
      if (action === 'solic-enviar') {
        const errEl       = container.querySelector('#solic-error');
        const solicitante = container.querySelector('#solic-solicitante')?.value;
        const tipoDoc     = container.querySelector('#solic-tipoDoc')?.value;
        const areaDoc     = container.querySelector('#solic-areaDoc')?.value;
        const titulo      = container.querySelector('#solic-titulo')?.value.trim();
        const justif      = container.querySelector('#solic-justificativa')?.value.trim();
        const elaborador  = container.querySelector('#solic-elab')?.value;

        if (!solicitante) { errEl.textContent = 'Selecione o solicitante.'; errEl.style.display = 'block'; return; }
        if (!tipoDoc || !areaDoc) { errEl.textContent = container.querySelector('#solic-tipo')?.value === 'Revisão' ? 'Selecione o documento a ser revisado.' : 'Selecione o tipo e área do documento.'; errEl.style.display = 'block'; return; }
        if (!titulo)     { errEl.textContent = '"Título proposto" é obrigatório.'; errEl.style.display = 'block'; return; }
        if (!justif)     { errEl.textContent = '"Justificativa" é obrigatória.'; errEl.style.display = 'block'; return; }
        if (!elaborador) { errEl.textContent = 'Selecione o elaborador proposto.'; errEl.style.display = 'block'; return; }
        errEl.style.display = 'none';

        const docExtId     = Number(container.querySelector('#solic-docExistente')?.value || 0);
        const docExtRef    = docExtId ? db.get('documentos').find(d => d.id === docExtId) : null;
        const isRevisao    = container.querySelector('#solic-tipo')?.value === 'Revisão';
        const numeroGerado = (isRevisao && docExtRef) ? docExtRef.numero : nextCode(tipoDoc, areaDoc);
        const numSolic     = nextSolicNum();

        db.add('solicitacoes', {
          numSolic,
          dataSolic:        container.querySelector('#solic-data')?.value,
          tipoSolic:        container.querySelector('#solic-tipo')?.value,
          solicitante,
          areaSolic:        container.querySelector('#solic-area')?.value,
          tipoDoc,
          areaDoc,
          tituloDoc:        titulo,
          numeroGerado,
          elaboradorProp:   elaborador,
          revisoresProp:    [container.querySelector('#solic-rev1')?.value, container.querySelector('#solic-rev2')?.value, container.querySelector('#solic-rev3')?.value].filter(Boolean).join(', '),
          aprovadoresProp:  [container.querySelector('#solic-apr1')?.value, container.querySelector('#solic-apr2')?.value].filter(Boolean).join(', '),
          justificativa:    justif,
          docsImpactados:   container.querySelector('#solic-docsImpactados')?.value || '',
          impactoQualidade: container.querySelector('#solic-impactoQualidade')?.value,
          impactoProcesso:  container.querySelector('#solic-impactoProcesso')?.value,
          impactoTreino:    container.querySelector('#solic-impactoTreino')?.value,
          areasTreinar:     container.querySelector('#solic-areasTreinar')?.value || '',
          qtdAnexos:        container.querySelector('#solic-qtdAnexos')?.value || '0',
          distAnexos:       container.querySelector('#solic-distAnexos')?.value || '',
          docExistente:     docExtRef?.numero || '',
          status: 'Pendente',
        });

        db.addAudit('Solicitação', 'documentos', numeroGerado,
          `Solicitação ${numSolic} enviada por ${solicitante}: ${justif.substring(0, 80)}`);
        toast(`Solicitação ${numSolic} enviada! A GQ irá analisar.`);
        _areaAtual = 'solicitar';
        renderMain(container);
      }
    });

    container.addEventListener('change', e => {
      if (e.target.id === 'elab-filtro-nome') renderEmAndamento(container);
    });
  },
};
