/** Inject once into the document for package tool widgets (Vue hosts without SFC CSS). */
export const TOOL_WIDGET_CSS = `
.nexus-tool-timeline { font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
.nexus-tool-timeline .timeline-item { display: flex; gap: 8px; margin: 0; align-items: flex-start; }
.nexus-tool-timeline .timeline-marker { width: 6px; height: 6px; border-radius: 50%; margin-top: 9px; background: #c5cbd3; flex-shrink: 0; box-shadow: 0 0 0 2px rgba(197,203,211,.25); }
.nexus-tool-timeline .timeline-marker.is-running { background: #2a9d8f; box-shadow: 0 0 0 3px rgba(42,157,143,.18); animation: nexus-tool-pulse 1.2s ease-in-out infinite; }
.nexus-tool-timeline .timeline-marker.is-paused { background: #e9a825; box-shadow: 0 0 0 3px rgba(233,168,37,.16); }
.nexus-tool-timeline .timeline-marker.is-success { background: #3d9a6a; }
.nexus-tool-timeline .timeline-marker.is-error { background: #d65a3a; }
.nexus-tool-timeline .timeline-marker.is-approval { background: #e9a825; }
.nexus-tool-timeline .timeline-marker.is-mode-blocked { background: #c47b2b; }
.nexus-tool-timeline .timeline-body { flex: 1; min-width: 0; }
@keyframes nexus-tool-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }

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

.nexus-tool-run {
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 8px;
  background: rgba(248, 250, 252, 0.92);
  overflow: hidden;
}
.nexus-tool-run--open { background: #fff; }
.nexus-tool-run__header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin: 0;
  padding: 5px 8px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: #334155;
  min-height: 28px;
}
.nexus-tool-run__header:disabled { cursor: default; opacity: 0.85; }
.nexus-tool-run__header:hover:not(:disabled) { background: rgba(15, 23, 42, 0.03); }
.nexus-tool-run__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: #94a3b8;
}
.nexus-tool-run__dot.is-running { background: #2a9d8f; animation: nexus-tool-pulse 1.2s ease-in-out infinite; }
.nexus-tool-run__dot.is-paused { background: #e9a825; }
.nexus-tool-run__dot.is-success { background: #3d9a6a; }
.nexus-tool-run__dot.is-error { background: #d65a3a; }
.nexus-tool-run__dot.is-approval,
.nexus-tool-run__dot.is-mode-blocked { background: #c47b2b; }
.nexus-tool-run__title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nexus-tool-run__chip {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: lowercase;
  line-height: 1;
  padding: 3px 6px;
  border-radius: 999px;
  color: #64748b;
  background: rgba(100, 116, 139, 0.1);
}
.nexus-tool-run__chip.is-running { color: #0f766e; background: rgba(42, 157, 143, 0.14); }
.nexus-tool-run__chip.is-paused { color: #a16207; background: rgba(233, 168, 37, 0.16); }
.nexus-tool-run__chip.is-success { color: #166534; background: rgba(61, 154, 106, 0.14); }
.nexus-tool-run__chip.is-error { color: #b91c1c; background: rgba(214, 90, 58, 0.14); }
.nexus-tool-run__chip.is-approval,
.nexus-tool-run__chip.is-mode-blocked { color: #9a3412; background: rgba(196, 123, 43, 0.16); }
.nexus-tool-run__chev { color: #94a3b8; font-size: 10px; flex-shrink: 0; margin-left: 2px; }
.nexus-tool-run__actions,
.nexus-tool-run__details {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 8px 8px;
}
.nexus-tool-run__details { flex-direction: column; gap: 6px; }
.nexus-tool-run__block { display: flex; flex-direction: column; gap: 3px; }
.nexus-tool-run__kicker {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #94a3b8;
}
.nexus-tool-run__pre {
  max-height: 8.5rem;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  color: #475569;
  margin: 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.035);
  border: 1px solid rgba(15, 23, 42, 0.06);
  font-size: 11px;
  line-height: 1.35;
}
.nexus-tool-run__error { margin: 0; color: #b91c1c; font-size: 12px; }
.nexus-tool-run__btn {
  appearance: none;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  color: #334155;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.3;
  cursor: pointer;
}
.nexus-tool-run__btn:disabled { opacity: 0.5; cursor: default; }
.nexus-tool-run__btn:hover:not(:disabled) { background: rgba(15, 23, 42, 0.03); }
.nexus-tool-run__btn--ghost { background: transparent; border-color: transparent; color: #475569; padding-left: 4px; padding-right: 4px; }
.nexus-tool-run__btn--ghost:hover:not(:disabled) { background: rgba(15, 23, 42, 0.05); }
.nexus-tool-run__btn--ok { border-color: rgba(42, 157, 143, 0.35); color: #0f766e; background: rgba(42, 157, 143, 0.08); }
.nexus-tool-run__btn--danger { border-color: transparent; color: #b91c1c; background: transparent; }
.nexus-tool-run__btn--danger:hover:not(:disabled) { background: rgba(185, 28, 28, 0.06); }

.nexus-sub-agent {
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 9px;
  background: linear-gradient(180deg, rgba(248, 250, 252, 0.98), #fff);
  overflow: hidden;
}
.nexus-sub-agent--running { border-color: rgba(42, 157, 143, 0.35); box-shadow: inset 2px 0 0 #2a9d8f; }
.nexus-sub-agent--error { border-color: rgba(214, 90, 58, 0.35); box-shadow: inset 2px 0 0 #d65a3a; }
.nexus-sub-agent__header {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin: 0;
  padding: 6px 8px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
  color: #1e293b;
  min-height: 30px;
}
.nexus-sub-agent__header:hover { background: rgba(15, 23, 42, 0.025); }
.nexus-sub-agent__ring { flex-shrink: 0; color: #2a9d8f; transform: rotate(-90deg); }
.nexus-sub-agent__ring-fill { transition: stroke-dashoffset .25s linear; }
.nexus-sub-agent__kind {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #64748b;
}
.nexus-sub-agent__title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nexus-sub-agent__elapsed {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #0f766e;
  letter-spacing: 0.01em;
}
.nexus-sub-agent__open-btn {
  flex-shrink: 0;
}
.nexus-sub-agent__meta {
  flex-shrink: 0;
  font-size: 10px;
  color: #94a3b8;
  font-variant-numeric: tabular-nums;
}
.nexus-sub-agent__meta--mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; max-width: 7.5rem; overflow: hidden; text-overflow: ellipsis; }
.nexus-sub-agent__body { display: flex; flex-direction: column; gap: 8px; padding: 0 8px 8px; }
.nexus-sub-agent__controls { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; }
.nexus-sub-agent__plan,
.nexus-sub-agent__tasks,
.nexus-sub-agent__details { display: flex; flex-direction: column; gap: 4px; }
.nexus-sub-agent__muted { color: #64748b; font-size: 11px; line-height: 1.35; }
.nexus-sub-agent__steps { margin: 0; padding-left: 1.1rem; color: #475569; font-size: 11px; }
.nexus-sub-agent__steps li { display: flex; align-items: center; gap: 6px; margin: 2px 0; }
.nexus-sub-agent__tasks { list-style: none; margin: 0; padding: 0; }
.nexus-sub-agent__tasks li { display: flex; align-items: center; gap: 6px; min-height: 22px; }
.nexus-sub-agent__check { margin: 0; }
.nexus-sub-agent__task-title { flex: 1; min-width: 0; font-size: 12px; color: #334155; }
.nexus-sub-agent__tool-rows { display: flex; flex-direction: column; gap: 4px; }
.nexus-sub-agent__tool-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
  min-height: 22px;
  padding: 3px 6px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.025);
  border: 1px solid rgba(15, 23, 42, 0.05);
}
.nexus-sub-agent__engine-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 999px;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0;
  color: #334155;
  background: rgba(100, 116, 139, 0.14);
}
.nexus-sub-agent__engine-icon.is-fetch { color: #0f766e; background: rgba(42, 157, 143, 0.16); }
.nexus-sub-agent__engine-icon.is-marketplace { color: #7c3aed; background: rgba(124, 58, 237, 0.12); }
.nexus-sub-agent__engine-icon.is-engine-brave { color: #fb542b; background: rgba(251, 84, 43, 0.12); }
.nexus-sub-agent__engine-icon.is-engine-google { color: #2563eb; background: rgba(37, 99, 235, 0.12); }
.nexus-sub-agent__engine-icon.is-engine-bing { color: #0284c7; background: rgba(2, 132, 199, 0.12); }
.nexus-sub-agent__engine-icon.is-engine-tavily { color: #059669; background: rgba(5, 150, 105, 0.12); }
.nexus-sub-agent__engine-icon.is-engine-exa { color: #9333ea; background: rgba(147, 51, 234, 0.12); }
.nexus-sub-agent__engine-icon.is-engine-duckduckgo { color: #ea580c; background: rgba(234, 88, 12, 0.12); }
.nexus-sub-agent__tool-name {
  font-size: 10px;
  font-weight: 700;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #475569;
}
.nexus-sub-agent__engine-id {
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.nexus-sub-agent__tool-hint {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nexus-sub-agent__http { font-variant-numeric: tabular-nums; }
.nexus-sub-agent__outcome { text-transform: lowercase; }
.nexus-sub-agent__summary-md {
  max-height: 12rem;
  overflow: auto;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.03);
  border: 1px solid rgba(15, 23, 42, 0.05);
  font-size: 11px;
  line-height: 1.4;
}
.nexus-sub-agent__summary-md .nexus-chat-markdown-table-wrap { margin-top: 4px; }
.nexus-sub-agent__summary-md table { font-size: 10px; border-collapse: collapse; width: 100%; }
.nexus-sub-agent__summary-md th,
.nexus-sub-agent__summary-md td {
  border: 1px solid rgba(15, 23, 42, 0.08);
  padding: 3px 5px;
  text-align: left;
  vertical-align: top;
}
.nexus-sub-agent__trail { display: flex; flex-wrap: wrap; gap: 4px; }
.nexus-sub-agent__trail-chip {
  font-size: 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #475569;
  background: rgba(15, 23, 42, 0.04);
  border: 1px solid rgba(15, 23, 42, 0.06);
  border-radius: 999px;
  padding: 2px 7px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nexus-sub-agent__answer {
  max-height: 7rem;
  overflow: auto;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(15, 23, 42, 0.03);
  border: 1px solid rgba(15, 23, 42, 0.05);
  color: #475569;
  font-size: 11px;
  line-height: 1.4;
  white-space: pre-wrap;
}
.nexus-sub-agent__message { display: flex; flex-direction: column; gap: 6px; }
.nexus-sub-agent__compose { display: flex; gap: 6px; align-items: center; }
.nexus-sub-agent__input {
  flex: 1;
  min-width: 0;
  height: 28px;
  border: 1px solid rgba(15, 23, 42, 0.12);
  border-radius: 6px;
  padding: 0 8px;
  font-size: 12px;
  background: #fff;
  color: #1e293b;
}
.nexus-sub-agent__input:focus { outline: none; border-color: rgba(42, 157, 143, 0.55); box-shadow: 0 0 0 2px rgba(42, 157, 143, 0.12); }

.nexus-subagents-strip {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid rgba(15, 23, 42, 0.1);
  border-radius: 999px;
  padding: 2px;
  margin-bottom: 8px;
  background: rgba(248, 250, 252, 0.95);
}
.nexus-subagents-strip--open {
  border-radius: 12px;
  padding: 4px;
}
.nexus-subagents-strip--compact { max-width: 100%; }
.nexus-subagents-strip--active {
  border-color: rgba(42, 157, 143, 0.35);
  background: linear-gradient(90deg, rgba(42, 157, 143, 0.08), rgba(248, 250, 252, 0.96));
}
.nexus-subagents-strip__toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  margin: 0;
  padding: 4px 8px 4px 10px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: #1e293b;
  cursor: pointer;
  text-align: left;
  min-height: 28px;
}
.nexus-subagents-strip__toggle:hover { background: rgba(15, 23, 42, 0.04); }
.nexus-subagents-strip__title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}
.nexus-subagents-strip__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  color: #0f766e;
  background: rgba(42, 157, 143, 0.16);
}
.nexus-subagents-strip__badge--live {
  color: #fff;
  background: #2a9d8f;
  box-shadow: 0 0 0 3px rgba(42, 157, 143, 0.16);
  animation: nexus-tool-pulse 1.4s ease-in-out infinite;
}
.nexus-subagents-strip__live {
  font-size: 10px;
  font-weight: 600;
  color: #0f766e;
}
.nexus-subagents-strip__chev { margin-left: auto; color: #94a3b8; font-size: 10px; }
.nexus-subagents-strip__list {
  list-style: none;
  margin: 0;
  padding: 2px 4px 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nexus-subagents-strip__item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 8px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.7);
}
.nexus-subagents-strip__mission {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  color: #334155;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nexus-subagents-strip__actions { display: inline-flex; align-items: center; gap: 0; flex-shrink: 0; }

.nexus-delivery-picker { display: inline-flex; flex-wrap: wrap; gap: 2px; }
.nexus-linked-subchat-banner {
  border: 1px solid rgba(42, 157, 143, 0.28);
  border-radius: 10px;
  padding: 6px 8px;
  margin-bottom: 8px;
  background: linear-gradient(90deg, rgba(42, 157, 143, 0.08), rgba(248, 250, 252, 0.96));
  font-size: 12px;
}
.nexus-linked-subchat-banner__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  flex-wrap: wrap;
}
.nexus-linked-subchat-banner__badge {
  display: inline-flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: #0f766e;
  background: rgba(13, 148, 136, 0.12);
  border: 1px solid rgba(13, 148, 136, 0.28);
  border-radius: 4px;
  padding: 2px 6px;
  flex-shrink: 0;
}
.nexus-linked-subchat-banner__return {
  appearance: none;
  border: 1px solid rgba(15, 23, 42, 0.12);
  background: #fff;
  color: #0f766e;
  border-radius: 6px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.3;
  cursor: pointer;
  flex-shrink: 0;
}
.nexus-linked-subchat-banner__return:hover {
  background: rgba(42, 157, 143, 0.1);
  border-color: rgba(42, 157, 143, 0.35);
}
.nexus-linked-subchat-banner__parent {
  min-width: 0;
  flex: 1;
  font-weight: 600;
  color: #1e293b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.nexus-linked-subchat-banner__meta {
  flex-shrink: 0;
  font-size: 10px;
}
.nexus-linked-subchat-banner__delivery {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 6px;
}
.nexus-linked-subchat-banner__delivery-label {
  font-size: 10px;
  color: #94a3b8;
  font-weight: 600;
}
.nexus-mode-refusal { border: 1px solid #fbc658; border-radius: 6px; padding: 8px 10px; background: rgba(251,198,88,.08); }
.nexus-mode-refusal__row { display: flex; align-items: flex-start; gap: 8px; }
.nexus-mode-refusal__badge { flex-shrink: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: #fbc658; border: 1px solid #fbc658; border-radius: 3px; padding: 1px 5px; margin-top: 1px; }
.nexus-mode-refusal__text { color: #66615b; }
.nexus-mode-refusal__action { margin-top: 8px; }
.nexus-mode-refusal__switched { font-style: italic; }
.nexus-mode-transition { display: inline-flex; align-items: center; gap: 6px; }
.nexus-mode-transition__ring { position: relative; flex-shrink: 0; }
.nexus-mode-transition__svg { transform: rotate(-90deg); color: #ced4da; }
.nexus-mode-transition__progress { color: #51cbce; transition: stroke-dashoffset .05s linear; }
.nexus-mode-transition__labels { display: inline-flex; align-items: center; gap: 4px; font-variant-numeric: tabular-nums; }
.nexus-mode-transition__from { color: #9a9a9a; text-decoration: line-through; opacity: .7; }
.nexus-mode-transition__arrow { color: #9a9a9a; }
.nexus-mode-transition__to { font-weight: 600; }
.nexus-mode-transition__countdown { color: #9a9a9a; font-size: 11px; margin-left: 2px; }
.nexus-mode-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; color: #6c757d; }
.nexus-mode-badge__label { font-weight: 600; text-transform: uppercase; letter-spacing: .02em; font-size: 10px; }
.nexus-chat-markdown { font-size: inherit; }
.nexus-chat-markdown p { margin: .35em 0; }
.nexus-chat-markdown ul, .nexus-chat-markdown ol { margin: .35em 0; padding-left: 1.25rem; }
.nexus-chat-markdown pre { font-size: 11px; overflow-x: auto; }
.nexus-chat-markdown code { font-size: 11px; }
.nexus-chat-markdown-table-wrap { overflow-x: auto; max-width: 100%; }
`;

let injectedVersion: string | null = null;
const STYLE_VERSION = 'search-preset-v1';

export function ensureToolWidgetStyles(): void {
  if (typeof document === 'undefined') return;
  if (injectedVersion === STYLE_VERSION) return;
  document.querySelectorAll('style[data-nexus-chat-tools]').forEach((node) => node.remove());
  const el = document.createElement('style');
  el.setAttribute('data-nexus-chat-tools', STYLE_VERSION);
  el.textContent = TOOL_WIDGET_CSS;
  document.head.appendChild(el);
  injectedVersion = STYLE_VERSION;
}
