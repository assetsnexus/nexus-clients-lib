export {
  scoreRoute,
  defaultKindWeight,
  type RouteKind,
} from './route-score.js';
export {
  normalizeCandidate,
  resolveRoutes,
  pickBestRoute,
  mdnsEndpointToLanCandidate,
  mergeLanMdnsCandidates,
  type RouteCandidateInput,
  type ResolvedRoute,
} from './route-resolver.js';
export {
  RouteMonitor,
  pickRedundantRoutes,
  DEFAULT_COMMAND_REDUNDANCY,
  type RouteRole,
  type ProbeResult,
  type RouteProbeFn,
  type RouteMonitorInput,
  type RouteQosSnapshot,
  type CommandRedundancyConfig,
  type RouteMonitorClock,
  type RouteMonitorOptions,
} from './route-monitor.js';
