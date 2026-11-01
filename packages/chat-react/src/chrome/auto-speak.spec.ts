import { describe, expect, it, vi } from 'vitest';
import { createAutoSpeakQueue, type AutoSpeakController } from './auto-speak.js';
import type { VoiceInterruptPolicy } from './voice-interrupt.js';

/** A controller that records what it was asked to speak and can be observed. */
function makeController() {
  const spoken: string[] = [];
  let resolveCurrent: (() => void) | null = null;
  const controller: AutoSpeakController & { spoken: string[]; cancels: number } = {
    spoken,
    cancels: 0,
    speak: (text: string) =>
      new Promise<void>((resolve) => {
        spoken.push(text);
        resolveCurrent = resolve;
      }),
    cancel: () => {
      controller.cancels += 1;
      resolveCurrent?.();
      resolveCurrent = null;
    },
  };
  return controller;
}

describe('createAutoSpeakQueue', () => {
  it('serialises speech: the second reply waits for the first to finish', async () => {
    const created: ReturnType<typeof makeController>[] = [];
    const queue = createAutoSpeakQueue({
      createController: () => {
        const c = makeController();
        created.push(c);
        return c;
      },
    });
    queue.speak('first', 'agent-a');
    queue.speak('second', 'agent-b');
    await Promise.resolve();
    // Only the first turn has started; the second is queued.
    expect(created[0]!.spoken).toEqual(['first']);
    expect(created[1]?.spoken ?? []).toEqual([]);
    // Finish the first; the drain loop picks up the second.
    created[0]!.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(created[1]!.spoken).toEqual(['second']);
  });

  it('replaces an unstarted reply for the same agent (newest wins)', async () => {
    const created: ReturnType<typeof makeController>[] = [];
    const queue = createAutoSpeakQueue({
      createController: () => {
        const c = makeController();
        created.push(c);
        return c;
      },
    });
    // First agent blocks the queue.
    queue.speak('busy', 'agent-a');
    const blocker = created[0]!;
    // Two rapid replies for the same agent: only the latest should be spoken.
    queue.speak('old', 'agent-b');
    queue.speak('new', 'agent-b');
    blocker.cancel();
    await Promise.resolve();
    await Promise.resolve();
    const agentB = created.find((c) => c.spoken.includes('new'))!;
    expect(agentB.spoken).toEqual(['new']);
    expect(created.some((c) => c.spoken.includes('old'))).toBe(false);
  });

  it('skip_current stops the playing utterance but leaves queued replies', async () => {
    const policy: { value: VoiceInterruptPolicy } = { value: 'skip_current' };
    const created: ReturnType<typeof makeController>[] = [];
    const queue = createAutoSpeakQueue({
      createController: () => {
        const c = makeController();
        created.push(c);
        return c;
      },
      getInterruptPolicy: () => policy.value,
    });
    queue.speak('playing', 'agent-a');
    queue.speak('queued', 'agent-b');
    await Promise.resolve();
    queue.interrupt();
    expect(created[0]!.cancels).toBe(1);
    // The queued reply is not dropped: it still plays after the current stops.
    await Promise.resolve();
    await Promise.resolve();
    expect(created[1]!.spoken).toEqual(['queued']);
  });

  it('clear_queue stops the playing utterance and drops queued replies', async () => {
    const policy: { value: VoiceInterruptPolicy } = { value: 'clear_queue' };
    const created: ReturnType<typeof makeController>[] = [];
    const queue = createAutoSpeakQueue({
      createController: () => {
        const c = makeController();
        created.push(c);
        return c;
      },
      getInterruptPolicy: () => policy.value,
    });
    queue.speak('playing', 'agent-a');
    queue.speak('queued', 'agent-b');
    await Promise.resolve();
    queue.interrupt();
    expect(created[0]!.cancels).toBe(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(created[1]?.spoken ?? []).toEqual([]);
    expect(queue.isBusy()).toBe(false);
  });

  it('off leaves speech untouched on send', async () => {
    const created: ReturnType<typeof makeController>[] = [];
    const queue = createAutoSpeakQueue({
      createController: () => {
        const c = makeController();
        created.push(c);
        return c;
      },
      getInterruptPolicy: () => 'off',
    });
    queue.speak('playing', 'agent-a');
    await Promise.resolve();
    queue.interrupt();
    expect(created[0]!.cancels).toBe(0);
  });

  it('cancel drops everything and reset clears controller cache', async () => {
    const factory = vi.fn(() => makeController());
    const queue = createAutoSpeakQueue({ createController: factory });
    queue.speak('one', 'agent-a');
    queue.cancel();
    // The drain loop unwinds on the next microtask once the speak promise settles.
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.isBusy()).toBe(false);
    queue.reset();
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('ignores empty text', () => {
    const factory = vi.fn(() => makeController());
    const queue = createAutoSpeakQueue({ createController: factory });
    queue.speak('   ', 'agent-a');
    expect(queue.isBusy()).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });
});
