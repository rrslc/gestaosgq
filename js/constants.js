/**
 * @fileoverview Constantes globais do SGQ — todos os valores imutáveis do sistema.
 */

export const STORE_KEY = 'sgq_data_v1';

export const STATUS = Object.freeze({
  CAPA: ['Aberta', 'Em Andamento', 'Aguardando Verificação', 'Concluída', 'Cancelada'],
  RNC: ['Aberta', 'Em Análise', 'Em Tratamento', 'Verificação de Eficácia', 'Encerrada', 'Cancelada'],
  FORN: ['Qualificado', 'Em Qualificação', 'Suspenso', 'Desqualificado'],
  TECNO: ['Aberto', 'Em Investigação', 'Notificado ANVISA', 'Concluído', 'Cancelado'],
  VAL: ['Planejada', 'Em Execução', 'Em Revalidação', 'Qualificado/Validado', 'Não Qualificado/Não Validado', 'Reprovada', 'Descontinuado', 'Cancelada'],
  GCM: ['Aberta', 'Em Análise', 'Aprovada', 'Em Implantação', 'Concluída', 'Rejeitada'],
  RISCO: ['Aceitável', 'Redução Necessária', 'Inaceitável', 'Controlado'],
  PRAGA: ['Agendado', 'Realizado', 'Pendente Laudo', 'Concluído', 'Vencido'],
  OBR:   ['Em Dia', 'A Vencer', 'Vencido', 'Suspenso'],
  DOC:   ['Em Elaboração', 'Em Revisão', 'Em Aprovação', 'Em Homologação', 'Vigente', 'A Vencer', 'Vencido', 'Cancelado', 'Suspenso'],
});

export const ORIGENS_CAPA = Object.freeze([
  'Auditoria Interna', 'Auditoria Externa', 'RNC', 'Reclamação de Cliente',
  'Análise Crítica', 'Monitoramento de Processo', 'Vigilância Pós-Mercado',
  'Análise de Risco', 'Iniciativa Interna',
]);

export const TIPOS_TECNO = Object.freeze([
  'Queixa Técnica', 'Tecnovigilância', 'Recall', 'Desvio de Qualidade', 'Notificação Voluntária',
]);

export const TIPOS_VAL = Object.freeze([
  'Qualificação de Equipamentos de Produção', 'Qualificação de Equipamentos de CQ',
  'Qualificação de Utilidades Críticas', 'Qualificação de Sala Limpa (ISO Classe 7)',
  'Qualificação Térmica – Autoclave', 'Qualificação Térmica – Câmara Climática',
  'Qualificação Térmica – Refrigeradores/Câmaras Frias', 'Qualificação Térmica – Almoxarifado',
  'Qualificação de Transporte', 'Validação de Limpeza', 'Validação de Esterilização',
  'Validação de Sistema de Barreira Estéril (SBE)', 'Validação de Processo Produtivo',
  'Validação de Métodos de Ensaio', 'Validação de Sistemas Computadorizados',
  'Estudo de Estabilidade', 'Revisão Periódica',
]);

export const CATEGORIAS_GCM = Object.freeze([
  'Processo', 'Produto', 'Software', 'Equipamento',
  'Documentação', 'Infraestrutura', 'Fornecedor', 'Regulatório',
]);

export const CRITICIDADES = Object.freeze(['Crítico', 'Maior', 'Menor']);
export const CLASSIFICACOES_RNC = Object.freeze(['Crítica', 'Maior', 'Menor', 'Observação']);
export const IMPACTOS = Object.freeze(['Alto', 'Médio', 'Baixo']);

export const ROUTES = Object.freeze({
  DASHBOARD:    'dashboard',
  CAPA:         'capa',
  RNC:          'rnc',
  FORNECEDORES: 'fornecedores',
  TECNOVIG:     'tecnovig',
  VALIDACOES:   'validacoes',
  GCM:          'gcm',
  RISCO:        'risco',
  PRAGAS:       'pragas',
  EQUIPE:       'equipe',
  CRONOGRAMA:   'cronograma',
  CALENDARIO:   'calendario',
  AGENDA:       'agenda',
  OBRIGACOES:   'obrigacoes',
  DOCUMENTOS:     'documentos',
  ELABORACAO:     'elaboracao',
  MONITORAMENTO:  'monitoramento',
  PERMISSOES:   'permissoes',
  CONFIGURACOES:'configuracoes',
});

export const PILL_MAP = Object.freeze({
  'Aberta':                       'pill-red',
  'Em Andamento':                 'pill-blue',
  'Aguardando Verificação':       'pill-amber',
  'Concluída':                    'pill-green',
  'Cancelada':                    'pill-gray',
  'Em Análise':                   'pill-purple',
  'Em Tratamento':                'pill-blue',
  'Verificação de Eficácia':      'pill-amber',
  'Encerrada':                    'pill-green',
  'Qualificado':                  'pill-green',
  'Em Qualificação':              'pill-amber',
  'Suspenso':                     'pill-orange',
  'Desqualificado':               'pill-red',
  'Aberto':                       'pill-red',
  'Em Investigação':              'pill-purple',
  'Notificado ANVISA':            'pill-amber',
  'Planejada':                    'pill-blue',
  'Em Execução':                  'pill-teal',
  'Em Revalidação':               'pill-amber',
  'Qualificado/Validado':         'pill-green',
  'Não Qualificado/Não Validado': 'pill-red',
  'Reprovada':                    'pill-red',
  'Descontinuado':                'pill-gray',
  'Em Implantação':               'pill-teal',
  'Rejeitada':                    'pill-red',
  'Aprovada (GCM)':               'pill-green',
  'Aceitável':                    'pill-green',
  'Redução Necessária':           'pill-amber',
  'Inaceitável':                  'pill-red',
  'Controlado':                   'pill-teal',
  'Agendado':                     'pill-blue',
  'Realizado':                    'pill-teal',
  'Pendente Laudo':               'pill-amber',
  'Vencido':                      'pill-red',
  'Em Dia':                       'pill-green',
  'A Vencer':                     'pill-amber',
  'Em Elaboração':                'pill-blue',
  'Em Revisão':                   'pill-purple',
  'Em Aprovação':                 'pill-amber',
  'Em Homologação':               'pill-teal',
  'Vigente':                      'pill-green',
  'Cancelado':                    'pill-gray',
  'Alto':                         'pill-red',
  'Médio':                        'pill-amber',
  'Baixo':                        'pill-green',
  'Crítico':                      'pill-red',
  'Maior':                        'pill-amber',
  'Menor':                        'pill-blue',
  'default':                      'pill-gray',
});

/** Perfis de acesso do SGQ. */
export const PERFIS = Object.freeze([
  'GQ Administrador',
  'Gestor GQ',
  'Garantia da Qualidade',
  'Elaborador',
  'Revisor',
  'Aprovador',
  'Executor',
  'Resp. por Impressão',
  'Consulta',
]);

/** Módulos do sistema para a matriz de permissões. */
export const MODULOS_PERM = Object.freeze([
  { key: 'dashboard',     label: 'Dashboard' },
  { key: 'agenda',        label: 'Agenda GQ' },
  { key: 'capa',          label: 'CAPA / Não Conformidade' },
  { key: 'rnc',           label: 'RNC' },
  { key: 'fornecedores',  label: 'Fornecedores' },
  { key: 'tecnovig',      label: 'Tecnovigilância' },
  { key: 'validacoes',    label: 'Validações' },
  { key: 'gcm',           label: 'Controle de Mudanças' },
  { key: 'risco',         label: 'Análise de Risco' },
  { key: 'pragas',        label: 'Controle de Pragas' },
  { key: 'obrigacoes',    label: 'Obrig. Regulatórias' },
  { key: 'documentos',    label: 'Controle de Docs.' },
  { key: 'equipe',        label: 'Equipe' },
  { key: 'permissoes',    label: 'Permissões' },
  { key: 'configuracoes', label: 'Configurações' },
]);

/** Tipos de operação disponíveis na matriz de permissões. */
export const ACOES_PERM = Object.freeze([
  { key: 'ver',      label: 'Consulta' },
  { key: 'criar',    label: 'Cadastro' },
  { key: 'editar',   label: 'Execução' },
  { key: 'gestao',   label: 'Gestão' },
  { key: 'aprovar',  label: 'Aprovação' },
]);

/** Etapas do fluxo de documentos conforme POP-GQ-002. */
export const ETAPAS_DOC = Object.freeze([
  { key: 'Em Elaboração',  label: 'Elaboração',  cor: '#2563eb', prox: 'Em Revisão',     ator: 'Elaborador (máx. 1)' },
  { key: 'Em Revisão',     label: 'Revisão',      cor: '#7c3aed', prox: 'Em Aprovação',   ator: 'Revisores (máx. 3)' },
  { key: 'Em Aprovação',   label: 'Aprovação',    cor: '#d97706', prox: 'Em Homologação', ator: 'Aprovadores (máx. 2)' },
  { key: 'Em Homologação', label: 'Homologação',  cor: '#059669', prox: 'Vigente',        ator: 'Gestor GQ' },
]);
