import { describe, expect, it } from 'vitest';
import {
  buildStorageExplorerUrl,
  displayToolCallName,
  formatCheckBackCountdown,
  formatToolResultText,
  isCheckBackOverdue,
  isCheckBackTriggerSettledError,
  parseMediaImages,
  parsePresentFileItems,
  presentToolRunRow,
  toConsoleStorageExplorerUrl,
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
    expect(
      toConsoleStorageExplorerUrl('/user/storage/browser/ws1?file=f1', '/b2b/ai-employees'),
    ).toBe('/b2b/storage/browser/ws1?file=f1');
  });

  it('does not treat a JSON or text tool result as a file', () => {
    expect(
      parsePresentFileItems({
        projects: [{ id: 'p1', name: 'Alpha' }],
      }),
    ).toEqual([]);
    expect(
      parsePresentFileItems({
        content: [{ type: 'text', text: '[{"id":"p1"}]' }],
      }),
    ).toEqual([]);
    expect(parsePresentFileItems('plain text result')).toEqual([]);
    expect(parsePresentFileItems({ files: [{ name: 'readme.md' }] })).toEqual([]);
    expect(parsePresentFileItems({ label: 'File', mimeType: 'application/json' })).toEqual([]);
  });

  it('keeps a stored file when the result actually identifies one', () => {
    const files = parsePresentFileItems({
      fileId: 'f9',
      label: 'notes.pdf',
      mimeType: 'application/pdf',
      presignedUrl: 'https://cdn/notes.pdf',
    });
    expect(files).toHaveLength(1);
    expect(files[0]?.label).toBe('notes.pdf');
  });
});

describe('tool call row', () => {
  it('shows mcp__catalog__list_projects as list_projects with the result visible', () => {
    expect(displayToolCallName('mcp__catalog__list_projects')).toEqual({
      name: 'list_projects',
      server: 'catalog',
    });
    const result = { projects: [{ id: 'p1', name: 'Alpha' }] };
    const row = presentToolRunRow({
      tool: 'mcp__catalog__list_projects',
      label: 'mcp__catalog__list_projects',
      status: 'success',
      result,
    });
    expect(row).toMatchObject({
      name: 'list_projects',
      server: 'catalog',
      status: 'success',
      files: [],
    });
    expect(row.resultText).toContain('"name": "Alpha"');
    expect(row.resultText).not.toBe('File');
  });

  it('keeps a real success body as success text and does not label an HTTP error body as a file', () => {
    const ok = presentToolRunRow({
      tool: 'list_projects',
      status: 'success',
      result: { ok: true, projects: [] },
    });
    expect(ok.status).toBe('success');
    expect(ok.files).toEqual([]);
    expect(ok.resultText).toContain('"ok": true');

    const denied = parsePresentFileItems({
      responseCode: 403,
      message: 'Missing grant',
    });
    expect(denied).toEqual([]);
    expect(formatToolResultText({ responseCode: 500, message: 'upstream failed' })).toContain(
      'upstream failed',
    );
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
