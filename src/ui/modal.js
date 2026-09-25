/**
 * Ein einzelner Modal-Container, der nacheinander unterschiedliche
 * Inhalte aufnimmt. Schliessen per Escape, Klick auf den Schleier
 * oder Schliessknopf.
 */

const root = document.getElementById('modal-root');
let onCloseHook = null;

function el(tag, className, html) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
}

export function closeModal() {
  root.hidden = true;
  root.replaceChildren();
  const hook = onCloseHook;
  onCloseHook = null;
  hook?.();
}

/**
 * @param {{title:string, subtitle?:string, body:Node|string,
 *          footer?:Node|null, onClose?:Function, wide?:boolean}} options
 */
export function openModal({ title, subtitle = '', body, footer = null, onClose = null, wide = false }) {
  onCloseHook = onClose;
  root.replaceChildren();

  const modal = el('div', 'modal');
  if (wide) modal.style.width = 'min(920px, 100%)';

  const head = el('div', 'modal-head');
  const heading = el('div');
  // Titel stammen oft aus Rezeptdaten, also als Text setzen, nie als Markup.
  heading.append(Object.assign(el('h2'), { textContent: title }));
  if (subtitle) heading.append(Object.assign(el('div', 'sub'), { textContent: subtitle }));

  const close = el('button', 'icon-btn', '&times;');
  close.setAttribute('aria-label', 'Schließen');
  close.addEventListener('click', closeModal);

  head.append(heading, close);

  const bodyNode = el('div', 'modal-body');
  if (typeof body === 'string') bodyNode.innerHTML = body;
  else bodyNode.append(body);

  modal.append(head, bodyNode);

  if (footer) {
    const foot = el('div', 'modal-foot');
    if (typeof footer === 'string') foot.innerHTML = footer;
    else foot.append(footer);
    modal.append(foot);
  }

  root.append(modal);
  root.hidden = false;
  close.focus();
  return { modal, body: bodyNode };
}

root.addEventListener('click', (e) => {
  if (e.target === root) closeModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !root.hidden) closeModal();
});

export { el };
