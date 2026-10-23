/**
 * `@nexus/storage-browser` — headless Nexus storage client + explorer model.
 *
 * Drives the region's `anx.file.*` / `anx.storage.*` surface with the same
 * capability fallbacks the portal uses (presign-PUT -> base64 upload-complete,
 * presign-GET -> proxy URL). Framework-free so the Electron renderer, the CLI
 * and Phase 3's mount daemon all share one implementation, and the transport is
 * a plain `send(command, payload)` so it is trivially testable.
 */

import type { CollectionItemRef, StorageCapabilityFlags } from '@nexus/files-core';

/** Narrow transport: the same shape `@nexus/commands-client` and node-core send. */
export type StorageCommandSender = (
  command: string,
  payload?: Record<string, unknown>,
) => Promise<unknown>;

export type FileRecord = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  workspaceId: string | null;
  folderId: string | null;
  encryptionTier: string;
  createdAt: string | null;
  revisionNo: number | null;
  raw: Record<string, unknown>;
};

export type BucketFilePage = {
  items: FileRecord[];
  total: number | null;
  nextCursor: string | null;
  encryptionSummary: Record<string, number>;
};

export type StorageContract = {
  id: string;
  kind: 'org' | 'user';
  isFreeTier: boolean;
  region: string;
  raw: Record<string, unknown>;
};

export type StorageWorkspace = {
  id: string;
  name: string;
  ownerUserId: string | null;
  orgId: string | null;
  memberUserIds: string[];
  raw: Record<string, unknown>;
};

export type BackendCapabilities = StorageCapabilityFlags & {
  presignPut: boolean;
  presignGet: boolean;
};

const asRecord = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Unwrap a region envelope's body, tolerating both `data` and `responseObject`. */
export function unwrapEnvelope(raw: unknown): Record<string, unknown> {
  const r = asRecord(raw);
  const body = r.responseObject ?? r.data;
  return body && typeof body === 'object' ? (body as Record<string, unknown>) : r;
}

/** True when a region envelope indicates failure. */
export function envelopeFailed(raw: unknown): { failed: boolean; code?: string; message?: string } {
  const r = asRecord(raw);
  if (r.ok === false) {
    return {
      failed: true,
      code: typeof r.code === 'string' ? r.code : undefined,
      message: typeof r.message === 'string' ? r.message : undefined,
    };
  }
  const code = typeof r.responseCode === 'number' ? r.responseCode : null;
  if (code != null && (code < 200 || code >= 300)) {
    const errors = Array.isArray(r.errorObjects) ? r.errorObjects : [];
    const first = asRecord(errors[0]);
    return {
      failed: true,
      code: typeof first.code === 'string' ? first.code : String(code),
      message: typeof first.message === 'string' ? first.message : undefined,
    };
  }
  return { failed: false };
}

export function parseFileRecord(raw: unknown): FileRecord {
  const r = asRecord(raw);
  return {
    id: str(r._id ?? r.id ?? r.fileId) ?? '',
    name: str(r.originalName ?? r.name) ?? 'file',
    mimeType: str(r.contentType ?? r.mimeType) ?? 'application/octet-stream',
    sizeBytes: num(r.sizeBytes) ?? 0,
    status: str(r.status) ?? 'unknown',
    workspaceId: str(r.workspaceId),
    folderId: str(r.folderId ?? r.folder_id),
    encryptionTier: str(r.encryptionTier) ?? 'none',
    createdAt: str(r.createdAt),
    revisionNo: num(r.revisionNo ?? r.revision),
    raw: r,
  };
}

export function toCollectionItemRef(file: FileRecord): CollectionItemRef {
  return {
    id: file.id,
    kind: 'file',
    source: 'storage_bucket',
    fileId: file.id,
    label: file.name,
    mimeType: file.mimeType,
    revisionNo: file.revisionNo ?? undefined,
  };
}

export type StorageClient = ReturnType<typeof createStorageClient>;

export function createStorageClient(send: StorageCommandSender) {
  /** List bucket files with cursor pagination. */
  async function listBucketFiles(input: {
    workspaceId?: string;
    folderId?: string | null;
    cursor?: string | null;
    search?: string;
    status?: string;
    limit?: number;
  }): Promise<BucketFilePage> {
    const payload: Record<string, unknown> = {};
    if (input.workspaceId) payload.workspaceId = input.workspaceId;
    if (input.folderId !== undefined) payload.folderId = input.folderId;
    if (input.cursor) payload.cursor = input.cursor;
    if (input.search) payload.search = input.search;
    if (input.status) payload.status = input.status;
    if (input.limit) payload.limit = input.limit;

    const raw = await send('anx.storage.bucket.list-files', payload);
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.bucket.list-files', fail);
    const body = unwrapEnvelope(raw);
    const items = Array.isArray(body.items) ? body.items.map(parseFileRecord) : [];
    return {
      items,
      total: num(body.total),
      nextCursor: str(body.nextCursor),
      encryptionSummary: asRecord(body.encryptionSummary) as Record<string, number>,
    };
  }

  async function listWorkspaces(): Promise<StorageWorkspace[]> {
    const raw = await send('anx.storage.workspace.list', {});
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.workspace.list', fail);
    const body = unwrapEnvelope(raw);
    const rows = Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.workspaces)
        ? body.workspaces
        : [];
    return rows.map((w) => {
      const r = asRecord(w);
      return {
        id: str(r._id ?? r.id) ?? '',
        name: str(r.name) ?? 'Workspace',
        ownerUserId: str(r.ownerUserId),
        orgId: str(r.orgId),
        memberUserIds: Array.isArray(r.memberUserIds)
          ? r.memberUserIds.filter((x): x is string => typeof x === 'string')
          : [],
        raw: r,
      };
    });
  }

  async function listContracts(): Promise<StorageContract[]> {
    const raw = await send('anx.storage.contracts.list-mine', {});
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.contracts.list-mine', fail);
    const rows = unwrapEnvelope(raw).contracts;
    if (!Array.isArray(rows)) return [];
    return rows.map((c) => {
      const r = asRecord(c);
      return {
        id: str(r._id ?? r.id) ?? '',
        kind: r.kind === 'org' ? 'org' : 'user',
        isFreeTier: r.isFreeTier === true,
        region: str(r.region) ?? '',
        raw: r,
      };
    });
  }

  async function folderList(workspaceId: string, parentFolderId?: string | null) {
    const payload: Record<string, unknown> = { workspaceId };
    if (parentFolderId !== undefined) payload.parentFolderId = parentFolderId;
    const raw = await send('anx.storage.workspace.folder.list', payload);
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.workspace.folder.list', fail);
    const items = unwrapEnvelope(raw).items;
    return Array.isArray(items)
      ? items.map((f) => {
          const r = asRecord(f);
          return {
            id: str(r._id ?? r.id) ?? '',
            name: str(r.name) ?? '',
            parentFolderId: str(r.parentFolderId),
          };
        })
      : [];
  }

  /** Every folder in a workspace (flat), so a path can be resolved to an id. */
  async function folderTree(workspaceId: string) {
    return folderList(workspaceId, '*');
  }

  /** Create a folder (used to materialize remote sub-dirs during sync). */
  async function createFolder(input: {
    workspaceId: string;
    name: string;
    parentFolderId?: string | null;
  }): Promise<{ id: string; name: string; parentFolderId: string | null }> {
    const payload: Record<string, unknown> = {
      workspaceId: input.workspaceId,
      name: input.name,
    };
    if (input.parentFolderId != null) payload.parentFolderId = input.parentFolderId;
    const raw = await send('anx.storage.workspace.folder.create', payload);
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.workspace.folder.create', fail);
    const r = asRecord(unwrapEnvelope(raw).folder ?? unwrapEnvelope(raw));
    return {
      id: str(r._id ?? r.id) ?? '',
      name: str(r.name) ?? input.name,
      parentFolderId: str(r.parentFolderId),
    };
  }

  /** Delete a file record (used for two-way deletes). */
  async function deleteFile(fileId: string) {
    const raw = await send('anx.storage.bucket.trash-file', { fileId });
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.bucket.trash-file', fail);
    return unwrapEnvelope(raw);
  }

  /**
   * Fetch a file's bytes (presigned GET, falling back to the region proxy), so
   * the sync daemon can materialize a local copy.
   */
  async function downloadBytes(input: {
    fileId: string;
    regionBaseUrl: string;
    fetchFn?: typeof fetch;
  }): Promise<Uint8Array> {
    const fetchFn = input.fetchFn ?? fetch;
    const { url } = await resolveDownloadUrl({
      fileId: input.fileId,
      regionBaseUrl: input.regionBaseUrl,
    });
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Backend capabilities matrix; URL + byte-transfer transports differ per backend. */
  async function backendCapabilities(kind?: string): Promise<BackendCapabilities> {
    const raw = await send(
      'anx.storage.backend.capabilities',
      kind ? { kind } : {},
    );
    const body = unwrapEnvelope(raw);
    const capability = asRecord(body.capability ?? body);
    return {
      read: capability.read !== false,
      partialWrite: Boolean(capability.partialWrite),
      revert: Boolean(capability.revert),
      livePreview: Boolean(capability.livePreview),
      shareLinks: capability.shareLinks !== false,
      pageDwell: Boolean(capability.pageDwell),
      presignPut: Boolean(capability.presignPut),
      presignGet: Boolean(capability.presignGet),
    };
  }

  /**
   * Upload bytes with the capability fallback: when the backend supports
   * presign-PUT, PUT to the signed URL and finalize with
   * `anx.file.upload-complete-presign`; otherwise send base64 via
   * `anx.file.upload-complete`. `presignPut` comes from the `upload-init`
   * response (the authoritative per-file signal), never guessed.
   */
  async function upload(input: {
    workspaceId?: string;
    folderId?: string | null;
    name: string;
    contentType: string;
    bytes: Uint8Array;
    /** Region `upload-init` result, to avoid a re-init when the caller already has it. */
    init?: UploadInit;
    fetchFn?: typeof fetch;
    /** Region `module` for the FileRecord (e.g. `chat-attachment`). */
    module?: string;
    /** Explicit encryption tier override (`org` | `user-known` | ...). */
    encryptionTier?: string;
    /**
     * Force the base64 `upload-complete` path and skip presign entirely.
     * App identities are not allowed to use presigned object URLs, so the
     * mobile adapter sets this even when the backend advertises `presignPut`.
     */
    forceBase64?: boolean;
  }): Promise<FileRecord> {
    const init = input.init ?? (await uploadInit(input));
    const fetchFn = input.fetchFn ?? fetch;
    const completeViaBase64 = () =>
      send('anx.file.upload-complete', {
        fileId: init.fileId,
        base64Data: bytesToBase64(input.bytes),
      }).then(done => {
        const fail = envelopeFailed(done);
        if (fail.failed) throw new StorageCommandError('anx.file.upload-complete', fail);
        return parseFileRecord(unwrapEnvelope(done).file ?? unwrapEnvelope(done));
      });

    if (!input.forceBase64 && init.presignPut && init.presignUrl) {
      try {
        const res = await fetchFn(init.presignUrl, {
          method: 'PUT',
          headers: { 'content-type': input.contentType },
          // RN's fetch typings and the DOM lib disagree on the body union;
          // `RequestInit['body']` is valid under both.
          body: input.bytes as RequestInit['body'],
        });
        if (!res.ok) {
          throw new Error(`presigned PUT failed (${res.status})`);
        }
        const done = await send('anx.file.upload-complete-presign', {
          fileId: init.fileId,
          sizeBytes: input.bytes.byteLength,
          contentType: input.contentType,
        });
        const fail = envelopeFailed(done);
        if (fail.failed) throw new StorageCommandError('anx.file.upload-complete-presign', fail);
        return parseFileRecord(unwrapEnvelope(done).file ?? unwrapEnvelope(done));
      } catch (err) {
        // The presign path is refused for app identities (APP_ACCESS_FORBIDDEN)
        // or unsupported backends (STORAGE_CAPABILITY_UNSUPPORTED). In those
        // cases complete through base64; a genuine transfer failure still throws.
        const code =
          err && typeof err === 'object' && 'code' in err
            ? String((err as { code?: unknown }).code || '')
            : '';
        if (code === 'APP_ACCESS_FORBIDDEN' || code === 'STORAGE_CAPABILITY_UNSUPPORTED') {
          return completeViaBase64();
        }
        throw err;
      }
    }

    return completeViaBase64();
  }

  async function uploadInit(input: {
    workspaceId?: string;
    folderId?: string | null;
    name: string;
    contentType: string;
    sizeBytes?: number;
    /**
     * Region `module` for the FileRecord (e.g. `chat-attachment`). Chat
     * attachments default their encryption tier from the identity when omitted.
     */
    module?: string;
    /** Explicit encryption tier override (`org` | `user-known` | ...). */
    encryptionTier?: string;
  }): Promise<UploadInit> {
    const payload: Record<string, unknown> = {
      originalName: input.name,
      contentType: input.contentType,
    };
    if (input.workspaceId) payload.workspaceId = input.workspaceId;
    if (input.folderId != null) payload.folderId = input.folderId;
    if (input.sizeBytes != null) payload.sizeBytes = input.sizeBytes;
    if (input.module) payload.module = input.module;
    if (input.encryptionTier) payload.encryptionTier = input.encryptionTier;

    const raw = await send('anx.file.upload-init', payload);
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.file.upload-init', fail);
    const body = unwrapEnvelope(raw);
    return {
      fileId: str(body.fileId) ?? '',
      storageKey: str(body.storageKey),
      presignPut: body.presignPut === true,
      presignUrl: str(body.presignUrl ?? body.url),
      raw: body,
    };
  }

  /**
   * Resolve a fetchable URL for a file, preferring a presigned GET and falling
   * back to the region proxy `GET /files/:fileId` when the backend cannot sign.
   */
  async function resolveDownloadUrl(input: {
    fileId: string;
    regionBaseUrl: string;
  }): Promise<{ url: string; presigned: boolean }> {
    const raw = await send('anx.storage.presign.get', { fileId: input.fileId });
    const fail = envelopeFailed(raw);
    if (!fail.failed) {
      const url = str(unwrapEnvelope(raw).url);
      if (url) return { url, presigned: true };
    }
    if (fail.code === 'STORAGE_CAPABILITY_UNSUPPORTED' || fail.failed) {
      const base = input.regionBaseUrl.replace(/\/+$/, '');
      return { url: `${base}/files/${encodeURIComponent(input.fileId)}`, presigned: false };
    }
    const url = str(unwrapEnvelope(raw).url);
    if (!url) throw new StorageCommandError('anx.storage.presign.get', fail);
    return { url, presigned: true };
  }

  async function listTrash(input: {
    workspaceId?: string;
    limit?: number;
    cursor?: string | null;
  }) {
    return listBucketFiles({ ...input, status: 'deleted' });
  }

  async function renameFile(fileId: string, newName: string) {
    const raw = await send('anx.storage.bucket.rename-file', { fileId, newName });
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.bucket.rename-file', fail);
    return unwrapEnvelope(raw);
  }

  /**
   * Link an uploaded file into a conversation's workspace (first `items.add`
   * CAS-creates the workspace; a duplicate fileId is a no-op on the region).
   * Mirrors `@nexus/chat-core` so a shared file also appears in chat history.
   */
  async function linkConversationItem(input: {
    conversationId?: string;
    workspaceId?: string;
    fileId: string;
    source?: 'conversation_media' | 'storage_bucket';
    label?: string;
    mimeType?: string;
  }): Promise<void> {
    const fileId = String(input.fileId || '').trim();
    if (!fileId || (!input.conversationId && !input.workspaceId)) return;
    const raw = await send('anx.workspace.items.add', {
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
      fileId,
      source: input.source || 'conversation_media',
      ...(input.label ? { label: input.label } : {}),
      ...(input.mimeType ? { mimeType: input.mimeType } : {}),
    });
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.workspace.items.add', fail);
  }

  async function moveFile(input: { fileId: string; targetFolderId?: string | null }) {
    const raw = await send('anx.storage.bucket.move-file', {
      fileId: input.fileId,
      targetFolderId: input.targetFolderId ?? null,
    });
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.bucket.move-file', fail);
    return unwrapEnvelope(raw);
  }

  async function copyFile(input: { fileId: string; targetFolderId?: string | null; name?: string }) {
    const raw = await send('anx.storage.bucket.copy-file', {
      fileId: input.fileId,
      targetFolderId: input.targetFolderId ?? null,
      ...(input.name ? { newName: input.name } : {}),
    });
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.bucket.copy-file', fail);
    return unwrapEnvelope(raw);
  }

  async function trashFile(fileId: string) {
    const raw = await send('anx.storage.bucket.trash-file', { fileId });
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.bucket.trash-file', fail);
    return unwrapEnvelope(raw);
  }

  async function restoreFile(fileId: string) {
    const raw = await send('anx.storage.bucket.restore-file', { fileId });
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.bucket.restore-file', fail);
    return unwrapEnvelope(raw);
  }

  async function subscriptionContingent(subscriptionId: string) {
    const raw = await send('anx.storage.subscription.contingent', { subscriptionId });
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.storage.subscription.contingent', fail);
    return unwrapEnvelope(raw);
  }

  // ─── Revision history / revert ────────────────────────────────────────────

  /**
   * A region that predates the revision commands answers `COMMAND_NOT_FOUND`.
   * That is not an error the user can act on, so callers degrade to a deliberate
   * "unsupported" state instead of surfacing a raw command error.
   */
  function isRevisionCommandNotFound(fail: { code?: string }): boolean {
    return fail.code === 'COMMAND_NOT_FOUND';
  }

  /** List a file's revision history (newest first). */
  async function listRevisions(input: { fileId: string; limit?: number }): Promise<RevisionPage> {
    const payload: Record<string, unknown> = { fileId: input.fileId };
    if (input.limit) payload.limit = input.limit;
    const raw = await send('anx.file.revision.list', payload);
    const fail = envelopeFailed(raw);
    if (fail.failed) {
      // Older region without the revision surface: report "unsupported" rather
      // than throwing (the recorded `anx.file.revision.list` command name is
      // asserted in client.spec.ts, so a rename cannot silently regress).
      if (isRevisionCommandNotFound(fail)) {
        return {
          fileId: input.fileId,
          currentRevisionNo: null,
          sha256: null,
          items: [],
          unsupported: true,
        };
      }
      throw new StorageCommandError('anx.file.revision.list', fail);
    }
    const body = unwrapEnvelope(raw);
    const items = Array.isArray(body.items) ? body.items.map(parseRevisionRow) : [];
    return {
      fileId: str(body.fileId) ?? input.fileId,
      currentRevisionNo: num(body.currentRevisionNo),
      sha256: str(body.sha256),
      items,
      unsupported: false,
    };
  }

  /** Read a past revision's bytes (base64), decoded to a Uint8Array. */
  async function readRevision(input: { fileId: string; revisionNo: number }): Promise<{ bytes: Uint8Array; sizeBytes: number; contentType: string }> {
    const raw = await send('anx.file.revision.read', {
      fileId: input.fileId,
      revisionNo: input.revisionNo,
    });
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.file.revision.read', fail);
    const body = unwrapEnvelope(raw);
    const base64 = str(body.base64Data) ?? '';
    return {
      bytes: base64ToBytes(base64),
      sizeBytes: num(body.sizeBytes) ?? 0,
      contentType: str(body.contentType) ?? 'application/octet-stream',
    };
  }

  /** Revert a file to a past revision (append-only; creates a new revision). */
  async function revertRevision(input: {
    fileId: string;
    revisionNo: number;
    ifMatchRevision?: number;
  }): Promise<{ revertedTo: number; revisionNo: number; sha256: string | null }> {
    const payload: Record<string, unknown> = {
      fileId: input.fileId,
      revisionNo: input.revisionNo,
    };
    if (input.ifMatchRevision != null) payload.ifMatchRevision = input.ifMatchRevision;
    const raw = await send('anx.file.revision.revert', payload);
    const fail = envelopeFailed(raw);
    if (fail.failed) throw new StorageCommandError('anx.file.revision.revert', fail);
    const body = unwrapEnvelope(raw);
    return {
      revertedTo: num(body.revertedTo) ?? input.revisionNo,
      revisionNo: num(body.revisionNo) ?? 0,
      sha256: str(body.sha256),
    };
  }

  return {
    listBucketFiles,
    listWorkspaces,
    listContracts,
    folderList,
    folderTree,
    createFolder,
    backendCapabilities,
    uploadInit,
    upload,
    resolveDownloadUrl,
    downloadBytes,
    listTrash,
    renameFile,
    linkConversationItem,
    moveFile,
    copyFile,
    trashFile,
    deleteFile,
    restoreFile,
    subscriptionContingent,
    listRevisions,
    readRevision,
    revertRevision,
  };
}

/** One revision row in a file's history. */
export type RevisionRow = {
  revisionNo: number;
  parentRevisionNo: number;
  sizeBytes: number;
  sha256: string;
  contentType: string;
  command: string;
  reason: string | null;
  createdBy: Record<string, unknown>;
  createdAt: string | null;
};

export type RevisionPage = {
  fileId: string;
  currentRevisionNo: number | null;
  sha256: string | null;
  items: RevisionRow[];
  /**
   * True when the connected region does not serve `anx.file.revision.list`
   * (`COMMAND_NOT_FOUND`). The explorer then shows a deliberate "history is
   * unavailable on this region" state instead of a raw error.
   */
  unsupported: boolean;
};

export function parseRevisionRow(raw: unknown): RevisionRow {
  const r = asRecord(raw);
  return {
    revisionNo: num(r.revisionNo) ?? 0,
    parentRevisionNo: num(r.parentRevisionNo) ?? 0,
    sizeBytes: num(r.sizeBytes) ?? 0,
    sha256: str(r.sha256) ?? '',
    contentType: str(r.contentType) ?? 'application/octet-stream',
    command: str(r.command) ?? '',
    reason: str(r.reason),
    createdBy: asRecord(r.createdBy),
    createdAt: str(r.createdAt),
  };
}

export type UploadInit = {
  fileId: string;
  storageKey: string | null;
  /** Authoritative per-file presign-PUT signal from `upload-init`. */
  presignPut: boolean;
  presignUrl: string | null;
  raw: Record<string, unknown>;
};

export class StorageCommandError extends Error {
  readonly command: string;
  readonly code?: string;
  constructor(
    command: string,
    fail: { code?: string; message?: string },
  ) {
    super(`${command} failed${fail.code ? ` (${fail.code})` : ''}: ${fail.message ?? 'unknown error'}`);
    this.name = 'StorageCommandError';
    this.command = command;
    this.code = fail.code;
  }
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64_LOOKUP = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) table[BASE64_ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/**
 * Encode bytes to base64. Pure JS so the same code path runs in Node
 * (desktop / CLI) and React Native (Hermes, where `btoa`/`Buffer` may be
 * missing or only shimmed inconsistently).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[((b1 & 0x0f) << 2) | (b2 >> 6)] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[b2 & 0x3f] : '=';
  }
  return out;
}

/** Decode base64 to bytes. Tolerates padding and embedded whitespace. */
export function base64ToBytes(base64: string): Uint8Array {
  const clean = String(base64 ?? '').replace(/[\s=]/g, '');
  const len = clean.length;
  const out = new Uint8Array((len >> 2) * 3 + (len % 4 === 2 ? 1 : len % 4 === 3 ? 2 : 0));
  let outIdx = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < len; i += 1) {
    const value = BASE64_LOOKUP[clean.charCodeAt(i)];
    if (value < 0) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIdx] = (buffer >> bits) & 0xff;
      outIdx += 1;
    }
  }
  return out;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
