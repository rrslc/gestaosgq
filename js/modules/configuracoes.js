/**
 * @fileoverview Módulo Configurações da Empresa.
 */

import { db } from '../db.js';
import { toast } from '../toast.js';

export default {
  render(container) {
    const cfg = db.getConfig();

    container.innerHTML = `
      <div class="page-header">
        <h2>Configurações da Empresa</h2>
      </div>
      <div class="card" style="max-width:680px">
        <div class="card-header">
          <h3>Dados da Empresa</h3>
        </div>
        <div class="card-body">
          <div class="form-grid" id="config-form">
            <div class="form-group span-2">
              <label for="cfg-empresa">Razão Social <span style="color:var(--red)">*</span></label>
              <input type="text" id="cfg-empresa" value="${cfg.empresa || ''}">
            </div>
            <div class="form-group">
              <label for="cfg-cnpj">CNPJ</label>
              <input type="text" id="cfg-cnpj" value="${cfg.cnpj || ''}">
            </div>
            <div class="form-group">
              <label for="cfg-afe">AFE</label>
              <input type="text" id="cfg-afe" value="${cfg.afe || ''}">
            </div>
            <div class="form-group span-2">
              <label for="cfg-classes">Classes de Produtos</label>
              <input type="text" id="cfg-classes" value="${cfg.classes || ''}">
            </div>
            <div class="form-group span-2">
              <label for="cfg-obs">Observações</label>
              <textarea id="cfg-obs" rows="4">${cfg.obs || ''}</textarea>
            </div>
          </div>
          <div style="margin-top:16px;display:flex;gap:10px">
            <button class="btn btn-primary" data-action="save-config">Salvar Configurações</button>
          </div>
        </div>
      </div>
    `;
  },

  init(container) {
    container.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;

      if (btn.dataset.action === 'save-config') {
        const empresa = container.querySelector('#cfg-empresa')?.value?.trim();
        if (!empresa) {
          toast('Razão Social é obrigatória.', 'error');
          return;
        }
        db.setConfig({
          empresa,
          cnpj: container.querySelector('#cfg-cnpj')?.value?.trim() || '',
          afe: container.querySelector('#cfg-afe')?.value?.trim() || '',
          classes: container.querySelector('#cfg-classes')?.value?.trim() || '',
          obs: container.querySelector('#cfg-obs')?.value?.trim() || '',
        });
        toast('Configurações salvas com sucesso!');
      }
    });
  },
};
