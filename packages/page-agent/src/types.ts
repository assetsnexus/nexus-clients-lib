/** Compact hit from host page search (menu ∪ routes). */
export type PageHit = {
  path: string;
  title: string;
  summary?: string;
  permissions?: string[];
  onboardingPath?: string | null;
  score?: number;
};

export type PageAccess = {
  path: string;
  allowed: boolean;
  missingPermissions?: string[];
  onboardingPath?: string | null;
  reason?: string;
};

export type EntityRef = {
  type: string;
  id?: string | null;
  name?: string | null;
  /** false when the form is create/unsaved */
  saved?: boolean;
};

/** Every message.send carries only this — ~200 tokens. */
export type TinyPagePointer = {
  path: string;
  pageId?: string;
  title: string;
  summary?: string;
  entityRef?: EntityRef;
  understandAvailable: true;
};

export type InjectedFunctionSchema = {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export type PageCommandMapEntry = {
  command: string;
  uiAction: string;
  apply: 'preview' | 'persist';
  fieldPath?: string;
};

export type PageSection = {
  id: string;
  label: string;
  howTo?: string;
};

export type PageUnderstandResult = {
  instructions: string;
  sections: PageSection[];
  commands: PageCommandMapEntry[];
  conceptIds: string[];
  extraTools: InjectedFunctionSchema[];
  snapshot: Record<string, unknown>;
  entityRef?: EntityRef;
};

export type PageValidateError = {
  fieldPath: string;
  message: string;
  section?: string;
};

export type PageValidateResult = {
  ok: boolean;
  errors: PageValidateError[];
};

export type FieldKind = 'text' | 'number' | 'boolean' | 'select' | 'image' | 'pdf' | 'model3d' | 'json';

export type PageFormField = {
  id: string;
  formId?: string;
  label?: string;
  type?: string;
  fieldKind?: FieldKind;
  fieldPath?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  valueAvailable?: boolean;
  value?: unknown;
  /** Region FileRecord id when fieldKind is image|pdf|model3d */
  fileId?: string | null;
  /** Format hint (e.g. urdf, gltf, png) for media fields */
  format?: string | null;
};

export type PageFormDescribe = {
  id: string;
  title: string;
  fields: PageFormField[];
};

export type OutlineLandmark = {
  id: string;
  kind: 'heading' | 'cta' | 'section' | 'field' | 'landmark';
  label: string;
  selector?: string;
  fieldKind?: FieldKind;
  fileId?: string | null;
  format?: string | null;
  fieldPath?: string;
};

export type DiffEntry = {
  id: string;
  kind: 'field' | 'command';
  label?: string;
  fieldId?: string;
  command?: string;
  oldValue: unknown;
  newValue: unknown;
  at: string;
};

export type PagePack = {
  /** Route match: string prefix or RegExp */
  match: string | RegExp | ((path: string) => boolean);
  pageId: string;
  title: string;
  summary?: string;
  conceptIds?: string[];
  entityRef?: (ctx: { path: string; params: Record<string, string> }) => EntityRef | undefined;
  understand: (ctx: PagePackContext) => PageUnderstandResult | Promise<PageUnderstandResult>;
  validate?: (ctx: PagePackContext) => PageValidateResult | Promise<PageValidateResult>;
  /** Mapped anx.* → apply to Vue/local state (preview) */
  applyCommand?: (
    command: string,
    payload: Record<string, unknown>,
    ctx: PagePackContext,
  ) => Promise<{ ok: boolean; diff?: DiffEntry; error?: string }> | { ok: boolean; diff?: DiffEntry; error?: string };
  extraTools?: InjectedFunctionSchema[];
  handleExtraTool?: (
    name: string,
    args: Record<string, unknown>,
    ctx: PagePackContext,
  ) => Promise<unknown> | unknown;
};

export type PagePackContext = {
  path: string;
  params: Record<string, string>;
  host: PageAgentHost;
};

export type PageAgentHost = {
  getCurrentPath(): string;
  searchPages(query: string, limit?: number): PageHit[] | Promise<PageHit[]>;
  resolveAccess(path: string): PageAccess | Promise<PageAccess>;
  navigate(path: string): Promise<{ ok: boolean; path: string; error?: string }>;
  listPageCommands(): Array<{ name: string; schema: InjectedFunctionSchema }>;
  /** Optional: route params for packs */
  getRouteParams?(): Record<string, string>;
  /** Optional: ask user before navigate when session auto-nav is off */
  confirmNavigate?(path: string, title?: string): Promise<'open' | 'link_only' | 'cancel'>;
};

export type FormRegistration = {
  commands: string[];
  formKey?: string;
  getState: () => Record<string, unknown>;
  applyPayload: (payload: Record<string, unknown>) => void | Promise<void>;
  describe?: () => PageFormDescribe | PageFormDescribe[];
  validate?: () => PageValidateResult;
  /** Field media binders */
  fields?: Array<{
    fieldPath: string;
    fieldKind: FieldKind;
    commands?: string[];
    /** Current FileRecord id when known (shown in outline) */
    fileId?: string | null;
    format?: string | null;
    label?: string;
    pageFieldId?: string;
  }>;
};
