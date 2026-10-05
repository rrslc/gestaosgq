/**
 * @fileoverview Conformidade com Procedimentos — matriz de concordância
 * rastreável entre cada cláusula dos POPs e a regra que o sistema aplica.
 *
 * Diferencial do SGQ MSB: o sistema não apenas segue o procedimento, ele
 * declara, item a item, QUAL cláusula do POP cada comportamento cumpre e por
 * qual mecanismo (gate automático, campo, fluxo, permissão). Serve de evidência
 * de validação (P-SQ-012) e de aderência regulatória (RDC 665 / ISO 13485).
 */

import { db } from '../db.js';
import { getSession } from '../session.js';

// Mecanismos de cumprimento e seus selos.
const MECANISMOS = {
  'Gate':      { pill: 'pill-red',   desc: 'Trava automática que impede o avanço fora do procedimento' },
  'Automático':{ pill: 'pill-blue',  desc: 'Cálculo ou numeração gerado pelo sistema' },
  'Campo':     { pill: 'pill-gray',  desc: 'Campo obrigatório/estruturado do formulário' },
  'Fluxo':     { pill: 'pill-amber', desc: 'Etapa ou transição do workflow' },
  'Permissão': { pill: 'pill-teal',  desc: 'Restrição de quem pode executar a ação' },
  'Gerencial': { pill: 'pill-green', desc: 'Indicador/análise no painel gerencial' },
  'Registro':  { pill: 'pill-gray',  desc: 'Controle de registros e arquivamento' },
};

const CONCORDANCIA = [
  {
    pop: 'POP-GQ-008',
    titulo: 'Gestão de Não Conformidades',
    rev: 'Rev. 00 · 26/03/2026',
    rota: 'rncAbertura',
    itens: [
      { clausula: '§7.1 / 7.1.1', requisito: 'Registro da NC com os campos 1.1–3 e codificação RNC.XXX/AA sequencial a cada ano', como: 'Formulário com os campos numerados do POP; o Nº RNC é gerado automaticamente no padrão RNC.XXX/AA', mecanismo: 'Automático' },
      { clausula: '§7.2', requisito: 'Avaliação inicial pela GQ; registro incompleto retorna ao elaborador', como: 'Etapa "Avaliação GQ" com a ação "Solicitar Ajustes", que devolve a RNC à área com o motivo', mecanismo: 'Fluxo' },
      { clausula: '§7.2.1', requisito: 'Análise de recorrência nos últimos 2 anos', como: 'Campos "Recorrência (últimos 2 anos)?" e "RNCs anteriores"', mecanismo: 'Campo' },
      { clausula: '§7.2.2 · Quadro 3', requisito: 'Classificação do risco por Matriz Probabilidade × Severidade', como: 'Matriz idêntica ao Quadro 3 do POP; o nível de risco é calculado automaticamente ao escolher Severidade e Probabilidade', mecanismo: 'Automático' },
      { clausula: '§7.3.1', requisito: 'NC Crítica procedente exige abertura OBRIGATÓRIA de CAPA', como: 'Gate: ao classificar Crítica + procedente, o sistema marca "⚠ CAPA obrigatório" e libera a abertura de CAPA já na classificação', mecanismo: 'Gate', destaque: true },
      { clausula: '§7.3.1', requisito: 'NC Menor exige apenas correção/disposição — sem investigação, plano de ação ou CAPA', como: 'Gate: a NC Menor encerra direto na Disposição, pulando o Plano de Ação e a Verificação de Eficácia', mecanismo: 'Gate', destaque: true },
      { clausula: '§7.3.2', requisito: 'NC não procedente encerra com justificativa e comunicação à área', como: 'Ação "Não Procedente" com justificativa obrigatória; encerra o registro', mecanismo: 'Fluxo' },
      { clausula: '§7.4.1', requisito: 'Investigação por 5 Porquês (+ ferramentas) em até 15 dias (D+15)', como: 'Campos dos 5 Porquês, Ishikawa 6M, Ferramenta Complementar e Prazo de Investigação (D+15)', mecanismo: 'Campo' },
      { clausula: '§7.4.2', requisito: 'Disposição (Retrabalho/Concessão/Rejeição/N.A.) assinada pelo RT', como: 'Campo "Disposição (SGQ)" com aprovador e data carimbados automaticamente ao definir a disposição', mecanismo: 'Campo' },
      { clausula: '§7.4.3.2', requisito: 'Aprovação do Plano de Ação pelo Gerente/Coordenador da GQ', como: 'O avanço da etapa "Plano de Ação" é restrito ao perfil GQ Administrador (Coordenador)', mecanismo: 'Permissão' },
      { clausula: '§7.4.4', requisito: 'Verificação de Eficácia em período de 3 a 12 meses', como: 'Etapa "Verificação de Eficácia" com campo "Período de Verificação" (3 a 12 meses)', mecanismo: 'Campo' },
      { clausula: '§7.4.5', requisito: 'Só encerra se eficaz; ações ineficazes direcionam para abertura de CAPA', como: 'Gate: bloqueia o encerramento sem "Foi Eficaz? = Sim"; se ineficaz, orienta e libera a abertura de CAPA', mecanismo: 'Gate', destaque: true },
      { clausula: '§7.3.5.1', requisito: 'Análise de tendência das NCs encerradas', como: 'Gráfico de tendência no painel "RNC — Gerencial"', mecanismo: 'Gerencial' },
      { clausula: '§8', requisito: 'Controle de registros e retenção (POP-GQ-008-02)', como: 'Lista "Todas as RNCs" (Controle de RNC) e geração de PDF para arquivamento físico', mecanismo: 'Registro' },
    ],
  },
  {
    pop: 'POP-GQ-009',
    titulo: 'Gestão de CAPA (Ações Corretivas e Preventivas)',
    rev: 'Rev. 00 · 26/03/2026',
    rota: 'capaAbertura',
    itens: [
      { clausula: '§7.1 / 7.1.1', requisito: 'Registro do CAPA com a Origem e codificação CAPA.XXX/AA sequencial a cada ano', como: 'Campo "Origem" conforme Quadro 1; o Nº CAPA é gerado automaticamente no padrão CAPA.XXX/AA', mecanismo: 'Automático' },
      { clausula: '§7.2 / 7.2.1', requisito: 'Avaliação inicial e análise de recorrência consultando o histórico de NC (POP-008)', como: 'Etapa "Avaliação GQ" + campos de recorrência', mecanismo: 'Campo', obs: 'Parcial — a consulta ao histórico de NC é manual. Melhoria prevista: vínculo automático RNC ↔ CAPA.' },
      { clausula: '§7.2.2 · Quadro 3', requisito: 'Classificação do risco por Matriz Probabilidade × Severidade', como: 'Matriz idêntica ao Quadro 3 do POP; nível de risco calculado automaticamente', mecanismo: 'Automático' },
      { clausula: '§7.3.1', requisito: 'Classificação Crítica/Maior/Menor; CAPA Menor encerra com justificativa simplificada', como: 'Gate: o CAPA Menor encerra após o Plano de Ação, sem a investigação aprofundada nem o ciclo de verificação de eficácia', mecanismo: 'Gate', destaque: true },
      { clausula: '§7.3.2', requisito: 'Não procedente (improcedente, duplicidade ou NC isolada já tratada)', como: 'Ação "Não Procedente" com justificativa técnica; encerra e arquiva', mecanismo: 'Fluxo' },
      { clausula: '§7.4', requisito: 'Investigação por 5 Porquês (+ ferramentas) em até 15 dias (D+15)', como: 'Campos dos 5 Porquês, Ishikawa 6M, Ferramenta Complementar e prazo de investigação', mecanismo: 'Campo' },
      { clausula: '§7.4.2.2', requisito: 'Aprovação do Plano de Ação pelo Gerente/Coordenador da GQ', como: 'O avanço da etapa "Plano de Ação" é restrito ao perfil GQ Administrador (Coordenador)', mecanismo: 'Permissão' },
      { clausula: '§7.4.3 / 7.4.4', requisito: 'Verificação de Eficácia (3–12 meses); ineficaz abre um novo CAPA', como: 'Gate: bloqueia o encerramento sem "Foi Eficaz? = Sim"; se ineficaz, orienta e libera a abertura de um novo CAPA', mecanismo: 'Gate', destaque: true },
      { clausula: '§7.4.4.1', requisito: 'Análise de tendência dos CAPAs encerrados', como: 'Gráfico de tendência no painel "CAPA — Gerencial"', mecanismo: 'Gerencial' },
      { clausula: '§8', requisito: 'Controle de registros e retenção (POP-GQ-009-02)', como: 'Lista "Todos os CAPAs" (Controle de CAPA) e geração de PDF para arquivamento físico', mecanismo: 'Registro' },
    ],
  },
];

function flatItens() {
  return CONCORDANCIA.flatMap(p => p.itens);
}

function resumo() {
  const all = flatItens();
  return {
    total:   all.length,
    gates:   all.filter(i => i.mecanismo === 'Gate').length,
    auto:    all.filter(i => i.mecanismo === 'Automático').length,
    parcial: all.filter(i => i.obs).length,
  };
}

function pill(mec) {
  const m = MECANISMOS[mec] ?? { pill: 'pill-gray' };
  return `<span class="pill ${m.pill}" style="font-size:0.62rem" title="${m.desc}">${mec}</span>`;
}

function kpiCard(valor, label, cor) {
  return `<div style="flex:1;min-width:120px;padding:14px;border:1px solid var(--border);border-top:3px solid ${cor};border-radius:10px;background:var(--surface);text-align:center">
    <div style="font-size:1.6rem;font-weight:700;color:${cor}">${valor}</div>
    <div style="font-size:0.74rem;color:var(--muted);margin-top:2px;line-height:1.3">${label}</div>
  </div>`;
}

function renderPopCard(p) {
  return `<div class="card" style="margin-bottom:18px">
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <div>
        <div style="font-weight:700;font-size:1rem">${p.pop} — ${p.titulo}</div>
        <div style="font-size:0.74rem;color:var(--muted);margin-top:2px">${p.rev} · ${p.itens.length} cláusulas mapeadas</div>
      </div>
      <button class="btn btn-secondary btn-sm" data-goto="${p.rota}">Abrir módulo →</button>
    </div>
    <div class="table-wrap"><table>
      <thead><tr>
        <th style="white-space:nowrap">Cláusula</th>
        <th>Requisito do procedimento</th>
        <th>Como o sistema cumpre</th>
        <th style="white-space:nowrap">Mecanismo</th>
      </tr></thead>
      <tbody>
        ${p.itens.map(i => `<tr style="${i.destaque ? 'background:color-mix(in srgb, var(--red) 5%, transparent)' : ''}">
          <td style="white-space:nowrap;font-weight:600">${i.clausula}</td>
          <td style="font-size:0.82rem">${i.requisito}</td>
          <td style="font-size:0.82rem">${i.destaque ? '🔒 ' : ''}${i.como}${i.obs ? `<div style="font-size:0.72rem;color:var(--amber,#b45309);margin-top:3px">◑ ${i.obs}</div>` : ''}</td>
          <td>${pill(i.mecanismo)}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  </div>`;
}

function buildPrintHtml() {
  const cfg = db.getConfig();
  const esc = s => String(s ?? '').replace(/</g, '&lt;');
  const secoes = CONCORDANCIA.map(p => `
    <h2>${p.pop} — ${esc(p.titulo)} <span style="font-weight:400;font-size:9px;color:#666">(${p.rev})</span></h2>
    <table>
      <thead><tr><th>Cláusula</th><th>Requisito do procedimento</th><th>Como o sistema cumpre</th><th>Mecanismo</th></tr></thead>
      <tbody>${p.itens.map(i => `<tr>
        <td>${esc(i.clausula)}</td><td>${esc(i.requisito)}</td>
        <td>${esc(i.como)}${i.obs ? ' — ' + esc(i.obs) : ''}</td><td>${esc(i.mecanismo)}</td>
      </tr>`).join('')}</tbody>
    </table>`).join('');
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Relatório de Conformidade — POP × Sistema</title>
    <style>
      @page { size: A4 landscape; margin: 14mm; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 10px; color: #111; margin: 0; }
      header { display:flex; justify-content:space-between; border-bottom:2px solid #111; padding-bottom:8px; margin-bottom:14px; }
      header h1 { font-size:15px; margin:0; } .meta { text-align:right; font-size:10px; color:#444; }
      h2 { font-size:11px; background:#f1f5f9; border-left:4px solid #2d5be3; padding:4px 8px; margin:16px 0 6px; }
      table { width:100%; border-collapse:collapse; margin-bottom:6px; }
      th,td { border:1px solid #999; padding:4px 6px; text-align:left; font-size:9px; vertical-align:top; }
      th { background:#f1f5f9; }
    </style></head><body>
    <header>
      <div><h1>${esc(cfg.empresa) || 'MSB Medical System do Brasil'}</h1>
        <div style="font-size:10px;color:#444">CNPJ: ${esc(cfg.cnpj) || '—'} · AFE: ${esc(cfg.afe) || '—'}</div></div>
      <div class="meta"><strong>Relatório de Conformidade — Procedimentos × Sistema</strong><br>
        Evidência de aderência (RDC 665 / ISO 13485 / CFR Part 11)<br>
        Emitido em ${new Date().toLocaleString('pt-BR')}</div>
    </header>
    ${secoes}
  </body></html>`;
}

export default {
  render(container) {
    const r = resumo();
    container.innerHTML = `
      <div class="page-header">
        <h2>Conformidade com Procedimentos</h2>
        <button class="btn btn-secondary" data-action="print-conformidade">🖨 Gerar Relatório (PDF)</button>
      </div>

      <div class="card" style="margin-bottom:16px;border-left:4px solid var(--blue)">
        <div style="font-size:0.9rem;line-height:1.55">
          <strong>Concordância rastreável com os procedimentos.</strong>
          Cada regra do sistema declara <strong>qual cláusula do POP</strong> ela cumpre e por qual <strong>mecanismo</strong>.
          É a evidência viva de que o SGQ opera em aderência aos procedimentos vigentes — base para a validação do sistema
          (P-SQ-012) e para auditorias (RDC 665 / ISO 13485).
        </div>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">
        ${kpiCard(r.total, 'Cláusulas mapeadas', 'var(--blue)')}
        ${kpiCard(r.gates, 'Travas automáticas (gates)', 'var(--red)')}
        ${kpiCard(r.auto, 'Cálculos/numeração automáticos', 'var(--purple,#9333ea)')}
        ${kpiCard(CONCORDANCIA.length, 'Procedimentos cobertos', 'var(--green)')}
      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;align-items:center">
        <span style="font-size:0.74rem;color:var(--muted);font-weight:600">Mecanismos:</span>
        ${Object.keys(MECANISMOS).map(m => pill(m)).join(' ')}
      </div>

      ${CONCORDANCIA.map(renderPopCard).join('')}

      <div style="font-size:0.74rem;color:var(--muted);margin-top:6px">
        🔒 destaca as travas de conformidade (gates). ◑ indica cumprimento parcial com melhoria prevista.
        Próximos procedimentos a mapear: POP-GQ-010 (Reclamações), POP-GQ-006 (Controle de Mudanças), POP-GQ-007 (Auditorias).
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', async e => {
      const goto = e.target.closest('[data-goto]');
      if (goto) {
        const m = await import('../app.js');
        m.router.navigate(goto.dataset.goto);
        return;
      }
      if (e.target.closest('[data-action="print-conformidade"]')) {
        const win = window.open('', '_blank');
        if (!win) return;
        win.document.open();
        win.document.write(buildPrintHtml());
        win.document.close();
        const doPrint = () => { try { win.focus(); win.print(); } catch { /* noop */ } };
        win.addEventListener('load', doPrint);
        setTimeout(doPrint, 400);
      }
    });
    // Evita variável não usada em lint: getSession disponível para futuras regras por perfil.
    void getSession;
  },
};
