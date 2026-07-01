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
  DOC:   ['Em Elaboração', 'Em Revisão', 'Vigente', 'A Vencer', 'Vencido', 'Cancelado', 'Suspenso'],
});

export const ORIGENS_CAPA = Object.freeze([
  'Auditoria Interna',
  'Auditoria Externa',
  'RNC',
  'Reclamação de Cliente',
  'Análise Crítica',
  'Monitoramento de Processo',
  'Vigilância Pós-Mercado',
  'Análise de Risco',
  'Iniciativa Interna',
]);

export const TIPOS_TECNO = Object.freeze([
  'Queixa Técnica',
  'Tecnovigilância',
  'Recall',
  'Desvio de Qualidade',
  'Notificação Voluntária',
]);

export const TIPOS_VAL = Object.freeze([
  // Qualificações de Equipamentos, Instalações e Utilidades (POP-GQ-015)
  'Qualificação de Equipamentos de Produção',
  'Qualificação de Equipamentos de CQ',
  'Qualificação de Utilidades Críticas',
  'Qualificação de Sala Limpa (ISO Classe 7)',
  // Qualificação Térmica
  'Qualificação Térmica – Autoclave',
  'Qualificação Térmica – Câmara Climática',
  'Qualificação Térmica – Refrigeradores/Câmaras Frias',
  'Qualificação Térmica – Almoxarifado',
  // Qualificação de Transporte
  'Qualificação de Transporte',
  // Validações de Processo (PL-GQ-005)
  'Validação de Limpeza',
  'Validação de Esterilização',
  'Validação de Sistema de Barreira Estéril (SBE)',
  'Validação de Processo Produtivo',
  'Validação de Métodos de Ensaio',
  'Validação de Sistemas Computadorizados',
  'Estudo de Estabilidade',
  // Revisões Periódicas
  'Revisão Periódica',
]);

export const CATEGORIAS_GCM = Object.freeze([
  'Processo',
  'Produto',
  'Software',
  'Equipamento',
  'Documentação',
  'Infraestrutura',
  'Fornecedor',
  'Regulatório',
]);

export const CRITICIDADES = Object.freeze(['Crítico', 'Maior', 'Menor']);

export const CLASSIFICACOES_RNC = Object.freeze([
  'Crítica',
  'Maior',
  'Menor',
  'Observação',
]);

export const IMPACTOS = Object.freeze(['Alto', 'Médio', 'Baixo']);

export const ROUTES = Object.freeze({
  DASHBOARD: 'dashboard',
  CAPA: 'capa',
  RNC: 'rnc',
  FORNECEDORES: 'fornecedores',
  TECNOVIG: 'tecnovig',
  VALIDACOES: 'validacoes',
  GCM: 'gcm',
  RISCO: 'risco',
  PRAGAS: 'pragas',
  EQUIPE: 'equipe',
  CRONOGRAMA: 'cronograma',
  CALENDARIO: 'calendario',
  AGENDA:        'agenda',
  OBRIGACOES:    'obrigacoes',
  DOCUMENTOS:    'documentos',
  CONFIGURACOES: 'configuracoes',
});

/**
 * Mapa de status → classe CSS de pill.
 * Permite renderizar qualquer status com a cor correta.
 */
export const PILL_MAP = Object.freeze({
  // CAPA
  'Aberta':                   'pill-red',
  'Em Andamento':             'pill-blue',
  'Aguardando Verificação':   'pill-amber',
  'Concluída':                'pill-green',
  'Cancelada':                'pill-gray',
  // RNC
  'Em Análise':               'pill-purple',
  'Em Tratamento':            'pill-blue',
  'Verificação de Eficácia':  'pill-amber',
  'Encerrada':                'pill-green',
  // FORN
  'Qualificado':              'pill-green',
  'Em Qualificação':          'pill-amber',
  'Suspenso':                 'pill-orange',
  'Desqualificado':           'pill-red',
  // TECNO
  'Aberto':                   'pill-red',
  'Em Investigação':          'pill-purple',
  'Notificado ANVISA':        'pill-amber',
  // VAL
  'Planejada':                'pill-blue',
  'Em Execução':              'pill-teal',
  'Em Revalidação':           'pill-amber',
  'Qualificado/Validado':     'pill-green',
  'Não Qualificado/Não Validado': 'pill-red',
  'Reprovada':                'pill-red',
  'Descontinuado':            'pill-gray',
  // GCM
  'Em Implantação':           'pill-teal',
  'Rejeitada':                'pill-red',
  'Aprovada (GCM)':           'pill-green',
  // RISCO
  'Aceitável':                'pill-green',
  'Redução Necessária':       'pill-amber',
  'Inaceitável':              'pill-red',
  'Controlado':               'pill-teal',
  // PRAGA
  'Agendado':                 'pill-blue',
  'Realizado':                'pill-teal',
  'Pendente Laudo':           'pill-amber',
  'Vencido':                  'pill-red',
  // OBR
  'Em Dia':                   'pill-green',
  'A Vencer':                 'pill-amber',
  // DOC
  'Em Elaboração':            'pill-blue',
  'Em Revisão':               'pill-purple',
  'Vigente':                  'pill-green',
  'Cancelado':                'pill-gray',
  // IMPACTO
  'Alto':                     'pill-red',
  'Médio':                    'pill-amber',
  'Baixo':                    'pill-green',
  // CRITICIDADE
  'Crítico':                  'pill-red',
  'Maior':                    'pill-amber',
  'Menor':                    'pill-blue',
  // Fallback
  'default':                  'pill-gray',
});
