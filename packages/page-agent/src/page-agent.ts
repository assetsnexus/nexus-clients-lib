import { findByAttr, findHighlightTarget, getFieldValue, setFieldValue, FIELD_ATTR, FIELD_ID_ATTR } from './dom.js';
import { FormRegistry } from './form-registry.js';
import { collectForms, collectOutline } from './outline.js';
import { mountOverlay, type OverlayController } from './overlay.js';
import { PagePackRegistry } from './page-pack-registry.js';
import { buildTinyPagePointer, buildTinyPagePointerPrompt, capInstructions } from './pointer.js';
import { GENERIC_PAGE_TOOL_SCHEMAS, isPageTool } from './tool-schemas.js';
import type {
  DiffEntry,
  FormRegistration,
  InjectedFunctionSchema,
  PageAgentHost,
  PagePack,
  TinyPagePointer,
} from './types.js';

export type PageAgentOptions = {
  host: PageAgentHost;
  conversationId?: string | null;
  /** When true, navigate without confirmNavigate */
  autoNavigate?: boolean;
};

export type ClientToolResult = {
  ok?: boolean;
  error?: string;
  /** Merged into this turn's tools (understand / assemble) */
  extraFunctionSchemas?: InjectedFunctionSchema[];
  extraTools?: InjectedFunctionSchema[];
  [key: string]: unknown;
};

/**
 * Framework-free page agent. Host supplies search/access/navigate;
 * packs + form registry supply deep copilots.
 */
export class PageAgent {
  readonly forms = new FormRegistry();
  readonly packs = new PagePackRegistry();
  private host: PageAgentHost;
  private conversationId: string | null;
  private autoNavigate = false;
  private overlay: OverlayController | null = null;
  private fieldDiffs: DiffEntry[] = [];

  constructor(opts: PageAgentOptions) {
    this.host = opts.host;
    this.conversationId = opts.conversationId ?? null;
    this.autoNavigate = !!opts.autoNavigate;
  }

  setHost(host: PageAgentHost): void {
    this.host = host;
  }

  setConversationId(id: string | null): void {
    this.conversationId = id;
  }

  setAutoNavigate(v: boolean): void {
    this.autoNavigate = v;
  }

  getAutoNavigate(): boolean {
    return this.autoNavigate;
  }

  mountOverlay(root?: HTMLElement | null): OverlayController {
    this.overlay = mountOverlay(root);
    this.overlay.setOnRevert(async () => {
      await this.execute('anx.page.forms.revert_all', {});
    });
    return this.overlay;
  }

  registerForm(reg: FormRegistration): () => void {
    return this.forms.register(reg);
  }

  registerPack(pack: PagePack): () => void {
    return this.packs.register(pack);
  }

  /** Schemas to inject every turn (generic + form-mapped + pack tools). */
  getInjectedFunctionSchemas(): InjectedFunctionSchema[] {
    const formSchemas: InjectedFunctionSchema[] = this.forms.listCommands().map((name) => ({
      name,
      description: `Apply payload to the current page form as a local preview (user Save persists). Command: ${name}`,
      parameters: {
        type: 'object' as const,
        properties: {
          payload: {
            type: 'object',
            description: 'Partial form fields to merge into the live editor',
            additionalProperties: true,
          },
        },
        required: [] as string[],
      },
    }));
    const mapped = this.host.listPageCommands().map((c) => c.schema);
    const pack = this.packs.resolve(this.host.getCurrentPath());
    const packTools = pack?.extraTools || [];
    // Prefer pack.commands with richer schemas when packs expose them via understand —
    // on inject we only have form + pack extraTools + generics.
    const byName = new Map<string, InjectedFunctionSchema>();
    for (const s of [...GENERIC_PAGE_TOOL_SCHEMAS, ...mapped, ...formSchemas, ...packTools]) {
      byName.set(s.name, s);
    }
    return [...byName.values()];
  }

  getTinyPointer(): TinyPagePointer {
    const path = this.host.getCurrentPath();
    const pack = this.packs.resolve(path);
    const params = this.host.getRouteParams?.() || {};
    let entityRef = pack?.entityRef?.({ path, params });
    // Unsaved create chips only when an editor form mixin is actually registered.
    if (entityRef && !entityRef.id && !this.hasActiveForm()) {
      entityRef = undefined;
    }
    return buildTinyPagePointer({
      path,
      title: pack?.title,
      summary: pack?.summary,
      pageId: pack?.pageId,
      entityRef,
    });
  }

  /** True when a pageAgentForm (or equivalent) registration is live on this view. */
  hasActiveForm(): boolean {
    return this.forms.listCommands().length > 0;
  }

  getTinyPointerPrompt(): string {
    return buildTinyPagePointerPrompt(this.getTinyPointer());
  }

  /** True if name is a page tool or a mapped form/pack command. */
  canExecute(name: string): boolean {
    if (isPageTool(name)) return true;
    if (this.forms.findByCommand(name)) return true;
    const pack = this.packs.resolve(this.host.getCurrentPath());
    if (pack?.extraTools?.some((t) => t.name === name)) return true;
    if (pack?.applyCommand && name.startsWith('anx.')) return true;
    return this.host.listPageCommands().some((c) => c.name === name);
  }

  async execute(name: string, args: Record<string, unknown> = {}): Promise<ClientToolResult> {
    try {
      if (name === 'anx.page.search') return this.search(args);
      if (name === 'anx.page.resolve') return this.resolve(args);
      if (name === 'anx.page.navigate') return this.navigate(args);
      if (name === 'anx.page.understand') return this.understand();
      if (name === 'anx.page.validate') return this.validate();
      if (name === 'anx.page.outline') return this.outline();
      if (name === 'anx.page.highlight') return this.highlight(args);
      if (name === 'anx.page.forms.describe') return { forms: collectForms(false) };
      if (name === 'anx.page.forms.read_current_values') {
        return {
          forms: collectForms(true),
          privacy: 'Non-secret values only; password/file/hidden skipped.',
        };
      }
      if (name === 'anx.page.forms.update_field') return this.updateField(args);
      if (name === 'anx.page.forms.revert_all') return this.revertAll();
      if (name === 'anx.page.model3d.read') return this.model3dRead(args);
      if (name === 'anx.page.model3d.apply') return this.model3dApply(args);

      const path = this.host.getCurrentPath();
      const pack = this.packs.resolve(path);
      const ctx = this.packs.buildContext(path, this.host);

      if (pack?.handleExtraTool && pack.extraTools?.some((t) => t.name === name)) {
        const result = await pack.handleExtraTool(name, args, ctx);
        return typeof result === 'object' && result ? (result as ClientToolResult) : { ok: true, result };
      }

      if (pack?.applyCommand) {
        const applied = await pack.applyCommand(name, args, ctx);
        if (applied.diff) {
          this.forms.pushFieldDiff(applied.diff);
          this.refreshOverlay();
        }
        return applied;
      }

      if (this.forms.findByCommand(name)) {
        const formArgs =
          args.payload && typeof args.payload === 'object' && !Array.isArray(args.payload)
            ? (args.payload as Record<string, unknown>)
            : args;
        const applied = await this.forms.applyCommand(name, formArgs);
        this.refreshOverlay();
        return applied;
      }

      return { ok: false, error: `Unknown page tool: ${name}` };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private async search(args: Record<string, unknown>): Promise<ClientToolResult> {
    const query = String(args.query || '').trim();
    const limit = typeof args.limit === 'number' ? args.limit : 10;
    if (!query) return { ok: false, error: 'query is required' };
    const hits = await this.host.searchPages(query, limit);
    return { ok: true, hits, conversationId: this.conversationId };
  }

  private async resolve(args: Record<string, unknown>): Promise<ClientToolResult> {
    const path = String(args.path || '').trim();
    if (!path) return { ok: false, error: 'path is required' };
    const access = await this.host.resolveAccess(path);
    return { ok: true, access };
  }

  private async navigate(args: Record<string, unknown>): Promise<ClientToolResult> {
    const path = String(args.path || '').trim();
    if (!path) return { ok: false, error: 'path is required' };
    const pingAfterArrive = args.pingAfterArrive !== false;
    const access = await this.host.resolveAccess(path);
    if (!access.allowed) {
      return {
        ok: false,
        error: access.reason || 'Access denied',
        access,
        hint: access.onboardingPath
          ? `User needs onboarding: ${access.onboardingPath}`
          : 'User lacks permissions for this page',
      };
    }
    if (!this.autoNavigate && this.host.confirmNavigate) {
      const choice = await this.host.confirmNavigate(path);
      if (choice === 'cancel') return { ok: false, cancelled: true };
      if (choice === 'link_only') {
        return { ok: true, navigated: false, path, linkOnly: true, pingAfterArrive: false };
      }
      this.autoNavigate = true;
    }
    const result = await this.host.navigate(path);
    return {
      ok: result.ok,
      path: result.path,
      navigated: result.ok,
      pingAfterArrive: result.ok && pingAfterArrive,
      error: result.error,
      pointer: result.ok ? this.getTinyPointer() : undefined,
    };
  }

  private async understand(): Promise<ClientToolResult> {
    const path = this.host.getCurrentPath();
    const pack = this.packs.resolve(path);
    if (!pack) {
      const outline = collectOutline();
      return {
        ok: true,
        instructions: capInstructions(
          `Generic page at ${path}. No page pack registered. Use outline/highlight/search. Call outline for landmarks.`,
        ),
        sections: [],
        commands: [],
        conceptIds: [],
        extraTools: [],
        extraFunctionSchemas: [],
        snapshot: { path, landmarks: outline.landmarks.length },
        entityRef: undefined,
      };
    }
    const ctx = this.packs.buildContext(path, this.host);
    const result = await pack.understand(ctx);
    result.instructions = capInstructions(result.instructions);
    const extra = [...(result.extraTools || []), ...(pack.extraTools || [])];
    const byName = new Map(extra.map((t) => [t.name, t]));
    // Surface registered form commands with usable parameter schemas (not empty stubs).
    for (const name of this.forms.listCommands()) {
      if (byName.has(name)) continue;
      byName.set(name, {
        name,
        description: `Apply payload to the current page form as a local preview. Command: ${name}`,
        parameters: {
          type: 'object',
          properties: {
            payload: {
              type: 'object',
              description: 'Partial form fields to merge into the live editor',
              additionalProperties: true,
            },
          },
          required: [],
        },
      });
    }
    // Map pack PREVIEW commands to schemas. Persist/region commands stay in
    // `commands[]` for the model to call via anx_command / assemble — not client tools.
    for (const c of result.commands || []) {
      if (!c?.command || byName.has(c.command)) continue;
      if (c.apply === 'persist') continue;
      byName.set(c.command, {
        name: c.command,
        description: `Page-mapped ${c.apply || 'preview'} via ${c.uiAction || c.command}`,
        parameters: {
          type: 'object',
          properties: {
            payload: {
              type: 'object',
              description: 'Fields for this mapped command (preview until user Save)',
              additionalProperties: true,
            },
          },
          required: [],
        },
      });
    }
    const mergedExtras = [...byName.values()];
    return {
      ok: true,
      ...result,
      extraTools: mergedExtras,
      extraFunctionSchemas: mergedExtras,
    };
  }

  private async validate(): Promise<ClientToolResult> {
    const path = this.host.getCurrentPath();
    const pack = this.packs.resolve(path);
    if (pack?.validate) {
      const ctx = this.packs.buildContext(path, this.host);
      const result = await pack.validate(ctx);
      return { ...result };
    }
    return { ...this.forms.validate() };
  }

  private outline(): ClientToolResult {
    const registered = this.forms.describe();
    const outline = collectOutline();
    const mediaFields = this.forms.listMediaFields();
    // Merge registered media binders into landmarks when not already present.
    for (const f of mediaFields) {
      const id = f.pageFieldId || f.fieldPath;
      if (!outline.landmarks.some((l) => l.id === id || l.fieldPath === f.fieldPath)) {
        outline.landmarks.push({
          id,
          kind: 'field',
          label: f.label || f.fieldPath,
          fieldPath: f.fieldPath,
          fieldKind: f.fieldKind,
          fileId: f.fileId ?? null,
          format: f.format ?? null,
        });
      }
    }
    return {
      ok: true,
      ...outline,
      registeredForms: registered,
      mediaFields,
    };
  }

  private model3dRead(args: Record<string, unknown>): ClientToolResult {
    const fieldPath = args.fieldPath != null ? String(args.fieldPath) : undefined;
    const pageFieldId = args.pageFieldId != null ? String(args.pageFieldId) : undefined;
    const maxChars = typeof args.maxChars === 'number' ? args.maxChars : 200_000;
    const media = this.forms.findMediaField({ fieldPath, pageFieldId });
    const el =
      (pageFieldId && (findByAttr(FIELD_ID_ATTR, pageFieldId) || findByAttr(FIELD_ATTR, pageFieldId))) ||
      (fieldPath && findByAttr(FIELD_ATTR, fieldPath)) ||
      null;
    let content: string | null = null;
    if (el) {
      const v = getFieldValue(el);
      content = v == null ? null : String(v);
    }
    // Host components may stash live editor text on window for page-agent (optional).
    const live =
      typeof window !== 'undefined'
        ? (window as unknown as { __anxPageModel3dContent?: string }).__anxPageModel3dContent
        : undefined;
    if (!content && typeof live === 'string') content = live;
    if (content && content.length > maxChars) {
      content = `${content.slice(0, maxChars)}\n…[truncated]`;
    }
    return {
      ok: true,
      fieldPath: media?.fieldPath || fieldPath || null,
      pageFieldId: media?.pageFieldId || pageFieldId || null,
      fieldKind: 'model3d',
      fileId: media?.fileId ?? el?.getAttribute('data-anx-ai-file-id') ?? null,
      format: media?.format ?? el?.getAttribute('data-anx-ai-format') ?? null,
      content,
      binary: content == null && Boolean(media?.fileId),
      hint:
        content == null && media?.fileId
          ? 'Field has a FileRecord — use anx.storage.model3d.read with fileId for durable text.'
          : undefined,
    };
  }

  private model3dApply(args: Record<string, unknown>): ClientToolResult {
    const content = typeof args.content === 'string' ? args.content : '';
    if (!content.trim()) return { ok: false, error: 'content is required' };
    const format = typeof args.format === 'string' ? args.format.toLowerCase() : 'urdf';
    const fieldPath = args.fieldPath != null ? String(args.fieldPath) : 'vr_digital_twin.model';
    const pageFieldId = args.pageFieldId != null ? String(args.pageFieldId) : undefined;
    const fileId =
      typeof args.fileId === 'string' && args.fileId.trim() ? args.fileId.trim() : null;

    // Prefer mixin apply via set-file / model3d command when registered.
    const media = this.forms.findMediaField({ fieldPath, pageFieldId });
    const applyCmd =
      media?.commands?.find((c) => c.includes('model3d.apply') || c.includes('set-file')) ||
      media?.commands?.[0];

    const payload: Record<string, unknown> = {
      content,
      format,
      fieldPath,
      ...(fileId ? { fileId, modelFileRef: fileId } : {}),
      ...(pageFieldId ? { pageFieldId } : {}),
    };

    // Live editor hook for BlueprintEditor / similar
    if (typeof window !== 'undefined') {
      const w = window as unknown as {
        __anxPageModel3dApply?: (p: Record<string, unknown>) => void | Promise<void>;
      };
      if (typeof w.__anxPageModel3dApply === 'function') {
        void w.__anxPageModel3dApply(payload);
      }
      (window as unknown as { __anxPageModel3dContent?: string }).__anxPageModel3dContent = content;
    }

    const el =
      (pageFieldId && findByAttr(FIELD_ID_ATTR, pageFieldId)) ||
      findByAttr(FIELD_ATTR, fieldPath) ||
      null;
    const oldValue = el ? getFieldValue(el) : null;
    if (el) {
      setFieldValue(el, content);
      if (fileId) el.setAttribute('data-anx-ai-file-id', fileId);
      el.setAttribute('data-anx-ai-format', format);
      el.setAttribute('data-anx-ai-field-kind', 'model3d');
      this.overlay?.markEdited(el);
    }

    const diff: DiffEntry = {
      id: `model3d-${Date.now()}`,
      kind: 'field',
      fieldId: pageFieldId || fieldPath,
      label: fieldPath,
      oldValue,
      newValue: { content, format, fileId },
      at: new Date().toISOString(),
    };
    this.fieldDiffs.push(diff);
    this.forms.pushFieldDiff(diff);
    this.refreshOverlay();

    return {
      ok: true,
      preview: true,
      fieldPath,
      format,
      fileId,
      applyCommandHint: applyCmd || 'anx.entity.field.set-file',
      note: fileId
        ? 'Preview applied with real FileRecord id — persist via set-file / Save.'
        : 'Preview applied in-memory — create a FileRecord (model3d.create) then set-file; do not use ai-generated:// placeholders.',
    };
  }

  private highlight(args: Record<string, unknown>): ClientToolResult {
    const el = findHighlightTarget({
      id: args.id != null ? String(args.id) : undefined,
      label: args.label != null ? String(args.label) : undefined,
      action: args.action != null ? String(args.action) : undefined,
      selector: args.selector != null ? String(args.selector) : undefined,
      section: args.section != null ? String(args.section) : undefined,
    });
    if (!el) return { ok: false, error: 'Target not found' };
    this.overlay?.spotlight(el);
    return {
      ok: true,
      highlighted: true,
      label: (el.textContent || '').trim().slice(0, 80),
    };
  }

  private updateField(args: Record<string, unknown>): ClientToolResult {
    const fieldId = String(args.fieldId || '').trim();
    if (!fieldId) return { ok: false, error: 'fieldId is required' };
    const el = findByAttr(FIELD_ID_ATTR, fieldId) || findByAttr('data-anx-ai-field', fieldId);
    if (!el) return { ok: false, error: `Field not found: ${fieldId}` };
    const oldValue = setFieldValue(el, args.value);
    this.overlay?.markEdited(el);
    const diff: DiffEntry = {
      id: `field-${Date.now()}`,
      kind: 'field',
      fieldId,
      label: fieldId,
      oldValue,
      newValue: getFieldValue(el),
      at: new Date().toISOString(),
    };
    this.fieldDiffs.push(diff);
    this.forms.pushFieldDiff(diff);
    this.refreshOverlay();
    return { ok: true, fieldId, oldValue, newValue: diff.newValue, reason: args.reason };
  }

  private async revertAll(): Promise<ClientToolResult> {
    for (const d of [...this.fieldDiffs].reverse()) {
      if (d.kind === 'field' && d.fieldId) {
        const el = findByAttr(FIELD_ID_ATTR, d.fieldId);
        if (el) {
          setFieldValue(el, d.oldValue);
          this.overlay?.clearEdited(el);
        }
      }
    }
    this.fieldDiffs = [];
    const cmd = await this.forms.revertAll();
    this.overlay?.clearSpotlight();
    this.refreshOverlay();
    return { ok: true, revertedFields: true, ...cmd };
  }

  private refreshOverlay(): void {
    const pending = this.forms.getDiffs().length;
    if (pending > 0) this.overlay?.show(pending);
    else this.overlay?.hide();
  }
}
