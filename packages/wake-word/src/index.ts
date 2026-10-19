/**
 * @nexus/wake-word — on-device wake-word engines for Nexus chat surfaces.
 *
 * Plan Part W. A wake word only opens a voice session; it never authenticates,
 * approves, or satisfies 2FA/SCA/biometric/device trust. Detection is on-device.
 */

export * from './types.js';
export * from './audio-source.js';
export * from './detector.js';
export * from './custom-sample.js';
export * from './engine.js';
export * from './controller.js';
