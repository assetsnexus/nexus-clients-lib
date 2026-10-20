import { useState } from 'react';
import type { CommandClient, NexusChat } from '@nexus/chat-core';

export type ClientToolRequest = {
  callId: string;
  name: string;
  arguments: Record<string, unknown>;
  conversationId: string | null;
};

export function ClientToolGrantCard({
  request,
  chat,
  onResolved,
}: {
  request: ClientToolRequest;
  chat: NexusChat;
  onResolved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const respond = async (granted: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const result = await chat.resumeClientTool({
        callId: request.callId,
        conversationId: request.conversationId || undefined,
        result: granted
          ? { ok: true, granted: true, name: request.name, arguments: request.arguments }
          : { ok: false, granted: false, error: 'User denied client tool' },
      });
      if (!result.ok) {
        setError(result.message || 'Failed to resume client tool');
        return;
      }
      onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nexus-chat__grant-card" role="region" aria-label="Client tool grant">
      <strong>Client tool request</strong>
      <div className="nexus-chat__muted">{request.name}</div>
      <pre className="nexus-chat__viewer-pre nexus-chat__grant-args">
        {JSON.stringify(request.arguments, null, 2)}
      </pre>
      <div className="nexus-chat__grant-actions">
        <button
          type="button"
          className="nexus-chat__btn nexus-chat__btn--primary"
          disabled={busy}
          onClick={() => void respond(true)}
        >
          Grant
        </button>
        <button type="button" className="nexus-chat__btn" disabled={busy} onClick={() => void respond(false)}>
          Deny
        </button>
      </div>
      {error ? <div className="nexus-chat__error">{error}</div> : null}
    </div>
  );
}

export type DataAccessPromptModel = {
  grantId: string | null;
  message: string;
  access?: string;
  scopeChoices?: Array<{ kind: string; id: string; label: string; isLeaf?: boolean }>;
  callId?: string | null;
};

export function DataAccessPromptCard({
  prompt,
  client,
  onResponded,
  onSca,
}: {
  prompt: DataAccessPromptModel;
  client?: CommandClient;
  onResponded: () => void;
  onSca?: (info: { authRequestId: string | null; command: string }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scopeKey, setScopeKey] = useState(
    prompt.scopeChoices?.[0] ? `${prompt.scopeChoices[0].kind}:${prompt.scopeChoices[0].id}` : '',
  );

  const respond = async (decision: string) => {
    if (!prompt.grantId) {
      setError('Missing grantId');
      return;
    }
    setBusy(true);
    setError(null);
    const selected = (prompt.scopeChoices || []).find((c) => `${c.kind}:${c.id}` === scopeKey);
    const payload: Record<string, unknown> = { grantId: prompt.grantId, decision };
    if (decision !== 'deny_once' && selected && !selected.isLeaf) {
      payload.scope = { kind: selected.kind, id: selected.id };
    }
    try {
      if (!client?.send) {
        onResponded();
        return;
      }
      const result = (await client.send('anx.security.data-access.respond', payload)) as {
        ok?: boolean;
        kind?: string;
        authRequestId?: string | null;
        responseCode?: number;
        message?: string;
        error?: { message?: string };
      };
      if (result?.kind === 'sca_required' || result?.responseCode === 202) {
        onSca?.({
          authRequestId: result.authRequestId ?? null,
          command: 'anx.security.data-access.respond',
        });
        return;
      }
      if (result?.ok === false) {
        setError(result.error?.message || result.message || 'Failed to record decision');
        return;
      }
      onResponded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="nexus-chat__grant-card" role="region" aria-label="Data access approval">
      <strong>Data access required</strong>
      <p className="nexus-chat__muted">{prompt.message}</p>
      {(prompt.scopeChoices || []).length ? (
        <div className="nexus-chat__grant-scopes">
          {(prompt.scopeChoices || []).map((c) => {
            const key = `${c.kind}:${c.id}`;
            return (
              <label key={key}>
                <input
                  type="radio"
                  name="data-access-scope"
                  checked={scopeKey === key}
                  onChange={() => setScopeKey(key)}
                />{' '}
                {c.label}
              </label>
            );
          })}
        </div>
      ) : null}
      <div className="nexus-chat__grant-actions">
        <button type="button" className="nexus-chat__btn" disabled={busy} onClick={() => void respond('allow_once')}>
          Once
        </button>
        <button type="button" className="nexus-chat__btn" disabled={busy} onClick={() => void respond('allow_always')}>
          Always
        </button>
        <button type="button" className="nexus-chat__btn" disabled={busy} onClick={() => void respond('deny_once')}>
          Deny once
        </button>
        <button type="button" className="nexus-chat__btn" disabled={busy} onClick={() => void respond('deny_always')}>
          Never
        </button>
      </div>
      {error ? <div className="nexus-chat__error">{error}</div> : null}
    </div>
  );
}

export type PermissionElevationPromptModel = {
  elevationId?: string | null;
  pack?: string | null;
  command?: string | null;
  commandNames?: string[];
  reason?: string | null;
  message?: string | null;
  resourceRef?: Record<string, unknown> | null;
  requiredOnboardingType?: string | null;
  onboardingSatisfied?: boolean;
};

type ElevationDecision = 'deny' | 'allow_once' | 'allow_session' | 'allow_always';

function elevationCommandNames(prompt: PermissionElevationPromptModel): string[] {
  return [...(prompt.commandNames || []), ...(prompt.command ? [prompt.command] : [])]
    .filter((name, index, all) => name.trim() && all.indexOf(name) === index)
    .slice(0, 6);
}

function promptNeedsOnboarding(prompt: PermissionElevationPromptModel): boolean {
  return Boolean(prompt.requiredOnboardingType && !prompt.onboardingSatisfied);
}

async function sendElevationDecision(
  client: CommandClient | undefined,
  elevationId: string,
  decision: ElevationDecision,
): Promise<
  | { kind: 'ok' }
  | { kind: 'sca'; authRequestId: string | null }
  | { kind: 'error'; message: string }
> {
  if (!client?.send) return { kind: 'ok' };
  const result = (await client.send('anx.ai-agents.elevations.respond', {
    elevationId,
    decision,
  })) as {
    ok?: boolean;
    kind?: string;
    authRequestId?: string | null;
    responseCode?: number;
    response?: { responseCode?: number; errorObjects?: Array<{ message?: string }> };
    message?: string;
    error?: { message?: string };
    errorObjects?: Array<{ message?: string }>;
  };
  if (result?.kind === 'sca_required' || result?.responseCode === 202) {
    return { kind: 'sca', authRequestId: result.authRequestId ?? null };
  }
  const ok =
    result?.ok === true ||
    result?.kind === 'ok' ||
    result?.responseCode === 200 ||
    result?.response?.responseCode === 200;
  if (!ok) {
    const message =
      result?.error?.message ||
      result?.errorObjects?.[0]?.message ||
      result?.response?.errorObjects?.[0]?.message ||
      result?.message ||
      'Failed to record decision';
    if (decision !== 'deny' && /in status 'active'/.test(message)) {
      return { kind: 'ok' };
    }
    return { kind: 'error', message };
  }
  return { kind: 'ok' };
}

/**
 * Open-chat grant dock. Supports one or many pending elevations; bulk actions
 * apply the same lasting decision to every row that is ready to grant.
 */
export function PermissionElevationDock({
  prompts,
  client,
  onChange,
  onSca,
}: {
  prompts: PermissionElevationPromptModel[];
  client?: CommandClient;
  onChange: (next: PermissionElevationPromptModel[]) => void;
  onSca?: (info: { authRequestId: string | null; command: string }) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  if (!prompts.length) return null;

  const decidable = prompts.filter((prompt) => prompt.elevationId && !promptNeedsOnboarding(prompt));

  const respondOne = async (prompt: PermissionElevationPromptModel, decision: ElevationDecision) => {
    const elevationId = String(prompt.elevationId || '').trim();
    if (!elevationId) {
      setError('Missing elevationId');
      return;
    }
    setBusyId(elevationId);
    setError(null);
    try {
      const outcome = await sendElevationDecision(client, elevationId, decision);
      if (outcome.kind === 'sca') {
        onSca?.({
          authRequestId: outcome.authRequestId,
          command: 'anx.ai-agents.elevations.respond',
        });
        return;
      }
      if (outcome.kind === 'error') {
        setError(outcome.message);
        return;
      }
      onChange(prompts.filter((row) => row.elevationId !== elevationId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const respondMany = async (decision: ElevationDecision) => {
    if (!decidable.length) return;
    setBulkBusy(true);
    setError(null);
    const remaining = [...prompts];
    const failures: string[] = [];
    try {
      for (const prompt of decidable) {
        const elevationId = String(prompt.elevationId || '').trim();
        if (!elevationId) continue;
        const outcome = await sendElevationDecision(client, elevationId, decision);
        if (outcome.kind === 'sca') {
          onSca?.({
            authRequestId: outcome.authRequestId,
            command: 'anx.ai-agents.elevations.respond',
          });
          break;
        }
        if (outcome.kind === 'error') {
          failures.push(`${prompt.pack || elevationId}: ${outcome.message}`);
          continue;
        }
        const idx = remaining.findIndex((row) => row.elevationId === elevationId);
        if (idx >= 0) remaining.splice(idx, 1);
      }
      onChange(remaining);
      if (failures.length) setError(failures[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBulkBusy(false);
    }
  };

  const busy = bulkBusy || busyId != null;
  const multi = prompts.length > 1;

  return (
    <div className="nexus-chat__elevation-dock" role="region" aria-label="Permission elevation">
      <div className="nexus-chat__elevation-head">
        <strong>{multi ? `Permissions needed (${prompts.length})` : 'Permission needed'}</strong>
      </div>
      {multi && decidable.length > 1 ? (
        <div className="nexus-chat__grant-actions nexus-chat__elevation-bulk">
          <button
            type="button"
            className="nexus-chat__btn"
            disabled={busy}
            onClick={() => void respondMany('deny')}
          >
            Deny all
          </button>
          <button
            type="button"
            className="nexus-chat__btn nexus-chat__btn--primary"
            disabled={busy}
            onClick={() => void respondMany('allow_session')}
          >
            Allow all for conversation
          </button>
        </div>
      ) : null}
      <ul className="nexus-chat__elevation-items">
        {prompts.map((prompt) => {
          const elevationId = String(prompt.elevationId || '');
          const needsOnboarding = promptNeedsOnboarding(prompt);
          const commandNames = elevationCommandNames(prompt);
          const rowBusy = busyId === elevationId || bulkBusy;
          return (
            <li key={elevationId || commandNames[0] || prompt.pack || 'elevation'} className="nexus-chat__elevation-item">
              <div className="nexus-chat__elevation-item-head">
                {prompt.pack ? <span className="nexus-chat__elevation-pack">{prompt.pack}</span> : null}
                <p className="nexus-chat__elevation-reason">
                  {prompt.reason ||
                    prompt.message ||
                    'This action needs your approval before the agent can continue.'}
                </p>
              </div>
              {commandNames.length ? (
                <ul className="nexus-chat__elevation-commands">
                  {commandNames.map((name) => (
                    <li key={name}>
                      <code>{name}</code>
                    </li>
                  ))}
                </ul>
              ) : null}
              {needsOnboarding ? (
                <div className="nexus-chat__error">
                  Complete {prompt.requiredOnboardingType} onboarding before granting this permission.
                </div>
              ) : (
                <div className="nexus-chat__grant-actions">
                  <button
                    type="button"
                    className="nexus-chat__btn"
                    disabled={rowBusy}
                    onClick={() => void respondOne(prompt, 'deny')}
                  >
                    Deny
                  </button>
                  <button
                    type="button"
                    className="nexus-chat__btn"
                    disabled={rowBusy}
                    onClick={() => void respondOne(prompt, 'allow_once')}
                  >
                    Allow once
                  </button>
                  <button
                    type="button"
                    className="nexus-chat__btn nexus-chat__btn--primary"
                    disabled={rowBusy}
                    onClick={() => void respondOne(prompt, 'allow_session')}
                  >
                    Allow for conversation
                  </button>
                  <button
                    type="button"
                    className="nexus-chat__btn"
                    disabled={rowBusy}
                    onClick={() => void respondOne(prompt, 'allow_always')}
                  >
                    Allow always (this agent)
                  </button>
                </div>
              )}
              {!needsOnboarding ? (
                <p className="nexus-chat__elevation-hint">
                  <strong>Allow always</strong> applies to your future conversations with this
                  agent only — it never grants anything to other people who chat with this agent.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
      {error ? <div className="nexus-chat__error">{elevationDecisionError(error)}</div> : null}
    </div>
  );
}

/** @deprecated Prefer PermissionElevationDock for one or many pending elevations. */
export function PermissionElevationCard({
  prompt,
  client,
  onResponded,
  onSca,
}: {
  prompt: PermissionElevationPromptModel;
  client?: CommandClient;
  onResponded: () => void;
  onSca?: (info: { authRequestId: string | null; command: string }) => void;
}) {
  return (
    <PermissionElevationDock
      prompts={[prompt]}
      client={client}
      onChange={(next) => {
        if (!next.length) onResponded();
      }}
      onSca={onSca}
    />
  );
}

function elevationDecisionError(message: string): string {
  if (message === 'COMMAND_NOT_ALLOWED' || message.includes('COMMAND_NOT_ALLOWED')) {
    return 'This app cannot record that decision yet.';
  }
  if (/OAuth2 app grant|APP_COMMAND_FORBIDDEN/i.test(message)) {
    return 'Sign in again so this app can approve agent permissions.';
  }
  return message;
}

export function ScaRequiredBanner({
  info,
}: {
  info: { authRequestId: string | null; command: string } | null;
}) {
  if (!info) return null;
  return (
    <div className="nexus-chat__sca-banner" role="status">
      <strong>Approve in the ANX app</strong>
      <div className="nexus-chat__muted">
        Strong customer authentication is required for <code>{info.command}</code>
        {info.authRequestId ? ` (${info.authRequestId})` : ''}. This is not a success — complete SCA,
        then retry.
      </div>
    </div>
  );
}
