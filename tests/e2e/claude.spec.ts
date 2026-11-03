import { test, expect } from '@playwright/test';

test('keeps local execution implementation private and shows connection status', async ({
  page,
}) => {
  await page.goto('/');
  const name = `Local_${Date.now().toString().slice(-7)}`;
  await page.getByRole('button', { name: '创建 Bot', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Bot 名称').fill(name);
  await expect(dialog.getByText(/本地执行能力暂不可用/)).toBeVisible();
  await dialog.getByRole('button', { name: '创建数字员工', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '管理数字员工', exact: true }).first().click();
  const profile = page
    .locator('.bot-profile')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await expect(profile.locator('.provider-tag')).toHaveText('本地能力');
  await profile.getByRole('button', { name: '查看 Agent 状态' }).click();
  await expect(
    dialog.getByRole('heading', { name: `${name} 的 Agent 状态`, exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText(/读取和搜索文件/)).toBeVisible();
  await expect(dialog.getByRole('textbox')).toHaveCount(0);
  await expect(dialog.getByRole('combobox')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: /绑定|切换运行设备/ })).toHaveCount(0);
  await expect(dialog.getByText(/Codex|Claude Code|Claude/)).toHaveCount(0);
});
