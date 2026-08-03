/* Rabta — the Return Receipt's persistent fold state.
 *
 * Hover and focus-visible are pure CSS. This module only adds the sticky
 * click/touch state, so a scriptless page still folds on hover and focus and
 * still reads correctly at rest.
 */

/**
 * Keep the visual state and the announced state in one place. `data-folded`
 * drives `--fold-progress`; `aria-pressed` is the same fact for assistive
 * technology, never a decorative attribute left behind.
 */
export function setReceiptFolded(button, folded) {
  button.dataset.folded = String(folded);
  button.setAttribute("aria-pressed", String(folded));
}

export function initReceiptFolds(root = document) {
  const cleanups = [];

  root.querySelectorAll("[data-receipt-fold]").forEach((button) => {
    /* A native <button> already handles Space and Enter, so there is no
       keyboard branch here to drift out of sync with the pointer one. */
    const onClick = () => setReceiptFolded(button, button.dataset.folded !== "true");
    button.addEventListener("click", onClick);
    cleanups.push(() => button.removeEventListener("click", onClick));
  });

  return () => cleanups.forEach((cleanup) => cleanup());
}
