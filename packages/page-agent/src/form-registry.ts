import type { DiffEntry, FormRegistration, PageFormDescribe, PageValidateResult } from './types.js';

/**
 * In-memory form registry for mixin / page-pack adapters.
 * Applies payloads as preview; tracks diffs for revert-all.
 */
export class FormRegistry {
  private registrations: FormRegistration[] = [];
  private diffs: DiffEntry[] = [];

  register(reg: FormRegistration): () => void {
    this.registrations.push(reg);
    return () => {
      this.registrations = this.registrations.filter((r) => r !== reg);
    };
  }

  clear(): void {
    this.registrations = [];
    this.diffs = [];
  }

  listCommands(): string[] {
    const set = new Set<string>();
    for (const r of this.registrations) {
      for (const c of r.commands || []) set.add(c);
    }
    return [...set];
  }

  describe(): PageFormDescribe[] {
    const out: PageFormDescribe[] = [];
    for (const r of this.registrations) {
      if (!r.describe) continue;
      const d = r.describe();
      if (Array.isArray(d)) out.push(...d);
      else out.push(d);
    }
    return out;
  }

  /** Media binders declared on registrations (image|pdf|model3d) for outline. */
  listMediaFields(): Array<{
    fieldPath: string;
    fieldKind: import('./types.js').FieldKind;
    commands?: string[];
    fileId?: string | null;
    format?: string | null;
    label?: string;
    pageFieldId?: string;
  }> {
    const out: Array<{
      fieldPath: string;
      fieldKind: import('./types.js').FieldKind;
      commands?: string[];
      fileId?: string | null;
      format?: string | null;
      label?: string;
      pageFieldId?: string;
    }> = [];
    for (const r of this.registrations) {
      for (const f of r.fields || []) {
        if (f.fieldKind === 'image' || f.fieldKind === 'pdf' || f.fieldKind === 'model3d') {
          out.push({ ...f });
        }
      }
    }
    return out;
  }

  findMediaField(opts: {
    fieldPath?: string;
    pageFieldId?: string;
  }): {
    fieldPath: string;
    fieldKind: import('./types.js').FieldKind;
    commands?: string[];
    fileId?: string | null;
    format?: string | null;
    label?: string;
    pageFieldId?: string;
  } | undefined {
    const path = opts.fieldPath?.trim();
    const pageFieldId = opts.pageFieldId?.trim();
    for (const r of this.registrations) {
      for (const f of r.fields || []) {
        if (path && f.fieldPath === path) return f;
        if (pageFieldId && (f.pageFieldId === pageFieldId || f.fieldPath === pageFieldId)) {
          return f;
        }
      }
    }
    return undefined;
  }

  validate(): PageValidateResult {
    const errors: PageValidateResult['errors'] = [];
    for (const r of this.registrations) {
      if (!r.validate) continue;
      const v = r.validate();
      if (!v.ok) errors.push(...v.errors);
    }
    return { ok: errors.length === 0, errors };
  }

  findByCommand(command: string): FormRegistration | undefined {
    return this.registrations.find((r) => (r.commands || []).includes(command));
  }

  async applyCommand(
    command: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; diff?: DiffEntry; error?: string }> {
    const reg = this.findByCommand(command);
    if (!reg) return { ok: false, error: `No form registered for ${command}` };
    const before = safeClone(reg.getState());
    try {
      await reg.applyPayload(payload);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    const after = safeClone(reg.getState());
    const diff: DiffEntry = {
      id: `cmd-${Date.now()}`,
      kind: 'command',
      command,
      label: command,
      oldValue: before,
      newValue: after,
      at: new Date().toISOString(),
    };
    this.diffs.push(diff);
    return { ok: true, diff };
  }

  getDiffs(): DiffEntry[] {
    return [...this.diffs];
  }

  pushFieldDiff(diff: DiffEntry): void {
    this.diffs.push(diff);
  }

  async revertAll(): Promise<{ reverted: number }> {
    // Revert in reverse order; command diffs restore prior getState snapshots via applyPayload
    const list = [...this.diffs].reverse();
    let reverted = 0;
    for (const d of list) {
      if (d.kind === 'command' && d.command) {
        const reg = this.findByCommand(d.command);
        if (reg && d.oldValue && typeof d.oldValue === 'object') {
          await reg.applyPayload(d.oldValue as Record<string, unknown>);
          reverted += 1;
        }
      }
    }
    this.diffs = [];
    return { reverted };
  }
}

function safeClone(v: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(v ?? null));
  } catch {
    return null;
  }
}
