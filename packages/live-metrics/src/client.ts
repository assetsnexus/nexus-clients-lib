import { createArrivalGate } from './arrival-gate.js'
import { buildMjpegUrl, normalizeCameras, type MjpegUrlOptions } from './camera-streams.js'
import { createMetricsStore, type MetricsStore } from './metrics-store.js'
import { pickPrimaryRoute } from './route-scoring.js'
import type { CameraEntry, MetricsFrame, RouteCandidate } from './types.js'

/** Minimal socket surface the client needs (injectable for tests). */
export type MetricsSocket = {
  send(data: string): void
  close(): void
  onMessage(handler: (data: string) => void): void
  onOpen(handler: () => void): void
  onClose(handler: () => void): void
}

export type SessionHandle = { sessionId: string; baseUrl: string }

export type HistoryPage = {
  rows: MetricsFrame[]
  nextBefore?: string
  hasMore?: boolean
}

export type LiveMetricsClientOptions = {
  /** Resolve the routes for the asset (region/registry). */
  fetchRoutes: () => Promise<RouteCandidate[]>
  /** Open a metrics WS for a route. */
  openSocket: (route: RouteCandidate, sessionId: string) => MetricsSocket
  /** Issue a stream session token + create a session on the route. */
  openSession: (route: RouteCandidate) => Promise<SessionHandle | null>
  /** Registry history fallback (region `asset_heartbeats`). */
  fetchHistory?: (opts: { from: number; to: number; before?: string }) => Promise<HistoryPage | null>
  /** Camera list from the edge. */
  fetchCameras?: (baseUrl: string) => Promise<CameraEntry[]>
  /** POST the edge camera stream prepare/sleep. */
  cameraCommand?: (baseUrl: string, cameraId: string, action: 'prepare' | 'sleep', body?: unknown) => Promise<boolean>
  flushMs?: number
  maxPoints?: number
  now?: () => number
}

export type LiveMetricsClient = {
  connect(): Promise<void>
  disconnect(): void
  subscribe(listener: (changedKeys: string[]) => void): () => void
  getStore(): MetricsStore
  getRoutes(): RouteCandidate[]
  getPrimaryRoute(): RouteCandidate | null
  setForceParallel(force: boolean): void
  getCameras(): CameraEntry[]
  refreshCameras(): Promise<CameraEntry[]>
  startCamera(cameraId: string, opts?: MjpegUrlOptions): Promise<string | null>
  stopCamera(cameraId: string): Promise<void>
  loadHistory(opts: { from: number; to: number; maxChunks?: number }): Promise<void>
}

const HISTORY_MAX_CHUNKS = 24

/**
 * Framework-free live-metrics + camera-stream client.
 *
 * One primary route socket feeds a buffered metrics store; parallel routes are
 * deduped by the arrival gate (first copy wins, late/duplicate discarded). The
 * camera list and MJPEG URLs come from the same edge base URL.
 */
export function createLiveMetricsClient(options: LiveMetricsClientOptions): LiveMetricsClient {
  const store = createMetricsStore({
    flushMs: options.flushMs,
    maxPoints: options.maxPoints,
    now: options.now,
  })
  const gate = createArrivalGate({ now: options.now })
  let routes: RouteCandidate[] = []
  let primary: RouteCandidate | null = null
  let socket: MetricsSocket | null = null
  let session: SessionHandle | null = null
  let forceParallel = false
  let cameras: CameraEntry[] = []
  let connected = false

  function handleFrame(routeId: string, raw: string): void {
    let frame: MetricsFrame
    try {
      frame = JSON.parse(raw) as MetricsFrame
    } catch {
      return
    }
    if (!frame || typeof frame !== 'object') return
    if (frame.type === 'tunnel' || frame.type === 'ping' || frame.type === 'qos') return
    const decision = gate.consider({
      routeId,
      seq: frame.seq,
      ts: frame.ts != null ? frame.ts : frame.tMs,
      forceParallel,
    })
    if (!decision.accepted) return
    store.ingestFrame(frame)
  }

  async function connect(): Promise<void> {
    if (connected) return
    routes = (await options.fetchRoutes()) || []
    primary = pickPrimaryRoute(routes)
    if (!primary) return
    session = await options.openSession(primary)
    if (!session) return
    socket = options.openSocket(primary, session.sessionId)
    socket.onMessage((data) => handleFrame(primary!.id, data))
    socket.onOpen(() => {
      // Ask for the full metric set; the store filters what it keeps.
      socket?.send(JSON.stringify({ type: 'select', mode: 'all' }))
    })
    store.start()
    connected = true
  }

  function disconnect(): void {
    store.stop()
    if (socket) socket.close()
    socket = null
    session = null
    connected = false
  }

  return {
    connect,
    disconnect,
    subscribe: (listener) => store.subscribe(listener),
    getStore: () => store,
    getRoutes: () => routes,
    getPrimaryRoute: () => primary,
    setForceParallel(force: boolean) {
      forceParallel = !!force
      gate.reset()
    },
    getCameras: () => cameras,
    async refreshCameras() {
      const base = session?.baseUrl || (primary && primary.url) || ''
      if (!base || !options.fetchCameras) return cameras
      cameras = normalizeCameras(await options.fetchCameras(base))
      return cameras
    },
    async startCamera(cameraId: string, opts: MjpegUrlOptions = {}) {
      const base = session?.baseUrl || (primary && primary.url) || ''
      if (!base || !options.cameraCommand) return null
      const cam = cameras.find((c) => c.cameraId === cameraId)
      const ok = await options.cameraCommand(base, cameraId, 'prepare', {
        ttlSec: 300,
        ...(Number(opts.maxWidth) > 0 ? { maxWidth: Number(opts.maxWidth) } : {}),
      })
      if (!ok) return null
      return buildMjpegUrl(base, cameraId, { ...opts, priority: cam?.priority })
    },
    async stopCamera(cameraId: string) {
      const base = session?.baseUrl || (primary && primary.url) || ''
      if (!base || !options.cameraCommand) return
      await options.cameraCommand(base, cameraId, 'sleep', {})
    },
    async loadHistory({ from, to, maxChunks = HISTORY_MAX_CHUNKS }) {
      if (!options.fetchHistory) return
      let before: string | undefined
      for (let i = 0; i < maxChunks; i += 1) {
        const page = await options.fetchHistory({ from, to, before })
        if (!page) break
        for (const row of page.rows || []) store.ingestFrame(row)
        store.flush()
        if (!page.hasMore || !page.nextBefore) break
        before = page.nextBefore
      }
    },
  }
}
