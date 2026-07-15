import { db } from '../db.js';
import { formatDate, statusPill, emptyState } from '../utils.js';

const AREAS_TOTAL = 9;
const CLOSED = ['Concluída', 'Cancelada'];

const PIPELINE_STEPS = [
  { key: 'Planejada',   label: 'Planejada',   color: 'var(--blue)'  },
  { key: 'Em Execução', label: 'Em Execução', color: 'var(--amber)' },
  { key: 'Concluída',   label: 'Concluída',   color: 'var(--green)' },
];

let _router = null;
async function getRouter() {
  if (!_router) { const m = await import('../app.js'); _router = m.router; }
  return _router;
}

function kpiCard(value, label, color, highlight) {
  return `<div style="padding:12px;background:var(--surface);border:1px solid ${highlight ? color : 'var(--border)'};border-left:3px solid ${color};border-radius:8px;text-align:center">
    <div style="font-size:1.6rem;font-weight:700;color:${color};line-height:1.1">${value}</div>
    <div style="font-size:0.71rem;color:var(--muted);margin-top:4px">${label}</div>
  </div>`;
}

function renderPipelineBar(items) {
  const counts = {};
  PIPELINE_STEPS.forEach(p => { counts[p.key] = 0; });
  items.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++; });

  return `
    <div style="display:flex;gap:0;margin-bottom:20px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">
      ${PIPELINE_STEPS.map((p, i) => `
        <div style="flex:1;padding:12px 8px;text-align:center;background:var(--surface);${i > 0 ? 'border-left:1px solid var(--border)' : ''}">
          <div style="font-size:1.4rem;font-weight:700;color:${p.color}">${counts[p.key]}</div>
          <div style="font-size:0.72rem;color:var(--muted);margin-top:2px;line-height:1.3">${p.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderContent() {
  const anoAtual = new Date().getFullYear();
  const all      = db.get('auditorias');

  const doAno = all.filter(r => {
    const data = r.dataPrevisao || r.dataReal || '';
    return data.startsWith(String(anoAtual));
  });

  const kpis = {
    total:      doAno.length,
    realizadas: doAno.filter(r => r.status === 'Concluída').length,
    andamento:  doAno.filter(r => r.status === 'Em Execução').length,
    comNC:      doAno.filter(r => (r.tipoAchado || '').includes('Não-Conformidades')).length,
  };

  const areasAuditadas = new Set(
    doAno.filter(r => r.status !== 'Cancelada').map(r => r.area).filter(Boolean)
  );
  const coberturaPct = Math.round((areasAuditadas.size / AREAS_TOTAL) * 100);

  const abertas = all.filter(r => !CLOSED.includes(r.status));

  return `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
      ${kpiCard(kpis.total,      'Planejadas no Ano',       'var(--blue)')}
      ${kpiCard(kpis.realizadas, 'Realizadas',              'var(--green)')}
      ${kpiCard(kpis.andamento,  'Em Andamento',            'var(--amber)')}
      ${kpiCard(kpis.comNC,      'Com Não-Conformidades',   'var(--red)', kpis.comNC > 0)}
    </div>

    <div class="card" style="margin-bottom:16px">
      <div style="font-weight:600;font-size:0.9rem;margin-bottom:12px">Cobertura por Área — ${anoAtual}</div>
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
        <div style="flex:1;height:10px;border-radius:5px;background:var(--border);overflow:hidden">
          <div style="height:100%;width:${coberturaPct}%;background:var(--blue);border-radius:5px"></div>
        </div>
        <span style="font-size:0.82rem;color:var(--muted);white-space:nowrap">${areasAuditadas.size} de ${AREAS_TOTAL} áreas auditadas em ${anoAtual}</span>
      </div>
      ${areasAuditadas.size > 0 ? `<div style="font-size:0.75rem;color:var(--muted)">${[...areasAuditadas].join(' · ')}</div>` : ''}
    </div>

    ${renderPipelineBar(doAno)}

    <div class="card">
      <div style="font-weight:600;font-size:0.9rem;margin-bottom:14px">Acompanhamento — Em Aberto</div>
      ${abertas.length ? `
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(255px,1fr));gap:10px">
          ${abertas.map(r => {
            const idx  = PIPELINE_STEPS.findIndex(p => p.key === r.status);
            const step = idx >= 0 ? PIPELINE_STEPS[idx] : { label: r.status, color: 'var(--muted)' };
            return `<div style="border:1px solid var(--border);border-left:3px solid ${step.color};border-radius:8px;padding:11px 12px;background:var(--surface)">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
                <strong style="font-size:0.84rem">${r.numero}</strong>
                <span style="font-size:0.68rem;font-weight:600;color:${step.color}">${step.label}</span>
              </div>
              <div style="font-size:0.75rem;color:var(--muted);margin-bottom:4px">${r.area || '—'} · ${r.tipo || '—'}</div>
              <div style="font-size:0.75rem;color:var(--muted);margin-bottom:8px">Auditor: ${r.auditor || '—'}</div>
              <div style="display:flex;gap:1px;height:5px;border-radius:3px;overflow:hidden;margin-bottom:5px">
                ${PIPELINE_STEPS.map((p, i) => `<div style="flex:1;background:${i < idx ? 'var(--green)' : i === idx ? p.color : 'var(--border)'}" title="${p.label}"></div>`).join('')}
              </div>
              <div style="font-size:0.7rem;color:var(--muted)">Prevista: ${formatDate(r.dataPrevisao)}</div>
            </div>`;
          }).join('')}
        </div>
      ` : emptyState('Nenhuma auditoria em aberto.')}
    </div>
  `;
}

export default {
  render(container) {
    container.innerHTML = `
      <div class="page-header">
        <h2>Auditorias — Plano Anual</h2>
        <button class="btn btn-primary" data-action="nova-auditoria">+ Nova Auditoria</button>
      </div>
      <div id="aud-plano-content">${renderContent()}</div>
    `;
  },

  init(container) {
    container.addEventListener('click', async e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      if (btn.dataset.action === 'nova-auditoria') {
        const r = await getRouter();
        r.navigate('auditoriasExec');
      }
    });
  },
};
