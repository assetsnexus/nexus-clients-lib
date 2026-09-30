export type WorkspaceItem = {
  id: string;
  fileId?: string | null;
  label?: string | null;
  mimeType?: string | null;
  url?: string | null;
  downloadUrl?: string | null;
  previewUrl?: string | null;
  viaDataRoomId?: string | null;
};

export type WorkspaceRow = {
  id: string;
  name?: string | null;
  items?: WorkspaceItem[];
};

export type WorkspaceStripProps = {
  items: WorkspaceItem[];
  loading?: boolean;
  error?: string | null;
  onOpenPopup: () => void;
  onOpenItem: (item: WorkspaceItem) => void;
  onRemoveItem: (item: WorkspaceItem) => void;
};

function itemIcon(item: WorkspaceItem): string {
  const mime = String(item.mimeType || '').toLowerCase();
  const name = String(item.label || '');
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(name)) return '🖼';
  if (mime.includes('pdf') || /\.pdf$/i.test(name)) return '📄';
  return '📎';
}

export function WorkspaceStrip({
  items,
  loading,
  error,
  onOpenPopup,
  onOpenItem,
  onRemoveItem,
}: WorkspaceStripProps) {
  if (!items.length && !loading && !error) return null;
  return (
    <div className="nexus-chat__workspace-strip" role="region" aria-label="Workspace">
      <button type="button" className="nexus-chat__workspace-label" onClick={onOpenPopup}>
        Workspace
      </button>
      {loading ? <span className="nexus-chat__muted">…</span> : null}
      {error ? <span className="nexus-chat__error">{error}</span> : null}
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          className="nexus-chat__chip nexus-chat__workspace-chip"
          title={item.label || item.fileId || item.id}
          onClick={() => onOpenItem(item)}
        >
          <span aria-hidden>{itemIcon(item)}</span>
          <span className="nexus-chat__workspace-name">{item.label || item.fileId || item.id}</span>
          <span
            className="nexus-chat__workspace-remove"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onRemoveItem(item);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                onRemoveItem(item);
              }
            }}
          >
            ×
          </span>
        </button>
      ))}
    </div>
  );
}
