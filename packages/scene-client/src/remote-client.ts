import { createLocalPrediction } from './prediction.js'
import {
  DEFAULT_GIVE_UP_MS,
  isMovingParticipant,
  loadPoses,
  mergePoses,
  nextConnection,
  normalizeRoomKey,
  presenceVisual,
  rememberEntities,
  rememberPose,
  stampPresenceOpacity,
} from './presence.js'
import type { SceneClient, SceneEntity, SceneIntent, SceneKind, SceneSnapshot, SceneSocket } from './types.js'

export type RemoteSceneClientOptions = {
  roomId: string
  socket: SceneSocket
  joinTicket?: string
  fetchJoinTicket?: () => Promise<string | { token?: string; joinTicket?: string }>
  kind?: SceneKind
  prediction?: boolean
  giveUpMs?: number
}

export function createRemoteSceneClient(options: RemoteSceneClientOptions): SceneClient {
  const roomId = options.roomId
  const socket = options.socket
  if (!roomId || !socket || typeof socket.emit !== 'function') {
    throw new Error('createRemoteSceneClient requires roomId and socket')
  }

  const listeners: Record<string, Set<(payload: unknown) => void>> = {
    snapshot: new Set(),
    delta: new Set(),
    marker: new Set(),
    status: new Set(),
    joints: new Set(),
    controlSession: new Set(),
    cameraPermission: new Set(),
    ping: new Set(),
  }
  const roomKey = normalizeRoomKey(roomId)
  const giveUpMs = Number.isFinite(options.giveUpMs) ? options.giveUpMs! : DEFAULT_GIVE_UP_MS

  let connection: 'live' | 'reconnecting' | 'lost' = 'live'
  let downSince: number | null = null
  let giveUpTimer: ReturnType<typeof setTimeout> | null = null

  let lastSnap: SceneSnapshot = {
    version: 1,
    mode: 'server',
    roomId,
    seq: 0,
    entities: [],
    tMs: Date.now(),
  }
  let joined = false
  let disposed = false
  const prediction = createLocalPrediction(!!options.prediction)
  const latestJoints = new Map<string, Record<string, number>>()

  function emitLocal(kind: string, payload: unknown) {
    listeners[kind]?.forEach((fn) => {
      try {
        fn(payload)
      } catch (err) {
        console.warn('[scene-client:remote]', kind, err)
      }
    })
  }

  function withPresence(snap: SceneSnapshot | null): SceneSnapshot {
    if (!snap) return lastSnap
    const ents = stampPresenceOpacity(snap.entities || [], connection)
    const visual = presenceVisual(connection)
    return {
      ...snap,
      entities: ents,
      presence: {
        connection,
        ...visual,
        viewportHookRequired: true,
      },
    }
  }

  function publishConnectionStatus() {
    const visual = presenceVisual(connection)
    emitLocal('status', {
      joined,
      transport: 'remote',
      connection,
      ...visual,
      roomId,
      viewportHookRequired: true,
      presenceEntityIds: (lastSnap.entities || []).filter(isMovingParticipant).map((e) => e.id),
    })
    if (joined && !disposed) {
      emitLocal('snapshot', withPresence(lastSnap))
    }
  }

  function clearGiveUpTimer() {
    if (giveUpTimer != null) {
      clearTimeout(giveUpTimer)
      giveUpTimer = null
    }
  }

  function applySocketDown(down: boolean) {
    if (disposed) return
    const now = Date.now()
    if (down) {
      if (downSince == null) downSince = now
      const sinceMs = now - downSince
      const next = nextConnection(connection, { socketDown: true, sinceMs, now, giveUpMs })
      if (next !== connection) {
        connection = next
        publishConnectionStatus()
      }
      clearGiveUpTimer()
      if (connection === 'reconnecting') {
        const remain = Math.max(0, giveUpMs - sinceMs)
        giveUpTimer = setTimeout(() => {
          giveUpTimer = null
          if (disposed || downSince == null) return
          applySocketDown(true)
        }, remain + 1)
      }
    } else {
      clearGiveUpTimer()
      downSince = null
      if (connection !== 'live') {
        connection = 'live'
        publishConnectionStatus()
      } else {
        connection = 'live'
      }
    }
  }

  function mergeAndStoreSnap(snap: SceneSnapshot): SceneSnapshot {
    if (!snap) return snap
    const cached = loadPoses(roomKey)
    const mergedEntities = mergePoses(snap.entities || [], cached) as SceneEntity[]
    const next = { ...snap, entities: mergedEntities }
    rememberEntities(roomKey, mergedEntities)
    return next
  }

  const onSnapshot = (snap: unknown) => {
    if (!snap || disposed) return
    lastSnap = mergeAndStoreSnap(snap as SceneSnapshot)
    joined = true
    const local = (lastSnap.entities || []).find((e) => e.id === 'local-player')
    if (local?.pose) prediction.reconcile(local.pose)
    emitLocal('snapshot', withPresence(lastSnap))
  }

  const onDelta = (delta: unknown) => {
    if (!delta || disposed) return
    const d = delta as {
      entity?: SceneEntity
      entityId?: string
      op?: string
      seq?: number
      tMs?: number
    }
    if (d.entity && d.entityId) {
      const ents = Array.isArray(lastSnap.entities) ? [...lastSnap.entities] : []
      const idx = ents.findIndex((e) => e.id === d.entityId)
      if (d.op === 'remove') {
        if (idx >= 0) ents.splice(idx, 1)
      } else if (idx >= 0) ents[idx] = d.entity
      else ents.push(d.entity)
      lastSnap = {
        ...lastSnap,
        seq: d.seq || lastSnap.seq,
        entities: ents,
        tMs: d.tMs || Date.now(),
      }
      if (isMovingParticipant(d.entity)) rememberPose(roomKey, { entityId: d.entity.id, ...d.entity.pose })
    }
    const stampedEntity =
      d.entity && isMovingParticipant(d.entity)
        ? stampPresenceOpacity([d.entity], connection)[0]
        : d.entity
    emitLocal('delta', stampedEntity ? { ...d, entity: stampedEntity } : d)
  }

  const onJoints = (frame: unknown) => {
    const f = frame as { assetId?: string; joints?: Record<string, number> }
    if (!f || disposed || !f.assetId) return
    latestJoints.set(f.assetId, { ...(f.joints || {}) })
    emitLocal('joints', frame)
  }

  const onControlSession = (payload: unknown) => {
    if (disposed) return
    emitLocal('controlSession', payload)
  }

  const onCameraPermission = (payload: unknown) => {
    if (disposed) return
    emitLocal('cameraPermission', payload)
  }

  const onDisconnect = () => applySocketDown(true)
  const onConnect = () => applySocketDown(false)

  let pingTimer: ReturnType<typeof setInterval> | null = null
  const onPong = (msg: unknown) => {
    const m = msg as { t?: number }
    if (disposed || !m || !Number.isFinite(Number(m.t))) return
    emitLocal('ping', { rttMs: Math.max(0, Date.now() - Number(m.t)) })
  }

  function stopPing() {
    if (pingTimer != null) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  function startPing() {
    if (pingTimer != null || disposed) return
    const send = () => {
      if (disposed || !joined || connection !== 'live') return
      socket.emit('scene:ping', { roomId, t: Date.now() })
    }
    send()
    pingTimer = setInterval(send, 2000)
  }

  socket.on('scene:snapshot', onSnapshot)
  socket.on('scene:delta', onDelta)
  socket.on('scene:joints', onJoints)
  socket.on('scene:control-session', onControlSession)
  socket.on('scene:camera-permission', onCameraPermission)
  socket.on('scene:pong', onPong)
  socket.on('disconnect', onDisconnect)
  socket.on('connect', onConnect)

  return {
    transport: 'remote',

    async join(seedEntities: SceneEntity[] = []) {
      if (disposed) throw new Error('scene client disposed')
      let joinTicket = options.joinTicket || null
      if (!joinTicket && typeof options.fetchJoinTicket === 'function') {
        const issued = await options.fetchJoinTicket()
        if (typeof issued === 'string') joinTicket = issued
        else joinTicket = (issued && (issued.token || issued.joinTicket)) || null
      }
      if (!joinTicket) throw new Error('join_ticket_required')
      const kind = options.kind || 'user'
      const cached = loadPoses(roomKey)
      const seeded = mergePoses(seedEntities || [], cached) as SceneEntity[]

      return new Promise<SceneSnapshot>((resolve, reject) => {
        socket.emit(
          'scene:join',
          { roomId, seedEntities: seeded, joinTicket, kind },
          (ack: unknown) => {
            const a = ack as { ok?: boolean; reason?: string; snapshot?: SceneSnapshot }
            if (a && a.ok === false) {
              reject(new Error(a.reason || 'scene_join_failed'))
              return
            }
            const raw = (a && a.snapshot) || lastSnap
            lastSnap = mergeAndStoreSnap(raw)
            joined = true
            applySocketDown(socket.connected === false)
            const snap = withPresence(lastSnap)
            emitLocal('status', {
              joined: true,
              transport: 'remote',
              connection,
              ...presenceVisual(connection),
              viewportHookRequired: true,
              presenceEntityIds: (lastSnap.entities || [])
                .filter(isMovingParticipant)
                .map((e) => e.id),
            })
            emitLocal('snapshot', snap)
            startPing()
            resolve(snap)
          },
        )
      })
    },

    registerJointSource(source: { assetId: string; metricsWsUrl: string; hz?: number }) {
      if (!joined || disposed || !source?.assetId || !source.metricsWsUrl) {
        return { ok: false, reason: 'not_ready' }
      }
      socket.emit('scene:joint-source', {
        roomId,
        assetId: source.assetId,
        metricsWsUrl: source.metricsWsUrl,
        hz: source.hz,
      })
      return { ok: true }
    },

    setControlSession(payload: Record<string, unknown>) {
      if (!joined || disposed) return { ok: false, reason: 'not_joined' }
      socket.emit('scene:control-session', { roomId, ...payload })
      return { ok: true }
    },

    setCameraGrant(payload: { assetId: string; viewerId: string; grant: boolean }) {
      if (!joined || disposed) return { ok: false, reason: 'not_joined' }
      socket.emit('scene:camera-grant', {
        roomId,
        assetId: payload.assetId,
        viewerId: payload.viewerId,
        grant: !!payload.grant,
      })
      return { ok: true }
    },

    getLatestJoints(assetId: string) {
      return latestJoints.get(assetId) || null
    },

    sendIntent(intent: SceneIntent) {
      if (!joined || disposed || !intent?.op) {
        return { ok: false, reason: 'not_joined' }
      }
      if (intent.entityId === 'local-player' && (intent.op === 'move' || intent.x != null)) {
        const pose = {
          x: intent.x,
          y: intent.y,
          z: intent.z,
          yaw: intent.yaw,
          ...(intent.pose || {}),
        }
        prediction.setPose(pose)
        rememberPose(roomKey, { entityId: 'local-player', ...pose })
      } else if (
        intent.entityId &&
        (intent.op === 'move' || intent.op === 'rotate') &&
        (intent.kind === 'avatar' ||
          intent.kind === 'user' ||
          intent.kind === 'agent' ||
          intent.kind === 'asset_agent')
      ) {
        rememberPose(roomKey, {
          entityId: intent.entityId,
          x: intent.x,
          y: intent.y,
          z: intent.z,
          yaw: intent.yaw,
          ...(intent.pose || {}),
        })
      }
      socket.emit('scene:intent', { roomId, intent })
      return { ok: true, predicted: prediction.enabled }
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
      return withPresence(lastSnap)
    },

    dispose() {
      rememberEntities(roomKey, lastSnap.entities || [])
      clearGiveUpTimer()
      stopPing()
      disposed = true
      joined = false
      prediction.clear()
      latestJoints.clear()
      if (typeof socket.off === 'function') {
        socket.off('scene:snapshot', onSnapshot)
        socket.off('scene:delta', onDelta)
        socket.off('scene:joints', onJoints)
        socket.off('scene:control-session', onControlSession)
        socket.off('scene:camera-permission', onCameraPermission)
        socket.off('scene:pong', onPong)
        socket.off('disconnect', onDisconnect)
        socket.off('connect', onConnect)
      }
      Object.values(listeners).forEach((set) => set.clear())
      emitLocal('status', { joined: false, disposed: true, connection })
    },
  }
}
