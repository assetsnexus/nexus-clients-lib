/**
 * `@nexus/storage-browser` — headless Nexus storage client + explorer/mount model.
 *
 * Phase 2: explorer data model over `anx.file.*` / `anx.storage.*` with backend
 * capability fallbacks (shared by the desktop UI, the CLI, and Phase 3's mount
 * daemon).
 * Phase 3: the OS-agnostic mount plan + journal model the native daemon consumes.
 */

export {
  StorageCommandError,
  base64ToBytes,
  bytesToBase64,
  createStorageClient,
  envelopeFailed,
  parseFileRecord,
  parseRevisionRow,
  toCollectionItemRef,
  unwrapEnvelope,
  type BackendCapabilities,
  type BucketFilePage,
  type FileRecord,
  type RevisionPage,
  type RevisionRow,
  type StorageCommandSender,
  type StorageClient,
  type StorageContract,
  type StorageWorkspace,
  type UploadInit,
} from './client.js';

export {
  buildMountPlan,
  driverForPlatform,
  isSafeMountRelPath,
  makeJournalEntry,
  orderJournal,
  type JournalEntry,
  type MountBinding,
  type MountDriver,
  type MountMode,
  type MountPlan,
} from './mount-plan.js';

export {
  CONFLICT_POLICIES,
  DEFAULT_EXCLUDES,
  SYNC_MODES,
  addSyncBinding,
  findSyncBinding,
  isExcluded,
  normalizeRemotePath,
  normalizeSyncBinding,
  removeSyncBinding,
  updateSyncBinding,
  validateSyncBindings,
  type BindingIssue,
  type ConflictPolicy,
  type SyncBinding,
  type SyncBindingInput,
  type SyncMode,
} from './sync-model.js';

export {
  decideConflict,
  joinRemotePath,
  reconcile,
  resolveFolderIdByPath,
  sameContent,
  toRemoteEntries,
  type ConflictResolution,
  type FolderRecord,
  type LocalEntry,
  type ReconcileOptions,
  type ReconcileResult,
  type RemoteEntry,
  type SyncAction,
  type SyncActionKind,
} from './sync-engine.js';

export {
  emptySyncState,
  planDeletions,
  pruneSyncState,
  recordSyncState,
  syncedRevisionOf,
  type SyncState,
  type SyncStateEntry,
  type DeletionPlan,
} from './sync-state.js';

export {
  defaultSessionPaths,
  describeCapabilities,
  normalizeMountPath,
  normalizeMountSession,
  sessionDriver,
  validateMountSessions,
  type MountCapabilities,
  type MountSession,
  type MountSessionInput,
  type MountSessionMode,
  type MountSessionState,
} from './mount-session.js';
