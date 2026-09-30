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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const needsOnboarding = Boolean(prompt.requiredOnboardingType && !prompt.onboardingSatisfied);

  const respond = async (decision: string) => {
    if (!prompt.elevationId) {
      setError('Missing elevationId');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!client?.send) {
        onResponded();
        return;
      }
      const result = (await client.send('anx.ai-agents.elevations.respond', {
        elevationId: prompt.elevationId,
        decision,
      })) as {
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
          command: 'anx.ai-agents.elevations.respond',
        });
        return;
      }
      const ok = result?.ok === true || result?.responseCode === 200;
      if (!ok) {
        const message = result?.error?.message || result?.message || 'Failed to record decision';
        if (decision !== 'deny' && /in status 'active'/.test(message)) {
          onResponded();
          return;
        }
        setError(message);
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
    <div className="nexus-chat__grant-card" role="region" aria-label="Permission elevation">
      <strong>Permission elevation required</strong>
      <p className="nexus-chat__muted">{prompt.reason || prompt.message || ''}</p>
      {prompt.pack ? (
        <div className="nexus-chat__muted">
          Pack: <code>{prompt.pack}</code>
        </div>
      ) : null}
      {needsOnboarding ? (
        <div className="nexus-chat__error">
          Complete {prompt.requiredOnboardingType} onboarding before granting this permission.
        </div>
      ) : (
        <div className="nexus-chat__grant-actions">
          <button type="button" className="nexus-chat__btn" disabled={busy} onClick={() => void respond('deny')}>
            Deny
          </button>
          <button
            type="button"
            className="nexus-chat__btn nexus-chat__btn--primary"
            disabled={busy}
            onClick={() => void respond('allow_once')}
          >
            Allow once
          </button>
          <button
            type="button"
            className="nexus-chat__btn"
            disabled={busy}
            onClick={() => void respond('allow_session')}
          >
            Allow for conversation
          </button>
        </div>
      )}
      {error ? <div className="nexus-chat__error">{error}</div> : null}
    </div>
  );
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
