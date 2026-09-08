## 0.1.0
- Initial headless extraction
## 0.2.0
- C4: SolarTome-grade WebRTC BrowserCallSession (ICE wait, data-channel transcripts, mute/pause without killing tracks, remount reattach, connect timeout, billing-signal end-call).
- APIs: startBrowserCall, createOutboundCall, prepareInboundCall, endCall, signalBillingCredits.
## 0.2.1
- C2: `uploadAttachment` thin consumer of region `upload-init` → `presign.put` → complete-presign; `conversation_attachment` ref = region fileId; `rehydrateTurns` maps `attachments[]`.
- T4.8: paste/drop file collection, 10-file / 100 MiB caps, destination mapping (`chat-attachment` vs `storage-browser`) and `retentionPolicy` on upload-init.
- Chat `uploadAttachment` follows Storage Explorer: `upload-init.presignPut === false` (local FS / creds-fallback) uses `anx.file.upload-complete`; otherwise `presign.put` with `fileId` so free-tier pools resolve correctly.
- Composer attachment rail (0–n cards above the input) with upload progress, cancel/remove, add-more; clipboard/drop files are snapshotted before the destination dialog so paste bytes survive.
