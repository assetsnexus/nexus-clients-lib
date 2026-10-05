export type SpeechResultMessage = {
  type: 'speechResult';
  requestId: string;
  text?: string;
  error?: string;
};

export type SpeechAvailabilityMessage = {
  type: 'speechAvailability';
  available: boolean;
};

type SpeechCtor = new () => {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function hostWindow(): Window & {
  SpeechRecognition?: SpeechCtor;
  webkitSpeechRecognition?: SpeechCtor;
  ReactNativeWebView?: { postMessage: (body: string) => void };
} {
  return window as Window & {
    SpeechRecognition?: SpeechCtor;
    webkitSpeechRecognition?: SpeechCtor;
    ReactNativeWebView?: { postMessage: (body: string) => void };
  };
}

export function webSpeechAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  const host = hostWindow();
  return Boolean(host.SpeechRecognition || host.webkitSpeechRecognition);
}

export function nativeSpeechBridgeAvailable(): boolean {
  if (typeof window === 'undefined') return false;
  return typeof hostWindow().ReactNativeWebView?.postMessage === 'function';
}

export function postSpeechCommand(payload: Record<string, unknown>): void {
  const post = hostWindow().ReactNativeWebView?.postMessage;
  if (!post) return;
  post(JSON.stringify(payload));
}

function parseMessageData(data: unknown): Record<string, unknown> | null {
  if (typeof data === 'string') {
    try {
      const parsed = JSON.parse(data) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

export function probePhoneStt(timeoutMs = 1500): Promise<boolean> {
  if (webSpeechAvailable()) return Promise.resolve(true);
  if (!nativeSpeechBridgeAvailable()) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      resolve(available);
    };
    const onMessage = (event: MessageEvent) => {
      const data = parseMessageData(event.data);
      if (data?.type !== 'speechAvailability') return;
      finish(data.available === true);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    window.addEventListener('message', onMessage);
    postSpeechCommand({ type: 'speechProbe' });
  });
}

export function startWebRecognition(lang: string): {
  stop: () => string;
  abort: () => void;
} {
  const host = hostWindow();
  const Ctor = host.SpeechRecognition || host.webkitSpeechRecognition;
  if (!Ctor) throw new Error('Speech recognition is not available on this device.');
  const rec = new Ctor();
  rec.lang = lang || 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  let said = '';
  rec.onresult = (event) => {
    const parts: string[] = [];
    const results = event.results;
    if (!results) return;
    for (let i = 0; i < results.length; i++) {
      const transcript = results[i]?.[0]?.transcript;
      if (transcript) parts.push(transcript);
    }
    if (parts.length) said = parts.join(' ').trim();
  };
  rec.onerror = (event) => {
    if (event?.error && event.error !== 'aborted' && event.error !== 'no-speech') {
      console.warn('anx.chat.dictation web speech error', event.error);
    }
  };
  rec.start();
  return {
    stop: () => {
      try {
        rec.stop();
      } catch (error) {
        console.warn('anx.chat.dictation web speech stop failed', error);
      }
      return said;
    },
    abort: () => {
      try {
        rec.abort();
      } catch {
        /* already stopped */
      }
    },
  };
}

export function startNativeRecognition(requestId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error: Error | null, text: string) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(text);
    };
    const onMessage = (event: MessageEvent) => {
      const data = parseMessageData(event.data);
      if (!data || data.type !== 'speechResult' || data.requestId !== requestId) return;
      if (typeof data.error === 'string' && data.error) {
        finish(new Error(data.error), '');
        return;
      }
      finish(null, typeof data.text === 'string' ? data.text : '');
    };
    const timer = setTimeout(() => finish(new Error('Speech recognition timed out.'), ''), 20000);
    window.addEventListener('message', onMessage);
    postSpeechCommand({ type: 'speechStart', requestId });
  });
}

export function stopNativeRecognition(requestId: string): void {
  postSpeechCommand({ type: 'speechStop', requestId });
}

export function cancelNativeRecognition(requestId: string): void {
  postSpeechCommand({ type: 'speechCancel', requestId });
}
