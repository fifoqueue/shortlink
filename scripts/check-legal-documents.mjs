import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { normalizeLegalUrl } from '../src/lib/legal-url.ts';

// Resolve the two runtime aliases used by these loads without starting a server.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '$lib/config' || specifier === '$lib/public-settings') {
      return nextResolve(
        new URL(`../src/lib/${specifier.slice(5)}.ts`, import.meta.url).href,
        context,
      );
    }
    return nextResolve(specifier, context);
  },
});

const { defaultSettings } = await import('../src/lib/config.ts');
const { localizedSettings } = await import('../src/lib/i18n/index.ts');
const { isRedirect } = await import('@sveltejs/kit');

for (const value of [
  undefined,
  null,
  1,
  '',
  ' ',
  '/terms',
  '//example.test',
  'javascript:alert(1)',
  'data:text/html,test',
  'ftp://example.test',
  'https://user:pass@example.test',
  'https://',
]) {
  assert.equal(normalizeLegalUrl(value), '', `Reject unsafe URL: ${value}`);
}
assert.equal(
  normalizeLegalUrl(' https://example.test/terms?q=1#top '),
  'https://example.test/terms?q=1#top',
);
assert.equal(
  normalizeLegalUrl('http://example.test/privacy'),
  'http://example.test/privacy',
);

for (const document of ['terms', 'privacy']) {
  const { load } = await import(`../src/routes/${document}/+page.server.ts`);
  const settings = structuredClone(defaultSettings);
  for (const locale of ['ko', 'en']) {
    const content = settings.i18n.locales[locale].legal;
    const originalContent = content[`${document}Content`];
    const event = () => ({
      locals: { localizedSettings: localizedSettings(settings, locale) },
    });
    assert.equal(
      (await load(event())).settings.legal[`${document}Content`],
      originalContent,
    );
    const external = `https://example.test/${locale}/${document}`;
    content[`${document}Url`] = external;
    await assert.rejects(
      load(event()),
      (error) =>
        isRedirect(error) &&
        error.status === 307 &&
        error.location === external,
    );
    content[`${document}Url`] = '';
    assert.equal(
      (await load(event())).settings.legal[`${document}Content`],
      originalContent,
    );
  }
}
console.log(
  'Legal documents: URL validation, localized redirects, built-in fallback passed.',
);
