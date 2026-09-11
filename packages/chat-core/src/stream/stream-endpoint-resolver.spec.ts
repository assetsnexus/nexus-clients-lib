import { describe, expect, it } from 'vitest';
import { StreamEndpointResolver } from './stream-endpoint-resolver.js';

describe('StreamEndpointResolver', () => {
  it('appends purpose and resourceId from stream-init (inbox)', () => {
    const resolver = new StreamEndpointResolver();
    resolver.setFromStreamInit({
      endpoints: ['wss://stream.example/anx/stream'],
      token: 'tok-1',
      purpose: 'user_inbox',
      resourceId: 'user-42',
    });
    const url = resolver.resolveWebSocketUrl(0);
    expect(url).toContain('token=tok-1');
    expect(url).toContain('purpose=user_inbox');
    expect(url).toContain('resourceId=user-42');
  });

  it('appends room purpose for room streams', () => {
    const resolver = new StreamEndpointResolver();
    resolver.setFromStreamInit({
      endpoints: ['wss://stream.example/anx/stream'],
      token: 'tok-room',
      purpose: 'room',
      resourceId: 'room-9',
    });
    expect(resolver.resolveWebSocketUrl(0)).toBe(
      'wss://stream.example/anx/stream?token=tok-room&purpose=room&resourceId=room-9',
    );
  });
});
