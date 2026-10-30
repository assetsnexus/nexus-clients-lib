/**
 * A finished turn collapses its tool calls into one "N tools called" summary
 * row. A still-waiting `schedule_check_back` used to disappear inside that
 * collapsed drawer, so the user could not see that the agent is waiting.
 *
 * These tests render the real component and assert the check-back card stays
 * in the DOM — below the summary row, outside the collapsed tool list — while
 * completed / fired check-backs do not linger.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ChatToolRun, NexusChat } from '@nexus/chat-core';
import { ToolTimeline } from './ToolTimeline.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const fut = (s: number) => new Date(Date.now() + s * 1000).toISOString();

function waitingCheckBack(): ChatToolRun {
  return {
    id: 'cb-1',
    tool: 'schedule_check_back',
    label: 'schedule_check_back',
    status: 'paused',
    args: {},
    result: { scheduled: true, delaySec: 120, reason: 'Wait for upload', wakeAt: fut(120) },
  };
}

function successRun(): ChatToolRun {
  return {
    id: 't-1',
    tool: 'anx.crm.lead.create',
    label: 'create lead',
    status: 'success',
    args: {},
    result: { ok: true },
  };
}

type Mounted = { container: HTMLElement; root: Root; unmount: () => void };
const mounted: Mounted[] = [];

function mount(runs: ChatToolRun[], props: Record<string, unknown> = {}): Mounted {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const chat = { triggerCheckBack: () => Promise.resolve() } as unknown as NexusChat;
  act(() => {
    root.render(<ToolTimeline runs={runs} streaming={false} chat={chat} {...props} />);
  });
  const entry: Mounted = {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
  mounted.push(entry);
  return entry;
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.unmount();
});

describe('ToolTimeline collapsed check-back', () => {
  it('keeps a waiting check-back visible below the collapsed summary row', () => {
    const { container } = mount([successRun(), waitingCheckBack()]);
    const timeline = container.querySelector('[data-nexus-tool-timeline="summary"]');
    expect(timeline).not.toBeNull();
    expect(container.querySelector('.nexus-chat__tool-summary')?.textContent).toContain(
      '2 tools called',
    );
    const promoted = container.querySelector('.nexus-chat__tool-timeline-promoted');
    expect(promoted).not.toBeNull();
    // The card, with its countdown, is rendered (not hidden in the drawer).
    expect(promoted?.querySelector('.nexus-chat__checkback')).not.toBeNull();
    expect(promoted?.textContent).toContain('Wait for upload');
    // And it sits after the summary button, not before it.
    const summary = container.querySelector('.nexus-chat__tool-summary')!;
    expect(summary.compareDocumentPosition(promoted!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('does not surface a check-back that already fired', () => {
    const fired: ChatToolRun = {
      ...waitingCheckBack(),
      result: { scheduled: true, delaySec: 120, reason: 'Wait for upload', wakeAt: fut(0), wakeUp: true },
    };
    const { container } = mount([successRun(), fired]);
    expect(container.querySelector('.nexus-chat__tool-timeline-promoted')).toBeNull();
  });

  it('promotes nothing when there is no check-back at all', () => {
    const { container } = mount([successRun(), successRun()]);
    expect(container.querySelector('.nexus-chat__tool-timeline-promoted')).toBeNull();
  });

  it('drops the promoted card once the user expands the tools', () => {
    const { container } = mount([successRun(), waitingCheckBack()]);
    act(() => {
      (container.querySelector('.nexus-chat__tool-summary') as HTMLButtonElement).dispatchEvent(
        new MouseEvent('click', { bubbles: true }),
      );
    });
    // Expanded: every row (including the check-back card) renders inline instead.
    expect(container.querySelector('.nexus-chat__tool-timeline-promoted')).toBeNull();
    const cards = container.querySelectorAll('.nexus-chat__checkback');
    expect(cards.length).toBe(1);
  });
});
