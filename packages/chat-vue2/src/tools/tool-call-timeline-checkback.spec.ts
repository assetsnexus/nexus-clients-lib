// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import Vue from 'vue';
import type { ChatToolRun } from '@nexus/chat-core';
import { ToolCallTimeline } from './ToolCallTimeline';

/**
 * A waiting `schedule_check_back` must stay visible below the collapsed "N tools
 * called" summary row, otherwise the countdown hides inside the collapsed tools
 * and the user cannot tell the agent is waiting (the reported portal bug).
 */

const fut = (s: number) => new Date(Date.now() + s * 1000).toISOString();

function waitingCheckBack(): ChatToolRun {
  return {
    id: 'cb-1',
    tool: 'schedule_check_back',
    label: 'schedule_check_back',
    status: 'paused',
    args: {},
    result: { scheduled: true, delaySec: 120, reason: 'Wait for upload', wakeAt: fut(120) },
  } as ChatToolRun;
}

function successRun(): ChatToolRun {
  return {
    id: 't-1',
    tool: 'anx.crm.lead.create',
    label: 'create lead',
    status: 'success',
    args: {},
    result: { ok: true },
  } as ChatToolRun;
}

const mounted: Array<{ $el: HTMLElement; $destroy(): void }> = [];

function mount(runs: ChatToolRun[]): { $el: HTMLElement } {
  const Ctor = Vue.extend(ToolCallTimeline as never);
  const vm = new Ctor({ propsData: { events: runs, streaming: false } }).$mount();
  mounted.push(vm as never);
  return { $el: (vm as unknown as { $el: HTMLElement }).$el };
}

afterEach(() => {
  while (mounted.length) mounted.pop()!.$destroy();
  vi.clearAllMocks();
});

describe('ToolCallTimeline collapsed check-back (vue2)', () => {
  it('keeps the waiting check-back in the DOM below the summary row', () => {
    const { $el } = mount([successRun(), waitingCheckBack()]);
    const summary = $el.querySelector('.nexus-tool-timeline__summary');
    expect(summary?.textContent).toContain('2 tools called');
    const promoted = $el.querySelector('.nexus-tool-timeline__promoted');
    expect(promoted).not.toBeNull();
    expect(promoted?.querySelector('.nexus-checkback')).not.toBeNull();
    expect(promoted?.textContent).toContain('Wait for upload');
    expect(
      (summary as Element).compareDocumentPosition(promoted as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('does not surface a check-back that already fired', () => {
    const fired = {
      ...waitingCheckBack(),
      result: { scheduled: true, delaySec: 120, reason: 'Wait for upload', wakeAt: fut(0), wakeUp: true },
    } as ChatToolRun;
    const { $el } = mount([successRun(), fired]);
    expect($el.querySelector('.nexus-tool-timeline__promoted')).toBeNull();
  });

  it('promotes nothing when there is no check-back', () => {
    const { $el } = mount([successRun(), successRun()]);
    expect($el.querySelector('.nexus-tool-timeline__promoted')).toBeNull();
  });
});
