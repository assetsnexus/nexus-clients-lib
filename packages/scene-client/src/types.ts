export type SceneKind = 'user' | 'agent' | 'asset_agent'

export type SceneEntity = {
  id: string
  kind?: string
  pose?: {
    x?: number
    y?: number
    z?: number
    yaw?: number
    [k: string]: unknown
  }
  presenceOpacity?: number
  [k: string]: unknown
}

export type SceneSnapshot = {
  version?: number
  mode?: string
  roomId?: string
  seq?: number
  entities: SceneEntity[]
  tMs?: number
  presence?: Record<string, unknown>
  [k: string]: unknown
}

export type SceneIntent = {
  op: string
  entityId?: string
  kind?: string
  x?: number
  y?: number
  z?: number
  yaw?: number
  pose?: Record<string, unknown>
  entity?: SceneEntity
  ghost?: unknown
  connection?: unknown
  movementPrefs?: Record<string, unknown>
  [k: string]: unknown
}

export type SceneSocket = {
  emit: (event: string, payload?: unknown, ack?: (res: unknown) => void) => void
  on: (event: string, handler: (...args: unknown[]) => void) => void
  off?: (event: string, handler: (...args: unknown[]) => void) => void
  connected?: boolean
}

export type SceneClientEvent =
  | 'snapshot'
  | 'delta'
  | 'joints'
  | 'status'
  | 'controlSession'
  | 'cameraPermission'
  | 'marker'
  | 'ping'

export type SceneClient = {
  transport: 'remote' | 'local-fallback'
  join(seedEntities?: SceneEntity[]): Promise<SceneSnapshot>
  sendIntent(intent: SceneIntent): unknown
  on(event: SceneClientEvent | string, handler: (payload: unknown) => void): (() => void) | void
  off(event: SceneClientEvent | string, handler: (payload: unknown) => void): void
  getSnapshot(): SceneSnapshot
  dispose(): void
  registerJointSource?(opts: {
    assetId: string
    metricsWsUrl: string
    hz?: number
  }): unknown
  getLatestJoints?(assetId: string): Record<string, number> | null
  setControlSession?(payload: Record<string, unknown>): unknown
  setCameraGrant?(payload: {
    assetId: string
    viewerId: string
    grant: boolean
  }): unknown
}

export type JoinTicketResponse = {
  token: string
  expiresAt: string
  jti: string
  roomId: string
  kind: SceneKind
}
