/** Normalize BCP-47 / ISO language tags for STT pickers. */
export function normalizeSttLanguageCode(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const primary = raw.split(/[-_]/)[0];
  return primary ? primary.toLowerCase() : null;
}

/** Select value for Auto — maps to omit/`null` on STT create / live-session. */
export const STT_AUTO_LANGUAGE = '';

export const STT_LANGUAGE_OPTIONS = [
  { code: 'en', native: 'English' },
  { code: 'de', native: 'Deutsch' },
  { code: 'fr', native: 'Français' },
  { code: 'es', native: 'Español' },
  { code: 'it', native: 'Italiano' },
  { code: 'pt', native: 'Português' },
  { code: 'nl', native: 'Nederlands' },
  { code: 'pl', native: 'Polski' },
  { code: 'ru', native: 'Русский' },
  { code: 'uk', native: 'Українська' },
  { code: 'zh', native: '中文' },
  { code: 'ja', native: '日本語' },
  { code: 'ko', native: '한국어' },
  { code: 'ar', native: 'العربية' },
  { code: 'tr', native: 'Türkçe' },
  { code: 'sv', native: 'Svenska' },
  { code: 'da', native: 'Dansk' },
  { code: 'fi', native: 'Suomi' },
  { code: 'no', native: 'Norsk' },
  { code: 'cs', native: 'Čeština' },
  { code: 'hu', native: 'Magyar' },
  { code: 'el', native: 'Ελληνικά' },
  { code: 'he', native: 'עברית' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'id', native: 'Bahasa Indonesia' },
  { code: 'th', native: 'ไทย' },
  { code: 'vi', native: 'Tiếng Việt' },
];

export function sttLanguageSelectOptions(preferredCode) {
  const preferred = normalizeSttLanguageCode(preferredCode);
  const known = new Set(STT_LANGUAGE_OPTIONS.map((row) => row.code));
  const extra =
    preferred && !known.has(preferred) ? [{ code: preferred, native: preferred }] : [];
  return extra.concat(STT_LANGUAGE_OPTIONS);
}

export function sttLanguageForApi(selected) {
  return normalizeSttLanguageCode(selected);
}
