import type { PagePack, PagePackContext } from './types.js';

export class PagePackRegistry {
  private packs: PagePack[] = [];

  register(pack: PagePack): () => void {
    this.packs.push(pack);
    return () => {
      this.packs = this.packs.filter((p) => p !== pack);
    };
  }

  clear(): void {
    this.packs = [];
  }

  list(): PagePack[] {
    return [...this.packs];
  }

  /** Concept id → packs that list it (for admin “used by”). */
  conceptUsage(): Map<string, Array<{ pageId: string; title: string; match: string }>> {
    const map = new Map<string, Array<{ pageId: string; title: string; match: string }>>();
    for (const p of this.packs) {
      for (const id of p.conceptIds || []) {
        const list = map.get(id) || [];
        list.push({
          pageId: p.pageId,
          title: p.title,
          match: typeof p.match === 'string' ? p.match : p.match instanceof RegExp ? p.match.source : '(fn)',
        });
        map.set(id, list);
      }
    }
    return map;
  }

  resolve(path: string): PagePack | undefined {
    const normalized = String(path || '').split('?')[0] || '';
    for (const p of this.packs) {
      if (matches(p.match, normalized)) return p;
    }
    return undefined;
  }

  buildContext(path: string, host: PagePackContext['host']): PagePackContext {
    return {
      path,
      params: host.getRouteParams?.() || {},
      host,
    };
  }
}

function matches(match: PagePack['match'], path: string): boolean {
  if (typeof match === 'string') {
    return path === match || path.startsWith(match.replace(/\/$/, '') + '/') || path.startsWith(match);
  }
  if (match instanceof RegExp) return match.test(path);
  return match(path);
}
