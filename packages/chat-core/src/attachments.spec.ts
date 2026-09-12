import { describe, expect, it } from 'vitest';
import {
  attachmentFileIds,
  attachmentsForCommand,
  mergeAttachmentDisplay,
} from './attachments.js';

describe('attachmentFileIds', () => {
  it('extracts conversation_attachment refs only', () => {
    expect(
      attachmentFileIds([
        { kind: 'entity', entityType: 'conversation_attachment', ref: 'file-1' },
        { kind: 'entity', entityType: 'knowledge_artifact', ref: 'k-1' },
        { kind: 'bucket', bucketId: 'b', path: '/x' },
      ]),
    ).toEqual(['file-1']);
  });
});

describe('attachmentsForCommand', () => {
  it('strips blob preview URLs so the command payload stays a region descriptor', () => {
    expect(
      attachmentsForCommand([
        {
          kind: 'entity',
          entityType: 'conversation_attachment',
          ref: 'file-1',
          mimeType: 'image/png',
          filename: 'a.png',
          previewUrl: 'blob:http://localhost/x',
        },
      ]),
    ).toEqual([
      {
        kind: 'entity',
        entityType: 'conversation_attachment',
        ref: 'file-1',
        mimeType: 'image/png',
        filename: 'a.png',
      },
    ]);
  });

  it('drops empty mime/filename and unknown display keys', () => {
    expect(
      attachmentsForCommand([
        {
          kind: 'entity',
          entityType: 'conversation_attachment',
          ref: 'file-1',
          mimeType: '',
          filename: '  ',
          thumbnailUrl: 'https://cdn.example/t.png',
        } as never,
      ]),
    ).toEqual([
      {
        kind: 'entity',
        entityType: 'conversation_attachment',
        ref: 'file-1',
      },
    ]);
  });
});

describe('mergeAttachmentDisplay', () => {
  it('keeps local previewUrl when history rehydrate has only a fileId', () => {
    const merged = mergeAttachmentDisplay(
      [
        {
          attachments: [
            {
              kind: 'entity',
              entityType: 'conversation_attachment',
              ref: 'file-1',
              previewUrl: 'blob:http://localhost/keep',
            },
          ],
        },
      ],
      [
        {
          kind: 'entity',
          entityType: 'conversation_attachment',
          ref: 'file-1',
          filename: 'a.png',
        },
      ],
    );
    expect(merged?.[0]).toMatchObject({
      ref: 'file-1',
      filename: 'a.png',
      previewUrl: 'blob:http://localhost/keep',
    });
  });
});
