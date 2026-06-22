<script lang="ts">
  import AuthCardPage from '$lib/components/AuthCardPage.svelte';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    data,
  }: {
    data: {
      locale: SiteLocale;
      ok: boolean;
      purpose: 'signup' | 'email-change';
      siteName: string;
      theme: SiteSettings['theme'];
      customHead: string;
      registrationAllowed: boolean;
    };
  } = $props();

  const text = $derived(uiText(data.locale));
  const title = $derived(data.ok ? text.auth.verifyOk : text.auth.verifyFailed);
  const description = $derived(
    data.ok
      ? data.purpose === 'email-change'
        ? text.auth.emailChanged
        : text.auth.accountActivated
      : text.auth.verifyFailedDetail,
  );
  const links = $derived(
    data.ok
      ? [
          { href: '/login', label: text.common.login, primary: true },
          { href: '/', label: text.common.home },
        ]
      : [
          ...(data.registrationAllowed
            ? [
                {
                  href: '/signup',
                  label: text.auth.signupAgain,
                  primary: true,
                },
              ]
            : []),
          { href: '/', label: text.common.home },
        ],
  );
</script>

<AuthCardPage
  locale={data.locale}
  siteName={data.siteName}
  theme={data.theme}
  customHead={data.customHead}
  documentTitle={text.auth.verifyTitle}
  {title}
  {description}
  {links}
/>
