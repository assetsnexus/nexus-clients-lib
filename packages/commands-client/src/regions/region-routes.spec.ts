import { describe, expect, it } from 'vitest';
import { parseRegionRoutes } from './region-routes.js';

const route = (url: string, priority: number, kind?: 'primary' | 'alternative' | 'internal_lan') =>
  kind ? { url, priority, kind } : { url, priority };

describe('parseRegionRoutes', () => {
  it('reads anx_region and region, sorts by priority, and dedupes', () => {
    const fromToken = parseRegionRoutes({
      access_token: 't',
      anx_region: {
        slug: 'eu-west',
        home: true,
        issuer: 'https://eu-west.example',
        publicKeyId: 'key-1',
        routes: [
          route('https://alt.example/', 5, 'alternative'),
          route('https://primary.example', 1, 'primary'),
          route('https://primary.example/', 1, 'primary'),
        ],
      },
    });
    expect(fromToken?.slug).toBe('eu-west');
    expect(fromToken?.home).toBe(true);
    expect(fromToken?.issuer).toBe('https://eu-west.example');
    expect(fromToken?.routes.map((item) => item.url)).toEqual([
      'https://primary.example',
      'https://alt.example',
    ]);

    const fromLogin = parseRegionRoutes({
      region: { slug: 'us', routes: [route('https://us.example', 0)] },
    });
    expect(fromLogin?.slug).toBe('us');
  });

  it('returns undefined when the field is missing or the shape is invalid', () => {
    expect(parseRegionRoutes({})).toBeUndefined();
    expect(parseRegionRoutes(null)).toBeUndefined();
    expect(
      parseRegionRoutes({
        anx_region: { slug: 'eu', routes: [{ url: 'https://ok.example', priority: '1' }] },
      }),
    ).toBeUndefined();
    expect(
      parseRegionRoutes({
        anx_region: { slug: 'eu', routes: [{ url: 'ftp://files.example', priority: 1 }] },
      }),
    ).toBeUndefined();
  });

  it('allows localhost http and rejects other http unless allowHttp', () => {
    expect(
      parseRegionRoutes({
        region: { slug: 'local', routes: [route('http://10.0.0.8:8443', 1)] },
      }),
    ).toBeUndefined();
    expect(
      parseRegionRoutes({
        region: { slug: 'local', routes: [route('http://localhost:8443', 1)] },
      })?.routes[0].url,
    ).toBe('http://localhost:8443');
    expect(
      parseRegionRoutes(
        { region: { slug: 'lan', routes: [route('http://10.0.0.8:8443', 1, 'internal_lan')] } },
        { allowHttp: true },
      )?.routes[0].url,
    ).toBe('http://10.0.0.8:8443');
  });

  it('keeps the eight lowest priorities', () => {
    const routes = Array.from({ length: 10 }, (_, index) =>
      route(`https://n${index}.example`, index),
    );
    const parsed = parseRegionRoutes({ anx_region: { slug: 'eu', routes } });
    expect(parsed?.routes).toHaveLength(8);
    expect(parsed?.routes[0].priority).toBe(0);
    expect(parsed?.routes[7].priority).toBe(7);
  });
});
