export function createLocalPrediction(enabled = false) {
  let predicted: Record<string, unknown> | null = null
  return {
    enabled: !!enabled,
    setPose(pose: Record<string, unknown> | null) {
      if (!this.enabled) return
      predicted = pose ? { ...pose } : null
    },
    getPose() {
      return predicted
    },
    reconcile(serverPose: Record<string, unknown> | null | undefined) {
      if (!this.enabled) return serverPose || null
      predicted = serverPose ? { ...serverPose } : null
      return predicted
    },
    clear() {
      predicted = null
    },
  }
}
