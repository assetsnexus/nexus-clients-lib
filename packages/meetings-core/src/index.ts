/**
 * `@nexus/meetings-core` — headless meetings model.
 *
 * One place for the multi-provider meeting catalog, the shared meeting card, the
 * room media session contract, and agent moderation. Framework-free: the React
 * and Vue adapters (and external nexus apps) render these models.
 */

export {
  MEETING_PROVIDERS,
  detectProviderFromUrl,
  isMeetingProviderId,
  normalizeProviderId,
  providerOpens,
  providerSpec,
  type MeetingOpenMode,
  type MeetingProviderId,
  type MeetingProviderSpec,
} from './providers.js';

export {
  buildMeetingCard,
  resolveMeetingProvider,
  resolveOpenTarget,
  type MeetingCardInput,
  type MeetingCardModel,
  type MeetingOpenTarget,
} from './card.js';

export {
  agentParticipantCount,
  applyModeration,
  canDisableListening,
  createEmptyRoomSession,
  removeParticipant,
  upsertParticipant,
  type MeetingParticipant,
  type MediaTransport,
  type ModerationAction,
  type ParticipantKind,
  type RoomMediaSession,
} from './room-session.js';

export { meetingViewTabs, type MeetingViewTab } from './view-tabs.js';

export {
  IMMERSIVE_VR_MODE,
  detectImmersiveVrSupport,
  type ImmersiveVrSupport,
  type XrSystemLike,
} from './xr.js';

export {
  PARTICIPANT_STATUS_COLORS,
  hasSceneAgents,
  isAgentKind,
  meetingSceneOccupants,
  meetingSceneOccupantsFromSession,
  occupantAvatarPresent,
  occupantMood,
  primaryMeetingAgent,
  type MeetingPresence,
  type MeetingPresenceMap,
  type MeetingSceneOccupant,
} from './scene.js';

export {
  EMPTY_VOICE_CAPABILITIES,
  availableVoiceModes,
  preferredVoiceMode,
  resolvePipelineEngines,
  shouldFallbackToPipeline,
  voiceModeUnavailableReason,
  type MeetingVoiceCapabilities,
  type MeetingVoiceMode,
  type VoiceEngine,
  type VoiceEngineKind,
  type VoiceEngineLocation,
  type VoiceEngineProtocol,
} from './voice.js';

export {
  VOICE_ENGINE_PROTOCOL_DEFAULTS,
  VOICE_ENGINE_PROTOCOL_LABELS,
  VOICE_ENGINE_PROTOCOLS,
  endpointTlsWarning,
  normalizeBaseUrl,
  resolveVoiceEngineEndpoint,
  validateBaseUrl,
  voiceEngineFromEndpoint,
  type VoiceEngineEndpoint,
  type VoiceEngineEndpointInput,
} from './voice-engine.js';

export {
  EMPTY_MEETING_VOICE_SURFACE,
  createMeetingVoiceSession,
  type MeetingVoiceSession,
  type MeetingVoiceSessionDeps,
  type MeetingVoiceStatus,
  type MeetingVoiceSurface,
  type PipelineSessionHandle,
  type RealtimeSessionHandle,
} from './voice-session.js';
