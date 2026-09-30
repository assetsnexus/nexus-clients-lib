export type {
  SceneKind,
  SceneEntity,
  SceneSnapshot,
  SceneIntent,
  SceneSocket,
  SceneClient,
  SceneClientEvent,
  JoinTicketResponse,
} from './types.js'

export { fetchSceneJoinTicket, type FetchSceneJoinTicketOpts } from './join-ticket.js'
export { probeSceneServer, buildSceneStatusUrl, type ProbeSceneServerOpts } from './probe.js'
export { createLocalSceneClient, type LocalSceneClientOptions } from './local-client.js'
export { createRemoteSceneClient, type RemoteSceneClientOptions } from './remote-client.js'
export {
  createSceneClient,
  createSceneClientAsync,
  shouldUseRemoteSceneClient,
  type CreateSceneClientOptions,
} from './factory.js'
export { createLocalPrediction } from './prediction.js'
