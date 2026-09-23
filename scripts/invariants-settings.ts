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

    const themeForm = new FormData();
    themeForm.set('preset', 'mono');
    themeForm.set('mode', 'system');
    themeForm.set('background', '#fafafa');
    themeForm.set('dark.background', '#123456');
    themeForm.set('dark.primaryContrast', '#abcdef');
    themeForm.set('radius', '17');
    themeForm.set('fontFamily', 'Georgia, serif');
    await updateSettings((settings) =>
      applySettingsForm('theme', themeForm, settings),
    );
    const themed = await getSettings();
    assert.equal(themed.theme.customTokens.background, '#fafafa');
    assert.equal(themed.theme.darkTokens?.background, '#123456');
    assert.equal(themed.theme.darkTokens?.primaryContrast, '#abcdef');
    assert.equal(themed.theme.customTokens.radius, 17);
    assert.equal(themed.theme.customTokens.fontFamily, 'Georgia, serif');

    // Old forms that only edit light colors must preserve a saved dark palette.
    const legacyThemeForm = new FormData();
    legacyThemeForm.set('preset', 'mono');
    legacyThemeForm.set('mode', 'dark');
    await updateSettings((settings) =>
      applySettingsForm('theme', legacyThemeForm, settings),
    );
    assert.deepEqual(
      (await getSettings()).theme.darkTokens,
      themed.theme.darkTokens,
    );
    await updateSettings((settings) =>
      applySettingsForm('resetTheme', legacyThemeForm, settings),
    );
    const resetTheme = (await getSettings()).theme;
    assert.equal(resetTheme.customTokens.radius, 8);
    assert.equal(resetTheme.darkTokens?.background, '#141414');
  } finally {
    await updateSettings((settings) => {
      Object.assign(settings, original);
    });
  }
  console.log(
    'Settings: concurrent saves, rollback, committed reads, section isolation passed.',
  );
}
