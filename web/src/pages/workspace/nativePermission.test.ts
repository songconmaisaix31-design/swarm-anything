import { describe, expect, it } from 'vitest';
import type { components } from '../../api/schema';
import { nativeActionAllowed } from './nativePermission';

const settings: components['schemas']['LocalProjectSettingsV1'] = { revision: 1, allow_directory: false, allowed_subdirs: [], expand_references: false, allowed_actions: ['start', 'resume', 'send', 'stop', 'observe'], allowed_tools: [], external_model_cli: 'codex', allow_agent_control: false, history_roots: {} };
const unknown = { status: 'unknown' as const, reason: 'not_observed', checked_at: null };
const agent: components['schemas']['LocalAgentV1'] = { id: 'codex', display_name: 'Codex', version: null, installed: { status: 'unknown', reason: 'not_observed', checked_at: null }, configured: { status: 'unknown', reason: 'not_observed', checked_at: null }, startable: { status: 'unknown', reason: 'not_observed', checked_at: null }, native_adapter_registered: true, capabilities: { discover: unknown, read_context: unknown, start: unknown, resume: unknown, send: unknown, stop: unknown, observe: unknown, reconcile: unknown } };

describe('human native permissions', () => {
  it('显式许可的非默认客户端可以按原能力操作，撤销后立即阻止', () => {
    const mixed = { ...settings, external_model_clis: ['codex', 'pi'] };
    const pi = { ...agent, id: 'pi' };
    for (const action of ['start', 'resume', 'send', 'observe'] as const) {
      expect(nativeActionAllowed(mixed, pi, 'pi', action, false)).toBe(true);
      expect(nativeActionAllowed(settings, pi, 'pi', action, false)).toBe(false);
      expect(nativeActionAllowed(mixed, pi, 'pi', action, true)).toBe(false);
    }
  });
  it('permits explicit unknown-operation verification only for the approved registered CLI', () => {
    for (const action of ['start', 'resume', 'send', 'stop', 'observe'] as const) expect(nativeActionAllowed(settings, agent, 'codex', action, false)).toBe(true);
    expect(agent.capabilities.resume.status).toBe('unknown');
    expect(nativeActionAllowed(settings, { ...agent, native_adapter_registered: false }, 'codex', 'resume', false)).toBe(false);
    expect(nativeActionAllowed(settings, agent, 'claude', 'resume', false)).toBe(false);
    expect(nativeActionAllowed({ ...settings, allowed_actions: ['start'] }, agent, 'codex', 'resume', false)).toBe(false);
    expect(nativeActionAllowed({ ...settings, external_model_cli: '' }, agent, 'codex', 'start', false)).toBe(false);
  });
  it('does not turn explicit unsupported into a verification action', () => {
    const unsupported = { ...agent, capabilities: { ...agent.capabilities, stop: { ...unknown, status: 'unsupported' as const } } };
    expect(nativeActionAllowed(settings, unsupported, 'codex', 'stop', false)).toBe(false);
  });
  it('allows approved human stop when capability cache is stale, and denies new work', () => {
    expect(nativeActionAllowed(settings, agent, 'codex', 'stop', true)).toBe(true);
    for (const action of ['start', 'resume', 'send', 'observe'] as const) expect(nativeActionAllowed(settings, agent, 'codex', action, true)).toBe(false);
    expect(nativeActionAllowed(settings, undefined, 'codex', 'stop', true)).toBe(false);
  });
});
