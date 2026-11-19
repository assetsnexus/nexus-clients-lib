export type {
  SeriesPoint,
  MetricsFrame,
  RouteCandidate,
  CameraEntry,
  QosProfile,
  ArrivalDecision,
} from './types.js'

export { createArrivalGate, type ArrivalGate, type ArrivalGateInput, type ArrivalGateOptions } from './arrival-gate.js'

export {
  MAX_POINTS_PER_SERIES,
  parseSeriesKey,
  normalizeSeriesKey,
  baseMetricId,
  trimPoints,
  trimPointsSince,
  mergeTrimPoints,
} from './series.js'

export { createMetricsStore, type MetricsStore, type MetricsStoreOptions } from './metrics-store.js'

export {
  QOS_STEPS,
  QOS_DEFAULT_PRIORITY,
  QOS_COORDINATE_COOLDOWN_MS,
  QOS_FPS_LOW_MS,
  QOS_RECOVER_FPS,
  createQosController,
  coordinateQos,
  rttFromPing,
  type QosController,
  type QosControllerOptions,
  type QosSample,
  type QosCoordinateState,
  type QosTier,
} from './qos.js'

export {
  CAMERA_STREAM_PRIORITY,
  normalizeCameras,
  cameraPriority,
  priorityFpsCap,
  buildMjpegUrl,
  sortCamerasByPriority,
  type MjpegUrlOptions,
} from './camera-streams.js'

export {
  DEGRADED_RTT_MS,
  DEGRADED_LOSS_PCT,
  routeModel,
  routeQosState,
  metricsRouteKind,
  bestLatencyByModel,
  pickPrimaryRoute,
  type RouteModel,
  type RouteQosState,
} from './route-scoring.js'

export {
  createLiveMetricsClient,
  type LiveMetricsClient,
  type LiveMetricsClientOptions,
  type MetricsSocket,
  type SessionHandle,
  type HistoryPage,
} from './client.js'
