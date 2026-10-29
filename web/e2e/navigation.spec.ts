import { test, expect } from '@playwright/test';
import { realService, importTrackedDocument } from './realService';

for (const [path, title] of [['/', '资料沉淀'], ['/attention', '资料沉淀'], ['/workspace', '共同工作区'], ['/swarm', '蜂群空间']]) {
  test(`实际页面导航 ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('h1')).toHaveText(title);
    if (path === '/attention') {
      await expect(page.getByRole('heading', { name: /^素材/ })).toBeVisible();
      await page.getByRole('tab', { name: '研究机会', exact: true }).click();
      await expect(page.getByRole('heading', { name: /^机会/ })).toBeVisible();
    }
    if (path === '/workspace') {
      await expect(page.getByRole('heading', { name: '项目总览', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '接入项目', exact: true }).click();
      await expect(page.getByRole('heading', { name: '项目接入与设置', exact: true })).toBeVisible();
      await page.getByRole('tab', { name: 'Agent 会话', exact: true }).click();
      await expect(page.getByRole('heading', { name: /^会话/ })).toBeVisible();
    }
    if (path === '/swarm') {
      await expect(page.getByRole('heading', { name: '顶层开发空间', exact: true })).toBeVisible();
      await page.locator('summary').filter({ hasText: /^已有任务记录/ }).click();
      await expect(page.getByRole('heading', { name: /^任务\(/ })).toBeVisible();
      await expect(page.getByRole('heading', { name: /^工作项\(/ })).toBeVisible();
      await page.getByRole('tab', { name: '成果与继承', exact: true }).click();
      await expect(page.getByRole('heading', { name: /^产物引用/ })).toBeVisible();
    }
  });
}

test('侧栏导航在三页之间切换', async ({ page }) => {
  await page.goto('/attention');
  const nav = page.getByRole('navigation', { name: '主导航' });
  for (const [path, title] of [['workspace', '共同工作区'], ['swarm', '蜂群空间'], ['attention', '资料沉淀']]) {
    await nav.getByRole('button', { name: title, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${path}`));
    await expect(page.locator('h1')).toHaveText(title);
  }
});
test('当前导航项目具有 aria-current', async ({ page }) => {
  await page.goto('/workspace');
  await expect(page.locator('button[aria-current="page"]')).toHaveText('共同工作区');
});

for (const path of ['/workspace', '/swarm']) {
  for (const query of ['', '?fixture=1']) {
    test(`${path}${query} 通过既有导入入口读取实际系统能力`, async ({ page }) => {
      const writes: string[] = [];
      page.on('request', request => { if (request.method() !== 'GET' && request.url().includes('/api/v1/')) writes.push(request.url()); });
      await page.goto(`${path}${query}`);
      const add = page.locator('.ac-sidebar').getByRole('button', { name: '添加资料', exact: true });
      await expect(add).toBeEnabled();
      await add.click();
      await expect(page).toHaveURL(/\/attention\?.*import=1/);
      const dialog = page.getByRole('dialog', { name: '添加资料', exact: true });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByLabel('导入方式', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).not.toBeVisible();
      expect(new URL(page.url()).searchParams.has('import')).toBe(false);
      expect(writes).toEqual([]);
    });
  }
}

test('资料沉淀显示实际空集合', async ({ page }) => {
  await page.goto('/attention');
  await expect(page.getByRole('status', { name: '暂无素材', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: '研究机会', exact: true }).click();
  await expect(page.getByRole('status', { name: '暂无机会', exact: true })).toBeVisible();
});
test('共同工作区显示实际空项目、提案和会话', async ({ page }) => {
  await page.goto('/workspace');
  await page.getByRole('button', { name: '接入项目', exact: true }).click();
  await expect(page.getByRole('status', { name: '暂无本地项目' })).toBeVisible();
  await page.getByRole('tab', { name: 'Agent 会话', exact: true }).click();
  await expect(page.getByRole('status', { name: '暂无会话' })).toBeVisible();
  await page.getByRole('tab', { name: '提案与批准', exact: true }).click();
  await expect(page.getByRole('status', { name: '暂无提案' })).toBeVisible();
});
test('新提案入口读取实际集合，刷新权限拒绝后人工读取恢复', async ({ page, context }) => {
  const writes: string[] = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/v1/')) writes.push(request.method());
  });
  const response = page.waitForResponse(value => new URL(value.url()).pathname === '/api/v1/proposals');
  await page.goto('/workspace');
  const initial = await response;
  expect(initial.status()).toBe(200);
  expect((await initial.json()).items).toEqual([]);
  await page.getByRole('tab', { name: '提案与批准', exact: true }).click();
  const proposals = page.locator('section').filter({ has: page.getByRole('heading', { name: /^提案(?:\(|$)/ }) });
  await expect(proposals.getByRole('status', { name: '暂无提案', exact: true })).toBeVisible();
  await context.setExtraHTTPHeaders({ Authorization: 'Bearer invalid' });
  const denied = page.waitForResponse(value => new URL(value.url()).pathname === '/api/v1/proposals');
  await page.getByRole('button', { name: '↻ 刷新', exact: true }).click();
  expect((await denied).status()).toBe(403);
  await expect(proposals.getByRole('alert')).toBeVisible();
  await expect(proposals.getByRole('status', { name: '暂无提案', exact: true })).toHaveCount(0);
  await context.setExtraHTTPHeaders({});
  const recovered = page.waitForResponse(value => new URL(value.url()).pathname === '/api/v1/proposals');
  await proposals.getByRole('button', { name: '重试', exact: true }).click();
  expect((await recovered).status()).toBe(200);
  await expect(proposals.getByRole('status', { name: '暂无提案', exact: true })).toBeVisible();
  expect(writes).toEqual([]);
});
test('蜂群空间显示实际空任务、工作项和产物', async ({ page }) => {
  await page.goto('/swarm');
  await page.locator('summary').filter({ hasText: /^已有任务记录/ }).click();
  await expect(page.getByRole('status', { name: '暂无任务' })).toBeVisible();
  await expect(page.getByRole('status', { name: '暂无工作项' })).toBeVisible();
  await page.getByRole('tab', { name: '成果与继承', exact: true }).click();
  await expect(page.getByRole('status', { name: '暂无产物' })).toBeVisible();
});

for (const query of ['', '?fixture=1']) {
  test(`历史查询参数 ${query || '为空'} 保持实际来源和刷新入口`, async ({ page }) => {
    const response = page.waitForResponse(value => value.url().endsWith('/api/v1/materials'));
    await page.goto(`/attention${query}`);
    expect((await response).status()).toBe(200);
    await expect(page.getByRole('alert').filter({ hasText: '示例数据模式' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '退出示例模式' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '↻ 刷新', exact: true })).toBeVisible();
  });
}
test('品牌入口回到实际资料页并移除历史示例参数', async ({ page }) => {
  await page.goto('/workspace?fixture=1');
  await page.getByRole('button', { name: 'Astrocyte 首页', exact: true }).click();
  await expect(page).toHaveURL(/\/attention$/);
});

for (const path of ['attention', 'workspace', 'swarm']) {
  test(`${path} 完成实际导航和页面加载`, async ({ page }) => {
    await page.goto(`/${path}`);
    await expect(page.locator('h1')).toBeVisible();
    await page.waitForLoadState('networkidle');
  });
}

test.describe('实际资料键盘和焦点管理', () => {
  let owned: Awaited<ReturnType<typeof realService>>;
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    owned = await realService();
    await importTrackedDocument(owned.api);
    await importTrackedDocument(owned.api, 'README.md');
  });
  test.afterAll(async () => { if (owned) await owned.server.close({ preserveData: true }); });
  async function open(page: import('@playwright/test').Page) {
    await page.goto(`${owned.server.webURL}/attention`);
    return page.locator('main [role="button"]').filter({ hasText: 'AGENTS.md' });
  }
  for (const key of ['Enter', 'Space']) {
    test(`${key} 打开实际资料详情`, async ({ page }) => {
      const trigger = await open(page);
      await trigger.focus();
      await page.keyboard.press(key);
      await expect(page.getByRole('dialog')).toBeVisible();
    });
  }
  test('Tab 按键在真实资料列表中移动', async ({ page }) => {
    await open(page);
    const cards = page.locator('main li[role="button"]');
    await expect(cards).toHaveCount(2);
    await cards.first().focus();
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveAttribute('role', 'button');
  });
  test('侧栏可以通过 Tab 进入正文', async ({ page }) => {
    await open(page);
    await page.locator('nav button').first().focus();
    for (let index = 0; index < 5; index++) await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveCount(1);
  });
  test('实际资料详情包含来源和人工批准说明', async ({ page }) => {
    const trigger = await open(page);
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('素材详情');
    await expect(dialog).toContainText('来源定位');
    await expect(dialog.getByText('保存资料后可形成候选，人工准入与任务批准分别确认', { exact: true })).toBeVisible();
    await expect(dialog.getByText('示例数据', { exact: true })).toHaveCount(0);
  });
  test('详情打开时关闭按钮获得焦点', async ({ page }) => {
    await (await open(page)).click();
    await expect(page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true })).toBeFocused();
  });
  test('Escape 关闭资料详情', async ({ page }) => {
    await (await open(page)).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
  test('Tab 和 Shift+Tab 在详情内循环焦点', async ({ page }) => {
    await (await open(page)).click();
    const dialog = page.getByRole('dialog');
    const close = dialog.getByRole('button', { name: '关闭', exact: true });
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    expect(await page.locator(':focus').evaluate(element => !!element.closest('[role="dialog"]'))).toBe(true);
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    for (let index = 0; index < 10; index++) {
      await page.keyboard.press('Tab');
      expect(await page.locator(':focus').evaluate(element => !!element.closest('[role="dialog"]'))).toBe(true);
    }
  });
  test('Escape 关闭后恢复原资料卡片焦点', async ({ page }) => {
    const trigger = await open(page);
    await trigger.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });
  test('详情外部焦点仍可通过 Escape 关闭详情', async ({ page }) => {
    await (await open(page)).click();
    await page.locator('nav button').first().focus();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).not.toBeVisible();
  });
});

test('实际权限拒绝显示首次读取错误且没有过期快照', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Authorization: 'Bearer invalid' });
  await page.goto('/attention');
  const sections = page.locator('section').filter({ has: page.getByRole('heading', { name: /^(素材|机会)/ }) });
  await expect(sections.getByRole('alert').filter({ hasText: '暂未完成' })).toHaveCount(2);
  await expect(page.getByText(/数据可能已过期/)).toHaveCount(0);
});
test('刷新遭实际权限拒绝后保留快照，恢复许可后替换为新集合', async ({ page, context }) => {
  test.setTimeout(120_000);
  const { server, api } = await realService();
  try {
    await importTrackedDocument(api);
    await page.goto(`${server.webURL}/attention`);
    await expect(page.locator('main [role="button"]').filter({ hasText: 'AGENTS.md' })).toBeVisible();
    await context.setExtraHTTPHeaders({ Authorization: 'Bearer invalid' });
    await page.getByRole('button', { name: '↻ 刷新', exact: true }).click();
    const stale = page.getByRole('alert').filter({ hasText: '数据可能已过期' });
    await expect(stale).toBeVisible();
    await expect(page.locator('main [role="button"]').filter({ hasText: 'AGENTS.md' })).toBeVisible();
    await importTrackedDocument(api, 'README.md');
    await context.setExtraHTTPHeaders({});
    await stale.getByRole('button', { name: '重试', exact: true }).click();
    await expect(stale).not.toBeVisible();
    await expect(page.locator('main [role="button"]').filter({ hasText: 'README.md' })).toBeVisible();
    expect((await api.get('/materials')).items).toHaveLength(2);
  } finally { await context.setExtraHTTPHeaders({}); await server.close({ preserveData: true }); }
});
test('实际错误状态提供各自重试入口', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Authorization: 'Bearer invalid' });
  await page.goto('/attention');
  const sections = page.locator('section').filter({ has: page.getByRole('heading', { name: /^(素材|机会)/ }) });
  await expect(sections.getByRole('alert').filter({ hasText: '暂未完成' })).toHaveCount(2);
  await expect(sections.getByRole('button', { name: '重试', exact: true })).toHaveCount(2);
});
test('人工重试发送新的真实 HTTP 请求', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Authorization: 'Bearer invalid' });
  await page.goto('/attention');
  const materials = page.locator('section').filter({ has: page.getByRole('heading', { name: /^素材/ }) });
  await expect(materials.getByRole('alert')).toBeVisible();
  await context.setExtraHTTPHeaders({});
  const response = page.waitForResponse(value => value.url().endsWith('/materials'));
  await materials.getByRole('button', { name: '重试', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(materials.getByRole('status', { name: '暂无素材', exact: true })).toBeVisible();
});
test('实际读取失败时没有样本资料回退', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Authorization: 'Bearer invalid' });
  await page.goto('/attention');
  await expect(page.getByRole('alert').filter({ hasText: '暂未完成' }).first()).toBeVisible();
  await expect(page.getByText('示例论文')).toHaveCount(0);
  await expect(page.getByText('示例机会')).toHaveCount(0);
});
test('实际 Mission 权限拒绝传播到工作项及产物视图', async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ Authorization: 'Bearer invalid' });
  await page.goto('/swarm');
  await page.locator('summary').filter({ hasText: /^已有任务记录/ }).click();
  for (const name of [/^任务\(/, /^工作项\(/]) {
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name }) });
    await expect(section.getByRole('alert').filter({ hasText: '暂未完成' })).toBeVisible();
  }
  await page.getByRole('tab', { name: '成果与继承', exact: true }).click();
  const artifacts = page.locator('section').filter({ has: page.getByRole('heading', { name: /^产物引用/ }) });
  await expect(artifacts.getByRole('alert').filter({ hasText: '暂未完成' })).toBeVisible();
  await expect(page.getByText('示例运行中任务')).toHaveCount(0);
});
