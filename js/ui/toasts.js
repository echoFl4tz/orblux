/* =========================================================
   Toasts — notificações (conquistas, missões, recorde)
   Ícones vêm do sprite SVG do index.html (ex.: 'ic-trophy')
   ========================================================= */

let container = null;

export function initToasts() {
  container = document.getElementById('toasts');
}

/**
 * @param {{icon?:string, title:string, desc?:string}} t
 * icon = id do symbol no sprite SVG (padrão: medalha)
 */
export function showToast({ icon = 'ic-medal', title, desc = '' }) {
  if (!container) return;
  // fim de jogo: no máximo 1 toast por vez (nunca cobrir o painel)
  if (document.body?.dataset?.screen === 'gameover' && container.children.length >= 1) return;
  const div = document.createElement('div');
  div.className = 'toast';
  div.innerHTML = `
    <svg class="ic" aria-hidden="true"><use href="#${icon}"/></svg>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      ${desc ? `<div class="toast-desc">${desc}</div>` : ''}
    </div>
    <span class="toast-bar"></span>`;
  container.appendChild(div);

  // no máximo 3 toasts na tela
  while (container.children.length > 3) container.removeChild(container.firstChild);

  setTimeout(() => {
    div.classList.add('leaving');
    setTimeout(() => div.remove(), 400);
  }, 3200);
}

/**
 * Limita a pilha de toasts (mantém os mais recentes).
 * Usado ao abrir telas sensíveis: no fim de jogo, no máximo 1.
 * @param {number} max
 */
export function trimToasts(max = 1) {
  if (!container) return;
  while (container.children.length > max) container.removeChild(container.firstChild);
}

/** Remove TODOS os toasts na hora (usado ao voltar ao menu). */
export function clearToasts() {
  if (!container) return;
  container.innerHTML = '';
}
