import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { startS1Server } from '../../tests/s1/server.mjs';
import { humanAPI } from '../../tests/s1/api.mjs';
import type { components } from '../src/api/schema';

type S = components['schemas'];

test('真实服务未配置原生运行时时显示错误并阻止创建和附着', async ({ page }) => {
  const server = await startS1Server({ browser: true, product: 'swa' });
  try {
    const human = await humanAPI(server.apiURL);
    const { space } = await human.write('/project-spaces', { title: 'SWA 浏览器边界核查' }, { status: 201 });
    const { project } = await human.write('/local-projects', { root: fileURLToPath(new URL('../../', import.meta.url)), name: 'SWA 实际公开项目', space_id: space.id });
    const commands: { project: string; action: string }[] = [];
    const apiPaths: string[] = [];
    page.on('request', request => {
      if (new URL(request.url()).pathname.startsWith('/api/')) apiPaths.push(new URL(request.url()).pathname);
      if (request.method() === 'POST' && request.url().includes('/orca/commands')) commands.push({ project: new URL(request.url()).pathname, action: request.postDataJSON().action });
    });
    await page.goto(server.webURL);
    await expect(page).toHaveTitle('SWA · 任务与交付');
    await expect(page.getByRole('navigation', { name: '主导航' }).getByRole('button')).toHaveText(['任务与交付', '项目与权限']);
    await expect(page.getByRole('heading', { name: 'SWA 执行工作台', exact: true })).toBeVisible();
    for (const path of ['/attention', '/cognition/today', '/workspace/works']) {
      await page.goto(`${server.webURL}${path}`);
      await expect(page.getByRole('heading', { name: '此页面不属于 SWA', exact: true })).toBeVisible();
    }
    await page.goto(`${server.webURL}/swarm`);
    // SectionCard 使用语义 section；通过标题定位所属容器，不修改生产可访问性来迁就测试。
    const workspace = page.locator('section').filter({ has: page.getByRole('heading', { name: 'SWA 执行工作台', exact: true }) }).first();
    await workspace.getByLabel('SWA 项目').selectOption(project.id);
    await expect(workspace.getByRole('alert').first()).toContainText('provider_unavailable');
    await expect(workspace.getByRole('button', { name: '连接已有任务', exact: true })).toBeDisabled();
    await expect(workspace.getByRole('button', { name: '提交完整任务', exact: true })).toBeDisabled();
    await expect(workspace.getByRole('button', { name: '重新连接完整任务', exact: true })).toBeDisabled();
    await workspace.getByText('新建 Controller 与固定任务', { exact: true }).click();
    await expect(workspace.getByRole('button', { name: '创建 Controller', exact: true })).toBeDisabled();
    expect(commands).toEqual([{ project: `/api/v1/local-projects/${project.id}/orca/commands`, action: 'status' }]);
    expect(server.query('SELECT COUNT(*) AS count FROM orca_execution_links')[0].count).toBe(0);
    await workspace.getByLabel('CLI 回执中的 Controller').fill('not-started-controller-input');
    await workspace.getByLabel('同一任务的根 Task ID').fill('not-started-task-input');
    const updated = await human.write(`/local-projects/${project.id}/settings`, { expected_revision: project.settings.revision, settings: { ...project.settings, allowed_actions: ['observe'] } }, { method: 'PUT' }) as S['LocalProjectResultV1'];
    const refreshed = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/local-projects/${project.id}/orca/commands`) && response.request().postDataJSON().action === 'status');
    await workspace.getByRole('button', { name: '刷新项目权限快照', exact: true }).click();
    expect((await refreshed).status()).toBe(503);
    await expect(workspace.getByText(new RegExp(`权限版本 ${updated.project.settings.revision}$`))).toBeVisible();
    await expect(workspace.getByLabel('CLI 回执中的 Controller')).toHaveValue('not-started-controller-input');
    await expect(workspace.getByLabel('同一任务的根 Task ID')).toHaveValue('not-started-task-input');
    await expect(workspace.getByRole('button', { name: '连接已有任务', exact: true })).toBeDisabled();
    await expect(workspace.getByRole('button', { name: '提交完整任务', exact: true })).toBeDisabled();
    await expect(workspace.getByRole('button', { name: '重新连接完整任务', exact: true })).toBeDisabled();
    expect(commands.filter(command => command.action === 'status')).toHaveLength(2);
    expect(commands.every(command => ['status', 'role.list', 'conversation.list'].includes(command.action) && command.project === `/api/v1/local-projects/${project.id}/orca/commands`)).toBe(true);
    await workspace.getByText('可复用角色与讨论', { exact: true }).click();
    await expect(workspace.getByRole('button', { name: '新建角色', exact: true })).toBeDisabled();
    await expect(workspace.getByRole('button', { name: '创建讨论', exact: true })).toBeDisabled();
    for (const name of ['创建角色', '保存角色新版本', '归档角色', '保存到讨论']) await expect(workspace.getByRole('button', { name, exact: true })).toHaveCount(0);
    const revoked = await human.write(`/local-projects/${project.id}/settings`, { expected_revision: updated.project.settings.revision, settings: { ...updated.project.settings, allowed_actions: [] } }, { method: 'PUT' }) as S['LocalProjectResultV1'];
    await workspace.getByRole('button', { name: '刷新项目权限快照', exact: true }).click();
    await expect(workspace.getByText(new RegExp(`权限版本 ${revoked.project.settings.revision}$`))).toBeVisible();
    await expect(workspace.getByText('当前项目未允许观察角色与讨论，请刷新项目权限或在项目设置中调整。', { exact: true })).toBeVisible();
    for (const name of ['新建角色', '创建讨论', '创建角色', '保存角色新版本', '归档角色', '保存到讨论']) await expect(workspace.getByRole('button', { name, exact: true })).toHaveCount(0);
    expect(commands.filter(command => command.action === 'status')).toHaveLength(3);
    await page.reload();
    await expect(workspace.getByLabel('SWA 项目')).toHaveValue('');
    expect(commands.filter(command => command.action === 'status')).toHaveLength(3);
    expect(commands.every(command => ['status', 'role.list', 'conversation.list'].includes(command.action))).toBe(true);
    expect(apiPaths.some(path => /^\/api\/v1\/(materials|opportunities|cognition|works|missions|proposals)(\/|$)/.test(path))).toBe(false);
    expect(server.query('SELECT COUNT(*) AS count FROM orca_execution_links')[0].count).toBe(0);
  } finally { await server.close(); }
});

test('项目控制许可保持真实初值，显式撤销和过期版本分别核验', async ({ page }) => {
  const server = await startS1Server({ browser: true, product: 'swa' });
  try {
    const human = await humanAPI(server.apiURL);
    const { space } = await human.write('/project-spaces', { title: 'SWA 当前项目许可核查' }, { status: 201 });
    const { project } = await human.write('/local-projects', { root: fileURLToPath(new URL('../../', import.meta.url)), name: 'SWA 权限往返项目', space_id: space.id }) as S['LocalProjectResultV1'];
    const configured = await human.write(`/local-projects/${project.id}/settings`, { expected_revision: project.settings.revision, settings: { ...project.settings, allowed_actions: ['send'], allow_agent_control: true } }, { method: 'PUT' }) as S['LocalProjectResultV1'];
    await page.goto(`${server.webURL}/workspace?tab=overview`);
    await page.getByRole('button', { name: /SWA 权限往返项目.*查看项目与权限/ }).click();
    await page.getByText('项目小权限与模型处理许可', { exact: true }).click();
    const control = page.getByRole('checkbox', { name: '允许此项目的 Agent 控制操作', exact: true });
    const save = page.getByRole('button', { name: '保存此项目许可', exact: true });
    await expect(control).toBeChecked();
    await page.getByRole('checkbox', { name: '观察与日志', exact: true }).check();
    let response = page.waitForResponse(result => result.request().method() === 'PUT' && result.url().endsWith(`/local-projects/${project.id}/settings`));
    await save.click();
    const retained = await response;
    expect(retained.status()).toBe(200);
    expect(retained.request().postDataJSON()).toMatchObject({ expected_revision: configured.project.settings.revision, settings: { allow_agent_control: true } });
    const retainedProject = (await retained.json() as S['LocalProjectResultV1']).project;
    expect(retainedProject.settings.allowed_actions).toContain('observe');
    await expect(save).toBeEnabled();
    await control.uncheck();
    response = page.waitForResponse(result => result.request().method() === 'PUT' && result.url().endsWith(`/local-projects/${project.id}/settings`));
    await save.click();
    const revoked = await response;
    expect(revoked.status()).toBe(200);
    const revokedProject = (await revoked.json() as S['LocalProjectResultV1']).project;
    expect(revokedProject.settings.allow_agent_control).toBe(false);
    expect(revokedProject.settings.revision).toBe(retainedProject.settings.revision + 1);
    await expect(save).toBeEnabled();
    const newer = await human.write(`/local-projects/${project.id}/settings`, { expected_revision: revokedProject.settings.revision, settings: { ...revokedProject.settings, allow_agent_control: true } }, { method: 'PUT' }) as S['LocalProjectResultV1'];
    response = page.waitForResponse(result => result.request().method() === 'PUT' && result.url().endsWith(`/local-projects/${project.id}/settings`));
    await save.click();
    expect((await response).status()).toBe(409);
    const current = (await human.get('/local-projects') as S['LocalProjectListV1']).items.find(item => item.id === project.id)!;
    expect(current.settings).toEqual(newer.project.settings);
    for (const table of ['local_agent_grants', 'local_agent_sessions', 'orca_execution_links']) expect(server.query(`SELECT COUNT(*) AS count FROM ${table}`)[0].count).toBe(0);
  } finally { await server.close(); }
});
