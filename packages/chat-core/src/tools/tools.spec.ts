import { describe, expect, it } from 'vitest';
import {
  buildStorageExplorerUrl,
  formatCheckBackCountdown,
  isCheckBackOverdue,
  isCheckBackTriggerSettledError,
  parseMediaImages,
  parsePresentFileItems,
  parseScheduleCheckBackResult,
  parseUserChoiceOptions,
} from './index.js';

describe('schedule-check-back', () => {
  it('parses a scheduled result and formats countdown', () => {
    const wakeAt = new Date(Date.now() + 90_000).toISOString();
    const parsed = parseScheduleCheckBackResult({
      scheduled: true,
      delaySec: 90,
      reason: 'Wait for upload',
      wakeAt,
    });
    expect(parsed?.reason).toBe('Wait for upload');
    expect(isCheckBackOverdue(parsed!, Date.now())).toBe(false);
    expect(formatCheckBackCountdown(65)).toBe('1:05');
  });

  it('treats settled trigger errors as non-retryable', () => {
    expect(isCheckBackTriggerSettledError(new Error('No pending check-back'))).toBe(true);
    expect(isCheckBackTriggerSettledError(new Error('network'))).toBe(false);
  });
});

describe('present-file', () => {
  it('builds explorer deep-links and parses files[]', () => {
    expect(buildStorageExplorerUrl('ws1', 'f1')).toBe(
      '/user/storage/browser/ws1?file=f1',
    );
    const files = parsePresentFileItems({
      files: [
        {
          label: 'shot.png',
          mimeType: 'image/png',
          presignedUrl: 'https://cdn/x',
          workspaceId: 'ws1',
          fileId: 'f1',
        },
      ],
    });
    expect(files).toHaveLength(1);
    expect(files[0]?.explorerUrl).toContain('/user/storage/browser/ws1');
  });
});

describe('media-result', () => {
  it('parses carousel images and choice options', () => {
    expect(
      parseMediaImages({
        images: [
          { index: 1, label: 'A', imageUrl: 'https://cdn/a.png' },
          { index: 2, label: 'B', serveUrl: 'https://cdn/b.png' },
        ],
      }),
    ).toHaveLength(2);
    expect(
      parseUserChoiceOptions({
        args: { options: [{ id: '1', label: 'Yes' }, { id: '2', label: 'No' }] },
      }),
    ).toEqual([
      { id: '1', label: 'Yes' },
      { id: '2', label: 'No' },
    ]);
  });
});
