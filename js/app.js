/**
 * @fileoverview Entry point do SGQ — registra rotas, eventos globais e inicializa a aplicação.
 */

import { Router } from './router.js';
import { db } from './db.js';
import { toast } from './toast.js';
import { today, formatDate } from './utils.js';
import { ROUTES } from './constants.js';
import { getSession, setSession, clearSession } from './session.js';
import { hashPassword, looksHashed } from './crypto.js';

// Modules
import dashboard      from './modules/dashboard.js';
import agenda         from './modules/agenda.js';
import capaGerencial  from './modules/capaGerencial.js';
import capaAbertura, { migrateLegacyCapaStatus } from './modules/capaAbertura.js';
import fornecedores from './modules/fornecedores.js';
import tecnovig     from './modules/tecnovig.js';
import validacoes   from './modules/validacoes.js';
import gcm          from './modules/gcm.js';
import gcmGerencial from './modules/gcmGerencial.js';
import gcmAbertura  from './modules/gcmAbertura.js';
import rncGerencial from './modules/rncGerencial.js';
import rncAbertura, { migrateLegacyRncStatus } from './modules/rncAbertura.js';
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

// ── Controle de acesso por perfil ─────────────────────────────────────────────

// GQ Administrador: vê tudo
// GQ Analista: vê tudo exceto Sistema e Planejamento Estratégico
// Área: vê apenas abertura/registro de CAPA, RNC, GCM e Elaboração de Docs
const AREA_ALLOWED_ROUTES  = new Set(['dashboard', 'capaAbertura', 'rncAbertura', 'gcmAbertura', 'elaboracao']);
const ADMIN_ONLY_ROUTES    = new Set(['equipe', 'permissoes', 'trilha', 'configuracoes', 'revisaoGerencial', 'cronograma']);

function isGQUser(session) {
  return !session || session.perfil === 'GQ Administrador' || session.perfil === 'GQ Analista';
}
function isGQAdmin(session) {
  return !session || session.perfil === 'GQ Administrador';
}

function updateSidebarAccess(session) {
  const gq    = isGQUser(session);
  const admin = isGQAdmin(session);
  document.querySelectorAll('#sidebar .nav-item[data-route]').forEach(item => {
    const route = item.dataset.route;
    const visible = admin
      || (gq && !ADMIN_ONLY_ROUTES.has(route))
      || AREA_ALLOWED_ROUTES.has(route);
    item.style.display = visible ? '' : 'none';
  });
  document.querySelectorAll('#sidebar .nav-section').forEach(section => {
    let next = section.nextElementSibling;
    let hasVisible = false;
    while (next && !next.classList.contains('nav-section')) {
      if (next.classList.contains('nav-item') && next.style.display !== 'none') hasVisible = true;
      next = next.nextElementSibling;
    }
    section.style.display = hasVisible ? '' : 'none';
  });
}

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
    el.innerHTML = '';
  }
  updateSidebarAccess(session);
}

const LOCKOUT_KEY   = 'sgq_loginlock';
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 30 * 60 * 1000; // 30 minutos

function getLock() {
  try { return JSON.parse(localStorage.getItem(LOCKOUT_KEY) || '{}'); } catch { return {}; }
}
function setLock(data) { localStorage.setItem(LOCKOUT_KEY, JSON.stringify(data)); }
function clearLock()   { localStorage.removeItem(LOCKOUT_KEY); }

/**
 * Autentica um colaborador. Reaproveita o bloqueio por tentativas (lockout).
 * @returns {Promise<{user: Object, token: string|undefined}>}
 * @throws {Error} com mensagem amigável em caso de bloqueio ou senha incorreta.
 */
async function authenticate(nome, senha) {
  const equipe = db.get('equipe').filter(m => m.senha);

  const lock = getLock();
  if (lock.lockedAt) {
    const lockedUntil = new Date(lock.lockedAt).getTime() + LOCKOUT_MS;
    if (Date.now() < lockedUntil) {
      const rem = Math.ceil((lockedUntil - Date.now()) / 60000);
      throw new Error(`Acesso bloqueado por tentativas incorretas. Tente novamente em ${rem} min.`);
    }
    clearLock();
  }

  function registrarFalha() {
    const count = (lock.count || 0) + 1;
    if (count >= MAX_ATTEMPTS) {
      setLock({ count, lockedAt: new Date().toISOString() });
      db.addAudit('Bloqueio', 'sistema', nome, `${count} tentativas incorretas consecutivas`);
      throw new Error(`${MAX_ATTEMPTS} tentativas incorretas. Acesso bloqueado por 30 minutos.`);
    }
    setLock({ count, lockedAt: null });
    throw new Error(`Senha incorreta. Restam ${MAX_ATTEMPTS - count} tentativa(s).`);
  }

  let user, token;

  if (db.mode === 'neon') {
    // Produção: verificação real no servidor — a senha em texto puro nunca sai do navegador.
    const senhaHash = await hashPassword(senha);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, senhaHash }),
    });
    if (!res.ok) registrarFalha();
    ({ user, token } = await res.json());
  } else {
    // Modo local (sem backend) — comparação no navegador, com migração de senha legada.
    const candidato = equipe.find(m => m.nome === nome);
    const hash = candidato ? await hashPassword(senha) : null;
    user = candidato && candidato.senha === hash ? candidato : null;

    if (!user && candidato && !looksHashed(candidato.senha) && candidato.senha === senha) {
      db.update('equipe', candidato.id, { senha: hash });
      user = candidato;
    }

    if (!user) registrarFalha();
  }

  clearLock();
  return { user, token };
}

// Primeiro acesso: enquanto NENHUM colaborador tiver senha, o portal permite
// escolher o nome e criar a senha inicial (evita travar o acesso). Assim que a
// primeira senha é criada, o login normal passa a valer e o administrador
// provisiona as demais senhas pelo módulo Equipe/Permissões.
let _primeiroAcesso = false;

/** Exibe o portal de login (bloqueia o acesso ao app). */
function showLoginScreen() {
  document.body.classList.add('auth-gate');

  const nomeSel   = document.getElementById('login-nome');
  const modeEl    = document.getElementById('login-mode');
  const errEl     = document.getElementById('login-error');
  const senha     = document.getElementById('login-senha');
  const hintEl    = document.getElementById('login-hint');
  const senhaLbl  = document.getElementById('login-senha-label');
  const submitBtn = document.getElementById('login-submit');

  const todos    = db.get('equipe');
  const comSenha = todos.filter(m => m.senha);
  _primeiroAcesso = comSenha.length === 0 && todos.length > 0;

  const lista = _primeiroAcesso ? todos : comSenha;
  if (nomeSel) {
    nomeSel.innerHTML = lista.length
      ? lista.map(m => `<option value="${m.nome}">${m.nome}</option>`).join('')
      : '<option value="">Nenhum colaborador cadastrado</option>';
    nomeSel.disabled = !lista.length;
  }

  if (hintEl) {
    hintEl.style.display = _primeiroAcesso ? 'block' : 'none';
    hintEl.textContent = _primeiroAcesso
      ? 'Primeiro acesso: selecione seu nome e crie uma senha (mínimo 8 caracteres) para configurar o sistema.'
      : '';
  }
  if (senhaLbl)  senhaLbl.textContent = _primeiroAcesso ? 'Criar senha' : 'Senha';
  if (submitBtn) submitBtn.textContent = _primeiroAcesso ? 'Criar senha e entrar' : 'Entrar';
  if (senha) { senha.value = ''; senha.autocomplete = _primeiroAcesso ? 'new-password' : 'current-password'; }
  if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
  if (modeEl) modeEl.textContent = db.mode === 'neon' ? '🟢 Conectado ao servidor' : '🟡 Modo local';

  setTimeout(() => nomeSel?.focus(), 60);
}

/** Esconde o portal de login e libera o app. */
function hideLoginScreen() {
  document.body.classList.remove('auth-gate');
}

document.getElementById('login-form')?.addEventListener('submit', async e => {
  e.preventDefault();
  const nome   = document.getElementById('login-nome').value;
  const senha  = document.getElementById('login-senha').value;
  const errEl  = document.getElementById('login-error');
  const btn    = document.getElementById('login-submit');

  const showErr = msg => { errEl.textContent = msg; errEl.style.display = 'block'; };
  errEl.style.display = 'none';

  if (!nome)  { showErr('Selecione o colaborador.'); return; }
  if (!senha) { showErr(_primeiroAcesso ? 'Crie uma senha.' : 'Informe a senha.'); return; }
  if (_primeiroAcesso && senha.length < 8) { showErr('A senha deve ter no mínimo 8 caracteres.'); return; }

  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = _primeiroAcesso ? 'Criando…' : 'Entrando…';
  try {
    let user, token;
    if (_primeiroAcesso) {
      // Bootstrap: grava a senha (hash) e cria a sessão a partir do registro local.
      const membro = db.get('equipe').find(m => m.nome === nome);
      if (!membro) throw new Error('Colaborador não encontrado.');
      db.update('equipe', membro.id, { senha: await hashPassword(senha) });
      user = membro;
    } else {
      ({ user, token } = await authenticate(nome, senha));
    }
    setSession({ id: user.id, nome: user.nome, iniciais: user.iniciais, area: user.area, perfil: user.perfil, licenca: user.licenca, cor: user.cor, token });
    db.addAudit('Login', 'sistema', user.id, `${user.nome} [${user.perfil || '—'}]`);
    hideLoginScreen();
    updateTopbarSession();
    router.navigate(router.current || ROUTES.DASHBOARD);
    toast(_primeiroAcesso ? `Senha criada! Bem-vinda, ${user.nome.split(' ')[0]}.` : `Bem-vinda, ${user.nome.split(' ')[0]}!`);
  } catch (err) {
    showErr(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
});

document.getElementById('topbar-session')?.addEventListener('click', e => {
  if (e.target.id === 'btn-logout') {
    const sess = getSession();
    if (sess) db.addAudit('Logout', 'sistema', sess.id, `${sess.nome} [${sess.perfil || '—'}]`);
    clearSession();
    updateTopbarSession();
    showLoginScreen();
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
    db.addAudit('Exportar', 'sistema', 'backup', `Backup exportado (${a.download})`);
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
        db.addAudit('Importar', 'sistema', 'backup', `Dados restaurados a partir de "${file.name}"`);
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

// Decisão síncrona (evita flash do app antes do portal): sem sessão → porta de login.
if (!getSession()) document.body.classList.add('auth-gate');

// Guard de rotas: usuários de área só podem acessar rotas permitidas
router.setGuard(routeName => {
  const session = getSession();
  if (ADMIN_ONLY_ROUTES.has(routeName) && !isGQAdmin(session)) {
    toast('Acesso restrito ao GQ Administrador.', 'warning');
    router.navigate(ROUTES.DASHBOARD);
    return false;
  }
  if (!isGQUser(session) && !AREA_ALLOWED_ROUTES.has(routeName)) {
    toast('Acesso restrito à equipe de Garantia da Qualidade.', 'warning');
    router.navigate(ROUTES.DASHBOARD);
    return false;
  }
  return true;
});

db.ready.then(() => {
  migrateLegacyPerfil();
  migrateLegacyRncStatus();
  migrateLegacyCapaStatus();

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

  if (getSession()) {
    const initialRoute = window.location.hash.replace('#', '') || ROUTES.DASHBOARD;
    router.navigate(initialRoute);
  } else {
    // Sem sessão: portal de login obrigatório antes de acessar o app.
    showLoginScreen();
  }
});

