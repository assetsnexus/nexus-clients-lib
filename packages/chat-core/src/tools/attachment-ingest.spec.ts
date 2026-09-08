import { describe, expect, it } from 'vitest';
import {
  CHAT_CONVERSATION_ATTACHMENT_TTL_MS,
  MAX_CHAT_ATTACHMENT_BYTES,
  MAX_CHAT_ATTACHMENTS_PER_MESSAGE,
  collectFilesFromClipboard,
  dataTransferHasFiles,
  extFromMime,
  looksLikeImageFile,
  partitionChatAttachmentFiles,
  snapshotChatFiles,
  uploadOptsForChatFileDestination,
} from './attachment-ingest.js';

function namedBlob(name: string, bytes: number, type = 'text/plain'): File {
  const blob = new Blob([new Uint8Array(Math.max(0, bytes))], { type });
  return new File([blob], name, { type, lastModified: 1 });
}

function sized(name: string, size: number, type = 'text/plain') {
  return { name, size, type, lastModified: 1 };
}

describe('attachment-ingest', () => {
  it('collects clipboard files from items (screenshot path) and files[]', () => {
    const shot = namedBlob('image.png', 4, 'image/png');
    const doc = namedBlob('notes.txt', 2, 'text/plain');
    const files = collectFilesFromClipboard({
      items: [
        { kind: 'string' },
        { kind: 'file', getAsFile: () => shot },
      ],
      files: [shot, doc],
    });
    expect(files).toHaveLength(2);
    expect(files.map((f) => f.name).sort()).toEqual(['image.png', 'notes.txt']);
  });

  it('detects Files in dataTransfer.types', () => {
    expect(dataTransferHasFiles({ types: ['Files'] })).toBe(true);
    expect(dataTransferHasFiles({ types: ['text/plain'] })).toBe(false);
    expect(dataTransferHasFiles(null)).toBe(false);
  });

  it('partitions by empty / size / count caps', () => {
    const ok = sized('a.txt', 8);
    const empty = sized('e.txt', 0);
    const huge = sized('big.bin', MAX_CHAT_ATTACHMENT_BYTES + 1);
    const extras = Array.from({ length: MAX_CHAT_ATTACHMENTS_PER_MESSAGE }, (_, i) =>
      sized(`n${i}.txt`, 2),
    );
    const { accepted, rejected } = partitionChatAttachmentFiles(
      [empty, ok, huge, ...extras],
      { alreadyPending: 0 },
    );
    expect(accepted).toHaveLength(MAX_CHAT_ATTACHMENTS_PER_MESSAGE);
    expect(rejected.some((r) => r.reason === 'empty')).toBe(true);
    expect(rejected.some((r) => r.reason === 'too_large')).toBe(true);
    expect(rejected.some((r) => r.reason === 'too_many')).toBe(true);
  });

  it('respects already-pending slots', () => {
    const files = [sized('a.txt', 2), sized('b.txt', 2)];
    const { accepted, rejected } = partitionChatAttachmentFiles(files, {
      alreadyPending: MAX_CHAT_ATTACHMENTS_PER_MESSAGE - 1,
    });
    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.reason).toBe('too_many');
  });

  it('maps destinations onto existing upload-init modules', () => {
    expect(uploadOptsForChatFileDestination('conversation')).toEqual({
      module: 'chat-attachment',
    });
    expect(uploadOptsForChatFileDestination('conversation', { withExpiry: true })).toEqual({
      module: 'chat-attachment',
      retentionPolicy: {
        kind: 'temporary',
        maxRetentionMs: CHAT_CONVERSATION_ATTACHMENT_TTL_MS,
      },
    });
    expect(
      uploadOptsForChatFileDestination('bucket', { workspaceId: 'ws-1' }),
    ).toEqual({
      module: 'storage-browser',
      workspaceId: 'ws-1',
    });
  });

  it('snapshotChatFiles copies bytes so later reads stay valid', async () => {
    const original = namedBlob('clip.png', 6, 'image/png');
    const [copy] = await snapshotChatFiles([original]);
    expect(copy).not.toBe(original);
    expect(copy.name).toBe('clip.png');
    expect(copy.size).toBe(6);
    expect(copy.type).toBe('image/png');
    expect(new Uint8Array(await copy.arrayBuffer()).length).toBe(6);
  });

  it('classifies image files by mime or extension', () => {
    expect(looksLikeImageFile({ name: 'x.JPG', size: 1, type: '' })).toBe(true);
    expect(looksLikeImageFile({ name: 'a.pdf', size: 1, type: 'application/pdf' })).toBe(false);
    expect(extFromMime('image/png')).toBe('.png');
  });
});
