import { describe, expect, it, vi } from 'vitest';
import { IMMERSIVE_VR_MODE, detectImmersiveVrSupport } from './xr.js';

describe('detectImmersiveVrSupport', () => {
  it('reports supported when the runtime can start an immersive-vr session', async () => {
    const isSessionSupported = vi.fn(async (mode: string) => mode === IMMERSIVE_VR_MODE);
    expect(await detectImmersiveVrSupport({ isSessionSupported })).toEqual({ status: 'supported' });
    expect(isSessionSupported).toHaveBeenCalledWith(IMMERSIVE_VR_MODE);
  });

  it('reports unsupported when no headset is connected', async () => {
    const res = await detectImmersiveVrSupport({ isSessionSupported: async () => false });
    expect(res.status).toBe('unsupported');
  });

  it('reports unavailable without a WebXR runtime', async () => {
    expect((await detectImmersiveVrSupport(null)).status).toBe('unavailable');
    expect((await detectImmersiveVrSupport(undefined)).status).toBe('unavailable');
    expect((await detectImmersiveVrSupport({})).status).toBe('unavailable');
  });

  it('never throws when isSessionSupported rejects', async () => {
    const res = await detectImmersiveVrSupport({
      isSessionSupported: async () => {
        throw new Error('gpu busy');
      },
    });
    expect(res).toEqual({ status: 'unavailable', detail: 'gpu busy' });
  });
});
