/* =========================================================
   Toasts — notificações (conquistas, missões, recorde)
   ========================================================= */

let container = null;

export function initToasts() {
  container = document.getElementById('toasts');
}

/** @param {{icon?:string, title:string, desc?:string}} t */
export function showToast({ icon = '🎖️', title, desc = '' }) {
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'toast';
  div.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div>
      <div class="toast-title">${title}</div>
      ${desc ? `<div class="toast-desc">${desc}</div>` : ''}
    </div>`;
  container.appendChild(div);

  // no máximo 3 toasts na tela
  while (container.children.length > 3) container.removeChild(container.firstChild);

  setTimeout(() => {
    div.classList.add('leaving');
    setTimeout(() => div.remove(), 400);
  }, 3200);
}
