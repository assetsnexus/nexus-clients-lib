/**
 * Minimal inline-SVG icon set for the chat chrome.
 *
 * The package ships no icon dependency (it is embedded in the desktop app, the
 * mobile WebView, and third-party hosts), so the handful of glyphs the composer
 * and sidebar need are drawn here. All icons are 16x16, use `currentColor`, and
 * are decorative (`aria-hidden`) — the button that wraps one owns the label.
 */

export type ChatIconProps = {
  className?: string;
  size?: number;
};

function svgProps(size: number, className?: string) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    className,
  };
}

/** Paperclip — attach files. */
export function IconPaperclip({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M21 11.5 12.6 19.9a5.5 5.5 0 0 1-7.8-7.8l8.4-8.4a3.7 3.7 0 1 1 5.2 5.2l-8.4 8.4a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" />
    </svg>
  );
}

/** Microphone — hold-to-talk dictation. */
export function IconMic({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v3.5" />
    </svg>
  );
}

/** Phone handset — start/end a call. */
export function IconPhone({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M6.5 3.5h3l1.5 4-2 1.5a12 12 0 0 0 5.9 5.9l1.6-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5Z" />
    </svg>
  );
}

/** Speaker with waves — auto voice (TTS playback). */
export function IconSpeaker({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 9.5h3l4-3.5v12l-4-3.5H4z" />
      <path d="M15 9.2a4 4 0 0 1 0 5.6" />
      <path d="M17.8 6.6a7.6 7.6 0 0 1 0 10.8" />
    </svg>
  );
}

/** Arrow up — send. */
export function IconSend({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 20V4" />
      <path d="m5.5 10.5 6.5-6.5 6.5 6.5" />
    </svg>
  );
}

/** Stacked rows — queue the message while the agent is streaming. */
export function IconQueue({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 7h16M4 12h16M4 17h10" />
    </svg>
  );
}

/** Square — stop the current generation. */
export function IconStop({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

/** Funnel — conversation-kind filter. */
export function IconFilter({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M4 5h16l-6.2 7.3V19l-3.6-2v-4.7z" />
    </svg>
  );
}

/** Plus — new conversation. */
export function IconPlus({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** Magnifier — search field. */
export function IconSearch({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

/** Vertical ellipsis — row actions. */
export function IconKebab({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)} strokeWidth={0} fill="currentColor">
      <circle cx="12" cy="5.5" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="18.5" r="1.6" />
    </svg>
  );
}

/** Briefcase — organisation identity chip fallback. */
export function IconBriefcase({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3" y="7.5" width="18" height="12" rx="2" />
      <path d="M9 7.5V5.5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
      <path d="M3 12.5h18" />
    </svg>
  );
}

/** Single person — private identity chip fallback. */
export function IconUser({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

/** Inbox tray — archive link. */
export function IconArchive({ className, size = 16 }: ChatIconProps) {
  return (
    <svg {...svgProps(size, className)}>
      <rect x="3" y="4.5" width="18" height="4.5" rx="1.2" />
      <path d="M5 9v9.5a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 18.5V9" />
      <path d="M10 13h4" />
    </svg>
  );
}
