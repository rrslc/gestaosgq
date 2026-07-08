/**
 * @fileoverview Roteador baseado em hash para SPA de módulo único.
 */

import { closeAllModals } from './modal.js';

class Router {
  /** @type {Object} */
  #routes;
  /** @type {string|null} */
  #current = null;
  /** @type {HTMLElement} */
  #container;
  /** @type {HTMLElement} */
  #titleEl;

  /**
   * @param {Object} routes — { [name]: { module, title, icon } }
   */
  constructor(routes) {
    this.#routes = routes;
    this.#container = document.getElementById('content');
    this.#titleEl = document.getElementById('topbar-title');

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash.replace('#', '') || 'dashboard';
      this.navigate(hash);
    });
  }

  /**
   * Navega para uma rota pelo nome.
   * @param {string} routeName
   */
  navigate(routeName) {
    const route = this.#routes[routeName];
    if (!route) {
      console.warn(`[Router] Rota desconhecida: ${routeName}`);
      return;
    }

    this.#current = routeName;
    window.location.hash = routeName;

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.route === routeName);
    });

    // Update topbar title
    if (this.#titleEl) {
      this.#titleEl.textContent = route.title;
    }

    // Fechar todos os modais antes de trocar de rota
    closeAllModals();

    // Render and init module
    this.#container.innerHTML = '';
    this.#container.classList.remove('fade-in');
    // Force reflow
    void this.#container.offsetWidth;
    this.#container.classList.add('fade-in');

    try {
      route.module.render(this.#container);
      route.module.init(this.#container);
    } catch (e) {
      console.error(`[Router] Erro ao renderizar "${routeName}":`, e);
      this.#container.innerHTML = `
        <div class="empty-state">
          <span class="empty-icon">⚠</span>
          <p>Erro ao carregar o módulo. Consulte o console.</p>
        </div>
      `;
    }
  }

  /**
   * Atualiza o badge numérico de um item de navegação.
   * @param {string} routeName
   * @param {number} count
   */
  updateBadge(routeName, count) {
    const navItem = document.querySelector(`.nav-item[data-route="${routeName}"]`);
    if (!navItem) return;

    let badge = navItem.querySelector('.nav-badge');
    if (count > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'nav-badge';
        navItem.appendChild(badge);
      }
      badge.textContent = count;
    } else {
      badge?.remove();
    }
  }

  /** @returns {string|null} */
  get current() {
    return this.#current;
  }
}

export { Router };
