/**
 * @fileoverview Permissões de Acesso — gestão de perfis, matriz de permissões e trilha de auditoria.
 * Conformidade: CFR 21 Part 11 · ANVISA RDC 665/2022 · IN 134/2022 · Guia 33 · ISO 13485:2016 §4.1.6.
 */

import { db } from '../db.js';
import { statusPill, formatDate } from '../utils.js';
import { openModal, showConfirm } from '../modal.js';
import { toast } from '../toast.js';
import { PERFIS, LICENCAS } from '../permissions.js';

const COR_PERFIL = {
  'Adm':      '#dc2626',
  'GQ Apoio': '#2563eb',
  'Executor': '#0891b2',
};

// ── CFR Part 11 Checklist ───────────────────────────────────────────────────

const CFR_ITEMS = [
  { ref: '§11.10(a)', req: 'Validação do sistema computadorizado', status: 'Pendente',    nota: 'Plano de validação deve ser elaborado conforme VAL-2026-010' },
  { ref: '§11.10(b)', req: 'Capacidade de gerar cópias legíveis e completas', status: 'Atendido', nota: 'Exportação JSON + impressão via browser' },
  { ref: '§11.10(c)', req: 'Proteção e arquivamento de registros', status: 'Parcial',    nota: 'Backup Neon PostgreSQL + export JSON manual' },
  { ref: '§11.10(d)', req: 'Limitação de acesso a usuários autorizados', status: 'Atendido', nota: 'Login com senha por usuário, sessão de 8h, matriz Adm/GQ Apoio/Executor × Manager/View implementada' },
  { ref: '§11.10(e)', req: 'Trilha de auditoria com data/hora e usuário', status: 'Atendido', nota: 'Módulo Trilha de Auditoria ativo em Documentos e Permissões' },
  { ref: '§11.10(f)', req: 'Verificação sequencial de etapas do fluxo', status: 'Atendido', nota: 'Kanban de documentos impõe sequência Elaboração → Revisão → Aprovação → Homologação' },
  { ref: '§11.10(g)', req: 'Verificação de autoridade por perfil', status: 'Atendido', nota: 'can(session, modulo, acao) aplicado em todos os módulos de workflow; perfil carregado na sessão' },
  { ref: '§11.10(h)', req: 'Verificação de completude de entrada de dados', status: 'Atendido', nota: 'Campos obrigatórios validados em todos os formulários' },
  { ref: '§11.100',   req: 'Assinatura eletrônica única por indivíduo', status: 'Atendido', nota: 'Modal de assinatura com identificação, data/hora e significado registrados na trilha' },
  { ref: '§11.200',   req: 'Componentes de assinatura: nome + data + significado', status: 'Atendido', nota: 'Implementado no modal de assinatura para Aprovação e Homologação' },
  { ref: 'ANVISA RDC 665/2022', req: 'BPF: sistema computadorizado controlado, acesso restrito, integridade de dados e trilha de auditoria', status: 'Parcial', nota: 'Trilha ativa, perfis definidos — autenticação formal e plano de validação (VAL-2026-010) pendentes' },
  { ref: 'ANVISA IN 134/2022', req: 'Requisitos para certificação e habilitação de sistemas de informação em saúde com dados de registros regulatórios', status: 'Parcial', nota: 'Controles de acesso e rastreabilidade implementados — certificação formal pendente' },
  { ref: 'ANVISA Guia 33', req: 'Validação de sistemas computadorizados: categorização de risco (GAMP), plano de validação, testes e documentação', status: 'Pendente', nota: 'Plano de validação (VAL-2026-010) a ser elaborado seguindo metodologia do Guia 33 / GAMP 5' },
  { ref: 'ISO 13485:2016 §4.1.6', req: 'Validação do software utilizado no SGQ antes do uso e após alterações', status: 'Pendente', nota: 'Execução do plano de validação vinculada ao Guia 33 e VAL-2026-010' },
  { ref: 'ISO 13485:2016 §4.2.5', req: 'Controle de documentos com status e revisão rastreáveis', status: 'Atendido', nota: 'Status, revisão, elaboradores, revisores, aprovadores, homologador registrados' },
];

const COR_STATUS = { 'Atendido': '#059669', 'Parcial': '#d97706', 'Pendente': '#dc2626' };

// ── Tabs ─────────────────────────────────────────────────────────────────────

const MATRIZ_ACESSO = [
  { grupo: 'Visão Geral',        modulos: ['Dashboard', 'Agenda GQ'],
    adm: 'Completo', gqManager: 'Completo', gqView: 'Leitura', execManager: 'Leitura', execView: 'Leitura' },
  { grupo: 'Não-Conformidades',  modulos: ['RNC — Gerencial', 'RNC — Fluxo'],
    adm: 'Completo', gqManager: 'Completo', gqView: 'Leitura', execManager: 'Abrir/Editar', execView: 'Leitura' },
  { grupo: 'CAPA',               modulos: ['CAPA — Gerencial', 'CAPA — Abertura'],
    adm: 'Completo', gqManager: 'Completo', gqView: 'Leitura', execManager: 'Abrir/Editar', execView: 'Leitura' },
  { grupo: 'Reclamações / Tecnovig', modulos: ['Reclamações', 'Tecnovigilância'],
    adm: 'Completo', gqManager: 'Completo', gqView: 'Leitura', execManager: 'Abrir/Editar', execView: 'Leitura' },
  { grupo: 'Qualidade',          modulos: ['Validações', 'Fornecedores', 'GCM', 'Análise de Risco'],
    adm: 'Completo', gqManager: 'Completo', gqView: 'Leitura', execManager: 'Monitorar', execView: 'Leitura' },
  { grupo: 'Auditorias',         modulos: ['Plano Anual', 'Execução / Achados'],
    adm: 'Completo', gqManager: 'Completo', gqView: 'Leitura', execManager: 'Executar / Gerir', execView: 'Leitura' },
  { grupo: 'Documentos',         modulos: ['Controle de Docs.', 'Elaboração'],
    adm: 'Completo', gqManager: 'Completo', gqView: 'Leitura', execManager: 'Executar / Cópia', execView: 'Leitura' },
  { grupo: 'Planejamento',       modulos: ['Atividades', 'Cronograma', 'Calendário', 'Projetos', 'Revisão Gerencial'],
    adm: 'Completo', gqManager: 'Completo', gqView: 'Leitura', execManager: 'Próprias atividades', execView: 'Leitura' },
  { grupo: 'Administração',      modulos: ['Equipe', 'Permissões', 'Configurações'],
    adm: 'Completo', gqManager: 'Leitura',  gqView: 'Leitura', execManager: '—',      execView: '—' },
];

const COR_ACESSO = {
  'Completo': '#059669', 'Leitura': '#3b82f6', 'Abrir/Editar': '#f59e0b',
  'Executar / Gerir': '#f59e0b', 'Executar / Cópia': '#f59e0b',
  'Próprias atividades': '#f59e0b', 'Monitorar': '#94a3b8', '—': '#e2e8f0',
};

function celula(val) {
  const cor = COR_ACESSO[val] || '#6b7280';
  if (val === '—') return `<td style="text-align:center;color:var(--border);font-size:0.9rem">—</td>`;
  return `<td style="text-align:center"><span style="display:inline-block;padding:2px 7px;border-radius:4px;background:${cor}18;color:${cor};font-size:0.72rem;font-weight:600;white-space:nowrap">${val}</span></td>`;
}

function renderPerfis() {
  const equipe = db.get('equipe');
  const porPerfil = { Adm: [], 'GQ Apoio': [], Executor: [] };
  equipe.forEach(m => { if (porPerfil[m.perfil]) porPerfil[m.perfil].push(m); });

  return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      ${PERFIS.map(p => {
        const cor = COR_PERFIL[p];
        const membros = porPerfil[p] || [];
        const descs = { Adm: 'Coordenadora GQ + TI — acesso total ao sistema', 'GQ Apoio': 'Analistas GQ/AR — todos os módulos com licença Manager', Executor: 'Demais colaboradoras — módulos de execução e solicitação' };
        return `<div style="border:1px solid var(--border);border-top:4px solid ${cor};border-radius:8px;padding:14px">
          <div style="font-weight:700;font-size:0.9rem;color:${cor};margin-bottom:4px">${p}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-bottom:10px;line-height:1.4">${descs[p]}</div>
          <div style="font-size:0.72rem;font-weight:600;margin-bottom:4px">Licenças disponíveis:</div>
          <div style="display:flex;gap:4px;margin-bottom:10px">
            ${LICENCAS.map(l => `<span style="padding:2px 8px;border-radius:3px;background:${l==='Manager'?'#f0fdf4':'#f8fafc'};color:${l==='Manager'?'#166534':'#64748b'};font-size:0.7rem;font-weight:600">${l}</span>`).join('')}
          </div>
          <div style="font-size:0.72rem;color:var(--muted)">${membros.length} usuária${membros.length !== 1?'s':''}: ${membros.map(m=>`<strong>${m.nome.split(' ')[0]}</strong>`).join(', ') || 'nenhuma'}</div>
        </div>`;
      }).join('')}
    </div>

    <div style="font-size:0.82rem;font-weight:600;margin-bottom:8px;color:var(--text)">Matriz de acesso por módulo</div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Grupo / Módulos</th>
            <th style="text-align:center">Adm</th>
            <th style="text-align:center">GQ Apoio<br><span style="font-weight:400;font-size:0.7rem">Manager</span></th>
            <th style="text-align:center">GQ Apoio<br><span style="font-weight:400;font-size:0.7rem">View</span></th>
            <th style="text-align:center">Executor<br><span style="font-weight:400;font-size:0.7rem">Manager</span></th>
            <th style="text-align:center">Executor<br><span style="font-weight:400;font-size:0.7rem">View</span></th>
          </tr>
        </thead>
        <tbody>
          ${MATRIZ_ACESSO.map(row => `
            <tr>
              <td>
                <div style="font-weight:600;font-size:0.82rem">${row.grupo}</div>
                <div style="font-size:0.7rem;color:var(--muted)">${row.modulos.join(' · ')}</div>
              </td>
              ${celula(row.adm)}
              ${celula(row.gqManager)}
              ${celula(row.gqView)}
              ${celula(row.execManager)}
              ${celula(row.execView)}
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderUsuarios() {
  const equipe = db.get('equipe');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Nome</th><th>Cargo</th><th>Área</th><th>Perfil</th><th>Licença</th><th>Senha</th><th>Ações</th></tr>
        </thead>
        <tbody>
          ${equipe.map(m => {
            const cor = COR_PERFIL[m.perfil] || '#6b7280';
            return `
              <tr>
                <td>
                  <div style="display:flex;align-items:center;gap:8px">
                    <div style="width:28px;height:28px;border-radius:50%;background:${m.cor || '#6b7280'};color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.72rem;font-weight:700">${m.iniciais}</div>
                    <strong>${m.nome}</strong>
                  </div>
                </td>
                <td style="font-size:0.82rem">${m.cargo}</td>
                <td style="font-size:0.82rem">${m.area || '—'}</td>
                <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${cor}15;color:${cor};font-size:0.75rem;font-weight:700">${m.perfil || '—'}</span></td>
                <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${m.licenca==='Manager'?'#f0fdf4':'#f8fafc'};color:${m.licenca==='Manager'?'#166534':'#64748b'};font-size:0.72rem;font-weight:600">${m.licenca || '—'}</span></td>
                <td style="font-size:0.78rem;color:var(--muted)">${m.senha ? '●●●●' : '<span style="color:var(--red);font-size:0.72rem">não definida</span>'}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" data-action="edit-perfil" data-id="${m.id}">Editar acesso</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:12px;padding:10px 14px;background:#eff6ff;border-radius:6px;font-size:0.78rem;color:#1e40af">
      <strong>Nota:</strong> A alteração de perfil é registrada na trilha de auditoria conforme CFR 21 Part 11 §11.10(e).
    </div>
  `;
}

function renderTrilha() {
  const trilha = [...db.get('trilha')].reverse().slice(0, 200);
  const modFiltro = document.querySelector('#trilha-mod-filter')?.value || '';
  const usuFiltro = document.querySelector('#trilha-usu-filter')?.value?.toLowerCase() || '';
  const filtered = trilha.filter(e => {
    if (modFiltro && e.modulo !== modFiltro) return false;
    if (usuFiltro && !e.usuario.toLowerCase().includes(usuFiltro)) return false;
    return true;
  });

  if (!filtered.length) return `<div style="text-align:center;padding:30px;color:var(--muted);font-size:0.85rem">
    Nenhum evento registrado. Ações no sistema (criação, edição, aprovação) serão registradas aqui conforme CFR 21 Part 11 §11.10(e).
  </div>`;

  const ACAO_COR = { 'Criou': '#059669', 'Editou': '#2563eb', 'Excluiu': '#dc2626', 'Solicitação': '#7c3aed', 'Avançou para Em Revisão': '#7c3aed', 'Avançou para Em Aprovação': '#d97706', 'Avançou para Em Homologação': '#059669', 'Homologação': '#059669' };

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Data/Hora</th>
            <th>Usuário</th>
            <th>Ação</th>
            <th>Módulo</th>
            <th>Registro</th>
            <th>Detalhe</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(e => {
            const cor = ACAO_COR[e.acao] || '#6b7280';
            return `
              <tr>
                <td style="font-size:0.75rem;white-space:nowrap">${new Date(e.dataHora).toLocaleString('pt-BR')}</td>
                <td style="font-size:0.78rem;font-weight:500">${e.usuario}</td>
                <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${cor}15;color:${cor};font-size:0.75rem;font-weight:600">${e.acao}</span></td>
                <td style="font-size:0.78rem;color:var(--muted);text-transform:capitalize">${e.modulo}</td>
                <td style="font-family:monospace;font-size:0.78rem">${e.registro}</td>
                <td style="font-size:0.75rem;color:var(--muted);max-width:260px">${e.detalhe}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div style="margin-top:8px;font-size:0.75rem;color:var(--muted)">
      Exibindo ${filtered.length} de ${trilha.length} eventos · Trilha protegida — registros não podem ser alterados ou excluídos
    </div>
  `;
}

function renderCFR() {
  const grupos = [
    { titulo: 'Atendido', cor: '#059669', items: CFR_ITEMS.filter(i => i.status === 'Atendido') },
    { titulo: 'Parcialmente Atendido', cor: '#d97706', items: CFR_ITEMS.filter(i => i.status === 'Parcial') },
    { titulo: 'Pendente', cor: '#dc2626', items: CFR_ITEMS.filter(i => i.status === 'Pendente') },
  ];

  const total = CFR_ITEMS.length;
  const atendidos = CFR_ITEMS.filter(i => i.status === 'Atendido').length;
  const parciais  = CFR_ITEMS.filter(i => i.status === 'Parcial').length;

  return `
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px">
      ${grupos.map(g => `
        <div style="background:${g.cor}10;border:1px solid ${g.cor}30;border-radius:8px;padding:12px;text-align:center">
          <div style="font-size:1.6rem;font-weight:800;color:${g.cor}">${g.items.length}</div>
          <div style="font-size:0.75rem;color:${g.cor};font-weight:600">${g.titulo}</div>
        </div>
      `).join('')}
    </div>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:0.82rem;color:#1e3a5f">
      <strong>Conformidade Atual:</strong> ${atendidos}/${total} requisitos totalmente atendidos (${Math.round(100*atendidos/total)}%).
      ${parciais > 0 ? `${parciais} em implementação — autenticação completa e validação formal do sistema (VAL-2026-010) pendentes.` : ''}
      <br><strong>Referências:</strong> CFR 21 Part 11 · ANVISA RDC 665/2022 · IN 134/2022 · Guia 33 · ISO 13485:2016 §4.1.6 e §4.2.5 · POP-GQ-002/003
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Referência</th><th>Requisito</th><th>Status</th><th>Observação de implementação</th></tr>
        </thead>
        <tbody>
          ${CFR_ITEMS.map(item => {
            const cor = COR_STATUS[item.status] || '#6b7280';
            return `
              <tr>
                <td style="font-family:monospace;font-size:0.75rem;font-weight:700;color:${cor};white-space:nowrap">${item.ref}</td>
                <td style="font-size:0.82rem">${item.req}</td>
                <td><span style="display:inline-block;padding:2px 8px;border-radius:4px;background:${cor}15;color:${cor};font-size:0.75rem;font-weight:600">${item.status}</span></td>
                <td style="font-size:0.78rem;color:var(--muted)">${item.nota}</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ── Render ────────────────────────────────────────────────────────────────────

let _tab = 'perfis';

function switchTab(container, tab) {
  _tab = tab;
  container.querySelectorAll('[data-tab-btn]').forEach(b => {
    const active = b.dataset.tabBtn === tab;
    b.style.fontWeight = active ? '700' : '400';
    b.style.borderBottom = active ? '2px solid var(--blue-light)' : '2px solid transparent';
    b.style.color = active ? 'var(--blue-light)' : 'var(--muted)';
  });
  rebuildContent(container);
}

function rebuildContent(container) {
  const wrap = container.querySelector('#perm-content');
  if (!wrap) return;
  if (_tab === 'perfis') {
    wrap.innerHTML = renderPerfis();
  } else if (_tab === 'usuarios') {
    wrap.innerHTML = renderUsuarios();
  } else if (_tab === 'trilha') {
    wrap.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <select id="trilha-mod-filter" class="toolbar-select" style="min-width:160px">
          <option value="">Todos os módulos</option>
          <option value="documentos">Documentos</option>
          <option value="capa">CAPA</option>
          <option value="rnc">RNC</option>
          <option value="fornecedores">Fornecedores</option>
          <option value="validacoes">Validações</option>
          <option value="permissoes">Permissões</option>
        </select>
        <input type="text" id="trilha-usu-filter" class="toolbar-search" placeholder="Filtrar por usuário…" style="max-width:200px">
        <button class="btn btn-secondary btn-sm" data-action="export-trilha">⬇ Exportar CSV</button>
      </div>
      ${renderTrilha()}
    `;
    container.querySelector('#trilha-mod-filter')?.addEventListener('change', () => rebuildContent(container));
    container.querySelector('#trilha-usu-filter')?.addEventListener('input', () => rebuildContent(container));
  } else if (_tab === 'cfr11') {
    wrap.innerHTML = renderCFR();
  }
}

export default {
  render(container) {
    const trilhaTotal = db.get('trilha').length;
    container.innerHTML = `
      <div class="page-header">
        <h2>Permissões de Acesso e Conformidade</h2>
        <div style="display:flex;gap:8px;align-items:center">
          <span style="background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;border-radius:6px;padding:3px 10px;font-size:0.75rem">${trilhaTotal} eventos na trilha</span>
        </div>
      </div>
      <div style="font-size:0.78rem;color:var(--muted);margin:-6px 0 12px">
        CFR 21 Part 11 · ANVISA RDC 665/2022 · IN 134/2022 · Guia 33 · ISO 13485:2016 §4.1.6
      </div>

      <div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:14px">
        <button data-tab-btn="perfis"   style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid var(--blue-light);color:var(--blue-light);font-weight:700">Perfis</button>
        <button data-tab-btn="usuarios" style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid transparent;color:var(--muted)">Usuários</button>
        <button data-tab-btn="trilha"   style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid transparent;color:var(--muted)">Trilha de Auditoria</button>
        <button data-tab-btn="cfr11"    style="padding:8px 16px;border:none;background:none;cursor:pointer;font-size:0.82rem;border-bottom:2px solid transparent;color:var(--muted)">CFR 11 / ANVISA</button>
      </div>

      <div class="card" style="padding:14px">
        <div id="perm-content">
          ${renderPerfis()}
        </div>
      </div>
    `;
  },

  init(container) {
    _tab = 'perfis';

    container.addEventListener('click', e => {
      const tabBtn = e.target.closest('[data-tab-btn]');
      if (tabBtn) { switchTab(container, tabBtn.dataset.tabBtn); return; }

      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const { action, id, perfilId } = btn.dataset;

      if (action === 'edit-perfil') {
        const membro = db.getById('equipe', Number(id));
        if (!membro) return;
        openModal({
          title: `Acesso — ${membro.nome}`,
          fields: [
            { id: 'perfil',  label: 'Perfil',   type: 'select', required: true,  span: 1, options: PERFIS },
            { id: 'licenca', label: 'Licença',   type: 'select', required: true,  span: 1, options: LICENCAS },
            { id: 'email',   label: 'E-mail',    type: 'text',   required: false, span: 2 },
            { id: 'area',    label: 'Área',      type: 'text',   required: false, span: 1 },
            { id: 'senha',   label: 'Senha',     type: 'text',   required: false, span: 1 },
          ],
          data: membro,
          setup(form) {
            const s = form.querySelector('#field-senha');
            if (s) s.type = 'password';
          },
          onSave: data => {
            const updates = { perfil: data.perfil, licenca: data.licenca, email: data.email, area: data.area };
            if (data.senha) updates.senha = data.senha;
            db.update('equipe', Number(id), updates);
            db.addAudit('Editou', 'permissoes', membro.nome, `Perfil → ${data.perfil} · Licença → ${data.licenca}`);
            toast(`Acesso de ${membro.nome.split(' ')[0]} atualizado.`);
            rebuildContent(container);
          },
        });
      }

      if (action === 'export-trilha') {
        const trilha = [...db.get('trilha')].reverse();
        const csv = ['Data/Hora,Usuario,Acao,Modulo,Registro,Detalhe',
          ...trilha.map(e => [
            new Date(e.dataHora).toLocaleString('pt-BR'),
            e.usuario, e.acao, e.modulo, e.registro,
            `"${(e.detalhe || '').replace(/"/g, '""')}"`
          ].join(','))
        ].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `trilha-auditoria-${new Date().toISOString().substring(0,10)}.csv`;
        a.click();
        toast('Trilha exportada em CSV');
      }
    });
  },
};
