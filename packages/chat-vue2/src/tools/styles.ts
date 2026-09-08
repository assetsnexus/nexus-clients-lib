/** Inject once into the document for package tool widgets (Vue hosts without SFC CSS). */
export const TOOL_WIDGET_CSS = `
.nexus-tool-timeline { font-size: 12px; }
.nexus-tool-timeline .timeline-item { display: flex; gap: 8px; margin-bottom: 8px; }
.nexus-tool-timeline .timeline-marker { width: 8px; height: 8px; border-radius: 50%; margin-top: 5px; background: #ccc; flex-shrink: 0; }
.nexus-tool-timeline .timeline-marker.is-running { background: #51cbce; animation: nexus-tool-pulse 1s infinite; }
.nexus-tool-timeline .timeline-marker.is-success { background: #6bd098; }
.nexus-tool-timeline .timeline-marker.is-error { background: #ef8157; }
.nexus-tool-timeline .timeline-marker.is-approval { background: #fbc658; }
@keyframes nexus-tool-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }
.nexus-media-grid { display: grid; gap: 8px; grid-template-columns: 1fr; }
.nexus-media-grid--multi { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (min-width: 576px) { .nexus-media-grid--multi { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.nexus-media-figure { margin: 0; border: 1px solid #e3e3e3; border-radius: 4px; overflow: hidden; background: #f8f9fa; }
.nexus-media-img { width: 100%; aspect-ratio: 1; object-fit: cover; display: block; }
.nexus-media-audio { width: 100%; max-width: 320px; height: 32px; }
.nexus-ask-choice { border: 1px solid #51cbce; border-radius: 6px; padding: 10px; background: rgba(81,203,206,.06); }
.nexus-ask-choice--active { border-width: 2px; box-shadow: 0 0 0 2px rgba(81,203,206,.25); }
.nexus-ask-choice__options .btn { white-space: normal; }
.nexus-checkback { border: 1px solid #51cbce; border-radius: 6px; padding: 10px; }
.nexus-checkback--done { border-color: #6bd098; background: rgba(107,208,152,.08); }
.nexus-checkback--overdue { border-color: #fbc658; background: rgba(251,198,88,.08); }
.nexus-checkback--waiting { border-color: #51cbce; background: rgba(81,203,206,.06); }
.nexus-checkback__row { display: flex; gap: 12px; align-items: flex-start; }
.nexus-checkback__ring { position: relative; flex-shrink: 0; }
.nexus-checkback__svg { transform: rotate(-90deg); color: #ced4da; }
.nexus-checkback__progress { color: #51cbce; transition: stroke-dashoffset .3s linear; }
.nexus-checkback__center { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.nexus-checkback__countdown { font-family: monospace; font-size: 12px; }
.nexus-file-tool { border: 1px solid #e3e3e3; border-radius: 6px; overflow: hidden; }
.nexus-file-tool__grid { display: grid; gap: 8px; grid-template-columns: 1fr; padding: 8px; }
@media (min-width: 576px) { .nexus-file-tool__grid { grid-template-columns: 1fr 1fr; } }
.nexus-file-tool__single { padding: 8px; max-width: 28rem; }
.nexus-file-card { border: 1px solid #eee; border-radius: 4px; overflow: hidden; background: #fff; }
.nexus-file-thumb { width: 100%; max-height: 12rem; object-fit: contain; background: #111; cursor: zoom-in; display: block; }
.nexus-file-video { width: 100%; max-height: 12rem; background: #000; display: block; }
.nexus-file-lightbox { position: fixed; inset: 0; z-index: 2000; background: rgba(0,0,0,.8); display: flex; align-items: center; justify-content: center; padding: 16px; }
.nexus-file-lightbox__img { max-height: 90vh; max-width: 90vw; object-fit: contain; }
.nexus-explorer-link { color: #51cbce; }
.nexus-tool-run { border: 1px solid #eee; border-radius: 4px; padding: 4px 6px; background: #fafafa; }
.nexus-tool-run__pre { max-height: 10rem; overflow: auto; white-space: pre-wrap; color: #666; margin: 0; }
.nexus-tool-run__badge.is-success { color: #6bd098; }
.nexus-tool-run__badge.is-error { color: #ef8157; }
.nexus-tool-run__badge.is-running { color: #51cbce; }
.nexus-tool-run__badge.is-approval { color: #fbc658; }
.nexus-sub-agent { border: 1px solid rgba(111,66,193,.35); border-radius: 6px; padding: 6px; background: rgba(111,66,193,.05); }
.nexus-chat-markdown { font-size: inherit; }
.nexus-chat-markdown p { margin: .35em 0; }
.nexus-chat-markdown ul, .nexus-chat-markdown ol { margin: .35em 0; padding-left: 1.25rem; }
.nexus-chat-markdown pre { font-size: 11px; overflow-x: auto; }
.nexus-chat-markdown code { font-size: 11px; }
.nexus-chat-markdown-table-wrap { overflow-x: auto; max-width: 100%; }
`;

let injected = false;

export function ensureToolWidgetStyles(): void {
  if (injected || typeof document === 'undefined') return;
  const el = document.createElement('style');
  el.setAttribute('data-nexus-chat-tools', '1');
  el.textContent = TOOL_WIDGET_CSS;
  document.head.appendChild(el);
  injected = true;
}
