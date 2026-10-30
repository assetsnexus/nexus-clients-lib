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
## 0.1.4
- Discoverable client-tool index is sent **once per conversation**: `sendMessage` keeps the server-issued `clientToolIndexHash` plus a local registry fingerprint, then sends only the hash on later turns. The server reads the index back from its conversation cache. A registry change, an explicit per-send `clientToolIndex`, or a different conversation re-sends the full index.
- `localClientToolIndexFingerprint` exported for hosts that want to know when their registry changed. The SDK never invents the hash value — it only echoes what the server returned.
## 0.1.5
- Plan-mode `write` client tool now runs its handler after approval: `NexusChat.approveClientTool` / `NexusChat.answerClientToolPause` resolve the paused request, run the registered handler (or the page / `onClientToolRequest` handler) and resume with the handler's **real** result. The approval cards previously posted a synthetic `{ granted: true }` result, so an approved write tool never executed.
- `conceptSlugs` is carried on `ClientToolIndexEntry` / `ChatToolDescriptor`, copied in `register` / `registerDescriptor`, emitted by `indexEntries()`, and folded into the local index fingerprint.
## 0.1.6
- Hydrate striped client-tool args from the persisted pause row: inference's client-facing sanitizer strips `client_tool_request.arguments` to `{}` for any tool name it cannot place in `page.*` or its builtin whitelist, so an approved write handler ran with `{}`. The real args are read back from the persisted `pendingPause.arguments` row before the handler or the approval card sees them.
## 0.1.7
- Shared conversation-label rule: `resolveConversationLabel` (plus `looksLikeInternalId` / `conversationPartnerNameOf` / `UNTITLED_CONVERSATION_LABEL`) resolves a row label as region `displayTitle` → stored `title`/`name` → `agentName` → partner/participant name → a neutral literal. It **never** returns the raw `conversationId`, fixing the bug where a title-less agent thread rendered an internal id (`1792316062792-nm26u6zve`) where a person's name belongs. `historyForContact`, `mapConversationListItem`, and `ConversationRow` / `ConversationHistoryItem` / `ChatSessionSummary` / `PanelState` now declare the optional `displayTitle` / `agentName` fields so consumers can read them without a cast.
- Shared hold-to-talk dictation policy: `decideDictationCapture`, `dictationFailureMessage`, `DictationFailure`, `MIN_CAPTURE_MS`, and the failure-code mappers (`micFailureCode` / `recognitionFailureCode` / `transcriptionFailureCode`) plus the sanitizing `micFailureMessage` / `transcriptionFailureMessage`. One source of truth for the actionable copy across the React composer and the Vue 2 portal overlay, so a raw transcriber/server error string is never shown to the user (the caller logs it).
- Durable metadata-only cache: `ChatCacheAdapter` + `ChatCacheStore` (LRU byte budget, 100 MiB default) cache the conversation list and short turn skeletons (previews only, never full message bodies), so a reload renders the list + thread instantly. Public API: `getCachedConversationList` / `putCachedConversationList` / `getCachedThreadSkeleton` / `putCachedThreadSkeleton` / `chatCacheStats` / `clearChatCache` / `invalidateConversation`, injected via `cacheAdapter` / `cacheScope` / `cacheMaxBytes` on `createNexusChat`.
- Lazy history: an initial open fetches 20 turns, `appendDelta` pages forward via the `after` cursor, `loadOlderHistory` pages up via `oldest`, and `loadNewerHistory` pages down via `newest`; `hasNewer` / `hasOlder` report what remains. `listMessages` gained `before` / `after` pass-through.
- `resolveConversationLabel` is also exposed through `historyForContact`, so a host can label a thread without re-deriving the rule.
- Each `permission_elevation_request` / `needs_approval` frame is surfaced **once** per conversation (`ElevationPromptTracker`), so an already-approved elevation is not re-raised on every reconnect/reload.
- The resume stream token is minted before the socket opens (fixes a race where a reconnect resumed without a valid token).
- `openContact` reuses the latest conversation for a contact instead of always creating one, and resumes an existing thread when `conversations.create` is denied.
- TTS playback routes to the configured output sink; `wake-word` trust metadata was extended (`reportsDetectionsToBackend` / `isActivityTracker` / `transmitsOnlyOnUserSubmit`).
