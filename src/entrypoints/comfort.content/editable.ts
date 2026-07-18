const EDITABLE_FORM_SELECTOR = 'input, textarea, select, option';

export function isEditableElement(element: Element): boolean {
  if (document.designMode === 'on') return true;
  if (element.matches(EDITABLE_FORM_SELECTOR)) return true;

  let current: Element | null = element;
  while (current) {
    const contentEditable = current.getAttribute('contenteditable');
    if (contentEditable === 'false') return false;
    if (
      contentEditable === '' ||
      contentEditable === 'true' ||
      contentEditable === 'plaintext-only'
    ) {
      return true;
    }

    current = current.parentElement;
  }

  return element instanceof HTMLElement && element.isContentEditable;
}

