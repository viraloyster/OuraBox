// Minimalism without guessing: buttons show only their icon. If the mouse
// stays over one for a second, the button expands and says what it is.
//
// - `data-hint="Text"`: after a second the name appears, coming out of the
//   button (to the left with `data-hint-side="left"`).
// - `data-expand="id"`: after a second the panel with that id opens (the
//   colors, the width). A click opens or closes it right away, for people
//   who use a pen or a touch screen, where there is no "mouse over".
//   With `data-expand-on="click"` the panel only opens with a click; after
//   a second, the button only says what it is.

const DELAY_MS = 1000;
const CLOSE_MS = 350;

let timer = 0;
let target: HTMLElement | null = null;
let bubble: HTMLElement | null = null;
const closeTimers = new Map<string, number>();

export function setupHints(): void {
  document.addEventListener("pointerover", (e) => {
    if (e.pointerType === "touch") return;
    const element = (e.target as Element | null)?.closest<HTMLElement>("[data-hint], [data-expand]");
    if (element === target) return;
    if (element && target?.contains(element)) return;
    leave();
    if (!element) return;
    target = element;
    timer = window.setTimeout(() => {
      if (target !== element) return;
      if (element.dataset.expand && element.dataset.expandOn !== "click") openPanel(element);
      else showBubble(element);
    }, DELAY_MS);
  });
  document.addEventListener("pointerout", (e) => {
    if (!target) return;
    const to = e.relatedTarget as Node | null;
    if (to && target.contains(to)) return;
    leave();
  });
  // When something is touched, the name is no longer needed.
  document.addEventListener("pointerdown", () => hideBubble(), { capture: true });
  window.addEventListener("blur", () => leave());

  for (const button of document.querySelectorAll<HTMLElement>("[data-expand]")) {
    const panel = document.getElementById(button.dataset.expand!);
    if (!panel) continue;
    button.addEventListener("click", () => (panel.hidden ? openPanel(button) : closePanel(button)));
    // The panel stays open while the mouse is on the button or on the panel.
    for (const element of [button, panel]) {
      element.addEventListener("pointerenter", () => clearTimeout(closeTimers.get(panel.id)));
      element.addEventListener("pointerleave", (e) => {
        if (e.pointerType === "touch" || panel.hidden) return;
        clearTimeout(closeTimers.get(panel.id));
        closeTimers.set(panel.id, window.setTimeout(() => closePanel(button), CLOSE_MS));
      });
    }
  }
  // A click outside or Esc closes the panels.
  document.addEventListener("pointerdown", (e) => {
    for (const button of document.querySelectorAll<HTMLElement>("[data-expand]")) {
      const panel = document.getElementById(button.dataset.expand!);
      if (panel && !panel.hidden && !panel.contains(e.target as Node) && !button.contains(e.target as Node)) closePanel(button);
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    let closed = false;
    for (const button of document.querySelectorAll<HTMLElement>("[data-expand]")) closed = closePanel(button) || closed;
    // If it closed a panel, Escape does nothing else (for example, it doesn't leave drawing).
    if (closed) e.preventDefault();
  });
}

/** Closes every panel that opens on its own (for example, when changing modes). */
export function closePanels(): void {
  for (const button of document.querySelectorAll<HTMLElement>("[data-expand]")) closePanel(button);
}

function leave(): void {
  clearTimeout(timer);
  target = null;
  hideBubble();
}

function showBubble(element: HTMLElement): void {
  hideBubble();
  const label = element.dataset.hint;
  if (!label) return;
  const rect = element.getBoundingClientRect();
  const left = element.dataset.hintSide === "left";
  bubble = document.createElement("div");
  bubble.className = `hint-bubble ${left ? "left" : "right"}`;
  bubble.setAttribute("aria-hidden", "true");
  bubble.textContent = label;
  bubble.style.top = `${rect.top + rect.height / 2}px`;
  if (left) bubble.style.right = `${window.innerWidth - rect.left + 6}px`;
  else bubble.style.left = `${rect.right + 6}px`;
  document.body.appendChild(bubble);
  // If it goes off the screen on the right, it goes below the button.
  const box = bubble.getBoundingClientRect();
  if (box.right > window.innerWidth - 8) {
    bubble.className = "hint-bubble below";
    bubble.style.left = `${rect.left + rect.width / 2}px`;
    bubble.style.right = "";
    bubble.style.top = `${rect.bottom + 8}px`;
  }
}

function hideBubble(): void {
  bubble?.remove();
  bubble = null;
}

function openPanel(button: HTMLElement): void {
  const panel = document.getElementById(button.dataset.expand!);
  if (!panel) return;
  hideBubble();
  panel.hidden = false;
  button.setAttribute("aria-expanded", "true");
}

function closePanel(button: HTMLElement): boolean {
  const panel = document.getElementById(button.dataset.expand!);
  if (!panel || panel.hidden) return false;
  panel.hidden = true;
  button.setAttribute("aria-expanded", "false");
  return true;
}
