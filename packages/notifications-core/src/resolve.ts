import { NOTIFICATION_ROUTE_RULES, keyMatches } from './catalog.js';
import {
  collectParamValues,
  dataRecord,
  extractNotificationObject,
  readCategoryKey,
  readEventKey,
  readTags,
  readTypes,
} from './extract.js';
import { alignConsoleRoot, isHttpsUrl, isInternalAppPath, isSafeId } from './safe.js';
import type {
  NotificationLink,
  NotificationResolveStep,
  NotificationRouteExplanation,
  NotificationRouteInput,
  NotificationRouteResource,
  NotificationRouteRule,
  ResolveNotificationOptions,
  ResolvedNotificationTarget,
} from './types.js';

const ACCOUNTING_PROOF_SOURCE = 'accounting.proof_required';

export function noneTarget(): ResolvedNotificationTarget {
  return { kind: 'none', value: '', grade: 'none', missingParams: [] };
}

function rulesOf(opts: ResolveNotificationOptions): readonly NotificationRouteRule[] {
  if (!opts.extraRules?.length) return NOTIFICATION_ROUTE_RULES;
  return [...NOTIFICATION_ROUTE_RULES, ...opts.extraRules];
}

function missingParams(rule: NotificationRouteRule, values: Record<string, string>): string[] {
  if (!rule.params?.length) return [];
  return rule.params.filter((param) => !values[param]);
}

function boundParams(
  rule: NotificationRouteRule,
  values: Record<string, string>,
): Record<string, string> | undefined {
  if (!rule.params?.length) return undefined;
  const out: Record<string, string> = {};
  for (const key of rule.params) {
    const value = values[key];
    if (value) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function fillPath(
  template: string,
  values: Record<string, string>,
  currentPath?: string,
  preserveConsole?: boolean,
): string | null {
  let missing = false;
  const filled = template.replace(/:([A-Za-z0-9_]+)/g, (token, name: string) => {
    const value = values[name];
    if (!value || !isSafeId(value)) {
      missing = true;
      return token;
    }
    return value;
  });
  if (missing) return null;
  const aligned = preserveConsole ? filled : alignConsoleRoot(filled, currentPath);
  if (!isInternalAppPath(aligned)) return null;
  return aligned;
}

function screenParams(
  templates: Record<string, string> | undefined,
  values: Record<string, string>,
): Record<string, string> | undefined {
  if (!templates) return undefined;
  const out: Record<string, string> = {};
  for (const [key, template] of Object.entries(templates)) {
    if (template.startsWith(':')) {
      const value = values[template.slice(1)];
      if (!value || !isSafeId(value)) return undefined;
      out[key] = value;
    } else if (template) {
      out[key] = template;
    }
  }
  return out;
}

function isLegacyAccountingProof(input: NotificationRouteInput, surface: 'portal' | 'app'): boolean {
  const data = dataRecord(input);
  const source = typeof data.source === 'string' ? data.source : '';
  if (source === ACCOUNTING_PROOF_SOURCE) return true;
  if (surface !== 'portal') return false;
  const type = typeof data.type === 'string' ? data.type : '';
  const tid = data.transactionId;
  return type === 'action_inbox' && tid != null && String(tid) !== '' && !source;
}

function eventSignal(
  rule: NotificationRouteRule,
  eventKey: string,
  input: NotificationRouteInput,
  surface: 'portal' | 'app',
): boolean {
  if (keyMatches(rule.match.eventKeys, eventKey)) return true;
  return rule.id === 'accounting-proof' && isLegacyAccountingProof(input, surface);
}

function categorySignal(rule: NotificationRouteRule, categoryKey: string): boolean {
  return keyMatches(rule.match.categoryKeys, categoryKey);
}

function tagsSignal(rule: NotificationRouteRule, tags: readonly string[]): boolean {
  const all = rule.match.tagsAll;
  const any = rule.match.tagsAny;
  if (!all?.length && !any?.length) return false;
  if (all?.length && !all.every((tag) => tags.includes(tag))) return false;
  if (any?.length && !any.some((tag) => tags.includes(tag))) return false;
  return true;
}

function screenAllowed(rule: NotificationRouteRule, opts: ResolveNotificationOptions): boolean {
  if (!rule.app || !('screen' in rule.app)) return false;
  if (!opts.appScreens) return true;
  return opts.appScreens.has(rule.app.screen);
}

function detailTarget(
  rule: NotificationRouteRule,
  values: Record<string, string>,
  opts: ResolveNotificationOptions,
): ResolvedNotificationTarget | null {
  if (!rule.params?.length || missingParams(rule, values).length) return null;
  if (opts.surface === 'app' && screenAllowed(rule, opts)) {
    const params = screenParams(rule.app && 'screen' in rule.app ? rule.app.params : undefined, values);
    if (rule.app && 'screen' in rule.app && rule.app.params && !params) return null;
    return {
      kind: 'screen',
      value: (rule.app as { screen: string }).screen,
      params,
      ruleId: rule.id,
      grade: 'detail',
      missingParams: [],
    };
  }
  const template = rule.portal?.path;
  if (!template) return null;
  const path = fillPath(template, values, opts.currentPath, rule.portal?.preserveConsole);
  if (!path) return null;
  const target: ResolvedNotificationTarget = {
    kind: opts.surface === 'app' ? 'portal-web' : 'path',
    value: path,
    params: boundParams(rule, values),
    ruleId: rule.id,
    grade: 'detail',
    missingParams: [],
  };
  return target;
}

function sectionTarget(
  rule: NotificationRouteRule,
  values: Record<string, string>,
  opts: ResolveNotificationOptions,
): ResolvedNotificationTarget | null {
  const absent = missingParams(rule, values);
  if (opts.surface === 'app' && screenAllowed(rule, opts) && !rule.params?.length) {
    return {
      kind: 'screen',
      value: (rule.app as { screen: string }).screen,
      ruleId: rule.id,
      grade: 'section',
      missingParams: absent,
    };
  }
  const template = rule.portal?.sectionPath;
  if (!template) return null;
  const path = fillPath(template, values, opts.currentPath, rule.portal?.preserveConsole);
  if (!path) return null;
  return {
    kind: opts.surface === 'app' ? 'portal-web' : 'path',
    value: path,
    ruleId: rule.id,
    grade: 'section',
    missingParams: absent,
  };
}

function firstDetail(
  rules: readonly NotificationRouteRule[],
  values: Record<string, string>,
  opts: ResolveNotificationOptions,
  accept: (rule: NotificationRouteRule) => boolean,
): ResolvedNotificationTarget | null {
  for (const rule of rules) {
    if (!accept(rule)) continue;
    const target = detailTarget(rule, values, opts);
    if (target) return target;
  }
  return null;
}

function firstSection(
  rules: readonly NotificationRouteRule[],
  values: Record<string, string>,
  opts: ResolveNotificationOptions,
  accept: (rule: NotificationRouteRule) => boolean,
): ResolvedNotificationTarget | null {
  for (const rule of rules) {
    if (!accept(rule)) continue;
    const target = sectionTarget(rule, values, opts);
    if (target) return target;
  }
  return null;
}

function pathTarget(
  path: string,
  opts: ResolveNotificationOptions,
  ruleId: string,
  grade: 'detail' | 'section',
): ResolvedNotificationTarget {
  const aligned = alignConsoleRoot(path.trim(), opts.currentPath);
  if (opts.surface === 'app') {
    return { kind: 'portal-web', value: aligned, ruleId, grade, missingParams: [] };
  }
  return { kind: 'path', value: aligned, ruleId, grade, missingParams: [] };
}

function ruleForResource(
  rules: readonly NotificationRouteRule[],
  resource: NotificationRouteResource,
): NotificationRouteRule | undefined {
  return rules.find((rule) => rule.match.resource === resource);
}

interface AppliedLink {
  stop: boolean;
  target?: ResolvedNotificationTarget;
  resource?: string;
  objectId?: string;
}

function applyPresentationLink(
  link: NotificationLink,
  rules: readonly NotificationRouteRule[],
  values: Record<string, string>,
  opts: ResolveNotificationOptions,
): AppliedLink {
  if (link.kind === 'url') {
    if (!isHttpsUrl(link.url)) return { stop: false };
    return {
      stop: true,
      target: {
        kind: 'url',
        value: link.url.trim(),
        ruleId: 'presentation.link',
        grade: 'detail',
        missingParams: [],
      },
    };
  }
  if (link.kind === 'path') {
    if (!isInternalAppPath(link.path)) return { stop: false };
    return { stop: true, target: pathTarget(link.path, opts, 'presentation.link', 'detail') };
  }
  const resource = link.resource;
  if (link.id != null && link.id !== '' && !isSafeId(link.id)) {
    return { stop: true, target: noneTarget() };
  }
  const rule = ruleForResource(rules, resource);
  const nextValues = { ...values };
  const param = rule?.params?.[0];
  if (link.id && isSafeId(link.id) && param) nextValues[param] = link.id;
  if (rule && link.id && isSafeId(link.id)) {
    const detail = detailTarget(rule, nextValues, opts);
    if (detail) {
      return { stop: true, target: { ...detail, ruleId: rule.id }, resource, objectId: link.id };
    }
  }
  if (rule) {
    const section = sectionTarget(rule, nextValues, opts);
    if (section) {
      return {
        stop: true,
        target: section,
        resource,
        objectId: link.id && isSafeId(link.id) ? link.id : undefined,
      };
    }
  }
  if (link.section && isInternalAppPath(link.section)) {
    return { stop: true, target: pathTarget(link.section, opts, 'presentation.link', 'section'), resource };
  }
  return { stop: false };
}

export interface InternalResolution {
  target: ResolvedNotificationTarget;
  step: NotificationResolveStep;
  eventKey?: string;
  categoryKey?: string;
  resource?: string;
  objectId?: string;
}

export function resolveNotificationTargetInternal(
  input: NotificationRouteInput,
  opts: ResolveNotificationOptions,
): InternalResolution {
  const eventKey = readEventKey(input);
  const categoryKey = readCategoryKey(input);
  const tags = readTags(input);
  const types = readTypes(input);
  const values = collectParamValues(input);
  const extracted = extractNotificationObject(input);
  const resource = extracted?.resource;
  const rules = rulesOf(opts);
  const base = { eventKey: eventKey || undefined, categoryKey: categoryKey || undefined };

  const link = input.presentation?.link;
  if (link) {
    const applied = applyPresentationLink(link, rules, values, opts);
    if (applied.stop && applied.target) {
      return {
        ...base,
        target: applied.target,
        step: applied.target.kind === 'none' ? 'none' : 'presentation.link',
        resource: applied.resource ?? (applied.target.kind === 'none' ? undefined : resource),
        objectId: applied.objectId,
      };
    }
  }

  const deepLink = dataRecord(input).deepLink;
  if (typeof deepLink === 'string' && isInternalAppPath(deepLink)) {
    return { ...base, target: pathTarget(deepLink, opts, 'deepLink', 'detail'), step: 'deepLink' };
  }

  const byEvent = firstDetail(rules, values, opts, (rule) => eventSignal(rule, eventKey, input, opts.surface));
  if (byEvent) {
    return {
      ...base,
      target: byEvent,
      step: 'eventKey',
      resource: resourceOf(rules, byEvent.ruleId),
      objectId: objectIdFor(rules, byEvent.ruleId, values, extracted?.id),
    };
  }

  const byObject = firstDetail(rules, values, opts, (rule) => {
    if (!extracted || rule.match.resource !== extracted.resource) return false;
    const restricts = Boolean(rule.match.eventKeys?.length || rule.match.categoryKeys?.length);
    if (!restricts) return true;
    return eventSignal(rule, eventKey, input, opts.surface) || categorySignal(rule, categoryKey);
  });
  if (byObject) {
    return { ...base, target: byObject, step: 'objectId', resource: extracted?.resource, objectId: extracted?.id };
  }

  const byEventSection = firstSection(rules, values, opts, (rule) => eventSignal(rule, eventKey, input, opts.surface));
  if (byEventSection) {
    return {
      ...base,
      target: byEventSection,
      step: 'eventKeySection',
      resource: resourceOf(rules, byEventSection.ruleId),
      objectId: objectIdFor(rules, byEventSection.ruleId, values, extracted?.id),
    };
  }

  const byCategoryDetail = firstDetail(rules, values, opts, (rule) => categorySignal(rule, categoryKey));
  if (byCategoryDetail) {
    return {
      ...base,
      target: byCategoryDetail,
      step: 'category',
      resource: resourceOf(rules, byCategoryDetail.ruleId),
      objectId: objectIdFor(rules, byCategoryDetail.ruleId, values, extracted?.id),
    };
  }
  const byCategory = firstSection(rules, values, opts, (rule) => categorySignal(rule, categoryKey));
  if (byCategory) {
    return {
      ...base,
      target: byCategory,
      step: 'category',
      resource: resourceOf(rules, byCategory.ruleId),
      objectId: objectIdFor(rules, byCategory.ruleId, values, extracted?.id),
    };
  }

  const byTags = firstSection(rules, values, opts, (rule) => tagsSignal(rule, tags))
    ?? firstDetail(rules, values, opts, (rule) => tagsSignal(rule, tags));
  if (byTags) {
    return { ...base, target: byTags, step: 'tags', resource: resourceOf(rules, byTags.ruleId) ?? resource, objectId: extracted?.id };
  }

  for (const type of types) {
    const byType = firstDetail(rules, values, opts, (rule) => Boolean(type && rule.match.types?.includes(type)))
      ?? firstSection(rules, values, opts, (rule) => Boolean(type && rule.match.types?.includes(type)));
    if (byType) {
      return { ...base, target: byType, step: 'type', resource, objectId: extracted?.id };
    }
  }

  return { ...base, target: noneTarget(), step: 'none', resource, objectId: extracted?.id };
}

function resourceOf(rules: readonly NotificationRouteRule[], ruleId: string | undefined): string | undefined {
  if (!ruleId) return undefined;
  return rules.find((rule) => rule.id === ruleId)?.match.resource;
}

function objectIdFor(
  rules: readonly NotificationRouteRule[],
  ruleId: string | undefined,
  values: Record<string, string>,
  extractedId: string | undefined,
): string | undefined {
  const rule = rules.find((item) => item.id === ruleId);
  const param = rule?.params?.[0];
  if (param && values[param]) return values[param];
  return extractedId;
}

export function resolveNotificationTarget(
  input: NotificationRouteInput,
  opts: ResolveNotificationOptions,
): ResolvedNotificationTarget {
  return resolveNotificationTargetInternal(input, opts).target;
}

export function explainNotification(
  input: NotificationRouteInput,
  opts: ResolveNotificationOptions,
): NotificationRouteExplanation {
  const resolved = resolveNotificationTargetInternal(input, opts);
  return {
    target: resolved.target,
    step: resolved.step,
    eventKey: resolved.eventKey,
    categoryKey: resolved.categoryKey,
    resource: resolved.resource,
    objectId: resolved.objectId,
  };
}
