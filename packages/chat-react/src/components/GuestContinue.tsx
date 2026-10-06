import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { GuestContinuePresentation } from '@nexus/chat-core';

export type GuestContinueProps = {
  presentation: GuestContinuePresentation;
};

/** Browser link or kiosk QR. Both use the login-and-continue URL from chat-core. */
export function GuestContinue({ presentation }: GuestContinueProps) {
  const [dataUrl, setDataUrl] = useState('');
  const url = presentation.kind === 'qr' ? presentation.url : '';
  useEffect(() => {
    let cancelled = false;
    setDataUrl('');
    if (!url) return undefined;
    QRCode.toDataURL(url, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then((next) => {
        if (!cancelled) setDataUrl(next);
      })
      .catch((err: unknown) => {
        console.warn('[GuestContinue] QR code failed', err instanceof Error ? err.message : err);
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (presentation.kind === 'none') return null;
  if (presentation.kind === 'link') {
    return <a href={presentation.url}>Log in to continue this chat</a>;
  }
  return (
    <div>
      {dataUrl ? (
        <img src={dataUrl} width={240} height={240} alt="QR code that opens the login page so this chat can continue" />
      ) : (
        <p>Preparing the login code…</p>
      )}
      <p>Scan to log in and continue this chat</p>
    </div>
  );
}
