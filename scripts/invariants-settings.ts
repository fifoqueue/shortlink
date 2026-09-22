import assert from 'node:assert/strict';
import { AppSettingModel, getDatabase } from '$lib/server/database';
import { getSettings, updateSettings } from '$lib/server/settings';
import { applySettingsForm } from '$lib/server/admin-settings';

export async function checkSettings() {
  const original = await getSettings({ mutable: true });
  const database = getDatabase();
  try {
    await Promise.all([
      updateSettings((settings) => {
        settings.theme.mode = 'dark';
      }),
      updateSettings((settings) => {
        settings.links.generatedCodeLength = 12;
      }),
    ]);
    const current = await getSettings();
    assert.equal(current.theme.mode, 'dark');
    assert.equal(current.links.generatedCodeLength, 12);

    const before = await getSettings();
    const hook = 'invariant-settings-failure';
    AppSettingModel.addHook('beforeBulkCreate', hook, (rows) => {
      if (rows.some((row) => row.key.startsWith('plugins:')))
        throw new Error('injected plugin settings failure');
    });
    try {
      await assert.rejects(
        updateSettings((settings) => {
          settings.theme.mode = 'light';
          settings.plugins.builtin.enabled = true;
        }),
        /injected plugin settings failure/,
      );
    } finally {
      AppSettingModel.removeHook('beforeBulkCreate', hook);
    }
    assert.deepEqual(
      await getSettings(),
      before,
      'Site writes roll back with plugin writes.',
    );

    await assert.rejects(
      database.transaction(async (transaction) => {
        await updateSettings((settings) => {
          settings.theme.mode = 'light';
        }, transaction);
        assert.deepEqual(
          await getSettings(),
          before,
          'Uncommitted settings stay invisible.',
        );
        throw new Error('rollback outer transaction');
      }),
      /rollback outer transaction/,
    );
    assert.deepEqual(await getSettings(), before);

    const form = new FormData();
    form.set('preset', 'emerald');
    form.set('mode', 'system');
    await updateSettings((settings) =>
      applySettingsForm('theme', form, settings),
    );
    const updated = await getSettings();
    assert.equal(updated.theme.mode, 'system');
    assert.deepEqual(
      updated.links,
      before.links,
      'Theme saves preserve link settings.',
    );
    assert.deepEqual(
      updated.auth,
      before.auth,
      'Theme saves preserve auth settings.',
    );
    const securityForm = new FormData();
    securityForm.set('passwordMinLength', '16');
    securityForm.set('passwordRequireNumbers', 'on');
    securityForm.set('csrfEnabled', 'on');
    securityForm.set('allowedSchemes', 'https');
    await updateSettings((settings) =>
      applySettingsForm('security', securityForm, settings),
    );
    const secured = await getSettings();
    assert.equal(secured.auth.password.minLength, 16);
    assert.equal(secured.auth.password.requireNumbers, true);
    assert.equal(secured.security.csrf.enabled, true);
    assert.deepEqual(secured.links.allowedSchemes, ['https']);
    assert.deepEqual(secured.theme, updated.theme);
  } finally {
    await updateSettings((settings) => {
      Object.assign(settings, original);
    });
  }
  console.log(
    'Settings: concurrent saves, rollback, committed reads, section isolation passed.',
  );
}
