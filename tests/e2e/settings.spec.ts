import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../../apps/server/src/app';

test('starts empty and saves the selected Bot model after automatically loading the account list', async ({
  page,
}, testInfo) => {
  const directory = mkdtempSync(join(tmpdir(), 'openbot-settings-browser-'));
  const token = randomUUID();
  const instance = await createApp({
    databasePath: join(directory, 'db.sqlite'),
    token,
    clientOrigin: 'http://127.0.0.1:1421',
  });
  await instance.app.listen({ host: '127.0.0.1', port: 0 });
  const url = `http://127.0.0.1:${(instance.app.server.address() as { port: number }).port}`;
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const listRequests: Record<string, unknown>[] = [];
  try {
    await page.addInitScript(
      ({ url, token }) => {
        localStorage.setItem('openbot.server', url);
        sessionStorage.setItem('openbot.token', token);
      },
      { url, token },
    );
    await page.route('**/api/settings/models', async (route) => {
      listRequests.push(route.request().postDataJSON());
      await route.fulfill({
        json: {
          models: [
            { id: 'ui-test-model', name: 'UI test conversation model' },
            { id: 'second-test-model', name: 'Second model' },
          ],
        },
      });
    });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '从一个想法开始', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: '开始协作', exact: true })).toHaveCount(0);
    await expect(page.locator('header.titlebar')).toHaveText('');
    await expect(page.getByRole('button', { name: '聊天', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '数字员工', exact: true })).toHaveCount(0);
    await expect(page.locator('.sidebar-bot-section + .activity-nav')).toContainText('活动记录');
    await page.screenshot({ path: testInfo.outputPath('empty-workspace.png') });

    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByLabel('模型服务', { exact: true }).selectOption('openai');
    await expect(page.locator('#model-base-url')).toHaveValue('https://api.openai.com/v1');
    const key = 'isolated-browser-only-key';
    await page.locator('#model-api-key').fill(key);
    await expect(page.locator('#model-api-key')).toHaveAttribute('type', 'password');
    await expect(page.getByText('已获取 2 个可用模型')).toBeVisible();
    expect(listRequests).toHaveLength(1);
    expect(listRequests[0]).toMatchObject({ provider: 'openai', apiKey: key });
    await page.getByLabel('选择模型', { exact: true }).selectOption('ui-test-model');
    await page.getByLabel('注意力模型', { exact: true }).selectOption('second-test-model');
    await page.getByRole('button', { name: '保存设置', exact: true }).click();
    await expect(page.getByText('已保存，所有 Bot 的后续对话立即生效。')).toBeVisible();
    await expect(page.locator('.model-current')).toContainText('OpenAI / ui-test-model');
    await expect(page.locator('#model-api-key')).toHaveValue('');
    const settings = await page.request.get(url + '/api/settings/model', {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(await settings.json()).toMatchObject({
      provider: 'openai',
      model: 'ui-test-model',
      attentionModel: 'second-test-model',
      hasKey: true,
    });
    expect(await settings.text()).not.toContain(key);
    await page.screenshot({ path: testInfo.outputPath('model-settings.png') });

    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByLabel('选择模型', { exact: true })).toHaveValue('ui-test-model');
    await expect(page.getByLabel('注意力模型', { exact: true })).toHaveValue('second-test-model');
    await expect(page.locator('#model-api-key')).toHaveValue('');
    await expect(page.getByText('已保存在本机', { exact: true })).toBeVisible();
    await expect.poll(() => listRequests.length).toBeGreaterThan(1);
    expect(listRequests.at(-1)).not.toHaveProperty('apiKey');
    expect(
      await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage })),
    ).not.toContain(key);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
    await expect(page.locator('#model-provider')).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await instance.app.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
