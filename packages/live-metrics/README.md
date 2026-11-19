# @nexus/live-metrics

Headless Nexus live-metrics + camera-stream client. Framework-free (no Vue/React),
so the portal, desktop app, mobile app and nexus apps share one data layer.

## What it does

- **Multi-route fan-in**: pick the primary route (p2p preferred, then lowest
  latency), open one metrics socket, and discard late/duplicate frames from
  parallel routes (`createArrivalGate`).
- **Buffered metrics store**: frames are buffered and applied at a fixed cadence
  (default 250 ms) so a high-rate stream does not re-render the UI per message
  (`createMetricsStore`).
- **Registry history fallback**: chunked history load for long ranges
  (`client.loadHistory`).
- **Priority-aware QoS**: one 0-100 priority per stream; under pressure the
  lowest-priority stream degrades first, the main camera last (`coordinateQos`).
- **Camera streams**: normalize `GET /api/cameras`, build priority-capped MJPEG
  URLs, start/stop on the edge (`buildMjpegUrl`, `normalizeCameras`).

## Usage

```ts
import { createLiveMetricsClient } from '@nexus/live-metrics'

const client = createLiveMetricsClient({
  fetchRoutes: () => api.get('/api/streams/routes/candidates'),
  openSession: (route) => api.createStreamSession(route),
  openSocket: (route, sessionId) => new WebSocket(metricsWsUrl(route, sessionId)),
  fetchHistory: (opts) => api.getMetricsHistory(opts),
  fetchCameras: (base) => api.get(`${base}/api/cameras`),
  cameraCommand: (base, id, action, body) => api.post(`${base}/api/cameras/${id}/${action}`, body),
})

await client.connect()
client.subscribe((changedKeys) => render(changedKeys))
const url = await client.startCamera('usb0', { fps: 15, maxWidth: 640 })
```

The transports are injectable, so the client is unit-testable without a real
WebSocket (`src/client.test.ts`).

## Modules

| Module | Purpose |
|---|---|
| `arrival-gate` | first-copy-wins fan-in dedupe |
| `series` | series-key parsing + point trimming/merging |
| `metrics-store` | buffered series store + flush/subscribe |
| `qos` | priority-aware degrade/recover |
| `camera-streams` | camera normalization + MJPEG URL + priority cap |
| `route-scoring` | route model/state + primary route selection |
| `client` | ties the above together with injectable transports |
