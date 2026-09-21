const HIGHLIGHT_STYLE_ID = 'anx-page-agent-highlight-style';
const OVERLAY_ID = 'anx-page-agent-overlay';
const EDITED_CLASS = 'anx-page-agent-edited';
const SPOTLIGHT_CLASS = 'anx-page-agent-spotlight';

export function ensureOverlayStyles(): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    .${EDITED_CLASS} {
      outline: 2px solid #51cbce !important;
      box-shadow: 0 0 0 4px rgba(81, 203, 206, 0.16) !important;
      transition: box-shadow 0.2s ease, outline-color 0.2s ease;
    }
    .${SPOTLIGHT_CLASS} {
      outline: 3px solid #fbc658 !important;
      box-shadow: 0 0 0 6px rgba(251, 198, 88, 0.25) !important;
      z-index: 1000;
      position: relative;
    }
    #${OVERLAY_ID} {
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10050;
      background: #2c3e50;
      color: #fff;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 13px;
      display: none;
      align-items: center;
      gap: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.25);
    }
    #${OVERLAY_ID}.visible { display: flex; }
    #${OVERLAY_ID} button {
      background: #51cbce;
      border: none;
      color: #1a1a1a;
      padding: 4px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-weight: 600;
    }
  `;
  document.head.appendChild(style);
}

export type OverlayController = {
  show(pendingCount: number): void;
  hide(): void;
  setOnRevert(fn: () => void | Promise<void>): void;
  markEdited(el: Element): void;
  clearEdited(el: Element): void;
  spotlight(el: Element | null): void;
  clearSpotlight(): void;
};

export function mountOverlay(root?: HTMLElement | null): OverlayController {
  ensureOverlayStyles();
  let onRevert: (() => void | Promise<void>) | null = null;
  let spotlightEl: Element | null = null;

  let bar = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!bar) {
    bar = document.createElement('div');
    bar.id = OVERLAY_ID;
    bar.innerHTML = `<span class="anx-page-agent-overlay-msg"></span><button type="button">Revert all</button>`;
    (root || document.body).appendChild(bar);
    bar.querySelector('button')?.addEventListener('click', () => {
      void onRevert?.();
    });
  }

  return {
    show(pendingCount: number) {
      if (!bar) return;
      const msg = bar.querySelector('.anx-page-agent-overlay-msg');
      if (msg) msg.textContent = `${pendingCount} pending AI edit${pendingCount === 1 ? '' : 's'}`;
      bar.classList.toggle('visible', pendingCount > 0);
    },
    hide() {
      bar?.classList.remove('visible');
    },
    setOnRevert(fn) {
      onRevert = fn;
    },
    markEdited(el) {
      el.classList.add(EDITED_CLASS);
    },
    clearEdited(el) {
      el.classList.remove(EDITED_CLASS);
    },
    spotlight(el) {
      this.clearSpotlight();
      if (!el) return;
      spotlightEl = el;
      el.classList.add(SPOTLIGHT_CLASS);
      if ('scrollIntoView' in el) {
        (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    },
    clearSpotlight() {
      if (spotlightEl) {
        spotlightEl.classList.remove(SPOTLIGHT_CLASS);
        spotlightEl = null;
      }
      document.querySelectorAll(`.${SPOTLIGHT_CLASS}`).forEach((n) => n.classList.remove(SPOTLIGHT_CLASS));
    },
  };
}

export { EDITED_CLASS, SPOTLIGHT_CLASS, OVERLAY_ID };
