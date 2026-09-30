import { createLocalSceneClient, type LocalSceneClientOptions } from './local-client.js'
import { createRemoteSceneClient, type RemoteSceneClientOptions } from './remote-client.js'
import { probeSceneServer } from './probe.js'
import type { SceneClient, SceneSocket } from './types.js'

export type CreateSceneClientOptions = LocalSceneClientOptions &
  Partial<RemoteSceneClientOptions> & {
    remoteFactory?: (opts: CreateSceneClientOptions) => SceneClient
    statusUrl?: string
    fetchFn?: typeof fetch
    headers?: Record<string, string>
  }

export function shouldUseRemoteSceneClient(options: CreateSceneClientOptions = {}): boolean {
  const hasTicket =
    Boolean(options.joinTicket) || typeof options.fetchJoinTicket === 'function'
  return Boolean(options.socket && options.roomId && hasTicket)
}

export function createSceneClient(options: CreateSceneClientOptions = {}): SceneClient {
  if (typeof options.remoteFactory === 'function') {
    try {
      const remote = options.remoteFactory(options)
      if (remote && typeof remote.join === 'function' && typeof remote.sendIntent === 'function') {
        return remote
      }
    } catch (err) {
      console.warn('[scene-client] remoteFactory failed; using local fallback', err)
    }
  }

  if (shouldUseRemoteSceneClient(options)) {
    try {
      return createRemoteSceneClient(options as RemoteSceneClientOptions)
    } catch (err) {
      console.warn('[scene-client] remote socket client failed; local fallback', err)
    }
  }

  return createLocalSceneClient(options)
}

export async function createSceneClientAsync(
  options: CreateSceneClientOptions = {},
): Promise<SceneClient> {
  if (typeof options.remoteFactory === 'function') {
    return createSceneClient(options)
  }
  if (options.statusUrl) {
    const up = await probeSceneServer({
      statusUrl: options.statusUrl,
      fetchFn: options.fetchFn,
      headers: options.headers,
    })
    if (up && shouldUseRemoteSceneClient(options)) {
      try {
        return createRemoteSceneClient(options as RemoteSceneClientOptions)
      } catch (err) {
        console.warn('[scene-client] probe ok but remote failed; local fallback', err)
      }
    }
    if (!up) {
      return createLocalSceneClient(options)
    }
  }
  return createSceneClient(options)
}

export type { SceneSocket }
