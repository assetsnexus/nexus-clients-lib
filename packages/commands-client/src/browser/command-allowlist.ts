/**
 * Browser command allowlist for a server-side command proxy.
 *
 * The region grant is the authoritative bound: an app token can only call what
 * the user consented to. This is the second gate, and it exists because the
 * browser is the least trusted part of the app: a compromised page must not be
 * able to reach a credential surface even if the grant happens to include it.
 *
 * The rule is a prefix allowlist with a deny list that always wins. It is
 * deliberately coarse — a new chat command under `anx.communicate.` works
 * without editing anything, while `anx.oauth2.client.*` stays unreachable from
 * the page no matter what.
 *
 * The defaults are the Nexus surfaces a browser legitimately drives. Pass your
 * own `allow` to narrow them further; the default deny list is not meant to be
 * removed.
 */

export type BrowserCommandAllowlistOptions = {
  /** Prefixes the browser may call. Defaults to the Nexus chat/app surfaces. */
  allow?: readonly string[];
  /** Prefixes that are never reachable, even inside an allowed prefix. */
  deny?: readonly string[];
  /** Exact commands that are never reachable. */
  denyExact?: readonly string[];
};

export type BrowserCommandDecision = {
  allowed: boolean;
  reason?: 'not_allowed' | 'denied_prefix' | 'denied_exact';
};

/** Surfaces a browser legitimately drives. */
export const NEXUS_BROWSER_ALLOW_PREFIXES: readonly string[] = [
  'anx.communicate.',
  'anx.inference.',
  'anx.ai-agents.',
  'anx.agents.',
  'anx.file.',
  'anx.storage.',
  'anx.workspace.items.',
  'anx.oauth2.grants.',
  'anx.oauth2.subject.',
  'anx.oauth2.app-subscription.',
  'anx.ai.agent-access.',
  'anx.knowledge.',
  'anx.long-running.',
];

/**
 * Never reachable from the browser, even inside an allowed prefix. These mint
 * or rotate credentials, move money, or manage the app's own registration.
 */
export const NEXUS_BROWSER_DENY_PREFIXES: readonly string[] = [
  'anx.oauth2.client.',
  'anx.oauth2.partner.toolset.',
  'anx.oauth2.app-role.',
  'anx.security.',
  'anx.wallet.',
  'anx.ai.byok.',
  'anx.inference.proxy-key.',
  'anx.inference.tool-connector.',
  'anx.ai-reseller.',
  'anx.region.admin.',
  'anx.region.pki.',
  'anx.pki.',
  'anx.device.',
  'anx.encryption.',
  'anx.auth.',
  'anx.ai-agents.virtual-employees.mcp-servers.',
  'anx.ai-agents.virtual-employees.bridge-tokens.',
  'anx.ai-agents.encryption-keys.',
  'anx.ai-agents.app-installs.',
  'anx.ai-agents.app-entitlements.',
  'anx.storage.share.',
  'anx.storage.external.',
  'anx.storage.decryption-session.',
  'anx.asset.setup.pairing-link.',
  'anx.kyc.',
  'anx.kyc-provider.',
  'anx.compliance.regulatory-compliance.',
  'anx.crypto.bridge.',
];

/** Exact commands denied despite an allowed prefix. */
export const NEXUS_BROWSER_DENY_EXACT: readonly string[] = [
  'anx.communicate.contacts.remove',
  'anx.communicate.contacts.block',
  'anx.communicate.contacts.unblock',
  'anx.communicate.contacts.ban',
  'anx.communicate.contacts.unban',
  'anx.communicate.contacts.bans.list',
  'anx.communicate.contacts.bans.history',
  'anx.communicate.contacts.bans.mark-false-positive',
  'anx.communicate.contacts.request.accept',
  'anx.communicate.contacts.request.reject',
  'anx.communicate.contacts.blocks.list',
];

export type BrowserCommandAllowlist = {
  check(command: string): BrowserCommandDecision;
  allow: readonly string[];
  deny: readonly string[];
  denyExact: readonly string[];
};

export function createBrowserCommandAllowlist(
  opts: BrowserCommandAllowlistOptions = {},
): BrowserCommandAllowlist {
  const allow = opts.allow ?? NEXUS_BROWSER_ALLOW_PREFIXES;
  const deny = opts.deny ?? NEXUS_BROWSER_DENY_PREFIXES;
  const denyExact = new Set(opts.denyExact ?? NEXUS_BROWSER_DENY_EXACT);

  return {
    allow,
    deny,
    denyExact: [...denyExact],
    check(command) {
      const name = String(command || '').trim();
      if (!name) return { allowed: false, reason: 'not_allowed' };
      if (denyExact.has(name)) return { allowed: false, reason: 'denied_exact' };
      if (deny.some((prefix) => name.startsWith(prefix))) {
        return { allowed: false, reason: 'denied_prefix' };
      }
      if (allow.some((prefix) => name.startsWith(prefix))) return { allowed: true };
      return { allowed: false, reason: 'not_allowed' };
    },
  };
}
