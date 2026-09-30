/** Client-side room orchestration rule limits (mirrors RoomOrchestrationRulesService.normalizeRules). */
export const MAX_ROOM_ORCHESTRATION_RULES = 20;
export const MAX_ROOM_ORCHESTRATION_RULE_LENGTH = 800;

export function normalizeRoomOrchestrationRules(rules: unknown): string[] {
  const list = Array.isArray(rules) ? rules : [];
  return list.map((rule) => String(rule || '').trim()).filter(Boolean);
}

export function validateRoomOrchestrationRules(
  rules: unknown,
): { ok: true; rules: string[] } | { ok: false; error: string } {
  const normalized = normalizeRoomOrchestrationRules(rules);
  if (normalized.length > MAX_ROOM_ORCHESTRATION_RULES) {
    return { ok: false, error: `Maximum ${MAX_ROOM_ORCHESTRATION_RULES} rules.` };
  }
  for (const rule of normalized) {
    if (rule.length > MAX_ROOM_ORCHESTRATION_RULE_LENGTH) {
      return {
        ok: false,
        error: `Each rule must be at most ${MAX_ROOM_ORCHESTRATION_RULE_LENGTH} characters.`,
      };
    }
  }
  return { ok: true, rules: normalized };
}
