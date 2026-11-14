/**
 * Elevation-dock resume regression.
 *
 * Recording a decision via `anx.ai-agents.elevations.respond` is NOT enough to
 * continue the paused turn: the pause rides the `client_tool` rail, which
 * soft-locks the dispatcher until a `client-tool.result` resume clears it. The
 * dock must call `chat.resumeClientTool` with the prompt's own `callId` after a
 * successful decision — for **both** approve and deny (inference reverts the tool
 * on a denial). Without it the agent only continued on an unrelated wake/message.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { CommandClient, NexusChat } from '@nexus/chat-core';
import { PermissionElevationDock } from './GrantCards.js';
import { withElevationResumeBinding } from '../../grants/pending-elevation.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type ResumeCall = { callId: string; conversationId?: string; result: unknown };

const mounted: Array<{ container: HTMLElement; root: Root }> = [];

afterEach(() => {
  while (mounted.length) {
    const entry = mounted.pop()!;
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

/** A client that always records the decision successfully. */
function makeClient(): CommandClient {
  return {
    send: vi.fn(async (command: string) =>
      command === 'anx.ai-agents.elevations.respond'
        ? { ok: true, responseCode: 200 }
        : { ok: true },
    ),
  } as unknown as CommandClient;
}

async function mountDock(opts: {
  client: CommandClient;
  chat: Pick<NexusChat, 'resumeClientTool'>;
  prompts: Parameters<typeof PermissionElevationDock>[0]['prompts'];
}): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <PermissionElevationDock
        prompts={opts.prompts}
        client={opts.client}
        chat={opts.chat}
        conversationId="c1"
        onChange={() => {}}
        onSca={() => {}}
      />,
    );
  });
  mounted.push({ container, root });
  return container;
}

function clickByText(container: HTMLElement, text: string): void {
  const button = Array.from(container.querySelectorAll('button')).find(
    (el) => el.textContent?.trim() === text,
  );
  if (!button) throw new Error(`button "${text}" not found`);
  act(() => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const flush = async () => {
  for (let i = 0; i < 6; i += 1) await Promise.resolve();
};

describe('PermissionElevationDock resumes the paused call', () => {
  it('approving resumes the paused call with the prompt callId and decision', async () => {
    const resumeClientTool = vi.fn(async (_opts: ResumeCall) => ({ ok: true }));
    const prompt = { elevationId: 'el-1', pack: 'crm', callId: 'call-1' };

    const container = await mountDock({
      client: makeClient(),
      chat: { resumeClientTool } as unknown as Pick<NexusChat, 'resumeClientTool'>,
      prompts: [prompt],
    });

    clickByText(container, 'Allow once');
    await act(async () => {
      await flush();
    });

    expect(resumeClientTool).toHaveBeenCalledTimes(1);
    expect(resumeClientTool).toHaveBeenCalledWith({
      callId: 'call-1',
      conversationId: 'c1',
      result: { approved: true, decision: 'allow_once' },
    });
  });

  it('denying ALSO resumes (as a denial) so the soft-lock clears', async () => {
    const resumeClientTool = vi.fn(async (_opts: ResumeCall) => ({ ok: true }));
    const container = await mountDock({
      client: makeClient(),
      chat: { resumeClientTool } as unknown as Pick<NexusChat, 'resumeClientTool'>,
      prompts: [{ elevationId: 'el-2', callId: 'call-2' }],
    });

    clickByText(container, 'Deny');
    await act(async () => {
      await flush();
    });

    expect(resumeClientTool).toHaveBeenCalledTimes(1);
    expect(resumeClientTool).toHaveBeenCalledWith({
      callId: 'call-2',
      conversationId: 'c1',
      result: { approved: false, decision: 'deny' },
    });
  });

  it('does not resume when the prompt carries no callId', async () => {
    const resumeClientTool = vi.fn(async (_opts: ResumeCall) => ({ ok: true }));
    const container = await mountDock({
      client: makeClient(),
      chat: { resumeClientTool } as unknown as Pick<NexusChat, 'resumeClientTool'>,
      prompts: [{ elevationId: 'el-3' }],
    });

    clickByText(container, 'Allow once');
    await act(async () => {
      await flush();
    });

    expect(resumeClientTool).not.toHaveBeenCalled();
  });

  it('bulk-approving distinct callIds resumes each paused call exactly once', async () => {
    const resumeClientTool = vi.fn(async (_opts: ResumeCall) => ({ ok: true }));
    const container = await mountDock({
      client: makeClient(),
      chat: { resumeClientTool } as unknown as Pick<NexusChat, 'resumeClientTool'>,
      prompts: [
        { elevationId: 'el-a', callId: 'call-a' },
        { elevationId: 'el-b', callId: 'call-b' },
      ],
    });

    clickByText(container, 'Allow all for conversation');
    await act(async () => {
      await flush();
    });

    const callIds = resumeClientTool.mock.calls.map((c) => (c[0] as ResumeCall).callId);
    expect(new Set(callIds)).toEqual(new Set(['call-a', 'call-b']));
    expect(resumeClientTool).toHaveBeenCalledTimes(2);
  });

  it('bulk-approving collapses a shared callId to a single resume', async () => {
    const resumeClientTool = vi.fn(async (_opts: ResumeCall) => ({ ok: true }));
    const container = await mountDock({
      client: makeClient(),
      chat: { resumeClientTool } as unknown as Pick<NexusChat, 'resumeClientTool'>,
      prompts: [
        { elevationId: 'el-c1', callId: 'shared-call' },
        { elevationId: 'el-c2', callId: 'shared-call' },
      ],
    });

    clickByText(container, 'Allow all for conversation');
    await act(async () => {
      await flush();
    });

    expect(resumeClientTool).toHaveBeenCalledTimes(1);
    expect(resumeClientTool).toHaveBeenCalledWith(
      expect.objectContaining({ callId: 'shared-call', conversationId: 'c1' }),
    );
  });
});

describe('withElevationResumeBinding', () => {
  it('binds the paused conversation + callId onto rehydrated rows', () => {
    const bound = withElevationResumeBinding(
      [{ elevationId: 'p1' }, { elevationId: 'p2', callId: 'own-call' }],
      { conversationId: 'c1', callId: 'paused-call' },
    );
    expect(bound[0]).toMatchObject({
      elevationId: 'p1',
      conversationId: 'c1',
      callId: 'paused-call',
    });
    // An already-bound callId wins over the fallback.
    expect(bound[1]).toMatchObject({ elevationId: 'p2', callId: 'own-call' });
  });

  it('is safe with an empty list or missing binding', () => {
    expect(withElevationResumeBinding([], { callId: 'x' })).toEqual([]);
    expect(withElevationResumeBinding(null as never)).toEqual([]);
    const rows = withElevationResumeBinding([{ elevationId: 'e' }]);
    expect(rows[0]).toMatchObject({ elevationId: 'e', callId: null, conversationId: null });
  });
});
