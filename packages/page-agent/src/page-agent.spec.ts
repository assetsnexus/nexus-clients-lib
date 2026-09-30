import { describe, expect, it, beforeEach } from 'vitest';
import { PageAgent } from './page-agent.js';
import { buildTinyPagePointer, buildTinyPagePointerPrompt, capInstructions } from './pointer.js';
import { PagePackRegistry } from './page-pack-registry.js';
import { FormRegistry } from './form-registry.js';
import { GENERIC_PAGE_TOOL_SCHEMAS } from './tool-schemas.js';
import type { PageAgentHost, PagePack } from './types.js';

function makeHost(overrides: Partial<PageAgentHost> = {}): PageAgentHost {
  return {
    getCurrentPath: () => '/b2b/jobs/blueprints/bp1/edit',
    searchPages: () => [{ path: '/b2b/jobs/blueprints/new', title: 'New job blueprint', score: 1 }],
    resolveAccess: (path) => ({ path, allowed: true }),
    navigate: async (path) => ({ ok: true, path }),
    listPageCommands: () => [],
    getRouteParams: () => ({ id: 'bp1' }),
    ...overrides,
  };
}

describe('pointer', () => {
  it('builds tiny pointer with entityRef', () => {
    const p = buildTinyPagePointer({
      path: '/x',
      title: 'Job',
      entityRef: { type: 'job_blueprint', id: '1', name: 'A', saved: true },
    });
    expect(p.understandAvailable).toBe(true);
    expect(p.entityRef?.type).toBe('job_blueprint');
    const prompt = buildTinyPagePointerPrompt(p);
    expect(prompt).toContain('anx.page.understand');
    expect(prompt).toContain('job_blueprint');
    expect(prompt).toContain('ask_user_choice');
  });

  it('sends cluster data questions to region reads', () => {
    const prompt = buildTinyPagePointerPrompt(
      buildTinyPagePointer({
        path: '/clusters/editor/c1',
        title: 'Cluster editor',
        entityRef: { type: 'cluster', id: 'c1', saved: true },
      }),
    );
    expect(prompt).toContain('search_anx_commands');
    expect(prompt).toContain('anx.cluster.get');
    expect(prompt).not.toMatch(/do not use anx_command/i);
    expect(prompt).not.toMatch(/do not use .*search_anx_commands/i);
  });

  it('caps instructions', () => {
    expect(capInstructions('hi', 10)).toBe('hi');
    expect(capInstructions('abcdefghijklmnop', 8)).toContain('truncated');
  });
});

describe('PagePackRegistry', () => {
  it('resolves by prefix and tracks concept usage', () => {
    const reg = new PagePackRegistry();
    const pack: PagePack = {
      match: '/b2b/jobs/blueprints',
      pageId: 'job-blueprint',
      title: 'Job blueprint',
      conceptIds: ['concept.jobs.blueprint'],
      understand: () => ({
        instructions: 'canvas',
        sections: [],
        commands: [],
        conceptIds: ['concept.jobs.blueprint'],
        extraTools: [],
        snapshot: {},
      }),
    };
    reg.register(pack);
    expect(reg.resolve('/b2b/jobs/blueprints/new')?.pageId).toBe('job-blueprint');
    expect(reg.conceptUsage().get('concept.jobs.blueprint')?.[0].pageId).toBe('job-blueprint');
  });
});

describe('FormRegistry', () => {
  it('applies payload and reverts', async () => {
    let state = { name: 'a' };
    const forms = new FormRegistry();
    forms.register({
      commands: ['anx.jobs.blueprint.versioning.update-draft'],
      getState: () => ({ ...state }),
      applyPayload: (p) => {
        state = { ...state, ...p };
      },
    });
    const r = await forms.applyCommand('anx.jobs.blueprint.versioning.update-draft', { name: 'b' });
    expect(r.ok).toBe(true);
    expect(state.name).toBe('b');
    await forms.revertAll();
    expect(state.name).toBe('a');
  });

  it('lists image/pdf/model3d media fields with fileId', () => {
    const forms = new FormRegistry();
    forms.register({
      commands: ['anx.entity.field.set-file'],
      getState: () => ({}),
      applyPayload: () => undefined,
      fields: [
        {
          fieldPath: 'vr_digital_twin.model',
          fieldKind: 'model3d',
          fileId: 'file-abc',
          format: 'urdf',
        },
        { fieldPath: 'name', fieldKind: 'text' },
      ],
    });
    const media = forms.listMediaFields();
    expect(media).toHaveLength(1);
    expect(media[0]?.fileId).toBe('file-abc');
    expect(media[0]?.fieldKind).toBe('model3d');
  });
});

describe('PageAgent', () => {
  let agent: PageAgent;

  beforeEach(() => {
    agent = new PageAgent({ host: makeHost() });
    agent.registerPack({
      match: /\/b2b\/jobs\/blueprints/,
      pageId: 'job-blueprint',
      title: 'Job blueprint editor',
      summary: 'Flow canvas',
      conceptIds: ['concept.jobs.blueprint'],
      entityRef: ({ params }) => ({
        type: 'job_blueprint',
        id: params.id || null,
        name: 'Demo',
        saved: Boolean(params.id),
      }),
      understand: () => ({
        instructions: 'Use canvas steps. Concepts via fetch_skill.',
        sections: [{ id: 'canvas', label: 'Canvas' }],
        commands: [
          {
            command: 'anx.jobs.blueprint.versioning.update-draft',
            uiAction: 'saveDraft',
            apply: 'preview',
          },
        ],
        conceptIds: ['concept.jobs.blueprint'],
        extraTools: [
          {
            name: 'page.jobs.goto_step',
            description: 'Focus a step',
            parameters: { type: 'object', properties: { stepId: { type: 'string' } }, required: ['stepId'] },
          },
        ],
        snapshot: { dirty: false, stepCount: 3 },
      }),
      applyCommand: async (cmd, payload) => ({
        ok: true,
        diff: {
          id: '1',
          kind: 'command',
          command: cmd,
          oldValue: {},
          newValue: payload,
          at: new Date().toISOString(),
        },
      }),
    });
  });

  it('search and resolve', async () => {
    const s = await agent.execute('anx.page.search', { query: 'blueprint' });
    expect(s.ok).toBe(true);
    expect((s.hits as unknown[]).length).toBe(1);
    const r = await agent.execute('anx.page.resolve', { path: '/x' });
    expect(r.ok).toBe(true);
  });

  it('understand returns conceptIds and extraFunctionSchemas', async () => {
    const u = await agent.execute('anx.page.understand', {});
    expect(u.ok).toBe(true);
    expect(u.conceptIds).toEqual(['concept.jobs.blueprint']);
    expect((u.extraFunctionSchemas as { name: string }[]).some((t) => t.name === 'page.jobs.goto_step')).toBe(
      true,
    );
  });

  it('tiny pointer includes entity', () => {
    const p = agent.getTinyPointer();
    expect(p.path).toContain('blueprints');
    expect(p.entityRef?.id).toBe('bp1');
    const prompt = agent.getTinyPointerPrompt();
    expect(prompt).toContain('understand');
    expect(prompt).toContain('search_anx_commands');
    expect(prompt).toContain('anx_command');
    expect(prompt).not.toMatch(/do not use anx_command/i);
    expect(prompt).toContain('ask_user_choice');
    expect(prompt).toContain('Open now');
    expect(prompt).toContain('run automatically');
    expect(prompt).toContain('requiresClientExecution');
  });

  it('omits unsaved entityRef when no form is registered', () => {
    const hostList = {
      getCurrentPath: () => '/sp/asset-integrator/assets/blueprints',
      getRouteParams: () => ({}),
      searchPages: () => [],
      resolveAccess: async () => ({ path: '/', allowed: true }),
      navigate: async (path: string) => ({ ok: true, path }),
      listPageCommands: () => [],
    };
    const listAgent = new PageAgent({ host: hostList as any });
    listAgent.registerPack({
      match: /^\/sp\/asset-integrator\/assets\/blueprints\/?$/,
      pageId: 'asset-blueprint-list',
      title: 'List',
      conceptIds: [],
      entityRef: () => undefined,
      understand: () => ({
        instructions: 'list',
        sections: [],
        commands: [],
        conceptIds: [],
        extraTools: [],
        snapshot: {},
      }),
    });
    expect(listAgent.getTinyPointer().entityRef).toBeUndefined();
    expect(listAgent.hasActiveForm()).toBe(false);
  });

  it('navigate with autoNavigate', async () => {
    agent.setAutoNavigate(true);
    const n = await agent.execute('anx.page.navigate', { path: '/b2b/jobs/briefings' });
    expect(n.ok).toBe(true);
    expect(n.navigated).toBe(true);
    expect(n.pingAfterArrive).toBe(true);
  });

  it('navigate respects pingAfterArrive false', async () => {
    agent.setAutoNavigate(true);
    const n = await agent.execute('anx.page.navigate', {
      path: '/b2b/jobs/briefings',
      pingAfterArrive: false,
    });
    expect(n.ok).toBe(true);
    expect(n.navigated).toBe(true);
    expect(n.pingAfterArrive).toBe(false);
  });

  it('navigate confirm open enables autoNavigate', async () => {
    const hostConfirm = {
      getCurrentPath: () => '/x',
      getRouteParams: () => ({}),
      searchPages: () => [],
      resolveAccess: async () => ({ path: '/y', allowed: true }),
      navigate: async (path: string) => ({ ok: true, path }),
      listPageCommands: () => [],
      confirmNavigate: async () => 'open' as const,
    };
    const a = new PageAgent({ host: hostConfirm, packs: [] });
    expect(a.getAutoNavigate()).toBe(false);
    const n = await a.execute('anx.page.navigate', { path: '/y' });
    expect(n.navigated).toBe(true);
    expect(a.getAutoNavigate()).toBe(true);
  });
  it('lists generic tour tool schemas', () => {
    const names = GENERIC_PAGE_TOOL_SCHEMAS.map((s) => s.name);
    for (const n of [
      'anx.page.search',
      'anx.page.resolve',
      'anx.page.navigate',
      'anx.page.understand',
      'anx.page.validate',
      'anx.page.outline',
      'anx.page.highlight',
      'anx.page.forms.describe',
      'anx.page.forms.read_current_values',
      'anx.page.forms.update_field',
      'anx.page.forms.revert_all',
      'anx.page.model3d.read',
      'anx.page.model3d.apply',
    ]) {
      expect(names).toContain(n);
    }
  });

  it('ask mode does not block understand', async () => {
    expect(agent.canExecute('anx.page.understand')).toBe(true);
    expect(agent.canExecute('anx.page.validate')).toBe(true);
  });
});
