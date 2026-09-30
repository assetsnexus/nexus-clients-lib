import type { CommandClient } from '@nexus/chat-core';
import type { WorkspaceItem, WorkspaceRow } from './WorkspaceStrip.js';

export type WorkspacePopupProps = {
  open: boolean;
  client?: CommandClient;
  conversationId?: string | null;
  workspace: WorkspaceRow | null;
  loading?: boolean;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onChanged: () => void;
  onError: (message: string) => void;
  onOpenItem: (item: WorkspaceItem) => void;
  onUpload: () => void;
};

function commandError(result: Record<string, unknown> | null | undefined, fallback: string): string {
  if (!result) return fallback;
  const err = result.error as { message?: string } | undefined;
  return (typeof result.message === 'string' && result.message) || err?.message || fallback;
}

export function WorkspacePopup({
  open,
  client,
  conversationId,
  workspace,
  loading,
  busy,
  error,
  onClose,
  onChanged,
  onError,
  onOpenItem,
  onUpload,
}: WorkspacePopupProps) {
  if (!open) return null;

  const createOrRefresh = async () => {
    if (!client?.send) return;
    if (workspace) {
      onChanged();
      return;
    }
    const result = (await client.send('anx.workspace.create', {
      name: 'Chat workspace',
      conversationId: conversationId || undefined,
    })) as Record<string, unknown>;
    if (result?.ok === false) {
      onError(commandError(result, 'Failed to create workspace'));
      return;
    }
    onChanged();
  };

  const remove = async (item: WorkspaceItem) => {
    if (!client?.send || !workspace?.id) return;
    const result = (await client.send('anx.workspace.items.remove', {
      workspaceId: workspace.id,
      itemId: item.id,
    })) as Record<string, unknown>;
    if (result?.ok === false) {
      onError(commandError(result, 'Failed to remove item'));
      return;
    }
    onChanged();
  };

  const unlink = async () => {
    if (!client?.send || !workspace?.id) return;
    const result = (await client.send('anx.workspace.unlink', {
      workspaceId: workspace.id,
      conversationId: conversationId || undefined,
    })) as Record<string, unknown>;
    if (result?.ok === false) {
      onError(commandError(result, 'Failed to unlink workspace'));
      return;
    }
    onChanged();
  };

  return (
    <div className="nexus-chat__sheet-backdrop" onClick={onClose} role="presentation">
      <div
        className="nexus-chat__sheet nexus-chat__workspace-popup"
        role="dialog"
        aria-label="Workspace"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="nexus-chat__sheet-header">
          <strong>Workspace</strong>
          <button type="button" className="nexus-chat__btn" onClick={onClose}>
            ×
          </button>
        </div>
        {loading ? <p className="nexus-chat__muted">Loading…</p> : null}
        {error ? <p className="nexus-chat__error">{error}</p> : null}
        {!loading && !workspace ? (
          <p className="nexus-chat__muted">No workspace linked to this conversation.</p>
        ) : null}
        {workspace ? (
          <div>
            <div className="nexus-chat__workspace-popup-head">
              <div>
                <div>{workspace.name || 'Chat workspace'}</div>
                <div className="nexus-chat__muted">
                  {(workspace.items || []).length} item{(workspace.items || []).length === 1 ? '' : 's'}
                </div>
              </div>
              <button type="button" className="nexus-chat__btn" disabled={busy} onClick={() => void unlink()}>
                Unlink
              </button>
            </div>
            <ul className="nexus-chat__workspace-list">
              {(workspace.items || []).map((item) => (
                <li key={item.id}>
                  <button type="button" className="nexus-chat__btn" onClick={() => onOpenItem(item)}>
                    {item.label || item.fileId || item.id}
                  </button>
                  <span className="nexus-chat__muted">{item.mimeType || '—'}</span>
                  <button
                    type="button"
                    className="nexus-chat__btn"
                    disabled={busy}
                    onClick={() => void remove(item)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="nexus-chat__sheet-actions">
          <button type="button" className="nexus-chat__btn" disabled={busy} onClick={onUpload}>
            Upload
          </button>
          <button
            type="button"
            className="nexus-chat__btn nexus-chat__btn--primary"
            disabled={busy}
            onClick={() => void createOrRefresh()}
          >
            {workspace ? 'Refresh' : 'Create workspace'}
          </button>
        </div>
      </div>
    </div>
  );
}
