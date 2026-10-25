import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { allowedModelCLIs, modelCLIAllowed, selectDefaultModelCLI } from './modelCLIPermission';
import { ProjectSettingsForm } from './ProjectSettingsForm';
import type { components } from '../../api/schema';

// 纯权限参数与静态表单呈现，不表示 CLI、模型或服务已经运行。
const settings: components['schemas']['LocalProjectSettingsV1'] = { revision: 2, allow_directory: true, allowed_subdirs: [], expand_references: false, allowed_actions: ['start'], allowed_tools: [], external_model_cli: 'codex', allow_agent_control: true, history_roots: {} };
describe('项目模型 CLI 许可', () => {
  it('旧设置和空列表仅许可默认，显式列表不能绕过缺失默认', () => {
    for (const value of [settings, { ...settings, external_model_clis: [] }]) {
      expect(allowedModelCLIs(value)).toEqual(['codex']);
      expect(modelCLIAllowed(value, 'pi')).toBe(false);
    }
    expect(allowedModelCLIs({ external_model_cli: '', external_model_clis: ['pi'] })).toEqual([]);
    expect(allowedModelCLIs({ external_model_cli: 'codex', external_model_clis: ['pi'] })).toEqual([]);
    expect(allowedModelCLIs({ ...settings, external_model_clis: ['codex', 'pi'] })).toEqual(['codex', 'pi']);
  });

  it('默认变化只保留原许可与明确选择，清空撤销全部', () => {
    const selected = selectDefaultModelCLI(settings, ' pi ');
    expect(selected.external_model_cli).toBe('pi');
    expect(selected.external_model_clis).toEqual(['codex', 'pi']);
    expect(selectDefaultModelCLI(selected, 'codex').external_model_clis).toEqual(['codex', 'pi']);
    expect(selectDefaultModelCLI(selected, '')).toMatchObject({ external_model_cli: '', external_model_clis: [] });
    expect(settings.external_model_clis).toBeUndefined();
  });

  it('没有能力清单时保留全部已许可项，发现的新 CLI 不会自动勾选', () => {
    const project: components['schemas']['LocalProjectV1'] = { id: 'rule-project', name: '规则项目', root: '/rule-project', space_id: 'rule-space', created_at: '2026-10-25T00:00:00Z', settings: { ...settings, external_model_clis: ['codex', 'pi'] } };
    const render = (knownAgents: string[]) => renderToStaticMarkup(createElement(ProjectSettingsForm, { project, disabled: false, onChanged: () => {}, swaOnly: true, knownAgents }));
    expect(render([])).toContain('已保存的许可保留');
    expect(render([])).toMatch(/checked=""\/> pi/);
    expect(render(['claude'])).toMatch(/type="checkbox"[^>]*\/> claude/);
    expect(render(['claude'])).not.toMatch(/checked=""\/> claude/);
    expect(render([])).toContain('加入许可列表');
  });
});
