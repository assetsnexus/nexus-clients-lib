/**
 * Wake-word listening controller (plan Part W2/W3 wiring).
 *
 * A surface-local controller that gates wake listening on:
 *  - an explicit user opt-in,
 *  - the chat surface being open,
 *  - (mobile) the app being unlocked when `requireUnlocked` is set.
 *
 * CRITICAL INVARIANT: `onWake` can ONLY request the voice session opener passed
 * to `arm()`. This controller has no access to the command dispatcher and never
 * exposes any authentication/approval capability. See `WAKE_WORD_TRUST`.
 */

import {
  type WakeWordConfig,
  type WakeWordDetection,
  type WakeWordEngine,
  type WakeWordEngineStatus,
  type WakeWordSurface,
} from './types.js';

export type WakeListeningState =
  | 'off' /** user has not opted in, or config disabled */
  | 'wake_listening' /** armed, waiting for the phrase */
  | 'opening' /** phrase fired, opening the voice session */
  | 'active' /** voice session open, listening paused */
  | 'unavailable' /** engine cannot detect on this device */
  | 'suspended'; /** surface hidden / app locked */

export type WakeDictationOpenRequest = {
  reason: 'wake_word';
  detection: WakeWordDetection;
  surface: WakeWordSurface;
  /** Always false: wake never proves identity. */
  authenticated: false;
};

export type WakeWordControllerOptions = {
  engine: WakeWordEngine;
  config: WakeWordConfig;
  surface: WakeWordSurface;
  /** Opens the voice session. Must not authenticate or run commands. */
  openVoiceSession: (request: WakeDictationOpenRequest) => void | Promise<void>;
  /** Observability only; must not carry audio or refs. */
  onStateChange?: (state: WakeListeningState, status: WakeWordEngineStatus) => void;
  /** Mobile lock gate. Return false to keep listening suspended. */
  isUnlocked?: () => boolean;
  /** Whether the chat surface is currently visible/open. */
  isSurfaceOpen?: () => boolean;
};

export class WakeWordController {
  private readonly engine: WakeWordEngine;
  private readonly config: WakeWordConfig;
  private readonly surface: WakeWordSurface;
  private readonly openVoiceSession: WakeWordControllerOptions['openVoiceSession'];
  private readonly onStateChange: WakeWordControllerOptions['onStateChange'];
  private readonly isUnlocked: () => boolean;
  private readonly isSurfaceOpen: () => boolean;

  private optedIn = false;
  private state: WakeListeningState = 'off';
  private armed = false;
  private disposed = false;

  constructor(opts: WakeWordControllerOptions) {
    this.engine = opts.engine;
    this.config = opts.config;
    this.surface = opts.surface;
    this.openVoiceSession = opts.openVoiceSession;
    this.onStateChange = opts.onStateChange;
    this.isUnlocked = opts.isUnlocked ?? (() => true);
    this.isSurfaceOpen = opts.isSurfaceOpen ?? (() => true);
  }

  getState(): WakeListeningState {
    return this.state;
  }

  getStatus(): WakeWordEngineStatus {
    return this.engine.getStatus();
  }

  /** True only when a real detector is armed and the gates are satisfied. */
  isListening(): boolean {
    return this.state === 'wake_listening' && this.engine.getStatus().detecting;
  }

  private setState(next: WakeListeningState): void {
    if (this.state === next) return;
    this.state = next;
    this.onStateChange?.(next, this.engine.getStatus());
  }

  /** Does the surface gate allow listening right now? */
  private gatesOpen(): boolean {
    if (!this.config.enabled) return false;
    if (this.config.requireUnlocked && !this.isUnlocked()) return false;
    if (this.config.surfaces && !this.config.surfaces.includes(this.surface)) return false;
    if (!this.isSurfaceOpen()) return false;
    return true;
  }

  /** User toggles wake listening on. */
  async optIn(): Promise<boolean> {
    if (this.disposed) return false;
    this.optedIn = true;
    return this.arm();
  }

  optOut(): void {
    this.optedIn = false;
    this.disarm();
    this.setState('off');
  }

  /** (Re)arm listening when all gates are open. */
  async arm(): Promise<boolean> {
    if (this.disposed || !this.optedIn) return false;
    if (!this.gatesOpen()) {
      this.setState(this.state === 'off' ? 'off' : 'suspended');
      return false;
    }
    const status = this.engine.getStatus();
    if (status.status !== 'listening' && !this.availableToStart(status)) {
      this.setState('unavailable');
      return false;
    }
    if (!this.armed) {
      await this.engine.load(this.config);
      await this.engine.start((detection) => this.handleWake(detection));
      this.armed = true;
    }
    const after = this.engine.getStatus();
    if (after.detecting) {
      this.setState('wake_listening');
      return true;
    }
    this.setState(after.status === 'unavailable' ? 'unavailable' : 'off');
    return false;
  }

  private availableToStart(status: WakeWordEngineStatus): boolean {
    return status.status === 'idle' || status.status === 'stopped' || status.status === 'listening';
  }

  disarm(): void {
    if (!this.armed) return;
    this.engine.stop();
    this.armed = false;
  }

  /** Called when the voice session becomes active; pause listening. */
  suspendForSession(): void {
    this.disarm();
    if (this.optedIn && this.gatesOpen()) this.setState('active');
    else this.setState('suspended');
  }

  /** Called when the voice session ends; re-arm if still opted in. */
  async resumeAfterSession(): Promise<boolean> {
    if (!this.optedIn) return false;
    return this.arm();
  }

  /** App locked / surface closed: gate off without losing the opt-in. */
  suspend(): void {
    this.disarm();
    if (this.optedIn) this.setState('suspended');
  }

  private handleWake(detection: WakeWordDetection): void {
    // A wake can ONLY open the voice session. No auth, no command, no approval.
    this.disarm();
    this.setState('opening');
    void Promise.resolve(
      this.openVoiceSession({
        reason: 'wake_word',
        detection,
        surface: this.surface,
        authenticated: false,
      }),
    ).catch(() => {
      /* Fall back to listening if the session could not open. */
      if (this.optedIn) void this.arm();
    });
  }

  dispose(): void {
    this.disposed = true;
    this.disarm();
    this.engine.dispose();
    this.setState('off');
  }
}
