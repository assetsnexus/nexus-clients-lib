/**
 * Regression: the agent/contact directory must load for hosts that pass
 * `identities` (desktop shell, webview, portal).
 *
 * Direct user report: five agents had profile pictures but only `Rune` (an
 * org-scoped agent) appeared in the client. `loadContacts` is the one call that
 * unions the owned catalog (`anx.ai-agents.virtual-employees.list`) with the
 * global public-facing catalog (`anx.ai-agents.virtual-employees.list-public`,
 * which the region returns to ANY authenticated caller — Veyla/Varic). The
 * multi-identity `reloadLists` branch returned BEFORE `loadContacts`, so every
 * identity host rendered a directory with no global agents in it.
 *
 * These tests mount the real `NexusChatApp` against a real `@nexus/chat-core`
 * controller (with a recording fake client) and assert the whole path: the
 * client issues `list-public`, the region rows land in the directory state, and
 * org listings still win the dedupe by agent id.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createNexusChat, type CommandClient } from '@nexus/chat-core';
import { NexusChatApp } from './NexusChatApp.js';
import type { ChatIdentitySession } from '../bridge/host-bridge.js';

// The stage lazily pulls the optional `@nexus/character-kit` peer dep (avatar
// cache / VRM), which is not installed for this package's unit tests.
vi.mock('@nexus/character-kit/asset-cache', () => ({
  fetchCachedPictureObjectUrl: async () => null,
  shouldPersistAssetUrl: () => false,
}));
vi.mock('@nexus/character-kit', () => ({}));

// The host bridge talks to `window.postMessage`; the tests only need a stub so
// mounting does not depend on a real host page.
vi.mock('../bridge/host-bridge.js', () => ({
  createHostBridge: () => ({ postToHost: () => {}, dispose: () => {} }),
  listenWindowMessages: () => () => {},
  parseHostMessage: () => null,
  stashHostMessage: () => {},
  drainStashedHostMessages: () => [],
}));

// Heavy leaves that are irrelevant to the directory: the 3D stage, the admin
// router, the file viewer (DOMPurify/marked) and the QR guest card.
vi.mock('./VoiceLayout.js', () => ({ VoiceLayout: () => null }));
vi.mock('./AdminRoutes.js', () => ({ AdminRoutes: () => null }));
vi.mock('./FileViewer.js', () => ({ FileViewer: () => null }));
vi.mock('./GuestContinue.js', () => ({ GuestContinue: () => null }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDENTITIES: ChatIdentitySession[] = [
  {
    key: 'business:org-1:user-1',
    label: 'Acme',
    userId: 'user-1',
    orgId: 'org-1',
    role: 'owner',
    deviceId: 'device-1',
    token: 'token-1',
    avatarUrl: null,
    orgLogo: null,
  },
  {
    key: 'private:user-1',
    label: 'Personal',
    userId: 'user-1',
    orgId: null,
    role: null,
    deviceId: 'device-1',
    token: 'token-1',
    avatarUrl: null,
    orgLogo: null,
  },
];

/** Real region shapes: org agent + global public agent (Veyla) + staff-only global. */
function makeClient(sent: string[]): CommandClient {
  return {
    async send(command: string) {
      sent.push(command);
      switch (command) {
        case 'anx.communicate.contacts.list':
          return { ok: true, data: { contacts: [] } };
        case 'anx.ai-agents.virtual-employees.list':
          return {
            ok: true,
            data: [
              { employeeId: 've-rune', name: 'Rune', scope: 'org', orgId: 'org-1' },
              // The caller's OWN private agent: the region now returns it in an
              // org-context list with `orgId:null`. It must survive to the
              // directory, not be dropped for lacking the listing identity's org.
              { employeeId: 've-selene', name: 'Selene', scope: 'user', orgId: null },
            ],
          };
        case 'anx.ai-agents.virtual-employees.list-public':
          return {
            ok: true,
            data: [
              // Duplicate of an owned row: the owned listing must win, so the
              // directory keeps `Rune` (not this public copy) and one row only.
              { employeeId: 've-rune', name: 'Rune (public copy)', scope: 'org', orgId: 'org-1' },
              { employeeId: 've-veyla', name: 'Veyla', scope: 'global', isPublicFacing: true },
              { employeeId: 've-varic', name: 'Varic', scope: 'global', isPublicFacing: true },
              // Staff-only global: the region is the audience gate and only sends
              // this to staff, so the client must pass it through, not re-filter.
              { employeeId: 've-nox', name: 'Nox', scope: 'global', isPublicFacing: false },
            ],
          };
        case 'anx.communicate.contacts.asset-agents.list':
          return { ok: true, data: { contacts: [] } };
        case 'anx.communicate.conversations.list':
          return { ok: true, data: { items: [] } };
        case 'anx.inference.models.available':
          return { ok: true, data: { models: [] } };
        default:
          return { ok: true, data: {} };
      }
    },
  };
}

type Mounted = { container: HTMLElement; root: Root; unmount: () => void };
const mounted: Mounted[] = [];

async function flush(times = 8): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountApp(props: {
  client: CommandClient;
  identities?: ChatIdentitySession[];
}): Promise<Mounted> {
  const chat = createNexusChat({
    client: props.client,
    features: { adminPanels: false },
  });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <NexusChatApp
        chat={chat}
        client={props.client}
        identities={props.identities}
      />,
    );
  });
  await flush();
  const entry: Mounted = {
    container,
    root,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
  mounted.push(entry);
  return entry;
}

beforeEach(() => {
  // jsdom implements neither of these; the SPA reads them on mount.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  for (const entry of mounted.splice(0)) entry.unmount();
});

describe('contact directory loading with identities', () => {
  it('issues list-public (the global catalog) even when identities are present', async () => {
    const sent: string[] = [];
    await mountApp({ client: makeClient(sent), identities: IDENTITIES });

    expect(sent).toContain('anx.ai-agents.virtual-employees.list');
    // The regression: the identity branch returned before `loadContacts`, so
    // this command was never sent and global public agents stayed invisible.
    expect(sent).toContain('anx.ai-agents.virtual-employees.list-public');
  });

  it('still fans the conversation list out over the identities', async () => {
    const sent: string[] = [];
    await mountApp({ client: makeClient(sent), identities: IDENTITIES });

    // One `conversations.list` per identity, and `loadContacts` did not replace
    // the fan-out (both paths run).
    expect(sent.filter((c) => c === 'anx.communicate.conversations.list').length).toBeGreaterThanOrEqual(2);
  });

  it('loads the directory without identities too (single-identity hosts)', async () => {
    const sent: string[] = [];
    await mountApp({ client: makeClient(sent) });

    expect(sent).toContain('anx.ai-agents.virtual-employees.list-public');
  });

  it("renders the caller's own private agent (scope:'user', orgId:null) in an org context", async () => {
    const sent: string[] = [];
    const mounted = await mountApp({ client: makeClient(sent), identities: IDENTITIES });

    // Open the Contacts directory, which reads the merged contact store.
    await act(async () => {
      const tab = Array.from(mounted.container.querySelectorAll('button.nexus-chat__tab')).find((b) =>
        /contact/i.test(b.textContent || ''),
      );
      (tab as HTMLButtonElement | undefined)?.click();
    });
    await flush();

    const names = Array.from(
      mounted.container.querySelectorAll('.nexus-chat__contact .nexus-chat__contact-name'),
    ).map((n) => n.textContent?.trim());

    // The private agent is rendered alongside the org and global agents — the
    // client does not require every directory row to carry the identity's org.
    expect(names).toContain('Selene');
    expect(names).toContain('Rune');
    expect(names).toContain('Veyla');
    expect(names).toContain('Varic');
    // Dedupe holds: the duplicate org row did not add a second Rune.
    expect(names.filter((n) => n === 'Rune')).toHaveLength(1);
    // A raw internal id is never a label.
    expect(names.some((n) => n === 've-selene')).toBe(false);
  });
});
