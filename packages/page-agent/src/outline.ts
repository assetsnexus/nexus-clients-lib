import {
  ACTION_ATTR,
  COMMAND_ATTR,
  FIELD_ATTR,
  FIELD_ID_ATTR,
  SECTION_ATTR,
  fieldLabel,
  getFieldValue,
  isReadableInput,
  isValueSafeToShare,
  safeText,
} from './dom.js';
import type { FieldKind, OutlineLandmark, PageFormDescribe, PageFormField } from './types.js';

const FIELD_KIND_ATTR = 'data-anx-ai-field-kind';
const FILE_ID_ATTR = 'data-anx-ai-file-id';
const FORMAT_ATTR = 'data-anx-ai-format';

const MEDIA_KINDS = new Set<FieldKind>(['image', 'pdf', 'model3d']);

function readMediaMeta(el: Element): {
  fieldKind?: FieldKind;
  fileId?: string | null;
  format?: string | null;
} {
  const kindRaw = (el.getAttribute(FIELD_KIND_ATTR) || '').trim().toLowerCase();
  const fieldKind = MEDIA_KINDS.has(kindRaw as FieldKind)
    ? (kindRaw as FieldKind)
    : kindRaw === 'model_3d'
      ? 'model3d'
      : undefined;
  const fileId = el.getAttribute(FILE_ID_ATTR);
  const format = el.getAttribute(FORMAT_ATTR);
  return {
    fieldKind,
    fileId: fileId && fileId.trim() ? fileId.trim() : fileId === '' ? null : undefined,
    format: format && format.trim() ? format.trim() : undefined,
  };
}

export function collectOutline(): { landmarks: OutlineLandmark[]; path: string } {
  const landmarks: OutlineLandmark[] = [];
  let i = 0;

  document.querySelectorAll('[data-anx-ai-section]').forEach((el) => {
    const id = el.getAttribute(SECTION_ATTR) || `section-${++i}`;
    landmarks.push({
      id,
      kind: 'section',
      label: safeText(el.getAttribute('aria-label') || el.getAttribute('title') || id),
      selector: `[${SECTION_ATTR}="${id}"]`,
    });
  });

  document.querySelectorAll('h1, h2, h3').forEach((el) => {
    const label = safeText((el.textContent || '').trim());
    if (!label) return;
    landmarks.push({
      id: el.id || `h-${++i}`,
      kind: 'heading',
      label,
      selector: el.id ? `#${el.id}` : undefined,
    });
  });

  document.querySelectorAll(`[${ACTION_ATTR}], button, a.btn, [role="button"]`).forEach((el) => {
    const action = el.getAttribute(ACTION_ATTR);
    const label = safeText(action || (el.textContent || '').trim() || el.getAttribute('aria-label') || '');
    if (!label || label.length > 80) return;
    landmarks.push({
      id: el.id || action || `cta-${++i}`,
      kind: 'cta',
      label,
      selector: action ? `[${ACTION_ATTR}="${action}"]` : el.id ? `#${el.id}` : undefined,
    });
  });

  document.querySelectorAll(`[${FIELD_ATTR}], [${FIELD_ID_ATTR}]`).forEach((el) => {
    const id = el.getAttribute(FIELD_ID_ATTR) || el.getAttribute(FIELD_ATTR) || `field-${++i}`;
    const media = readMediaMeta(el);
    landmarks.push({
      id,
      kind: 'field',
      label: fieldLabel(el) || id,
      selector: `[${FIELD_ID_ATTR}="${id}"], [${FIELD_ATTR}="${id}"]`,
      fieldPath: el.getAttribute(FIELD_ATTR) || undefined,
      ...media,
    });
  });

  // Cap for token safety
  return {
    landmarks: landmarks.slice(0, 80),
    path: typeof location !== 'undefined' ? location.pathname + location.search : '',
  };
}

export function collectForms(includeValues: boolean): PageFormDescribe[] {
  const forms = Array.from(document.querySelectorAll('form')).map((formEl, formIndex) => {
    const formId =
      formEl.getAttribute('data-anx-ai-form-id') ||
      formEl.id ||
      formEl.getAttribute('name') ||
      `form-${formIndex + 1}`;
    formEl.setAttribute('data-anx-ai-form-id', formId);
    const fields = collectFieldsIn(formEl, formId, includeValues);
    return {
      id: formId,
      title:
        formEl.getAttribute('aria-label') ||
        formEl.id ||
        formEl.getAttribute('name') ||
        `Form ${formIndex + 1}`,
      fields,
    };
  }).filter((f) => f.fields.length > 0);

  const inForms = new Set(
    Array.from(document.querySelectorAll('form input, form textarea, form select, form [contenteditable="true"]')),
  );
  const loose = Array.from(
    document.querySelectorAll('input, textarea, select, [contenteditable="true"], [data-anx-ai-field]'),
  ).filter((el) => !inForms.has(el) && (isReadableInput(el) || el.hasAttribute(FIELD_ATTR)));

  if (loose.length) {
    forms.push({
      id: 'page-fields',
      title: 'Page fields',
      fields: loose.map((el, idx) => toField(el, 'page-fields', idx, includeValues)),
    });
  }
  return forms;
}

function collectFieldsIn(root: Element, formId: string, includeValues: boolean): PageFormField[] {
  return Array.from(root.querySelectorAll('input, textarea, select, [contenteditable="true"], [data-anx-ai-field]'))
    .filter((el) => isReadableInput(el) || el.hasAttribute(FIELD_ATTR))
    .map((el, idx) => toField(el, formId, idx, includeValues));
}

function toField(el: Element, formId: string, idx: number, includeValues: boolean): PageFormField {
  const existing = el.getAttribute(FIELD_ID_ATTR) || el.getAttribute(FIELD_ATTR);
  const id = existing || `${formId}.${(el as HTMLInputElement).id || (el as HTMLInputElement).name || `field-${idx + 1}`}`;
  el.setAttribute(FIELD_ID_ATTR, id);
  const html = el as HTMLInputElement;
  const tag = (el.tagName || '').toLowerCase();
  const type = html.isContentEditable ? 'contenteditable' : html.getAttribute('type') || tag;
  const media = readMediaMeta(el);
  const field: PageFormField = {
    id,
    formId,
    label: fieldLabel(el),
    type,
    required: !!html.required,
    disabled: !!html.disabled,
    readOnly: !!html.readOnly,
    valueAvailable: isValueSafeToShare(el),
    fieldPath: el.getAttribute(FIELD_ATTR) || undefined,
    ...media,
  };
  const cmd = el.getAttribute(COMMAND_ATTR);
  if (cmd) (field as PageFormField & { command?: string }).command = cmd;
  if (includeValues && field.valueAvailable) field.value = getFieldValue(el);
  return field;
}
