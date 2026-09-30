/** Pose cache + disconnect presence visuals (headless port of portal play-presence). */

export const PRESENCE_STORAGE_KEY = 'anx.clusterPlay.presence.v1'
export const SPAWN_POSE = Object.freeze({ x: 0, y: 0, z: 0, yaw: 0 })
export const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000
export const DEFAULT_MAX_POSES = 48
export const DEFAULT_GIVE_UP_MS = 20_000

const MOVING_KINDS = new Set(['avatar', 'user', 'agent', 'asset_agent'])

export function isMovingParticipant(ent: unknown): ent is SceneEntityLike {
  if (!ent || typeof ent !== 'object') return false
  const e = ent as SceneEntityLike
  if (!e.id) return false
  if (e.id === 'local-player') return true
  return MOVING_KINDS.has(String(e.kind || '').toLowerCase())
}

type SceneEntityLike = { id?: string; kind?: string; pose?: Record<string, unknown> }

export function isSpawnPose(pose: unknown): boolean {
  if (!pose || typeof pose !== 'object') return true
  const p = pose as Record<string, unknown>
  const x = Number(p.x)
  const y = Number(p.y)
  const z = Number(p.z)
  const yaw = Number(p.yaw)
  const nx = Number.isFinite(x) ? x : 0
  const ny = Number.isFinite(y) ? y : 0
  const nz = Number.isFinite(z) ? z : 0
  const nyaw = Number.isFinite(yaw) ? yaw : 0
  return nx === SPAWN_POSE.x && ny === SPAWN_POSE.y && nz === SPAWN_POSE.z && nyaw === SPAWN_POSE.yaw
}

export function presenceVisual(connection: 'live' | 'reconnecting' | 'lost'): {
  opacity: number
  symbol: null | 'reconnecting' | 'lost'
} {
  if (connection === 'reconnecting') return { opacity: 0.45, symbol: 'reconnecting' }
  if (connection === 'lost') return { opacity: 0.28, symbol: 'lost' }
  return { opacity: 1, symbol: null }
}

export function nextConnection(
  prev: 'live' | 'reconnecting' | 'lost',
  opts: { socketDown: boolean; sinceMs?: number; now?: number; giveUpMs?: number } = { socketDown: false },
): 'live' | 'reconnecting' | 'lost' {
  const socketDown = !!opts.socketDown
  if (!socketDown) return 'live'
  const giveUpMs = Number.isFinite(opts.giveUpMs) ? opts.giveUpMs! : DEFAULT_GIVE_UP_MS
  const sinceMs = Number.isFinite(opts.sinceMs) ? opts.sinceMs! : 0
  if (sinceMs >= giveUpMs) return 'lost'
  if (prev === 'lost' && sinceMs >= giveUpMs) return 'lost'
  return 'reconnecting'
}

export function normalizeRoomKey(roomKey: unknown): string {
  const s = roomKey == null || roomKey === '' ? 'local' : String(roomKey)
  return s || 'local'
}

type StorageLike = { getItem: (k: string) => string | null; setItem: (k: string, v: string) => void }

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage) return storage
  if (typeof localStorage !== 'undefined') return localStorage
  return null
}

function readAll(storage: StorageLike | null): { rooms: Record<string, unknown> } {
  if (!storage) return { rooms: {} }
  try {
    const raw = JSON.parse(storage.getItem(PRESENCE_STORAGE_KEY) || 'null')
    if (!raw || typeof raw !== 'object') return { rooms: {} }
    const rooms =
      raw.rooms && typeof raw.rooms === 'object'
        ? (raw.rooms as Record<string, unknown>)
        : {}
    return { rooms: { ...rooms } }
  } catch {
    return { rooms: {} }
  }
}

function writeAll(storage: StorageLike | null, data: { rooms: Record<string, unknown> }): void {
  if (!storage) return
  try {
    storage.setItem(PRESENCE_STORAGE_KEY, JSON.stringify(data))
  } catch {
    /* quota */
  }
}

export type CachedPose = {
  entityId: string
  x?: number
  y?: number
  z?: number
  yaw?: number
  updatedAt?: number
}

export function loadPoses(roomKey: string, storage?: StorageLike | null): CachedPose[] {
  const key = normalizeRoomKey(roomKey)
  const store = resolveStorage(storage)
  const all = readAll(store)
  const room = all.rooms[key]
  if (!room || typeof room !== 'object') return []
  const poses = (room as { poses?: CachedPose[] }).poses
  return Array.isArray(poses) ? [...poses] : []
}

export function rememberPose(
  roomKey: string,
  rec: CachedPose,
  opts?: { storage?: StorageLike | null; now?: number },
): void {
  if (!rec?.entityId) return
  const key = normalizeRoomKey(roomKey)
  const store = resolveStorage(opts?.storage)
  const all = readAll(store)
  const roomRaw = all.rooms[key]
  const room =
    roomRaw && typeof roomRaw === 'object'
      ? { ...(roomRaw as object) }
      : { poses: [] as CachedPose[] }
  const poses = Array.isArray((room as { poses?: CachedPose[] }).poses)
    ? [...(room as { poses: CachedPose[] }).poses]
    : []
  const now = opts?.now ?? Date.now()
  const idx = poses.findIndex((p) => p.entityId === rec.entityId)
  const next: CachedPose = { ...rec, updatedAt: now }
  if (idx >= 0) poses[idx] = next
  else poses.push(next)
  const trimmed = poses.slice(-DEFAULT_MAX_POSES)
  all.rooms[key] = { ...room, poses: trimmed }
  writeAll(store, all)
}

export function mergePoses(entities: SceneEntityLike[], cached: CachedPose[]): SceneEntityLike[] {
  const byId = new Map<string, CachedPose>()
  for (const c of cached) {
    if (c?.entityId) byId.set(c.entityId, c)
  }
  return entities.map((ent) => {
    if (!ent?.id) return ent
    const cache = byId.get(ent.id)
    if (!cache) return ent
    const pose = ent.pose || {}
    if (!isSpawnPose(pose)) return ent
    return {
      ...ent,
      pose: {
        ...pose,
        x: cache.x ?? pose.x,
        y: cache.y ?? pose.y,
        z: cache.z ?? pose.z,
        yaw: cache.yaw ?? pose.yaw,
      },
    }
  })
}

export function rememberEntities(
  roomKey: string,
  entities: SceneEntityLike[],
  opts?: { storage?: StorageLike | null },
): void {
  for (const ent of entities) {
    if (!isMovingParticipant(ent)) continue
    const p = ent.pose || {}
    rememberPose(
      roomKey,
      {
        entityId: ent.id!,
        x: p.x as number | undefined,
        y: p.y as number | undefined,
        z: p.z as number | undefined,
        yaw: p.yaw as number | undefined,
      },
      opts,
    )
  }
}

export function stampPresenceOpacity<T extends SceneEntityLike>(
  entities: T[],
  connection: 'live' | 'reconnecting' | 'lost',
): T[] {
  const { opacity } = presenceVisual(connection)
  if (connection === 'live') return entities
  return entities.map((e) => ({
    ...e,
    presenceOpacity: isMovingParticipant(e) ? opacity : (e as { presenceOpacity?: number }).presenceOpacity,
  }))
}
