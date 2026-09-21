const FIELD_ATTR = 'data-anx-ai-field';
const FIELD_ID_ATTR = 'data-anx-ai-field-id';
const ACTION_ATTR = 'data-anx-ai-action';
const COMMAND_ATTR = 'data-anx-ai-command';
const SECTION_ATTR = 'data-anx-ai-section';

const MAX_TEXT = 160;

export function safeText(value: unknown, max = MAX_TEXT): string {
  const s = value == null ? '' : String(value);
  return s.length > max ? `${s.slice(0, max)}...` : s;
}

export function cssEscape(value: string): string {
  if (typeof window !== 'undefined' && window.CSS?.escape) {
    return window.CSS.escape(value);
  }
  return String(value).replace(/["\\]/g, '\\$&');
}

export function isReadableInput(el: Element): boolean {
  const html = el as HTMLInputElement;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if ((el as HTMLElement).isContentEditable) return true;
  if (tag !== 'input') return false;
  const type = (html.getAttribute('type') || 'text').toLowerCase();
  return !['button', 'submit', 'reset', 'image', 'file', 'password', 'hidden'].includes(type);
}

export function isValueSafeToShare(el: Element): boolean {
  const tag = (el.tagName || '').toLowerCase();
  const type = ((el as HTMLInputElement).getAttribute('type') || '').toLowerCase();
  if (tag === 'input' && ['file', 'image', 'password'].includes(type)) return false;
  return true;
}

export function fieldLabel(el: Element): string {
  const html = el as HTMLInputElement;
  if (html.id) {
    const label = document.querySelector(`label[for="${cssEscape(html.id)}"]`);
    if (label?.textContent) return safeText(label.textContent.trim());
  }
  const wrapperLabel = el.closest('label');
  if (wrapperLabel?.textContent) return safeText(wrapperLabel.textContent.trim());
  return (
    html.getAttribute('aria-label') ||
    html.getAttribute('placeholder') ||
    html.getAttribute('name') ||
    html.id ||
    html.getAttribute(FIELD_ATTR) ||
    ''
  );
}

export function getFieldValue(el: Element): unknown {
  if (!isValueSafeToShare(el)) return undefined;
  const html = el as HTMLInputElement;
  if (html.isContentEditable) return html.textContent || '';
  const tag = (el.tagName || '').toLowerCase();
  const type = (html.getAttribute('type') || '').toLowerCase();
  if (type === 'checkbox' || type === 'radio') return !!html.checked;
  if (tag === 'select' && (html as unknown as HTMLSelectElement).multiple) {
    return Array.from((html as unknown as HTMLSelectElement).selectedOptions || []).map((o) => o.value);
  }
  return html.value;
}

export function setFieldValue(el: Element, value: unknown): unknown {
  const oldValue = getFieldValue(el);
  const html = el as HTMLInputElement;
  if (html.isContentEditable) {
    html.textContent = value == null ? '' : String(value);
  } else {
    const tag = (el.tagName || '').toLowerCase();
    const type = (html.getAttribute('type') || '').toLowerCase();
    if (type === 'checkbox' || type === 'radio') {
      html.checked = !!value;
    } else if (tag === 'select' && (html as unknown as HTMLSelectElement).multiple && Array.isArray(value)) {
      Array.from((html as unknown as HTMLSelectElement).options || []).forEach((option) => {
        option.selected = value.includes(option.value);
      });
    } else {
      html.value = value == null ? '' : String(value);
    }
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return oldValue;
}

export function findByAttr(attr: string, value: string): Element | null {
  if (!value || typeof document === 'undefined') return null;
  return document.querySelector(`[${attr}="${cssEscape(value)}"]`);
}

export function findHighlightTarget(args: {
  id?: string;
  label?: string;
  action?: string;
  selector?: string;
  section?: string;
}): Element | null {
  if (args.selector) {
    try {
      return document.querySelector(args.selector);
    } catch {
      /* ignore */
    }
  }
  if (args.id) {
    return (
      findByAttr(FIELD_ID_ATTR, args.id) ||
      findByAttr(FIELD_ATTR, args.id) ||
      document.getElementById(args.id)
    );
  }
  if (args.section) {
    return findByAttr(SECTION_ATTR, args.section);
  }
  if (args.action) {
    const byAction = findByAttr(ACTION_ATTR, args.action);
    if (byAction) return byAction;
  }
  const needle = (args.label || args.action || '').toLowerCase().trim();
  if (!needle) return null;
  const candidates = Array.from(
    document.querySelectorAll('button, a, [role="button"], [data-anx-ai-action], h1, h2, h3, h4, label'),
  );
  for (const el of candidates) {
    const text = (el.textContent || el.getAttribute('aria-label') || '').toLowerCase().trim();
    if (text.includes(needle)) return el;
  }
  return null;
}

export {
  FIELD_ATTR,
  FIELD_ID_ATTR,
  ACTION_ATTR,
  COMMAND_ATTR,
  SECTION_ATTR,
};
