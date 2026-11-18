import { describe, expect, it } from 'vitest';
import {
  NEXUS_BROWSER_ALLOW_PREFIXES,
  createBrowserCommandAllowlist,
} from './command-allowlist.js';

describe('browser command allowlist', () => {
  const allowlist = createBrowserCommandAllowlist();

  it('allows the chat and storage surfaces a browser drives', () => {
    for (const command of [
      'anx.communicate.conversations.list',
      'anx.communicate.message.send',
      'anx.communicate.stream-init',
      'anx.inference.models.list',
      'anx.ai-agents.virtual-employees.list',
      'anx.file.upload-init',
      'anx.storage.presign.put',
      'anx.storage.bucket.list-files',
      'anx.workspace.items.add',
      'anx.oauth2.grants.list',
      'anx.oauth2.subject.identities.list',
      'anx.ai.agent-access.resolve',
    ]) {
      expect(allowlist.check(command).allowed, command).toBe(true);
    }
  });

  it('denies credential and money surfaces even inside an allowed prefix', () => {
    for (const command of [
      'anx.oauth2.client.self-branding.set',
      'anx.oauth2.client.rotate-secret',
      'anx.security.auth.verify-2fa',
      'anx.wallet.get',
      'anx.ai.byok.register',
      'anx.inference.proxy-key.create',
      'anx.region.admin.platform.config.stripe.update',
      'anx.ai-agents.virtual-employees.mcp-servers.create',
      'anx.storage.share.create',
      'anx.storage.decryption-session.create',
      'anx.device.retrieve-keys-backup',
    ]) {
      const decision = allowlist.check(command);
      expect(decision.allowed, command).toBe(false);
      expect(decision.reason).toBe('denied_prefix');
    }
  });

  it('denies contact blocking even though it is under an allowed prefix', () => {
    for (const command of [
      'anx.communicate.contacts.block',
      'anx.communicate.contacts.ban',
      'anx.communicate.contacts.remove',
    ]) {
      const decision = allowlist.check(command);
      expect(decision.allowed).toBe(false);
      expect(decision.reason).toBe('denied_exact');
    }
  });

  it('denies anything outside the allowed prefixes', () => {
    for (const command of ['anx.crm.lead.list', 'anx.cluster.list', 'not-a-command', '']) {
      expect(allowlist.check(command).allowed).toBe(false);
    }
  });

  it('lets an app narrow the allow list without losing the deny list', () => {
    const narrow = createBrowserCommandAllowlist({ allow: ['anx.communicate.'] });
    expect(narrow.check('anx.communicate.message.send').allowed).toBe(true);
    expect(narrow.check('anx.storage.workspace.list').allowed).toBe(false);
    // The default deny list still wins.
    expect(narrow.check('anx.communicate.contacts.block').allowed).toBe(false);
  });

  it('exposes the defaults for documentation', () => {
    expect(NEXUS_BROWSER_ALLOW_PREFIXES).toContain('anx.communicate.');
    expect(allowlist.deny).toContain('anx.oauth2.client.');
  });
});
