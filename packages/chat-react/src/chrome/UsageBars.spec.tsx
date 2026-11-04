/**
 * UsageBars regression.
 *
 * Chat chrome used to print `Usage: 15982 tok /1048576 €0.00 Cost: €0.00` — a
 * redundant cost (the billing popover owns money) and no cache information at
 * all. These pin the replacement: a context-fill bar and a prompt-cache bar,
 * with no cost text.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { UsageBars } from './UsageBars.js';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Root[] = [];
const containers: HTMLElement[] = [];

async function mount(ui: React.ReactElement): Promise<HTMLElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(ui);
  });
  mounted.push(root);
  containers.push(container);
  return container;
}

afterEach(() => {
  while (mounted.length) act(() => mounted.pop()!.unmount());
  while (containers.length) containers.pop()!.remove();
});

describe('UsageBars', () => {
  it('renders a context bar and a cache bar, and never a cost label', async () => {
    const el = await mount(
      <UsageBars
        usage={{
          tokensUsed: 15982,
          maxContextTokens: 128000,
          cacheHitRate: 0.42,
          displayCostMinor: 0,
          displayCurrency: 'EUR',
        }}
      />,
    );

    const contextFill = el.querySelector('[data-nexus-usage-fill="context"]');
    const cacheFill = el.querySelector('[data-nexus-usage-fill="cache"]');
    expect(contextFill).not.toBeNull();
    expect(cacheFill).not.toBeNull();
    // 15982 / 128000 = 12.48% -> 12
    expect((contextFill as HTMLElement).style.width).toBe('12%');
    expect((cacheFill as HTMLElement).style.width).toBe('42%');
    expect(el.textContent).toContain('12%');
    expect(el.textContent).toContain('42%');
    expect(el.textContent).toContain('15982 / 128000 tok');
    // The redundant cost text is gone.
    expect(el.textContent).not.toContain('€');
    expect(el.querySelector('[data-nexus-cost]')).toBeNull();
  });

  it('falls back to the usage payload context snapshot', async () => {
    const el = await mount(
      <UsageBars usage={{ tokensUsed: 5000, contextSnapshot: { maxContextTokens: 10000, cacheHitRate: 0.75 } }} />,
    );
    expect((el.querySelector('[data-nexus-usage-fill="context"]') as HTMLElement).style.width).toBe('50%');
    expect((el.querySelector('[data-nexus-usage-fill="cache"]') as HTMLElement).style.width).toBe('75%');
  });

  it('renders only the context bar when the provider reported no cache data', async () => {
    const el = await mount(<UsageBars usage={{ tokensUsed: 1000, maxContextTokens: 4000 }} />);
    expect(el.querySelector('[data-nexus-usage-fill="context"]')).not.toBeNull();
    expect(el.querySelector('[data-nexus-usage-fill="cache"]')).toBeNull();
  });

  it('shows the raw token count instead of an empty gap when the window is unknown', async () => {
    const el = await mount(<UsageBars usage={{ tokensUsed: 812 }} />);
    expect(el.querySelector('[data-nexus-usage-fill]')).toBeNull();
    expect(el.textContent).toContain('812 tok');
  });

  it('renders nothing without usage', async () => {
    const el = await mount(<UsageBars usage={null} />);
    expect(el.textContent).toBe('');
  });
});
