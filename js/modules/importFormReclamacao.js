/**
 * @fileoverview Importa uma Reclamação do formulário POP-GQ-010-02
 * (Controle de Ocorrência) preenchido. O mapa de células exige um exemplo
 * PREENCHIDO do formulário — o modelo em branco não permite localizar os
 * valores com segurança. Enquanto não houver o exemplo, o modal orienta o
 * usuário. Quando o formulário preenchido for fornecido, o parser é ativado
 * espelhando importFormRnc.js / importFormCapa.js.
 */

export function openImportFormReclamacaoModal(onDone) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'align-items:flex-start;padding:20px;overflow-y:auto';
  overlay.innerHTML = `
    <div class="modal-dialog" style="max-width:560px;width:100%;margin:auto">
      <div class="modal-header">
        <h3 style="margin:0;font-size:1rem">Importar Formulário de Reclamação</h3>
        <button class="modal-close" style="background:none;border:none;font-size:1.2rem;cursor:pointer;color:var(--muted)">✕</button>
      </div>
      <div class="modal-body">
        <div style="padding:8px 2px;font-size:0.85rem;line-height:1.55;color:var(--text)">
          O leitor do formulário <strong>POP-GQ-010-02 (Controle de Ocorrência)</strong> ainda
          precisa ser calibrado com um <strong>exemplo preenchido</strong> — o modelo em branco
          não permite localizar os valores com segurança.
          <div style="margin-top:12px;padding:10px 12px;background:rgba(86,164,187,0.1);border:1px solid rgba(86,164,187,0.3);border-radius:8px;font-size:0.82rem">
            Envie um <strong>.xlsx do formulário 010-02 preenchido</strong> (uma reclamação real
            ou fictícia) e o import é habilitado, extraindo número, notificante, produto,
            criticidade, investigação e conclusão — como já fizemos para RNC e CAPA.
          </div>
          <div style="margin-top:12px;color:var(--muted);font-size:0.8rem">
            Por enquanto, registre a reclamação manualmente em <strong>+ Nova Reclamação</strong>.
          </div>
        </div>
      </div>
      <div class="modal-footer" style="display:flex;justify-content:flex-end;gap:8px">
        <button class="btn btn-primary" id="imr-ok">Entendi</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('.modal-close').addEventListener('click', close);
  overlay.querySelector('#imr-ok').addEventListener('click', close);
}
