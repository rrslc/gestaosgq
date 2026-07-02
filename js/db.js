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

const COLLECTIONS = ['equipe', 'capa', 'rnc', 'fornecedores', 'tecno', 'validacoes', 'gcm', 'risco', 'pragas', 'obrigacoes', 'documentos', 'perfis', 'trilha'];

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
        { id: 1, nome: 'Raissa Caldas',     iniciais: 'RC', cargo: 'Gerente da Qualidade',      cor: '#2d5be3', perfil: 'Gestor GQ',  email: 'raissa.caldas@msbbrasil.com', area: 'GQ' },
        { id: 2, nome: 'Fernanda Oliveira', iniciais: 'FO', cargo: 'Analista de Qualidade',     cor: '#00897b', perfil: 'Elaborador',  email: 'fernanda.oliveira@msbbrasil.com', area: 'GQ' },
        { id: 3, nome: 'Mariana Santos',    iniciais: 'MS', cargo: 'Engenheira de Processos',   cor: '#7c3aed', perfil: 'Elaborador',  email: 'mariana.santos@msbbrasil.com', area: 'MT' },
        { id: 4, nome: 'Juliana Pereira',   iniciais: 'JP', cargo: 'Especialista Regulatório',  cor: '#f59e0b', perfil: 'Aprovador',   email: 'juliana.pereira@msbbrasil.com', area: 'AR' },
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
        // ── Qualificações de Equipamentos, Instalações e Utilidades (POP-GQ-015) ──
        { id: 1,  numero: 'QUA-2026-001', tipo: 'Qualificação de Equipamentos de Produção',    descricao: 'Qualificação de equipamentos de montagem, bonding, revestimento, corte e selagem de embalagem (Modelo V: QP → QI → QO → QD)', fase: 'Protocolo',      responsavel: 'Mariana Santos',    prazo: '2026-09-30', status: 'Em Execução',   progresso: 25 },
        { id: 2,  numero: 'QUA-2026-002', tipo: 'Qualificação de Equipamentos de CQ',          descricao: 'Qualificação de equipamentos de ensaio: força, pressão, fluxo, balanças, microscopia',                                                                   fase: 'Planejamento',    responsavel: 'Fernanda Oliveira', prazo: '2026-10-31', status: 'Planejada',     progresso: 0  },
        { id: 3,  numero: 'QUA-2026-003', tipo: 'Qualificação de Utilidades Críticas',         descricao: 'Qualificação de HVAC Sala Limpa, ar comprimido técnico e água purificada (quando aplicável)',                                                              fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-11-30', status: 'Planejada',     progresso: 0  },
        { id: 4,  numero: 'QUA-2026-004', tipo: 'Qualificação de Sala Limpa (ISO Classe 7)',   descricao: 'Qualificação de sala limpa ISO 7: classificação de partículas, filtros HEPA, diferenciais de pressão, Recovery Test e monitoramento ambiental',            fase: 'Protocolo',       responsavel: 'Raissa Caldas',     prazo: '2026-12-15', status: 'Em Execução',   progresso: 15 },
        // ── Qualificação Térmica ──
        { id: 5,  numero: 'QTH-2026-001', tipo: 'Qualificação Térmica – Autoclave',            descricao: 'Qualificação térmica de autoclaves: distribuição de calor, penetração de calor e carga crítica',                                                          fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-08-31', status: 'Planejada',     progresso: 0  },
        { id: 6,  numero: 'QTH-2026-002', tipo: 'Qualificação Térmica – Câmara Climática',     descricao: 'Mapeamento de temperatura e umidade relativa — câmaras climáticas e de estabilidade',                                                                      fase: 'Planejamento',    responsavel: 'Raissa Caldas',     prazo: '2026-09-30', status: 'Planejada',     progresso: 0  },
        { id: 7,  numero: 'QTH-2026-003', tipo: 'Qualificação Térmica – Refrigeradores/Câmaras Frias', descricao: 'Mapeamento de temperatura e estudo de recuperação — refrigeradores e câmaras frias do CQ',                                                        fase: 'Planejamento',    responsavel: 'Fernanda Oliveira', prazo: '2026-09-30', status: 'Planejada',     progresso: 0  },
        { id: 8,  numero: 'QTH-2026-004', tipo: 'Qualificação Térmica – Almoxarifado',         descricao: 'Mapeamento de temperatura e umidade (mín. 72h), pior caso sazonal — almoxarifado climatizado',                                                            fase: 'Planejamento',    responsavel: 'Juliana Pereira',   prazo: '2026-10-31', status: 'Planejada',     progresso: 0  },
        // ── Qualificação de Transporte ──
        { id: 9,  numero: 'QTR-2026-001', tipo: 'Qualificação de Transporte',                  descricao: 'Qualificação de transporte de produtos estéreis acabados: choque, vibração, compressão, temperatura e integridade do SBE pós-transporte',                 fase: 'Planejamento',    responsavel: 'Juliana Pereira',   prazo: '2026-11-30', status: 'Planejada',     progresso: 0  },
        // ── Validações (PL-GQ-005) ──
        { id: 10, numero: 'VAL-2026-001', tipo: 'Validação de Limpeza',                        descricao: 'Validação de limpeza de equipamentos e utensílios em contato com produto; sanitização da Sala Limpa (pior caso; tempos de espera sujo/limpo)',             fase: 'Execução',        responsavel: 'Mariana Santos',    prazo: '2026-08-15', status: 'Em Execução',   progresso: 40 },
        { id: 11, numero: 'VAL-2026-002', tipo: 'Validação de Esterilização',                   descricao: 'Validação do processo de esterilização dos produtos acabados (EO, radiação ou vapor) — 3 lotes consecutivos prospectivos',                                fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-10-31', status: 'Planejada',     progresso: 0  },
        { id: 12, numero: 'VAL-2026-003', tipo: 'Validação de Sistema de Barreira Estéril (SBE)', descricao: 'Validação do processo de selagem de embalagem primária: parâmetros de heat sealing e integridade do SBE',                                             fase: 'Execução',        responsavel: 'Mariana Santos',    prazo: '2026-07-31', status: 'Em Execução',   progresso: 60 },
        { id: 13, numero: 'VAL-2026-004', tipo: 'Validação de Processo Produtivo',              descricao: 'Validação do processo de revestimento hidrofílico — cateteres e fio-guia (3 lotes prospectivos)',                                                         fase: 'Protocolo',       responsavel: 'Mariana Santos',    prazo: '2026-09-30', status: 'Em Execução',   progresso: 20 },
        { id: 14, numero: 'VAL-2026-005', tipo: 'Validação de Processo Produtivo',              descricao: 'Validação do processo de bonding/colagem — componentes, hubs e junções',                                                                                   fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-10-31', status: 'Planejada',     progresso: 0  },
        { id: 15, numero: 'VAL-2026-006', tipo: 'Validação de Processo Produtivo',              descricao: 'Validação do processo de conformação de fio-guia e tratamento térmico',                                                                                    fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-11-30', status: 'Planejada',     progresso: 0  },
        { id: 16, numero: 'VAL-2026-007', tipo: 'Validação de Processo Produtivo',              descricao: 'Validação do processo de montagem de eletrodo temporário e conformação',                                                                                   fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-11-30', status: 'Planejada',     progresso: 0  },
        { id: 17, numero: 'VAL-2026-008', tipo: 'Validação de Processo Produtivo',              descricao: 'Validação do processo de montagem de cateteres angiográficos e de ablação termoquímica',                                                                   fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-12-15', status: 'Planejada',     progresso: 0  },
        { id: 18, numero: 'VAL-2026-009', tipo: 'Validação de Métodos de Ensaio',               descricao: 'Validação de métodos de ensaio: integridade de embalagem, força, torque e pressão',                                                                       fase: 'Protocolo',       responsavel: 'Fernanda Oliveira', prazo: '2026-09-30', status: 'Em Execução',   progresso: 15 },
        { id: 19, numero: 'VAL-2026-010', tipo: 'Validação de Sistemas Computadorizados',       descricao: 'Validação de sistemas computadorizados conforme PL-GQ-026 – Plano Mestre de Validação de Sistemas Computadorizados',                                      fase: 'Planejamento',    responsavel: 'Raissa Caldas',     prazo: '2026-12-31', status: 'Planejada',     progresso: 0  },
        { id: 20, numero: 'EST-2026-001', tipo: 'Estudo de Estabilidade',                       descricao: 'Estudo de estabilidade – envelhecimento acelerado (ASTM F1980) por linha de produto',                                                                      fase: 'Execução',        responsavel: 'Raissa Caldas',     prazo: '2026-09-30', status: 'Em Execução',   progresso: 50 },
        { id: 21, numero: 'EST-2026-002', tipo: 'Estudo de Estabilidade',                       descricao: 'Estudo de estabilidade – envelhecimento em tempo real, acompanhamento contínuo conforme cronograma do estudo',                                            fase: 'Execução',        responsavel: 'Raissa Caldas',     prazo: '2027-12-31', status: 'Em Execução',   progresso: 30 },
        // ── Revisões Periódicas ──
        { id: 22, numero: 'REV-2026-001', tipo: 'Revisão Periódica',                            descricao: 'Revisão periódica dos equipamentos de produção: manutenções, calibrações, desvios e mudanças do período',                                                fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-12-15', status: 'Planejada',     progresso: 0  },
        { id: 23, numero: 'REV-2026-002', tipo: 'Revisão Periódica',                            descricao: 'Revisão periódica da Sala Limpa ISO 7 + certificação conforme ISO 14644-2',                                                                               fase: 'Planejamento',    responsavel: 'Raissa Caldas',     prazo: '2026-12-15', status: 'Planejada',     progresso: 0  },
        { id: 24, numero: 'REV-2026-003', tipo: 'Revisão Periódica',                            descricao: 'Revisão periódica da validação de esterilização: ciclo, parâmetros críticos e testes de produto',                                                        fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-12-15', status: 'Planejada',     progresso: 0  },
        { id: 25, numero: 'REV-2026-004', tipo: 'Revisão Periódica',                            descricao: 'Revisão periódica da validação de SBE: dados de selagem, integridade e estudos de estabilidade',                                                         fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-12-15', status: 'Planejada',     progresso: 0  },
        { id: 26, numero: 'REV-2026-005', tipo: 'Revisão Periódica',                            descricao: 'Revisão periódica das validações de processos produtivos (VCP) + revisão formal anual',                                                                   fase: 'Planejamento',    responsavel: 'Mariana Santos',    prazo: '2026-12-31', status: 'Planejada',     progresso: 0  },
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
      obrigacoes: [
        { id: 1, numero: 'OBR-2026-001', nome: 'Envio MAPA à Polícia Federal', orgao: 'Polícia Federal / SISCORI', periodicidade: 'Mensal', diaLimite: 10, responsavel: 'Juliana Pereira', ultimoEnvio: '2026-06-10', proximoVencimento: '2026-07-10', status: 'Em Dia', descricao: 'Mapa de controle de substâncias sujeitas a controle especial — envio até o dia 10 do mês subsequente via SISCORI (Port. SVS/MS nº 344/1998)' },
        { id: 2, numero: 'OBR-2026-002', nome: 'Relatório Semestral de Tecnovigilância (ANVISA)', orgao: 'ANVISA', periodicidade: 'Semestral', diaLimite: 31, responsavel: 'Juliana Pereira', ultimoEnvio: '2026-01-31', proximoVencimento: '2026-07-31', status: 'A Vencer', descricao: 'Relatório periódico de tecnovigilância para produtos com registro ativo — RDC 67/2009' },
        { id: 3, numero: 'OBR-2026-003', nome: 'Renovação de AFE (ANVISA)', orgao: 'ANVISA', periodicidade: 'Anual', diaLimite: 31, responsavel: 'Raissa Caldas', ultimoEnvio: '2026-01-15', proximoVencimento: '2027-01-31', status: 'Em Dia', descricao: 'Autorização de Funcionamento de Empresa — renovação anual junto à ANVISA via Solicita' },
        { id: 4, numero: 'OBR-2026-004', nome: 'Verificação de Vigência de Documentos Externos', orgao: 'Interno (GQ)', periodicidade: 'Trimestral', diaLimite: 30, responsavel: 'Raissa Caldas', ultimoEnvio: '2026-06-17', proximoVencimento: '2026-09-30', status: 'Em Dia', descricao: 'Verificar a cada 3 meses a vigência de normas, portarias e regulamentações externas aplicáveis ao SGQ — POP-GQ-003 §7.6.1' },
        { id: 5, numero: 'OBR-2026-005', nome: 'Verificação e Atualização do Cartão de Assinaturas', orgao: 'Interno (GQ)', periodicidade: 'Anual', diaLimite: 31, responsavel: 'Juliana Pereira', ultimoEnvio: '2026-03-17', proximoVencimento: '2027-03-31', status: 'Em Dia', descricao: 'Verificação anual das assinaturas e rubricas de todos os colaboradores cadastrados no POP-GQ-003-05 — POP-GQ-003 §7.10' },
      ],
      documentos: [
        { id: 1, numero: 'MA-GQ-001',  tipo: 'MA',  area: 'GQ', revisao: '00', titulo: 'Manual da Qualidade', dataHomologacao: '2026-01-15', status: 'Vigente', elaboradores: 'Juliana Pereira', revisores: 'Raissa Caldas', aprovadores: 'Diretoria', descricao: 'Descreve o escopo do SGQ, a interação entre seus processos e os fundamentos para atendimento à RDC 665/2022 e ISO 13485:2016.' },
        { id: 2, numero: 'POP-GQ-002', tipo: 'POP', area: 'GQ', revisao: '00', titulo: 'Elaboração, Revisão, Aprovação, Homologação e Treinamento dos Documentos do SGQ', dataHomologacao: '2026-03-16', status: 'Vigente', elaboradores: 'Juliana Ranzan Matos', revisores: 'Raissa Caldas', aprovadores: '', descricao: 'Descreve a sistemática para elaboração, revisão, treinamento e homologação dos documentos do SGQ.' },
        { id: 3, numero: 'POP-GQ-003', tipo: 'POP', area: 'GQ', revisao: '00', titulo: 'Controle de Documentos e Dados', dataHomologacao: '2026-01-20', status: 'Vigente', elaboradores: 'Raissa Caldas', revisores: 'Juliana Pereira', aprovadores: '', descricao: 'Procedimento para controle, distribuição e obsolescência de documentos e dados do SGQ.' },
        { id: 4, numero: 'IT-GQ-004',  tipo: 'IT',  area: 'GQ', revisao: '00', titulo: 'Formatação de Documentos', dataHomologacao: '2026-01-20', status: 'Vigente', elaboradores: 'Raissa Caldas', revisores: 'Juliana Pereira', aprovadores: '', descricao: 'Instrução de trabalho para padronização da formatação de documentos do SGQ.' },
        { id: 5, numero: 'POP-RH-002', tipo: 'POP', area: 'RH', revisao: '00', titulo: 'Gestão de Conhecimento', dataHomologacao: '2026-02-10', status: 'Vigente', elaboradores: 'RH', revisores: 'Raissa Caldas', aprovadores: '', descricao: 'Procedimento para gestão de treinamentos e homologação de documentos.' },
        { id: 6, numero: 'PL-GQ-005',  tipo: 'PL',  area: 'GQ', revisao: '01', titulo: 'Plano Mestre de Validação', dataHomologacao: '2026-01-10', status: 'Vigente', elaboradores: 'Raissa Caldas', revisores: 'Mariana Santos', aprovadores: 'Diretoria', descricao: 'Define escopo, critérios e cronograma das 26 qualificações e validações previstas para 2026 (QUA, QTH, QTR, VAL, EST, REV).' },
      ],
      perfis: (() => {
        const ALL = { ver: true, criar: true, editar: true, gestao: true, aprovar: true };
        const STD = { ver: true, criar: true, editar: true, gestao: false, aprovar: false };
        const REV = { ver: true, criar: false, editar: true, gestao: false, aprovar: true };
        const RO  = { ver: true, criar: false, editar: false, gestao: false, aprovar: false };
        const NO  = { ver: false, criar: false, editar: false, gestao: false, aprovar: false };
        const mods = ['dashboard','agenda','capa','rnc','fornecedores','tecnovig','validacoes','gcm','risco','pragas','obrigacoes','documentos','equipe','permissoes','configuracoes'];
        function mp(base, ov) { return Object.fromEntries(mods.map(m => [m, (ov && ov[m]) ? ov[m] : base])); }
        return [
          { id: 1, nome: 'GQ Administrador',    cor: '#dc2626', descricao: 'Acesso total ao SGQ', permissoes: mp(ALL) },
          { id: 2, nome: 'Gestor GQ',           cor: '#2563eb', descricao: 'Gerencia processos GQ, homologa documentos', permissoes: mp(ALL, { configuracoes: STD }) },
          { id: 3, nome: 'Elaborador',          cor: '#059669', descricao: 'Elabora e edita documentos na sua área', permissoes: mp(RO,  { documentos: STD, agenda: RO }) },
          { id: 4, nome: 'Revisor',             cor: '#7c3aed', descricao: 'Revisa documentos e emite parecer', permissoes: mp(RO,  { documentos: REV }) },
          { id: 5, nome: 'Aprovador',           cor: '#d97706', descricao: 'Aprova documentos na etapa de aprovação', permissoes: mp(RO,  { documentos: { ver: true, criar: false, editar: false, gestao: false, aprovar: true } }) },
          { id: 6, nome: 'Executor',            cor: '#0891b2', descricao: 'Execução — abre CAPA, RNC, solicitações', permissoes: mp(RO,  { capa: STD, rnc: STD, gcm: STD, documentos: { ver: true, criar: true, editar: false, gestao: false, aprovar: false } }) },
          { id: 7, nome: 'Resp. por Impressão', cor: '#65a30d', descricao: 'Gerencia impressão de cópias controladas', permissoes: mp(NO, { documentos: { ver: true, criar: false, editar: true, gestao: false, aprovar: false } }) },
          { id: 8, nome: 'Consulta',            cor: '#6b7280', descricao: 'Somente visualização, sem edição', permissoes: mp(RO, { permissoes: NO, configuracoes: NO }) },
        ];
      })(),
      trilha: [],
    };
  }

  /** Registra evento na trilha de auditoria (CFR 21 Part 11 / ANVISA RDC 27/2011). */
  addAudit(acao, modulo, registro, detalhe = '') {
    this.add('trilha', {
      dataHora: new Date().toISOString(),
      usuario: this.getSessionUser() || 'Sistema',
      acao,
      modulo,
      registro: String(registro),
      detalhe,
    });
  }

  /** Retorna o usuário da sessão atual (sessionStorage). */
  getSessionUser() {
    try { return sessionStorage.getItem('sgq_usuario') || ''; } catch { return ''; }
  }

  /** Define o usuário da sessão atual. */
  setSessionUser(nome) {
    try {
      if (nome) sessionStorage.setItem('sgq_usuario', nome);
      else sessionStorage.removeItem('sgq_usuario');
    } catch { /* noop */ }
  }
}

export const db = new Database();
