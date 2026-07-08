/**
 * Seed script — insere os 11 documentos administrativos no Neon PostgreSQL.
 * Execução: node scripts/seed-docs-admin.js
 * Requer DATABASE_URL definida no ambiente ou em .env.local
 */

require('dotenv').config({ path: '.env.local' });

const { neon } = require('@neondatabase/serverless');

if (!process.env.DATABASE_URL) {
  console.error('Erro: DATABASE_URL não definida. Crie .env.local com a connection string do Neon.');
  process.exit(1);
}

const sql = neon(process.env.DATABASE_URL);

const DOCS = [
  { id: 1,  descricao: 'Alvará de Funcionamento',                       dataEmissao: '2025-03-25', dataValidade: '2027-03-31', prazoAntecedenciaDias: 30,  renovacaoPeriodo: '1 ano',         orgao: 'Prefeitura Municipal de Lauro de Freitas',           renovacaoAutomatica: false, observacao: 'Sem prazo legal específico de antecedência estabelecido pela legislação municipal. Adotado 30 dias como boa prática para renovação.', link: 'https://sefaz.laurodefreitas.ba.gov.br', legislacaoBase: 'Lei Municipal', checklistRenovacao: ['Acessar o portal SEFAZ — Lauro de Freitas','Preencher o requerimento de renovação do Alvará','Anexar CNPJ atualizado e contrato social (se houver alteração)','Pagar a taxa de renovação (boleto/GRU)','Acompanhar deferimento e retirar novo alvará'] },
  { id: 2,  descricao: 'Alvará de Publicidade',                         dataEmissao: '2025-05-30', dataValidade: '2027-04-30', prazoAntecedenciaDias: 30,  renovacaoPeriodo: '1 ano',         orgao: 'Prefeitura Municipal de Lauro de Freitas (SEFAZ)',   renovacaoAutomatica: true,  observacao: 'Renovação automática mediante pagamento da taxa no portal da SEFAZ.', link: 'https://solosweb.laurodefreitas.ba.gov.br/servico.jsf?servico=49', legislacaoBase: 'Lei Municipal', checklistRenovacao: ['Acessar o portal SEFAZ — Lauro de Freitas','Pagar a taxa anual de publicidade (renovação automática após pagamento)','Guardar comprovante de pagamento'] },
  { id: 3,  descricao: 'Alvará Sanitário',                               dataEmissao: '2025-11-16', dataValidade: '2026-11-16', prazoAntecedenciaDias: 120, renovacaoPeriodo: '1 ano',         orgao: 'VISA Municipal — Lauro de Freitas',                  renovacaoAutomatica: false, observacao: 'Prazo de 120 dias baseado em recomendação ANVISA/VISA para análise e deferimento do processo de renovação, considerando a complexidade documental exigida.', link: '', legislacaoBase: 'VISA Municipal / Recomendação ANVISA', checklistRenovacao: ['Protocolar requerimento de renovação na VISA Municipal','Apresentar planta baixa atualizada das instalações','Apresentar licença sanitária vigente e documentos da empresa (CNPJ, contrato social)','Apresentar habilitação do Responsável Técnico (RT) — CRF ou conselho competente','Pagar taxa de vistoria sanitária','Aguardar vistoria da VISA nas instalações','Retirar novo Alvará Sanitário após aprovação'] },
  { id: 4,  descricao: 'Autorização de Funcionamento (AFE)',             dataEmissao: '2008-09-01', dataValidade: null,         prazoAntecedenciaDias: 90,  renovacaoPeriodo: 'Indeterminado', orgao: 'ANVISA',                                             renovacaoAutomatica: false, observacao: 'A AFE tem validade indeterminada. Deve ser atualizada quando houver alteração de atividade, responsável técnico, endereço ou dados cadastrais.', link: 'https://www.gov.br/anvisa/pt-br/sistemas/certifiq', legislacaoBase: 'RDC 204/2017 — ANVISA', checklistRenovacao: ['Monitorar alterações que exijam atualização: atividade, endereço, responsável técnico ou dados cadastrais','Acessar o sistema CERTIFIQ da ANVISA (gov.br/anvisa/certifiq)','Protocolar petição de alteração/atualização da AFE quando necessário','Pagar GRU de alteração cadastral (se aplicável)','Acompanhar análise e deferimento pela ANVISA','Verificar periodicamente portarias e RDCs vigentes sobre AFE'] },
  { id: 5,  descricao: 'Certificado de Boas Práticas de Fabricação (CBPF)', dataEmissao: '2026-01-19', dataValidade: '2028-01-22', prazoAntecedenciaDias: 120, renovacaoPeriodo: '2 anos',    orgao: 'ANVISA',                                             renovacaoAutomatica: false, observacao: 'Protocolar pedido de renovação com mínimo de 120 dias de antecedência conforme cronograma de inspeções da ANVISA. Obrigatório para produtos Classe III e IV.', link: 'https://www.gov.br/anvisa/pt-br/sistemas/certifiq', legislacaoBase: 'RDC 665/2022 / ISO 13485', checklistRenovacao: ['Acessar o sistema CERTIFIQ da ANVISA','Protocolar solicitação de renovação de CBPF (mínimo 120 dias antes do vencimento)','Pagar GRU de solicitação de inspeção','Atualizar e disponibilizar o dossiê de inspeção (Manual de BPF, procedimentos, registros)','Atualizar Lista Mestra de Documentos do SGQ','Verificar e corrigir eventuais não conformidades do ciclo anterior','Aguardar agendamento de inspeção pela ANVISA','Realizar inspeção presencial nas instalações','Responder relatório de inspeção (CAPA) se houver não conformidades','Aguardar emissão do novo Certificado de CBPF'] },
  { id: 6,  descricao: 'Certificado de Licença do Corpo de Bombeiros',   dataEmissao: '2025-03-07', dataValidade: '2027-03-02', prazoAntecedenciaDias: 120, renovacaoPeriodo: '1 ano',         orgao: 'CBMBA — Corpo de Bombeiros Militar da Bahia',        renovacaoAutomatica: false, observacao: 'Solicitar agendamento de vistoria com antecedência mínima de 120 dias, considerando a disponibilidade de agenda do CBMBA e prazo de emissão do certificado após inspeção.', link: '', legislacaoBase: 'Decreto Estadual / Legislação Municipal', checklistRenovacao: ['Acessar o site do CBMBA e solicitar agendamento de vistoria','Providenciar planta baixa das instalações atualizada e aprovada','Preparar memorial descritivo do sistema de segurança contra incêndio','Verificar funcionamento de todos os extintores, hidrantes e saídas de emergência','Obter ART (Anotação de Responsabilidade Técnica) do engenheiro responsável','Pagar taxa de vistoria do CBMBA','Realizar vistoria presencial com o CBMBA','Corrigir eventuais não conformidades apontadas na vistoria','Aguardar emissão do novo Certificado de Licença'] },
  { id: 7,  descricao: 'Certidão de Regularidade Técnica',               dataEmissao: '2026-01-15', dataValidade: '2026-07-19', prazoAntecedenciaDias: 120, renovacaoPeriodo: '3 meses',       orgao: 'CRF / Conselho de Classe Técnico',                   renovacaoAutomatica: false, observacao: 'Certidão trimestral — requer acompanhamento rigoroso devido ao curto período de validade. Protocolar renovação com 120 dias de antecedência.', link: '', legislacaoBase: 'Legislação do Conselho de Classe', checklistRenovacao: ['Verificar anuidade do Responsável Técnico (RT) junto ao CRF / Conselho competente','Pagar anuidade ou parcelamento vigente (se pendente)','Solicitar emissão da Certidão de Regularidade Técnica no conselho de classe','Confirmar dados do RT e da empresa na certidão emitida','Arquivar certidão e registrar nova data de vencimento'] },
  { id: 8,  descricao: 'Inscrição Municipal (Cartão CGA)',                dataEmissao: '2026-01-12', dataValidade: '2027-03-31', prazoAntecedenciaDias: 30,  renovacaoPeriodo: '1 ano',         orgao: 'Prefeitura Municipal de Lauro de Freitas',           renovacaoAutomatica: true,  observacao: 'Renovação automática pelo portal da prefeitura. Sem prazo específico de antecedência. Verificar atualização anual.', link: 'https://sistemas.sefaz.pmlf.ba.gov.br/webrun/form.jsp?sys=TR2', legislacaoBase: 'Lei Municipal', checklistRenovacao: ['Acessar o portal SEFAZ — Lauro de Freitas (sistema TR2)','Verificar se os dados cadastrais (endereço, atividade, sócios) estão atualizados','Confirmar renovação automática após abertura do exercício fiscal','Emitir e arquivar novo Cartão CGA atualizado'] },
  { id: 9,  descricao: 'Certificado de Licença de Funcionamento (CLF)',  dataEmissao: '2025-07-16', dataValidade: '2026-07-17', prazoAntecedenciaDias: 60,  renovacaoPeriodo: '1 ano',         orgao: 'ANVISA',                                             renovacaoAutomatica: false, observacao: 'Protocolar renovação com 60 dias de antecedência conforme recomendação ANVISA para análise e deferimento do processo.', link: 'https://www.gov.br/anvisa/pt-br/sistemas/certifiq', legislacaoBase: 'RDC ANVISA / RDC 848/2024', checklistRenovacao: ['Acessar o sistema CERTIFIQ da ANVISA','Verificar e atualizar dados cadastrais da empresa (se necessário)','Protocolar petição de renovação de CLF (mínimo 60 dias antes do vencimento)','Pagar GRU de renovação do CLF','Anexar documentos exigidos: comprovante de AFE vigente, documentos da empresa','Acompanhar análise técnica na fila do CERTIFIQ','Responder eventuais exigências da ANVISA dentro do prazo','Aguardar emissão e download do novo CLF'] },
  { id: 10, descricao: 'Licença Ambiental Unificada (LU)',                dataEmissao: '2025-12-02', dataValidade: '2027-12-02', prazoAntecedenciaDias: 120, renovacaoPeriodo: '2 anos',        orgao: 'INEMA — Instituto do Meio Ambiente e Recursos Hídricos/BA', renovacaoAutomatica: false, observacao: 'CONAMA 237/97, Art. 18, § único: o requerimento de renovação deverá ser protocolado com antecedência mínima de 120 dias antes do vencimento, sob pena de suspensão das atividades.', link: '', legislacaoBase: 'CONAMA 237/1997 — Art. 18, § único', checklistRenovacao: ['Protocolar requerimento de renovação no INEMA via sistema SEI (obrigatório mín. 120 dias antes)','Elaborar e anexar Relatório de Monitoramento Ambiental do período vigente','Pagar taxa de renovação de licença ambiental (DAE/INEMA)','Obter ART do responsável técnico ambiental','Apresentar planta de situação atualizada e memorial descritivo das atividades','Comprovar destinação adequada de resíduos sólidos e efluentes (laudos/contratos)','Aguardar vistoria do INEMA nas instalações (se solicitada)','Responder eventuais condicionantes ou exigências do INEMA','Aguardar emissão da nova Licença Ambiental Unificada'] },
  { id: 11, descricao: 'Certidão da Polícia Civil',                      dataEmissao: '2026-01-13', dataValidade: '2027-01-15', prazoAntecedenciaDias: 30,  renovacaoPeriodo: '1 ano',         orgao: 'Polícia Civil da Bahia — FISPROCEM',                 renovacaoAutomatica: false, observacao: 'Enviar documentação nos 30 dias anteriores ao vencimento para renovação do cadastro.\nContato: fisprocem.cfpc@pcivil.ba.gov.br\nTel: (71) 3116-6417 | WhatsApp: (71) 9637-8211', link: '', legislacaoBase: 'Portaria FISPROCEM / Polícia Civil da Bahia', checklistRenovacao: ['Enviar e-mail para fisprocem.cfpc@pcivil.ba.gov.br solicitando renovação','Anexar CNPJ atualizado da empresa','Anexar contrato social atualizado e RG/CPF dos sócios','Anexar comprovante de endereço da empresa','Pagar taxa de renovação (se aplicável) e incluir comprovante','Confirmar recebimento com a FISPROCEM: (71) 3116-6417 ou WhatsApp (71) 9637-8211','Aguardar emissão e retirada da nova Certidão'] },
];

async function seed() {
  console.log('Verificando registros existentes em docsAdmin...');
  const existing = await sql(
    `SELECT id FROM sgq_records WHERE collection = 'docsAdmin' ORDER BY id`
  );

  if (existing.length > 0) {
    console.log(`Já existem ${existing.length} documentos em docsAdmin. Limpando...`);
    await sql(`DELETE FROM sgq_records WHERE collection = 'docsAdmin'`);
  }

  console.log(`Inserindo ${DOCS.length} documentos...`);
  for (const doc of DOCS) {
    const { id, ...data } = doc;
    await sql(
      `INSERT INTO sgq_records (collection, data) VALUES ('docsAdmin', $1)`,
      [JSON.stringify(data)]
    );
    console.log(`  ✓ ${doc.descricao}`);
  }

  console.log('\nSeed concluído com sucesso!');
  process.exit(0);
}

seed().catch(err => {
  console.error('Erro durante o seed:', err.message);
  process.exit(1);
});
