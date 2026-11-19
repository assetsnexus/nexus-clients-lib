/** One ISO-timestamped sample. */
export type SeriesPoint = { t: string; v: number }

/** A live-metrics WebSocket frame (edge or registry relay). */
export type MetricsFrame = {
  type?: string
  seq?: number
  ts?: number | string
  tMs?: number
  /** `{ metricKey: [[tsMs, value], ...] }` */
  samples?: Record<string, Array<[number, number]>>
  /** `{ metricKey: value | { value, component } }` */
  metrics?: Record<string, unknown>
  /** `{ jointId: value }` for the read-only joint channel. */
  values?: Record<string, number>
  /** Route disclosure carried on some frames. */
  routes?: RouteCandidate[]
  [key: string]: unknown
}

/** A route the client may open a metrics socket on. */
export type RouteCandidate = {
  id: string
  url?: string
  routeType?: string
  route_type?: string
  kind?: string
  latency?: number
  reachable?: boolean
  role?: string
  isCurrent?: boolean
  qosActive?: boolean
  qosDegraded?: boolean
  packetLoss?: number
  fanUnsupported?: boolean
  [key: string]: unknown
}

/** Camera status from `GET /api/cameras`. */
export type CameraEntry = {
  cameraId: string
  label?: string
  enabled?: boolean
  streamActive?: boolean
  hardwareOnline?: boolean
  sourceType?: string
  resolution?: string | null
  fps?: number | null
  codec?: string | null
  frameSeq?: number
  bandwidthBps?: number | null
  ptz?: { pan?: boolean; tilt?: boolean; zoom?: boolean } | null
  mount?: { panJointId?: string; tiltJointId?: string } | null
  position?: { yawDeg?: number; pitchDeg?: number } | null
  /** QoS priority 0-100 (higher = keep longer under pressure). */
  priority?: number
  [key: string]: unknown
}

/** A sender quality profile for one stream. */
export type QosProfile = {
  type: 'qos.profile'
  streamId: string
  fps: number
  width: number
  height: number
  reason: string
}

/** Arrival-gate decision for one frame on one route. */
export type ArrivalDecision = {
  accepted: boolean
  reason: 'single' | 'first' | 'duplicate' | 'delayed' | 'untimed'
  seq?: number
  lagMs?: number
}
