import { createLocalPrediction } from './prediction.js'
import {
  isMovingParticipant,
  loadPoses,
  mergePoses,
  normalizeRoomKey,
  presenceVisual,
  rememberEntities,
  rememberPose,
  stampPresenceOpacity,
} from './presence.js'
import type { SceneClient, SceneEntity, SceneIntent, SceneSnapshot } from './types.js'

let seqCounter = 0
function nextSeq() {
  seqCounter += 1
  return seqCounter
}

export type LocalSceneClientOptions = {
  roomId?: string
  prediction?: boolean
}

export function createLocalSceneClient(options: LocalSceneClientOptions = {}): SceneClient {
  const listeners: Record<string, Set<(payload: unknown) => void>> = {
    snapshot: new Set(),
    delta: new Set(),
    marker: new Set(),
    status: new Set(),
  }
  const entities = new Map<string, SceneEntity>()
  let joined = false
  let disposed = false
  const prediction = createLocalPrediction(!!options.prediction)
  const roomKey = normalizeRoomKey(options.roomId)

  function emit(kind: string, payload: unknown) {
    listeners[kind]?.forEach((fn) => {
      try {
        fn(payload)
      } catch (err) {
        console.warn('[scene-client]', kind, err)
      }
    })
  }

  function snapshot(): SceneSnapshot {
    const ents = stampPresenceOpacity(Array.from(entities.values()), 'live')
    return {
      version: 1,
      mode: 'local',
      seq: nextSeq(),
      entities: ents,
      tMs: Date.now(),
      presence: { connection: 'live', ...presenceVisual('live'), viewportHookRequired: true },
    }
  }

  return {
    transport: 'local-fallback',

    async join(seedEntities: SceneEntity[] = []) {
      if (disposed) throw new Error('scene client disposed')
      entities.clear()
      const cached = loadPoses(roomKey)
      const merged = mergePoses(seedEntities || [], cached) as SceneEntity[]
      for (const ent of merged) {
        if (ent?.id) entities.set(ent.id, { ...ent })
      }
      joined = true
      emit('status', {
        joined: true,
        transport: 'local-fallback',
        connection: 'live',
        ...presenceVisual('live'),
        viewportHookRequired: true,
      })
      const snap = snapshot()
      emit('snapshot', snap)
      return snap
    },

    sendIntent(intent: SceneIntent) {
      if (!joined || disposed || !intent?.op) {
        return { ok: false, reason: 'not_joined' }
      }
      const seq = nextSeq()
      const op = String(intent.op)
      let entity = intent.entityId ? entities.get(intent.entityId) : undefined

      if (op === 'move' || op === 'rotate' || op === 'set_height') {
        if (!entity && intent.entityId) {
          entity = { id: intent.entityId, kind: intent.kind || 'avatar', pose: {} }
          entities.set(entity.id, entity)
        }
        if (entity) {
          entity.pose = {
            ...(entity.pose || {}),
            ...(intent.pose || {}),
            x: intent.x != null ? intent.x : entity.pose?.x,
            y: intent.y != null ? intent.y : entity.pose?.y,
            z: intent.z != null ? intent.z : entity.pose?.z,
            yaw: intent.yaw != null ? intent.yaw : entity.pose?.yaw,
          }
          if (intent.movementPrefs && typeof intent.movementPrefs === 'object') {
            entity.movementPrefs = { ...(entity.movementPrefs || {}), ...intent.movementPrefs }
          }
          if (intent.entityId === 'local-player') prediction.setPose(entity.pose || {})
          if (isMovingParticipant(entity)) {
            rememberPose(roomKey, { entityId: entity.id, ...entity.pose })
          }
        }
      } else if (op === 'place_ghost') {
        emit('delta', { seq, op, ghost: intent.ghost || null, tMs: Date.now() })
        return { ok: true, seq, predicted: true }
      } else if (op === 'commit_place' || op === 'place') {
        const placed = intent.entity
        if (placed?.id) entities.set(placed.id, { ...placed })
      } else if (op === 'remove' && intent.entityId) {
        entities.delete(intent.entityId)
      } else if (op === 'clone' && intent.entity?.id) {
        entities.set(intent.entity.id, { ...intent.entity })
      } else if (op === 'connect_interfaces') {
        emit('delta', { seq, op, connection: intent.connection || null, tMs: Date.now() })
        return { ok: true, seq }
      }

      const delta = {
        seq,
        op,
        entityId: intent.entityId || intent.entity?.id || null,
        entity: entity ? { ...entity } : intent.entity || null,
        tMs: Date.now(),
      }
      emit('delta', delta)
      return { ok: true, seq, predicted: true }
    },

    on(event: string, handler: (payload: unknown) => void) {
      if (!listeners[event]) listeners[event] = new Set()
      listeners[event].add(handler)
      return () => this.off(event, handler)
    },

    off(event: string, handler: (payload: unknown) => void) {
      listeners[event]?.delete(handler)
    },

    getSnapshot() {
      return snapshot()
    },

    dispose() {
      rememberEntities(roomKey, Array.from(entities.values()))
      disposed = true
      joined = false
      emit('status', { joined: false, disposed: true, connection: 'live' })
      entities.clear()
      prediction.clear()
      Object.values(listeners).forEach((set) => set.clear())
    },
  }
}
