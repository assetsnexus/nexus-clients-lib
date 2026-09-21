import type { InjectedFunctionSchema } from './types.js';

export const PAGE_TOOL_PREFIX = 'anx.page.';

export const GENERIC_PAGE_TOOL_SCHEMAS: InjectedFunctionSchema[] = [
  {
    name: 'anx.page.search',
    description:
      'Search portal pages (menu ∪ route-only editors). Returns paths, titles, onboarding links when access is missing.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Free-text page query' },
        limit: { type: 'number', description: 'Max hits (default 10)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'anx.page.resolve',
    description: 'Resolve access for a path: allowed, missing permissions, onboarding wizard URL.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
      },
      required: ['path'],
    },
  },
  {
    name: 'anx.page.navigate',
    description:
      'Navigate the host UI to a path. Prefer ask_user_choice with [Open now] / [Just the link] first unless session auto-nav is on. Set pingAfterArrive (default true) so the parent gets a fresh page pointer after redirect.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        pingAfterArrive: { type: 'boolean' },
      },
      required: ['path'],
    },
  },
  {
    name: 'anx.page.understand',
    description:
      'Load instructions, command↔UI map, conceptIds, and extra tools for the CURRENT page. Call before guiding or editing. Result is a tool payload — not standing prompt.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'anx.page.validate',
    description: 'Run the current page form/entity validation without persisting. Returns field errors.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'anx.page.outline',
    description: 'Return headings, CTAs, landmarks, and registered fields on the current page.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'anx.page.highlight',
    description: 'Spotlight a control by id, label, action, selector, or section.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        label: { type: 'string' },
        action: { type: 'string' },
        selector: { type: 'string' },
        section: { type: 'string' },
      },
      required: [],
    },
  },
  {
    name: 'anx.page.forms.describe',
    description: 'Describe form structure on the current page (no secret values).',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'anx.page.forms.read_current_values',
    description: 'Read non-secret current field values (user should approve).',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'anx.page.forms.update_field',
    description: 'Update one field by id (preview). Highlights the field; supports revert.',
    parameters: {
      type: 'object',
      properties: {
        fieldId: { type: 'string' },
        value: { description: 'New value' },
        reason: { type: 'string' },
      },
      required: ['fieldId', 'value'],
    },
  },
  {
    name: 'anx.page.forms.revert_all',
    description: 'Revert all pending page-agent field/command previews on this page.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'anx.page.model3d.read',
    description:
      'Read LLM-editable 3D text (URDF / glTF JSON / OBJ) from a registered model3d field or live editor content.',
    parameters: {
      type: 'object',
      properties: {
        fieldPath: { type: 'string', description: 'Registered fieldPath (e.g. vr_digital_twin.model)' },
        pageFieldId: { type: 'string' },
        maxChars: { type: 'number' },
      },
      required: [],
    },
  },
  {
    name: 'anx.page.model3d.apply',
    description:
      'Apply URDF/glTF JSON text into the live 3D editor as a preview (does not persist). Prefer anx.entity.field.set-file with a real fileId for durable bind.',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Full model text (URDF XML or glTF JSON)' },
        format: { type: 'string', enum: ['urdf', 'gltf', 'obj', 'usda', 'stl'] },
        fieldPath: { type: 'string' },
        pageFieldId: { type: 'string' },
        fileId: {
          type: 'string',
          description: 'Optional region FileRecord id — when set, preview uses real file ref (not placeholders)',
        },
      },
      required: ['content'],
    },
  },
];

export function isPageTool(name: string): boolean {
  return typeof name === 'string' && name.startsWith(PAGE_TOOL_PREFIX);
}

export function isGenericPageTool(name: string): boolean {
  return GENERIC_PAGE_TOOL_SCHEMAS.some((s) => s.name === name);
}
