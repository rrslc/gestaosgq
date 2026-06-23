/**
 * @fileoverview Camada de dados — API Neon (produção) com fallback localStorage (desenvolvimento).
 *
 * Estratégia de modo dual:
 *  - Ao iniciar, tenta GET /api/health para detectar se o backend está disponível.
 *  - Se disponível (Vercel + Neon): todas as operações vão para a API REST.
 *  - Se indisponível (dev local sem API): usa localStorage como armazenamento local.
 *  - Aguarde `db.ready` antes de usar qualquer método de leitura.
 */

import { STORE_KEY } from './constants.js';

const COLLECTIONS = ['equipe', 'capa', 'rnc', 'fornecedores', 'tecno', 'validacoes', 'gcm', 'risco', 'pragas'];

class Database {
  /** @type {Record<string, Array>} cache em memória */
  #data = {};

  /** @type {'neon' | 'local'} */
  #mode = 'local';

  /** @type {Promise<void>} */
  ready;

  constructor() {
    this.ready = this.#init();
  }

  // ── Inicialização ────────────────────────────────────────────────────────

  async #init() {
    try {
      const res = await fetch('/api/health', { signal: AbortSignal.timeout(3000) });
      const { ok } = await res.json();
      if (ok) {
        this.#mode = 'neon';
        await this.#loadFromAPI();
        return;
      }
    } catch {
      // backend indisponível — modo local
    }
    this.#mode = 'local';
    this.#loadFromStorage();
  }

  /** Carrega todos os dados da API Neon em paralelo. */
  async #loadFromAPI() {
    const results = await Promise.all(
      COLLECTIONS.map(col =>
        fetch(`/api/${col}`)
          .then(r => r.ok ? r.json() : [])
          .catch(() => [])
      )
    );
    COLLECTIONS.forEach((col, i) => { this.#data[col] = results[i]; });

    const cfgRes = await fetch('/api/config').catch(() => null);
    this.#data.config = cfgRes?.ok ? await cfgRes.json() : this.#defaultConfig();
  }

  /** Carrega do localStorage (fallback). */
  #loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const defaults = this.#defaults();
      for (const key of Object.keys(defaults)) {
        this.#data[key] = parsed[key] ?? defaults[key];
      }
    } catch (e) {
      console.warn('[DB] Falha ao ler localStorage:', e);
      this.#data = this.#defaults();
    }
  }

  #persistToStorage() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(this.#data));
    } catch (e) {
      console.error('[DB] Falha ao persistir no localStorage:', e);
    }
  }

  #nextId(col) {
    const arr = this.#data[col] ?? [];
    return arr.length > 0 ? Math.max(...arr.map(r => r.id)) + 1 : 1;
  }

  // ── API helpers ───────────────────────────────────────────────────────────

  async #apiPost(col, body) {
    const res = await fetch(`/api/${col}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async #apiPut(col, id, body) {
    const res = await fetch(`/api/${col}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  }

  async #apiDelete(col, id) {
    const res = await fetch(`/api/${col}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(await res.text());
  }

  // ── API Pública ───────────────────────────────────────────────────────────

  /**
   * Retorna o modo de armazenamento atual.
   * @returns {'neon' | 'local'}
   */
  get mode() { return this.#mode; }

  /**
   * Retorna uma cópia do array da collection.
   * @param {string} collection
   * @returns {Array}
   */
  get(collection) {
    return [...(this.#data[collection] ?? [])];
  }

  /**
   * Busca um item pelo id.
   * @param {string} collection
   * @param {number} id
   * @returns {Object|null}
   */
  getById(collection, id) {
    return (this.#data[collection] ?? []).find(r => r.id === id) ?? null;
  }

  /**
   * Adiciona um registro e sincroniza com o backend.
   * @param {string} collection
   * @param {Object} record
   * @returns {Object} registro com id atribuído
   */
  add(collection, record) {
    if (collection === 'risco') {
      record = { ...record, rpn: Number(record.severidade || 0) * Number(record.probabilidade || 0) };
    }

    if (this.#mode === 'neon') {
      // Otimista: insere localmente com id temporário, depois substitui pelo id real
      const tempId = this.#nextId(collection);
      const tempItem = { id: tempId, ...record };
      this.#data[collection].push(tempItem);

      this.#apiPost(collection, record).then(saved => {
        const idx = this.#data[collection].findIndex(r => r.id === tempId);
        if (idx !== -1) this.#data[collection][idx] = saved;
      }).catch(err => {
        console.error('[DB] Falha ao sincronizar com API:', err);
        this.#data[collection] = this.#data[collection].filter(r => r.id !== tempId);
        window.dispatchEvent(new CustomEvent('sgq:sync-error', { detail: err.message }));
      });

      return tempItem;
    }

    // Modo local
    const item = { id: this.#nextId(collection), ...record };
    this.#data[collection].push(item);
    this.#persistToStorage();
    return item;
  }

  /**
   * Atualiza parcialmente um registro existente.
   * @param {string} collection
   * @param {number} id
   * @param {Object} patch
   * @returns {Object} registro atualizado
   */
  update(collection, id, patch) {
    const arr = this.#data[collection] ?? [];
    const idx = arr.findIndex(r => r.id === id);
    if (idx === -1) throw new Error(`Registro ${id} não encontrado em "${collection}"`);

    if (collection === 'risco' && (patch.severidade || patch.probabilidade)) {
      const merged = { ...arr[idx], ...patch };
      patch = { ...patch, rpn: Number(merged.severidade) * Number(merged.probabilidade) };
    }

    arr[idx] = { ...arr[idx], ...patch };

    if (this.#mode === 'neon') {
      this.#apiPut(collection, id, arr[idx]).catch(err => {
        console.error('[DB] Falha ao sincronizar UPDATE com API:', err);
        window.dispatchEvent(new CustomEvent('sgq:sync-error', { detail: err.message }));
      });
    } else {
      this.#persistToStorage();
    }

    return { ...arr[idx] };
  }

  /**
   * Remove um registro da collection.
   * @param {string} collection
   * @param {number} id
   */
  remove(collection, id) {
    const arr = this.#data[collection] ?? [];
    const idx = arr.findIndex(r => r.id === id);
    if (idx === -1) throw new Error(`Registro ${id} não encontrado em "${collection}"`);
    arr.splice(idx, 1);

    if (this.#mode === 'neon') {
      this.#apiDelete(collection, id).catch(err => {
        console.error('[DB] Falha ao sincronizar DELETE com API:', err);
        window.dispatchEvent(new CustomEvent('sgq:sync-error', { detail: err.message }));
      });
    } else {
      this.#persistToStorage();
    }
  }

  /**
   * Retorna a configuração da empresa.
   * @returns {Object}
   */
  getConfig() {
    return { ...(this.#data.config ?? this.#defaultConfig()) };
  }

  /**
   * Atualiza a configuração da empresa.
   * @param {Object} patch
   */
  setConfig(patch) {
    this.#data.config = { ...this.#data.config, ...patch };
    if (this.#mode === 'neon') {
      fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.#data.config),
      }).catch(err => console.error('[DB] Falha ao salvar config:', err));
    } else {
      this.#persistToStorage();
    }
  }

  /**
   * Exporta todos os dados como JSON.
   * @returns {string}
   */
  exportJSON() {
    return JSON.stringify(this.#data, null, 2);
  }

  /**
   * Importa dados de uma string JSON com validação de schema.
   * @param {string} json
   */
  importJSON(json) {
    let parsed;
    try { parsed = JSON.parse(json); }
    catch { throw new Error('JSON inválido. Verifique o arquivo de backup.'); }

    const required = ['config', 'equipe', 'capa', 'rnc', 'fornecedores', 'tecno', 'validacoes', 'gcm', 'risco', 'pragas'];
    const missing = required.filter(k => !(k in parsed));
    if (missing.length) throw new Error(`Arquivo inválido. Campos ausentes: ${missing.join(', ')}`);

    this.#data = parsed;
    this.#persistToStorage();

    if (this.#mode === 'neon') {
      // Avisa que o import local não sincroniza automático com o Neon
      window.dispatchEvent(new CustomEvent('sgq:import-warning'));
    }
  }

  // ── Defaults ──────────────────────────────────────────────────────────────

  #defaultConfig() {
    return { empresa: '', cnpj: '', afe: '', classes: 'Classe I, II, III e IV', obs: '' };
  }

  #defaults() {
    return {
      config: this.#defaultConfig(),
      equipe: [
        { id: 1, nome: 'Raissa Caldas',     iniciais: 'RC', cargo: 'Gerente da Qualidade',      cor: '#2d5be3' },
        { id: 2, nome: 'Fernanda Oliveira', iniciais: 'FO', cargo: 'Analista de Qualidade',     cor: '#00897b' },
        { id: 3, nome: 'Mariana Santos',    iniciais: 'MS', cargo: 'Engenheira de Processos',   cor: '#7c3aed' },
        { id: 4, nome: 'Juliana Pereira',   iniciais: 'JP', cargo: 'Especialista Regulatório',  cor: '#f59e0b' },
      ],
      capa: [
        { id: 1, numero: 'CAPA-2026-001', descricao: 'Desvio de estanqueidade em cateter venoso central lote LVC-0512', origem: 'RNC', responsavel: 'Mariana Santos', prazo: '2026-07-15', status: 'Em Andamento', progresso: 45, causa: 'Variação de temperatura no processo de selagem térmica', acao: 'Requalificação do processo de selagem e calibração dos equipamentos' },
        { id: 2, numero: 'CAPA-2026-002', descricao: 'Não-conformidade em auditoria interna — rastreabilidade de componentes', origem: 'Auditoria Interna', responsavel: 'Fernanda Oliveira', prazo: '2026-06-30', status: 'Aberta', progresso: 10, causa: '', acao: '' },
        { id: 3, numero: 'CAPA-2026-003', descricao: 'Reclamação de cliente: embalagem danificada de eletrodo descartável', origem: 'Reclamação de Cliente', responsavel: 'Raissa Caldas', prazo: '2026-07-31', status: 'Aguardando Verificação', progresso: 80, causa: 'Pressão excessiva no processo de embalagem secundária', acao: 'Ajuste de parâmetros de selagem e validação concluída' },
      ],
      rnc: [
        { id: 1, numero: 'RNC-2026-001', descricao: 'Cateter venoso central lote LVC-0512 — falha em teste de estanqueidade', produto: 'Cateter Venoso Central 7Fr', responsavel: 'Mariana Santos', dataAbertura: '2026-06-10', status: 'Em Tratamento', classificacao: 'Maior' },
        { id: 2, numero: 'RNC-2026-002', descricao: 'Eletrodo descartável — embalagem primária com selagem incompleta', produto: 'Eletrodo ECG Descartável', responsavel: 'Fernanda Oliveira', dataAbertura: '2026-06-15', status: 'Em Análise', classificacao: 'Maior' },
        { id: 3, numero: 'RNC-2026-003', descricao: 'Luva estéril — rótulo com data de fabricação ilegível lote LG-0601', produto: 'Luva Cirúrgica Estéril', responsavel: 'Fernanda Oliveira', dataAbertura: '2026-06-20', status: 'Aberta', classificacao: 'Menor' },
      ],
      fornecedores: [
        { id: 1, nome: 'Polímeros Técnicos SA', cnpj: '45.678.901/0001-23', categoria: 'Matéria-Prima', criticidade: 'Crítico', status: 'Qualificado', validade: '2027-03-15', responsavel: 'Fernanda Oliveira' },
        { id: 2, nome: 'EmbaPack Indústria Ltda.', cnpj: '23.456.789/0001-11', categoria: 'Embalagem', criticidade: 'Maior', status: 'Qualificado', validade: '2026-12-31', responsavel: 'Mariana Santos' },
        { id: 3, nome: 'SterilServ Esterilização', cnpj: '78.901.234/0001-55', categoria: 'Serviço Terceirizado', criticidade: 'Crítico', status: 'Em Qualificação', validade: '', responsavel: 'Raissa Caldas' },
      ],
      tecno: [
        { id: 1, numero: 'REC-2026-001', tipo: 'Queixa Técnica', produto: 'Cateter Venoso Central 7Fr', descricao: 'Cliente relata vazamento em cateter após 24h de uso, lote LVC-0512', data: '2026-06-12', prazoAnvisa: '2026-07-12', status: 'Em Investigação' },
        { id: 2, numero: 'REC-2026-002', tipo: 'Tecnovigilância', produto: 'Monitor de Sinais Vitais MVX-300', descricao: 'Alarme de SpO2 com falso positivo em ambiente com alta luminosidade', data: '2026-06-18', prazoAnvisa: '2026-07-18', status: 'Aberto' },
      ],
      validacoes: [
        { id: 1, numero: 'VAL-2026-001', tipo: 'Qualificação de Equipamento (OQ)', descricao: 'Qualificação operacional da seladora a vácuo SVX-500', fase: 'Relatório Final', responsavel: 'Mariana Santos', prazo: '2026-07-20', status: 'Em Execução', progresso: 70 },
        { id: 2, numero: 'VAL-2026-002', tipo: 'Validação de Limpeza', descricao: 'Validação do processo de limpeza da linha de cateteres', fase: 'Execução', responsavel: 'Fernanda Oliveira', prazo: '2026-08-15', status: 'Em Execução', progresso: 40 },
        { id: 3, numero: 'VAL-2026-003', tipo: 'Validação de Software', descricao: 'Validação do sistema de rastreabilidade WMS v3.2', fase: 'Planejamento', responsavel: 'Raissa Caldas', prazo: '2026-09-30', status: 'Planejada', progresso: 0 },
      ],
      gcm: [
        { id: 1, numero: 'GCM-2026-001', descricao: 'Atualização do POP-QLD-012 — Inspeção de Recebimento de Matéria-Prima', categoria: 'Documentação', solicitante: 'Fernanda Oliveira', data: '2026-06-10', status: 'Aprovada', impacto: 'Baixo' },
        { id: 2, numero: 'GCM-2026-002', descricao: 'Substituição de fornecedor de PVC grau médico', categoria: 'Fornecedor', solicitante: 'Raissa Caldas', data: '2026-06-15', status: 'Em Análise', impacto: 'Alto' },
        { id: 3, numero: 'GCM-2026-003', descricao: 'Alteração de parâmetros de selagem térmica — embaladora principal', categoria: 'Processo', solicitante: 'Mariana Santos', data: '2026-06-20', status: 'Em Implantação', impacto: 'Médio' },
      ],
      risco: [
        { id: 1, produto: 'Cateter Venoso Central 7Fr', perigo: 'Contaminação microbiana', situacao: 'Falha na selagem da embalagem estéril', severidade: 5, probabilidade: 2, rpn: 10, controle: 'Teste de integridade 100% + EO estéril validado', status: 'Controlado' },
        { id: 2, produto: 'Monitor MVX-300', perigo: 'Leitura incorreta de SpO2', situacao: 'Interferência de luz ambiente', severidade: 4, probabilidade: 3, rpn: 12, controle: 'Alarme de sinal de baixa qualidade + protetor de sensor', status: 'Redução Necessária' },
      ],
      pragas: [
        { id: 1, numero: 'PG-2026-001', area: 'Almoxarifado e Recebimento', empresa: 'EcoPest Controle Ambiental', tipo: 'Dedetização e Desratização', dataRealizacao: '2026-06-05', proximaVisita: '2026-09-05', status: 'Concluído' },
        { id: 2, numero: 'PG-2026-002', area: 'Produção e Sala Limpa', empresa: 'EcoPest Controle Ambiental', tipo: 'Monitoramento com armadilhas', dataRealizacao: '2026-06-10', proximaVisita: '2026-07-10', status: 'Pendente Laudo' },
      ],
    };
  }
}

export const db = new Database();
