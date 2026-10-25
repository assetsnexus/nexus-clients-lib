/**
 * ContactActionSheet label regression.
 *
 * The sheet used to render `Open {h.title || h.conversationId}`, so a title-less
 * agent thread showed the raw internal id `1792316062792-nm26u6zve` where a
 * person's name belongs. These tests pin the shared precedence on the exact
 * render path: displayTitle → title → agentName → neutral literal, and never the
 * conversation id.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ChatContact, NexusChat } from '@nexus/chat-core';
import { ContactActionSheet } from './ContactActionSheet.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CONVERSATION_ID = '1792316062792-nm26u6zve';

const CONTACT = {
  id: 've-1',
  name: 'Rune',
  type: 'agent',
  virtualEmployeeId: 've-1',
} as unknown as ChatContact;

type HistoryRow = Record<string, unknown>;

function makeFakeChat(rows: HistoryRow[]): NexusChat {
  return {
    history: vi.fn(async () => rows),
    getState: () => ({ panels: [{ conversationId: CONVERSATION_ID }], activePanelIndex: 0, conversationId: CONVERSATION_ID }),
  } as unknown as NexusChat;
}

type Mounted = { container: HTMLElement; root: Root; unmount: () => void };
const mounted: Mounted[] = [];

async function mountSheet(rows: HistoryRow[]): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <ContactActionSheet contact={CONTACT} chat={makeFakeChat(rows)} onClose={() => {}} />,
    );
  });
  mounted.push({
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  });
  return container;
}

/** Button labels that start an open-the-thread action. */
function openLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll('button'))
    .map((b) => b.textContent?.trim() || '')
    .filter((text) => text.startsWith('Open ') && !text.startsWith('Open latest'))
    .map((text) => text.replace(/^Open\s+/, '').replace(/\s+\((active|archived)\)$/, ''));
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
  vi.clearAllMocks();
});

describe('ContactActionSheet conversation labels', () => {
  it('prefers the region-resolved displayTitle', async () => {
    const container = await mountSheet([
      { conversationId: CONVERSATION_ID, displayTitle: 'Support thread', title: 'Old title', agentName: 'Xcamp' },
    ]);
    expect(openLabels(container)).toEqual(['Support thread']);
  });

  it('uses the stored title when there is no displayTitle', async () => {
    const container = await mountSheet([{ conversationId: CONVERSATION_ID, title: 'Project kickoff' }]);
    expect(openLabels(container)).toEqual(['Project kickoff']);
  });

  it('uses the agent name when neither displayTitle nor title is present', async () => {
    const container = await mountSheet([{ conversationId: CONVERSATION_ID, title: null, agentName: 'Xcamp' }]);
    expect(openLabels(container)).toEqual(['Xcamp']);
  });

  it('falls back to the neutral literal — NEVER the raw conversationId', async () => {
    const container = await mountSheet([{ conversationId: CONVERSATION_ID }]);
    const labels = openLabels(container);
    expect(labels).toEqual(['Untitled conversation']);
    expect(labels[0]).not.toBe(CONVERSATION_ID);
    expect(container.textContent || '').not.toContain(CONVERSATION_ID);
  });

  it('keeps the status suffix while never leaking the id', async () => {
    const container = await mountSheet([
      { conversationId: CONVERSATION_ID, displayTitle: 'Old chat', status: 'archived' },
    ]);
    const button = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Old chat'),
    );
    expect(button?.textContent?.trim()).toBe('Open Old chat (archived)');
    expect(container.textContent || '').not.toContain(CONVERSATION_ID);
  });
});
