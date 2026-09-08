import type { IoDescriptor } from '../types.js';
import type { ChatAttachmentRetentionPolicy } from './attachment-ingest.js';

export type UploadAttachmentClient = {
  send: (
    command: string,
    payload?: Record<string, unknown>,
    opts?: { requestId?: string },
  ) => Promise<unknown>;
};

export type UploadAttachmentFile = {
  name?: string;
  type?: string;
  size: number;
  /** Browser File / Blob, or any body fetch accepts for PUT. */
  body: Blob | ArrayBuffer | Uint8Array | string;
};

export type UploadAttachmentResult = {
  fileId: string;
  storageKey: string;
  workspaceId: string;
  mimeType: string;
  filename: string;
  descriptor: Extract<IoDescriptor, { kind: 'entity' }>;
};

class UploadCommandError extends Error {
  readonly code?: string;
  readonly command: string;
  constructor(command: string, message: string, code?: string) {
    super(message || `${command} failed`);
    this.name = 'UploadCommandError';
    this.command = command;
    this.code = code;
  }
}

function unwrapData(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== 'object') return {};
  const r = result as Record<string, unknown>;
  if (r.data && typeof r.data === 'object') return r.data as Record<string, unknown>;
  if (r.responseObject && typeof r.responseObject === 'object') {
    return r.responseObject as Record<string, unknown>;
  }
  return r;
}

function failInfo(result: unknown): { code?: string; message?: string } | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as {
    ok?: unknown;
    message?: string;
    error?: { code?: string; message?: string };
    errorObjects?: Array<{ code?: string; message?: string }>;
    responseCode?: unknown;
    response?: { errorObjects?: Array<{ code?: string; message?: string }> };
  };
  if (r.ok === false) {
    const nested = r.error || r.errorObjects?.[0] || r.response?.errorObjects?.[0];
    return {
      code: nested?.code,
      message: r.message || nested?.message,
    };
  }
  if ('responseCode' in r) {
    const code = Number(r.responseCode);
    if (Number.isFinite(code) && code !== 200) {
      const nested = r.errorObjects?.[0] || r.error;
      return { code: nested?.code, message: nested?.message || `${code}` };
    }
  }
  return null;
}

function assertCommandOk(result: unknown, command: string): Record<string, unknown> {
  const fail = failInfo(result);
  if (fail) {
    throw new UploadCommandError(
      command,
      fail.message || `${command} failed`,
      fail.code,
    );
  }
  return unwrapData(result);
}

function advertisedPresignPut(init: Record<string, unknown>): boolean | undefined {
  const v = init.presignPut;
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  return undefined;
}

function isPresignUnsupported(err: unknown): boolean {
  const code =
    err && typeof err === 'object' && 'code' in err
      ? String((err as { code?: unknown }).code || '')
      : '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    code === 'STORAGE_CAPABILITY_UNSUPPORTED' ||
    /presignPut|does not support ['"]?presignPut/i.test(msg)
  );
}

async function bodyToBase64(body: Blob | ArrayBuffer | Uint8Array | string): Promise<string> {
  if (typeof body === 'string') {
    if (typeof Buffer !== 'undefined') return Buffer.from(body, 'utf8').toString('base64');
    return btoa(body);
  }
  let bytes: Uint8Array;
  if (body instanceof Uint8Array) {
    bytes = body;
  } else if (typeof ArrayBuffer !== 'undefined' && body instanceof ArrayBuffer) {
    bytes = new Uint8Array(body);
  } else if (typeof Blob !== 'undefined' && typeof (body as Blob).arrayBuffer === 'function') {
    bytes = new Uint8Array(await (body as Blob).arrayBuffer());
  } else {
    throw new Error('uploadAttachment: unsupported file body');
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function conversationAttachmentDescriptor(
  fileId: string,
  opts?: { mimeType?: string; filename?: string },
): Extract<IoDescriptor, { kind: 'entity' }> {
  return {
    kind: 'entity',
    entityType: 'conversation_attachment',
    ref: fileId,
    ...(opts?.mimeType ? { mimeType: opts.mimeType } : {}),
    ...(opts?.filename ? { filename: opts.filename } : {}),
  };
}

/**
 * Thin consumer of region S1 upload path:
 * upload-init → (presign.put + HTTP PUT + complete-presign) when the backend supports
 * presigned PUT, else upload-complete (base64) — same split as Storage Explorer.
 * Returns the region fileId (only accepted conversation_attachment ref).
 */
export type ChatAttachmentEncryptionTier = 'org' | 'user-known' | 'region' | 'user-device' | 'none';

export type UploadAttachmentOpts = {
  workspaceId?: string;
  folderId?: string;
  originalName?: string;
  module?: string;
  /**
   * Chat attachments should use `org` (org session) or `user-known` (personal).
   * When omitted for `module:'chat-attachment'`, region defaults from identity.orgId.
   */
  encryptionTier?: ChatAttachmentEncryptionTier;
  /** Region FileRecord retention; drop-to-conversation uses `{ kind:'temporary', maxRetentionMs }`. */
  retentionPolicy?: ChatAttachmentRetentionPolicy;
  /** Abort in-flight PUT / complete; pending FileRecord is trashed. */
  signal?: AbortSignal;
  onProgress?: (evt: UploadProgressEvent) => void;
};

export type UploadProgressEvent = {
  fraction: number;
  stage: 'init' | 'put' | 'complete';
};

export function isUploadAbortError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = String((err as { name?: unknown }).name || '');
  const code = String((err as { code?: unknown }).code || '');
  return name === 'AbortError' || code === 'ABORT_ERR';
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    const err = new Error('Upload cancelled');
    err.name = 'AbortError';
    throw err;
  }
}

function reportProgress(
  onProgress: UploadAttachmentOpts['onProgress'] | undefined,
  fraction: number,
  stage: UploadProgressEvent['stage'],
) {
  if (typeof onProgress !== 'function') return;
  onProgress({ fraction: Math.max(0, Math.min(1, fraction)), stage });
}

function putWithXhr(
  url: string,
  body: Blob | ArrayBuffer | Uint8Array | string,
  args: {
    contentType: string;
    signal?: AbortSignal;
    onProgress?: UploadAttachmentOpts['onProgress'];
  },
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', args.contentType);
    xhr.upload.onprogress = (ev) => {
      if (!ev.lengthComputable) return;
      reportProgress(args.onProgress, 0.15 + 0.7 * (ev.loaded / ev.total), 'put');
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Presigned upload failed (HTTP ${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Presigned upload failed (network)'));
    xhr.onabort = () => {
      const err = new Error('Upload cancelled');
      err.name = 'AbortError';
      reject(err);
    };
    const onAbort = () => xhr.abort();
    if (args.signal) {
      if (args.signal.aborted) {
        onAbort();
        return;
      }
      args.signal.addEventListener('abort', onAbort, { once: true });
    }
    xhr.send(body as XMLHttpRequestBodyInit);
  });
}

async function putObjectBytes(
  url: string,
  body: Blob | ArrayBuffer | Uint8Array | string,
  args: {
    contentType: string;
    signal?: AbortSignal;
    onProgress?: UploadAttachmentOpts['onProgress'];
  },
): Promise<void> {
  const canXhr =
    typeof XMLHttpRequest !== 'undefined' && typeof args.onProgress === 'function';
  if (canXhr) {
    await putWithXhr(url, body, args);
    return;
  }
  const putHttp = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': args.contentType },
    body: body as BodyInit,
    signal: args.signal,
  });
  if (!putHttp.ok) {
    throw new Error(`Presigned upload failed (HTTP ${putHttp.status})`);
  }
}

export async function uploadAttachment(
  client: UploadAttachmentClient,
  file: UploadAttachmentFile | File | Blob,
  opts?: UploadAttachmentOpts,
): Promise<UploadAttachmentResult> {
  const isBrowserFile =
    typeof File !== 'undefined' && file instanceof File
      ? file
      : typeof Blob !== 'undefined' && file instanceof Blob
        ? file
        : null;

  const filename =
    opts?.originalName ||
    (isBrowserFile && 'name' in isBrowserFile && typeof isBrowserFile.name === 'string'
      ? isBrowserFile.name
      : null) ||
    (file as UploadAttachmentFile).name ||
    'attachment.bin';
  const mimeType =
    (isBrowserFile && isBrowserFile.type) ||
    (file as UploadAttachmentFile).type ||
    'application/octet-stream';
  const sizeBytes = isBrowserFile
    ? isBrowserFile.size
    : Number((file as UploadAttachmentFile).size || 0);
  const body = isBrowserFile ? isBrowserFile : (file as UploadAttachmentFile).body;

  if (!sizeBytes || sizeBytes < 1) {
    throw new Error('uploadAttachment requires a non-empty file');
  }

  throwIfAborted(opts?.signal);
  reportProgress(opts?.onProgress, 0.02, 'init');

  const module = opts?.module || 'chat-attachment';
  const init = assertCommandOk(
    await client.send('anx.file.upload-init', {
      ...(opts?.workspaceId ? { workspaceId: opts.workspaceId } : {}),
      ...(opts?.folderId ? { folderId: opts.folderId } : {}),
      originalName: filename,
      contentType: mimeType,
      expectedSize: sizeBytes,
      module,
      ...(opts?.encryptionTier ? { encryptionTier: opts.encryptionTier } : {}),
      ...(opts?.retentionPolicy ? { retentionPolicy: opts.retentionPolicy } : {}),
    }),
    'anx.file.upload-init',
  );

  const fileId = String(init.fileId || '');
  const storageKey = String(init.storageKey || '');
  const workspaceId = String(init.workspaceId || opts?.workspaceId || '');
  if (!fileId || !storageKey || !workspaceId) {
    throw new Error('upload-init did not return fileId/storageKey/workspaceId');
  }
  throwIfAborted(opts?.signal);
  reportProgress(opts?.onProgress, 0.12, 'init');

  const usePresign = advertisedPresignPut(init) !== false;

  try {
    if (usePresign) {
      try {
        await uploadViaPresign(client, {
          fileId,
          workspaceId,
          storageKey,
          mimeType,
          sizeBytes,
          body,
          signal: opts?.signal,
          onProgress: opts?.onProgress,
        });
      } catch (err) {
        if (advertisedPresignPut(init) === true || !isPresignUnsupported(err)) {
          throw err;
        }
        await uploadViaComplete(client, {
          fileId,
          body,
          signal: opts?.signal,
          onProgress: opts?.onProgress,
        });
      }
    } else {
      await uploadViaComplete(client, {
        fileId,
        body,
        signal: opts?.signal,
        onProgress: opts?.onProgress,
      });
    }
  } catch (err) {
    try {
      await client.send('anx.storage.bucket.trash-file', { fileId });
    } catch {
      /* best-effort orphan cleanup */
    }
    throw err;
  }

  return {
    fileId,
    storageKey,
    workspaceId,
    mimeType,
    filename,
    descriptor: conversationAttachmentDescriptor(fileId, { mimeType, filename }),
  };
}

async function uploadViaPresign(
  client: UploadAttachmentClient,
  args: {
    fileId: string;
    workspaceId: string;
    storageKey: string;
    mimeType: string;
    sizeBytes: number;
    body: Blob | ArrayBuffer | Uint8Array | string;
    signal?: AbortSignal;
    onProgress?: UploadAttachmentOpts['onProgress'];
  },
): Promise<void> {
  throwIfAborted(args.signal);
  const put = assertCommandOk(
    await client.send('anx.storage.presign.put', {
      workspaceId: args.workspaceId,
      objectKey: args.storageKey,
      fileId: args.fileId,
      contentType: args.mimeType,
      contentLength: args.sizeBytes,
    }),
    'anx.storage.presign.put',
  );
  const url = String(put.url || '');
  if (!url) throw new Error('presign.put did not return url');
  throwIfAborted(args.signal);
  reportProgress(args.onProgress, 0.15, 'put');

  await putObjectBytes(url, args.body, {
    contentType: args.mimeType,
    signal: args.signal,
    onProgress: args.onProgress,
  });
  throwIfAborted(args.signal);
  reportProgress(args.onProgress, 0.9, 'complete');

  assertCommandOk(
    await client.send('anx.file.upload-complete-presign', {
      fileId: args.fileId,
      sizeBytes: args.sizeBytes,
      contentType: args.mimeType,
    }),
    'anx.file.upload-complete-presign',
  );
  reportProgress(args.onProgress, 1, 'complete');
}

async function uploadViaComplete(
  client: UploadAttachmentClient,
  args: {
    fileId: string;
    body: Blob | ArrayBuffer | Uint8Array | string;
    signal?: AbortSignal;
    onProgress?: UploadAttachmentOpts['onProgress'];
  },
): Promise<void> {
  throwIfAborted(args.signal);
  reportProgress(args.onProgress, 0.25, 'put');
  const base64Data = await bodyToBase64(args.body);
  throwIfAborted(args.signal);
  reportProgress(args.onProgress, 0.7, 'complete');
  assertCommandOk(
    await client.send('anx.file.upload-complete', {
      fileId: args.fileId,
      base64Data,
    }),
    'anx.file.upload-complete',
  );
  reportProgress(args.onProgress, 1, 'complete');
}
