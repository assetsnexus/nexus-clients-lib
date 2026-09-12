import { describe, expect, it } from 'vitest';
import {
  applyDraftRestore,
  attachmentChipLabel,
  attachmentThumbUrl,
  attachmentTypeIcon,
  isImageAttachment,
  shouldRenderImageThumb,
  turnAttachmentsFromPending,
} from './attachment-render.util';

describe('isImageAttachment', () => {
  it('detects image mime and extensions for thumbnails', () => {
    expect(isImageAttachment({ mimeType: 'image/png', filename: 'a.png' })).toBe(true);
    expect(isImageAttachment({ filename: 'shot.jpg' })).toBe(true);
    expect(isImageAttachment({ filename: 'q3.xlsx', mimeType: 'application/xlsx' })).toBe(false);
  });
});

describe('shouldRenderImageThumb', () => {
  it('does not render an empty img when the descriptor has no URL', () => {
    expect(
      shouldRenderImageThumb({
        mimeType: 'image/png',
        filename: 'shot.png',
        ref: 'file-1',
      }),
    ).toBe(false);
  });

  it('renders a thumb when a local preview URL exists', () => {
    expect(
      shouldRenderImageThumb({
        mimeType: 'image/png',
        filename: 'shot.png',
        previewUrl: 'blob:http://localhost/abc',
      }),
    ).toBe(true);
  });
});

describe('attachmentChipLabel / type icon', () => {
  it('falls back to filename then mime then ref', () => {
    expect(attachmentChipLabel({ filename: 'notes.pdf', mimeType: 'application/pdf' })).toBe(
      'notes.pdf',
    );
    expect(attachmentChipLabel({ mimeType: 'application/pdf', ref: 'f1' })).toBe('application/pdf');
    expect(attachmentChipLabel({ ref: 'f1' })).toBe('f1');
    expect(attachmentTypeIcon({ mimeType: 'image/png' })).toBe('🖼');
    expect(attachmentTypeIcon({ mimeType: 'application/pdf' })).toBe('PDF');
  });
});

describe('attachmentThumbUrl', () => {
  it('prefers previewUrl over other fields', () => {
    expect(
      attachmentThumbUrl({
        previewUrl: 'blob:1',
        url: 'https://cdn/x',
      }),
    ).toBe('blob:1');
  });
});

describe('turnAttachmentsFromPending', () => {
  it('copies previewUrl, mime, and filename onto the descriptor for the bubble', () => {
    const out = turnAttachmentsFromPending([
      {
        status: 'ready',
        mimeType: 'image/png',
        filename: 'cat.png',
        previewUrl: 'blob:http://localhost/att',
        descriptor: {
          kind: 'entity',
          entityType: 'conversation_attachment',
          ref: 'file-99',
        },
      },
    ]);
    expect(out).toEqual([
      {
        kind: 'entity',
        entityType: 'conversation_attachment',
        ref: 'file-99',
        mimeType: 'image/png',
        filename: 'cat.png',
        previewUrl: 'blob:http://localhost/att',
      },
    ]);
  });
});

describe('applyDraftRestore', () => {
  it('vision-warn restores text only — not pendingItems', () => {
    const next = applyDraftRestore(
      { draft: '', pendingItems: [] },
      { text: 'hello', pendingItems: [{ id: '1' }] },
      { textOnly: true },
    );
    expect(next.draft).toBe('hello');
    expect(next.pendingItems).toEqual([]);
  });

  it('cancel restores attachments', () => {
    const next = applyDraftRestore(
      { draft: '', pendingItems: [] },
      { text: 'hello', pendingItems: [{ id: '1' }] },
    );
    expect(next.pendingItems).toEqual([{ id: '1' }]);
  });
});
