export class PermissionBatchValidationError extends Error {
  readonly code = 'VALIDATION';

  constructor(message: string) {
    super(message);
    this.name = 'PermissionBatchValidationError';
  }
}

export type PermissionResourceRef = { type: string; id: string };

export type PermissionBatchItem = {
  kind: 'command' | 'data_access';
  commandName?: string;
  dataDomain?: string;
  access?: 'read' | 'write';
  resourceRef?: PermissionResourceRef;
};

const MAX_ITEMS = 40;

function resourceRef(value: unknown): PermissionResourceRef | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const ref = value as { type?: unknown; id?: unknown };
  if (typeof ref.type !== 'string' || !ref.type.trim()) return undefined;
  if (typeof ref.id !== 'string' || !ref.id.trim()) return undefined;
  return { type: ref.type.trim(), id: ref.id.trim() };
}

export function normalizePermissionBatch(raw: PermissionBatchItem[]): PermissionBatchItem[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new PermissionBatchValidationError('items must be a non-empty array');
  }
  if (raw.length > MAX_ITEMS) {
    throw new PermissionBatchValidationError(`At most ${MAX_ITEMS} permission items are allowed`);
  }
  return raw.map((item, index) => {
    if (!item || (item.kind !== 'command' && item.kind !== 'data_access')) {
      throw new PermissionBatchValidationError(`items[${index}].kind must be command or data_access`);
    }
    const ref = resourceRef(item.resourceRef);
    if (item.kind === 'command') {
      const commandName = typeof item.commandName === 'string' ? item.commandName.trim() : '';
      if (!commandName || /\s/.test(commandName)) {
        throw new PermissionBatchValidationError(`items[${index}].commandName is required`);
      }
      return { kind: 'command' as const, commandName, ...(ref ? { resourceRef: ref } : {}) };
    }
    const dataDomain = typeof item.dataDomain === 'string' ? item.dataDomain.trim() : '';
    if (!dataDomain) {
      throw new PermissionBatchValidationError(`items[${index}].dataDomain is required`);
    }
    if (item.access !== 'read' && item.access !== 'write') {
      throw new PermissionBatchValidationError(`items[${index}].access must be read or write`);
    }
    return {
      kind: 'data_access' as const,
      dataDomain,
      access: item.access,
      ...(ref ? { resourceRef: ref } : {}),
    };
  });
}
