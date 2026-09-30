import { useEffect, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { loadViewerPreview, type LoadedPreview, type ViewerFileRef } from '../viewer/load-preview.js';

export type FileViewerTab = ViewerFileRef & { tabId: string };

export type FileViewerProps = {
  tabs: FileViewerTab[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onCloseTab: (tabId: string) => void;
};

function cellText(cell: unknown): string {
  if (cell == null) return '';
  if (typeof cell === 'object' && cell && 'text' in cell) return String((cell as { text: unknown }).text);
  return String(cell);
}

function PreviewBody({ preview, name }: { preview: LoadedPreview; name: string }) {
  if (preview.kind === 'image') {
    return <img className="nexus-chat__viewer-img" src={preview.objectUrl} alt={name} />;
  }
  if (preview.kind === 'text') {
    return <pre className="nexus-chat__viewer-pre">{preview.text}</pre>;
  }
  if (preview.kind === 'markdown') {
    return (
      <div
        className="nexus-chat-markdown nexus-chat__viewer-md"
        dangerouslySetInnerHTML={{ __html: preview.html }}
      />
    );
  }
  if (preview.kind === 'html' || preview.kind === 'office-word') {
    return (
      <iframe
        className="nexus-chat__viewer-iframe"
        title={name}
        sandbox=""
        srcDoc={preview.srcdoc}
      />
    );
  }
  if (preview.kind === 'office-sheet') {
    return (
      <div className="nexus-chat__viewer-sheet">
        <div className="nexus-chat__viewer-sheet-name">{preview.sheetName}</div>
        <table>
          <tbody>
            {preview.rows.slice(0, 200).map((row, ri) => (
              <tr key={ri}>
                {(Array.isArray(row) ? row : [row]).slice(0, 40).map((cell, ci) => (
                  <td key={ci}>{cellText(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (preview.kind === 'office-slide') {
    return (
      <div className="nexus-chat__viewer-slides">
        {preview.slides.map((slide) => (
          <div key={slide.index} className="nexus-chat__viewer-slide">
            <strong>Slide {slide.index}</strong>
            {slide.text ? <p>{slide.text}</p> : null}
            {slide.images.length ? (
              <div className="nexus-chat__media-strip">
                {slide.images.map((src, i) => (
                  <img key={i} src={src} alt={`Slide ${slide.index} image ${i + 1}`} />
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {preview.downloadUrl ? (
          <a className="nexus-chat__btn" href={preview.downloadUrl} download={name}>
            Download
          </a>
        ) : null}
      </div>
    );
  }
  if (preview.kind === 'pdf') {
    return (
      <iframe className="nexus-chat__viewer-iframe" title={name} src={preview.objectUrl} />
    );
  }
  return (
    <div className="nexus-chat__viewer-other">
      <p>{preview.message}</p>
      {preview.downloadUrl ? (
        <a className="nexus-chat__btn" href={preview.downloadUrl} download={name}>
          Download
        </a>
      ) : null}
    </div>
  );
}

function TabPreview({ file }: { file: FileViewerTab }) {
  const [preview, setPreview] = useState<LoadedPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPreview(null);
    void loadViewerPreview(file, {
      purify: DOMPurify as { sanitize: (dirty: string, config?: any) => string },
      parseMarkdown: (src) => marked.parse(String(src || ''), { async: false }) as string,
    })
      .then((p) => {
        if (!cancelled) setPreview(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [file.id, file.url, file.downloadUrl, file.name, file.mimeType]);

  if (loading) return <div className="nexus-chat__muted">Loading preview…</div>;
  if (error) return <div className="nexus-chat__error">{error}</div>;
  if (!preview) return null;
  return <PreviewBody preview={preview} name={file.name} />;
}

export function FileViewer({ tabs, activeTabId, onSelectTab, onCloseTab }: FileViewerProps) {
  if (!tabs.length) return null;
  const active = tabs.find((t) => t.tabId === activeTabId) || tabs[0]!;
  return (
    <aside className="nexus-chat__viewer" aria-label="File viewer">
      <div className="nexus-chat__viewer-tabs">
        {tabs.map((tab) => (
          <div
            key={tab.tabId}
            className={`nexus-chat__viewer-tab${tab.tabId === active.tabId ? ' nexus-chat__viewer-tab--active' : ''}`}
          >
            <button type="button" className="nexus-chat__viewer-tab-btn" onClick={() => onSelectTab(tab.tabId)}>
              {tab.name}
            </button>
            <button
              type="button"
              className="nexus-chat__viewer-tab-close"
              aria-label={`Close ${tab.name}`}
              onClick={() => onCloseTab(tab.tabId)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="nexus-chat__viewer-body">
        <TabPreview key={active.tabId} file={active} />
      </div>
    </aside>
  );
}
