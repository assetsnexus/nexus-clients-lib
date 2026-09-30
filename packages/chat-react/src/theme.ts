export type NexusChatTheme = {
  colorBg?: string;
  colorSurface?: string;
  colorText?: string;
  colorMuted?: string;
  colorAccent?: string;
  colorBorder?: string;
  fontFamily?: string;
  fontSize?: string;
  radius?: string;
  density?: 'compact' | 'comfortable';
};

export const DEFAULT_THEME: NexusChatTheme = {
  colorBg: '#0f1117',
  colorSurface: '#1a1d27',
  colorText: '#e8eaef',
  colorMuted: '#8b919e',
  colorAccent: '#5b8def',
  colorBorder: '#2a2f3d',
  fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
  fontSize: '14px',
  radius: '10px',
  density: 'comfortable',
};

const VAR_MAP: Record<keyof NexusChatTheme, string> = {
  colorBg: '--nx-chat-bg',
  colorSurface: '--nx-chat-surface',
  colorText: '--nx-chat-text',
  colorMuted: '--nx-chat-muted',
  colorAccent: '--nx-chat-accent',
  colorBorder: '--nx-chat-border',
  fontFamily: '--nx-chat-font',
  fontSize: '--nx-chat-font-size',
  radius: '--nx-chat-radius',
  density: '--nx-chat-density',
};

export function themeToCssVars(theme: NexusChatTheme = {}): Record<string, string> {
  const merged = { ...DEFAULT_THEME, ...theme };
  const out: Record<string, string> = {};
  for (const key of Object.keys(VAR_MAP) as (keyof NexusChatTheme)[]) {
    const val = merged[key];
    if (val != null && val !== '') {
      out[VAR_MAP[key]] = String(val);
    }
  }
  if (merged.density === 'compact') {
    out['--nx-chat-gap'] = '6px';
    out['--nx-chat-pad'] = '8px';
  } else {
    out['--nx-chat-gap'] = '10px';
    out['--nx-chat-pad'] = '12px';
  }
  return out;
}

export function applyThemeToElement(el: HTMLElement, theme: NexusChatTheme = {}): void {
  const vars = themeToCssVars(theme);
  for (const [k, v] of Object.entries(vars)) {
    el.style.setProperty(k, v);
  }
}
