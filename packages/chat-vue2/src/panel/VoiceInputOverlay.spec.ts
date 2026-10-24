// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import Vue from 'vue';
import VoiceInputOverlay from './VoiceInputOverlay.vue';

/**
 * Component-level render test for the portal dictation overlay.
 *
 * It drives `afterStop` directly with a stubbed command client whose
 * `anx.inference.stt.create` returns a *raw* server error, then asserts the
 * overlay renders the shared actionable copy — never the raw transcriber
 * string. This is the portal-parity guard the React composer already has via
 * `dictationOutcome`.
 */
/** Loosely-typed handle for driving the overlay's data/methods in the test. */
type OverlayVm = {
  chunks: Blob[];
  usedLiveStream: boolean;
  localModelId: string;
  errorMessage: string | null;
  afterStop(mimeType: string): Promise<void>;
  $el: HTMLElement;
  $destroy(): void;
};

function mountOverlay(props: Record<string, unknown> = {}): OverlayVm {
  // `VoiceInputOverlay` is a Vue 2.7 SFC typed as `DefineComponent`, which the
  // Vue 2 `extend` overloads do not accept directly; the runtime object is a
  // normal component options bag.
  const Ctor = Vue.extend(VoiceInputOverlay as never);
  const vm = new Ctor({ propsData: { open: true, modelId: 'stt-1', ...props } }).$mount();
  return vm as unknown as OverlayVm;
}

describe('VoiceInputOverlay error copy', () => {
  it('shows the shared transcription copy, not the raw server error', async () => {
    const raw =
      'Link a subscription to this agent before chatting. Model calls use subscription keys only.';
    const commandClient = {
      send: vi.fn().mockResolvedValue({
        command: 'anx.inference.stt.create',
        responseCode: 200,
        responseObject: {
          workloadId: 'wl-1',
          status: 'failed',
          resultPayload: { error: raw },
        },
      }),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const vm = mountOverlay({ commandClient });

    // A real capture: enough bytes to clear the too-short guard, no live text.
    vm.chunks = [new Blob([new Uint8Array(4096)])];
    vm.usedLiveStream = false;
    vm.localModelId = 'stt-1';
    await vm.afterStop('audio/webm');

    expect(vm.errorMessage).toBe(
      'The speech service could not transcribe the recording. Try again in a moment.',
    );
    expect(vm.errorMessage).not.toContain('subscription');
    expect(warn).toHaveBeenCalled();
    // The raw detail is preserved in the console, never in the UI.
    const logged = warn.mock.calls.map((c) => String(c[0])).join(' ');
    expect(logged).toContain('anx.chat.dictation');
    warn.mockRestore();
    vm.$destroy();
  });

  it('renders the shared copy into the DOM error line', async () => {
    const commandClient = {
      send: vi.fn().mockRejectedValue(new Error('E11000 duplicate key error anxVeId_1')),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const vm = mountOverlay({ commandClient });
    vm.chunks = [new Blob([new Uint8Array(4096)])];
    vm.localModelId = 'stt-1';
    await vm.afterStop('audio/webm');
    await Vue.nextTick();

    const line = vm.$el.querySelector('.text-danger');
    expect(line?.textContent).toContain('The speech service could not transcribe the recording');
    expect(vm.$el.textContent).not.toContain('E11000');
    warn.mockRestore();
    vm.$destroy();
  });

  it('keeps the shared too-short copy for a sub-minimum capture', async () => {
    const vm = mountOverlay();
    vm.chunks = [new Blob([new Uint8Array(4)])];
    await vm.afterStop('audio/webm');
    expect(vm.errorMessage).toBe(
      'That press was too short. Hold the mic button while you speak, then release.',
    );
    vm.$destroy();
  });

  it('honours a host label override for the transcription failure', async () => {
    const commandClient = {
      send: vi.fn().mockRejectedValue(new Error('boom')),
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const vm = mountOverlay({ commandClient, labels: { sttFailed: 'Transkription fehlgeschlagen' } });
    vm.chunks = [new Blob([new Uint8Array(4096)])];
    vm.localModelId = 'stt-1';
    await vm.afterStop('audio/webm');
    expect(vm.errorMessage).toBe('Transkription fehlgeschlagen');
    warn.mockRestore();
    vm.$destroy();
  });
});
