<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCardPage from '$lib/components/AuthCardPage.svelte';
  import PluginSlotOutlet from '$lib/components/PluginSlotOutlet.svelte';
  import type { SiteLocale, SiteSettings } from '$lib/config';
  import type { PublicPluginSlots } from '$lib/public-plugin-slots';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    data,
    form,
  }: {
    data: {
      locale: SiteLocale;
      defaultLocale: SiteLocale;
      siteName: string;
      theme: SiteSettings['theme'];
      customHead: string;
      setupRequired: boolean;
      passwordPolicy: string;
      emailVerificationEnabled: boolean;
      registrationAllowed: boolean;
      registrationUnavailableReason: string;
      publicSlots: PublicPluginSlots;
    };
    form?: {
      ok?: boolean;
      verificationRequired?: boolean;
      registrationBlocked?: boolean;
      message?: string;
      values?: { email?: string; name?: string };
    };
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));
</script>

<AuthCardPage
  locale={data.locale}
  siteName={data.siteName}
  theme={data.theme}
  customHead={data.customHead}
  title={data.setupRequired ? text.auth.setupTitle : text.auth.signupTitle}
  description={data.setupRequired
    ? text.auth.setupDescription
    : text.auth.signupDescription}
  toast={form?.message ? { message: form.message, ok: form.ok } : undefined}
  links={[
    { href: '/login', label: text.common.login, primary: true },
    { href: '/', label: text.common.home },
  ]}
>
  {#if !data.registrationAllowed || form?.registrationBlocked}
    <div class="inline-note">
      {form?.message ?? data.registrationUnavailableReason}
    </div>
  {:else if !form?.verificationRequired}
    <form method="POST" action="?/register" use:enhance>
      <label>
        {text.auth.email}
        <input
          type="email"
          name="email"
          autocomplete="email"
          value={form?.values?.email ?? ''}
          required
        />
      </label>
      <label>
        {text.auth.name}
        <input
          name="name"
          autocomplete="name"
          value={form?.values?.name ?? ''}
          required
        />
      </label>
      <label>
        {text.auth.password}
        <input
          type="password"
          name="password"
          autocomplete="new-password"
          required
        />
        <span>{data.passwordPolicy}</span>
      </label>
      <PluginSlotOutlet
        slots={data.publicSlots}
        slot="signup-extra"
        locale={data.locale}
        fallbackLocale={data.defaultLocale}
      />
      <button type="submit">{text.auth.signupSubmit}</button>
    </form>
  {/if}

  {#if data.registrationAllowed && data.emailVerificationEnabled}
    <p class="hint">{text.auth.verificationHint}</p>
  {/if}
</AuthCardPage>
