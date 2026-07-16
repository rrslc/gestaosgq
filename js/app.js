/**
 * @fileoverview Entry point do SGQ — registra rotas, eventos globais e inicializa a aplicação.
 */

import { Router } from './router.js';
import { db } from './db.js';
import { toast } from './toast.js';
import { today, formatDate } from './utils.js';
import { ROUTES } from './constants.js';
import { openModal } from './modal.js';
import { getSession, setSession, clearSession } from './session.js';

// Modules
import dashboard      from './modules/dashboard.js';
import agenda         from './modules/agenda.js';
import capaGerencial  from './modules/capaGerencial.js';
import capaAbertura   from './modules/capaAbertura.js';
import fornecedores from './modules/fornecedores.js';
import tecnovig     from './modules/tecnovig.js';
import validacoes   from './modules/validacoes.js';
import gcm          from './modules/gcm.js';
import gcmGerencial from './modules/gcmGerencial.js';
import gcmAbertura  from './modules/gcmAbertura.js';
import rncGerencial from './modules/rncGerencial.js';
import rncAbertura  from './modules/rncAbertura.js';
import risco        from './modules/risco.js';
import monitoramento, { setTargetArea } from './modules/monitoramento.js';

function monitorArea(key) {
  return {
    render: (c) => { setTargetArea(key); monitoramento.render(c); },
    init:   (c) => monitoramento.init(c),
  };
}
import docsAdmin    from './modules/docsAdmin.js';
import obrigacoes   from './modules/obrigacoes.js';
import documentos   from './modules/documentos.js';
import elaboracao   from './modules/elaboracao.js';
import equipe, { migrateLegacyPerfil } from './modules/equipe.js';
import cronograma   from './modules/cronograma.js';
import calendario   from './modules/calendario.js';
import configuracoes        from './modules/configuracoes.js';
import permissoes           from './modules/permissoes.js';
import reclamacoesGerencial from './modules/reclamacoesGerencial.js';
import reclamacoesAbertura  from './modules/reclamacoesAbertura.js';
import auditoriasPlano      from './modules/auditoriasPlano.js';
import auditoriasExec       from './modules/auditoriasExec.js';
import assistenciaTecnica   from './modules/assistenciaTecnica.js';
import revisaoGerencial     from './modules/revisaoGerencial.js';
import projetosGerencial    from './modules/projetosGerencial.js';
import projetosAbertura     from './modules/projetosAbertura.js';
import atividades           from './modules/atividades.js';
import trilha               from './modules/trilha.js';

// ── Router ───────────────────────────────────────────────────────────────────

export const router = new Router({
  [ROUTES.DASHBOARD]:      { module: dashboard,     title: 'Dashboard',            icon: '◉' },
  [ROUTES.AGENDA]:         { module: agenda,       title: 'Agenda GQ',             icon: '📅' },
  [ROUTES.CAPA_GERENCIAL]: { module: capaGerencial, title: 'CAPA — Gerencial',     icon: '📊' },
  [ROUTES.CAPA_ABERTURA]:  { module: capaAbertura,  title: 'CAPA — Abertura',      icon: '📋' },
  capa: { module: { render() {}, init() { router.navigate(ROUTES.CAPA_GERENCIAL); } }, title: 'CAPA', icon: '◈' },
  [ROUTES.RNC]:            { module: { render() {}, init() { router.navigate(ROUTES.RNC_GERENCIAL); } }, title: 'RNC', icon: '⚑' },
  [ROUTES.RNC_GERENCIAL]:  { module: rncGerencial,  title: 'RNC — Gerencial',        icon: '📊' },
  [ROUTES.RNC_ABERTURA]:   { module: rncAbertura,   title: 'Registro de RNC',                 icon: '⚑' },
  [ROUTES.FORNECEDORES]: { module: fornecedores, title: 'Fornecedores',             icon: '⬡' },
  [ROUTES.TECNOVIG]:     { module: tecnovig,     title: 'Tecnovigilância',          icon: '⚕' },
  [ROUTES.VALIDACOES]:   { module: validacoes,   title: 'Validações',               icon: '✔' },
  [ROUTES.GCM]:          { module: { render() {}, init() { router.navigate(ROUTES.GCM_GERENCIAL); } }, title: 'GCM', icon: '↻' },
  [ROUTES.GCM_GERENCIAL]:{ module: gcmGerencial,  title: 'GCM — Gerencial',          icon: '📊' },
  [ROUTES.GCM_ABERTURA]: { module: gcmAbertura,   title: 'GCM — Abertura',           icon: '↻' },
  [ROUTES.RISCO]:        { module: risco,        title: 'Análise de Risco',         icon: '⚠' },
  pragas:           { module: monitorArea('pragas'),           title: 'Controle de Pragas',      icon: '🐛' },
  reservatorio:     { module: monitorArea('reservatorio'),     title: 'Limpeza de Reservatório', icon: '💧' },
  residuos:         { module: monitorArea('residuos'),         title: 'Gerenc. de Resíduos',     icon: '♻' },
  microbiologico:   { module: monitorArea('microbiologico'),   title: 'Monit. Microbiológico',   icon: '🔬' },
  limpezaMensal:    { module: monitorArea('limpezaMensal'),    title: 'Limpeza Mensal',          icon: '🧹' },
  gembaWalk:        { module: monitorArea('gembaWalk'),        title: 'Gemba Walk',              icon: '👣' },
  orcamentosAnuais: { module: monitorArea('orcamentosAnuais'), title: 'Orçamentos Anuais',       icon: '📋' },
  docsAdmin:             { module: docsAdmin,    title: 'Docs. Administrativos',    icon: '🗂' },
  [ROUTES.OBRIGACOES]:   { module: obrigacoes,   title: 'Obrig. Regulatórias',      icon: '📋' },
  [ROUTES.DOCUMENTOS]:   { module: documentos,   title: 'Controle de Docs.',         icon: '📄' },
  [ROUTES.ELABORACAO]:   { module: elaboracao,   title: 'Elaboração de Docs.',        icon: '✏' },
  atividades:            { module: atividades,    title: 'Atividades Individuais',   icon: '✅' },
  [ROUTES.EQUIPE]:       { module: equipe,       title: 'Equipe',                   icon: '⚇' },
  [ROUTES.CRONOGRAMA]:   { module: cronograma,   title: 'Cronograma',               icon: '▤' },
  [ROUTES.CALENDARIO]:   { module: calendario,   title: 'Calendário',               icon: '▦' },
  [ROUTES.CONFIGURACOES]:      { module: configuracoes,        title: 'Configurações',             icon: '⚙' },
  [ROUTES.PERMISSOES]:         { module: permissoes,           title: 'Permissões de Acesso',       icon: '🔐' },
  [ROUTES.RECLAM_GERENCIAL]:   { module: reclamacoesGerencial, title: 'Reclamações — Gerencial',    icon: '📊' },
  [ROUTES.RECLAM_ABERTURA]:    { module: reclamacoesAbertura,  title: 'Reclamações — Abertura',     icon: '📩' },
  reclamacoes: { module: { render() {}, init() { router.navigate(ROUTES.RECLAM_GERENCIAL); } }, title: 'Reclamações', icon: '📩' },
  [ROUTES.AUDIT_PLANO]:        { module: auditoriasPlano,      title: 'Auditorias — Plano Anual',   icon: '📋' },
  [ROUTES.AUDIT_EXEC]:         { module: auditoriasExec,       title: 'Auditorias — Execução',      icon: '📊' },
  auditorias: { module: { render() {}, init() { router.navigate(ROUTES.AUDIT_PLANO); } }, title: 'Auditorias', icon: '📋' },
  [ROUTES.ASSIST_TEC]:         { module: assistenciaTecnica,   title: 'Assistência Técnica',        icon: '🔧' },
  [ROUTES.REVISAO_GER]:        { module: revisaoGerencial,     title: 'Revisão Gerencial',          icon: '🏛' },
  [ROUTES.PROJ_GERENCIAL]:     { module: projetosGerencial,    title: 'Projetos — Gerencial',       icon: '🗂' },
  [ROUTES.PROJ_ABERTURA]:      { module: projetosAbertura,     title: 'Projetos — Atividades GQ',   icon: '📐' },
  projetos: { module: { render() {}, init() { router.navigate(ROUTES.PROJ_GERENCIAL); } }, title: 'Projetos', icon: '📐' },
  [ROUTES.TRILHA]:             { module: trilha,               title: 'Trilha de Auditoria',        icon: '📋' },
});

// ── Session / Login ───────────────────────────────────────────────────────────

function updateTopbarSession() {
  const el = document.getElementById('topbar-session');
  if (!el) return;
  const session = getSession();
  if (session) {
    const cor      = session.cor || '#2d5be3';
    const iniciais = session.iniciais || session.nome.charAt(0);
    const nome     = session.nome.split(' ')[0];
    const area     = session.area ? `<span style="padding:1px 6px;border-radius:3px;background:var(--surface2);color:var(--muted);font-size:0.7rem">${session.area}</span>` : '';
    el.innerHTML = `
      <span style="display:flex;align-items:center;gap:6px;font-size:0.8rem">
        <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${cor};color:#fff;font-weight:700;font-size:0.7rem;flex-shrink:0">${iniciais}</span>
        <span style="color:var(--text);white-space:nowrap">${nome}</span>
        ${area}
        <button id="btn-logout" class="btn btn-secondary btn-sm" style="white-space:nowrap">Sair</button>
      </span>`;
  } else {
    el.innerHTML = `<button id="btn-login" class="btn btn-secondary btn-sm">🔐 Entrar</button>`;
  }
}

const LOCKOUT_KEY   = 'sgq_loginlock';
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 30 * 60 * 1000; // 30 minutos

function getLock() {
  try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}'); } catch { return {}; }
}
function setLock(data) { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data)); }
function clearLock()   { localStorage.removeItem(LOCKOUT_KEY); }

function openLoginModal() {
  const equipe = db.get('equipe').filter(m => m.senha);
  if (!equipe.length) {
    toast('Nenhum usuário com senha cadastrada. Configure as senhas no módulo Equipe.', 'warning');
    return;
  }
  openModal({
    title: 'Entrar no SGQ',
    fields: [
      { id: 'nome',  label: 'Seu nome', type: 'select', required: true,  span: 2, options: equipe.map(m => m.nome) },
      { id: 'senha', label: 'Senha',    type: 'text',   required: true,  span: 2 },
    ],
    data: {},
    setup(form) {
      const inp = form.querySelector('#field-senha');
      if (inp) inp.type = 'password';
    },
    onSave(data) {
      // Verificar bloqueio
      const lock = getLock();
      if (lock.lockedAt) {
        const lockedUntil = new Date(lock.lockedAt).getTime() + LOCKOUT_MS;
        if (Date.now() < lockedUntil) {
          const rem = Math.ceil((lockedUntil - Date.now()) / 60000);
          throw new Error(`Acesso bloqueado por tentativas incorretas. Tente novamente em ${rem} min.`);
        }
        clearLock();
      }

      const user = equipe.find(m => m.nome === data.nome && m.senha === data.senha);
      if (!user) {
        const count = (lock.count || 0) + 1;
        if (count >= MAX_ATTEMPTS) {
          setLock({ count, lockedAt: new Date().toISOString() });
          db.addAudit('Bloqueio', 'sistema', data.nome, `${count} tentativas incorretas consecutivas`);
          throw new Error(`${MAX_ATTEMPTS} tentativas incorretas. Acesso bloqueado por 30 minutos.`);
        }
        setLock({ count, lockedAt: null });
        throw new Error(`Senha incorreta. Restam ${MAX_ATTEMPTS - count} tentativa(s).`);
      }

      // Sucesso — limpa lockout, cria sessão, registra auditoria
      clearLock();
      setSession({ id: user.id, nome: user.nome, iniciais: user.iniciais, area: user.area, perfil: user.perfil, licenca: user.licenca, cor: user.cor });
      db.addAudit('Login', 'sistema', user.id, `${user.nome} [${user.perfil || '—'}]`);
      updateTopbarSession();
      router.navigate(router.current || ROUTES.DASHBOARD);
      toast(`Bem-vinda, ${user.nome.split(' ')[0]}!`);
    },
  });
}

document.getElementById('topbar-session')?.addEventListener('click', e => {
  if (e.target.id === 'btn-login')  openLoginModal();
  if (e.target.id === 'btn-logout') {
    const sess = getSession();
    if (sess) db.addAudit('Logout', 'sistema', sess.id, `${sess.nome} [${sess.perfil || '—'}]`);
    clearSession();
    updateTopbarSession();
    router.navigate(router.current || ROUTES.DASHBOARD);
    toast('Sessão encerrada.');
  }
});

// ── Sidebar navigation (event delegation) ───────────────────────────────────

document.getElementById('sidebar').addEventListener('click', e => {
  const item = e.target.closest('[data-route]');
  if (!item) return;
  router.navigate(item.dataset.route);
});

// ── Topbar date ──────────────────────────────────────────────────────────────

const dateEl = document.getElementById('topbar-date');
if (dateEl) {
  const now = new Date();
  dateEl.textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

// ── Import / Export ──────────────────────────────────────────────────────────

document.getElementById('btn-export')?.addEventListener('click', () => {
  try {
    const json = db.exportJSON();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sgq-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Backup exportado com sucesso!');
  } catch (e) {
    toast('Erro ao exportar backup: ' + e.message, 'error');
  }
});

document.getElementById('btn-import')?.addEventListener('click', () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        db.importJSON(reader.result);
        toast('Dados importados com sucesso! Recarregando…');
        setTimeout(() => window.location.reload(), 1000);
      } catch (e) {
        toast(e.message, 'error');
      }
    };
    reader.readAsText(file);
  });
  input.click();
});

// ── Update sidebar badges ────────────────────────────────────────────────────

function updateAllBadges() {
  const capaOpen    = db.get('capa').filter(r => !['Encerrada', 'Não Procedente'].includes(r.status)).length;
  const rncOpen     = db.get('rnc').filter(r => !['Encerrada', 'Cancelada', 'Não Procedente'].includes(r.status)).length;
  const reclamOpen  = db.get('reclamacoes').filter(r => !['Concluída', 'Cancelada'].includes(r.status)).length;
  router.updateBadge(ROUTES.CAPA_GERENCIAL, capaOpen);
  router.updateBadge(ROUTES.RNC_GERENCIAL, rncOpen);
  router.updateBadge(ROUTES.RECLAM_GERENCIAL, reclamOpen);
}

// ── Sync error handler ───────────────────────────────────────────────────────

window.addEventListener('sgq:sync-error', e => {
  toast(`Erro ao sincronizar com o servidor: ${e.detail}`, 'error');
});

window.addEventListener('sgq:import-warning', () => {
  toast('Dados importados localmente. Para sincronizar com o Neon, faça um novo deploy.', 'warning');
});

// ── Bootstrap ────────────────────────────────────────────────────────────────

db.ready.then(() => {
  migrateLegacyPerfil();

  // Exibe o modo de armazenamento ativo no topbar
  const modeEl = document.getElementById('topbar-mode');
  if (modeEl) {
    const isNeon = db.mode === 'neon';
    modeEl.textContent = isNeon ? '🟢 Neon' : '🟡 Local';
    modeEl.title = isNeon
      ? 'Conectado ao banco Neon PostgreSQL'
      : 'Modo local (localStorage) — sem backend disponível';
  }

  updateAllBadges();
  updateTopbarSession();

  const initialRoute = window.location.hash.replace('#', '') || ROUTES.DASHBOARD;
  router.navigate(initialRoute);
});

