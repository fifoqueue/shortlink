<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { enhance } from '$app/forms';
  import AuthCardPage from '$lib/components/AuthCardPage.svelte';
  import type { SiteLocale, SiteSettings } from '$lib/config';
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
      token: string;
      available: boolean;
      unavailableReason: string;
      passwordPolicy: string;
    };
    form?: {
      ok?: boolean;
      message?: string;
    };
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));
</script>

<AuthCardPage
  locale={data.locale}
  siteName={data.siteName}
  theme={data.theme}
  customHead={data.customHead}
  title={text.auth.resetPasswordTitle}
  description={text.auth.resetPasswordDescription}
  toast={form?.message && !form.ok
    ? { message: form.message, ok: form.ok }
    : undefined}
  links={[
    { href: '/login', label: text.common.login, primary: true },
    { href: '/', label: text.common.home },
  ]}
>
  {#if form?.ok}
    <div class="inline-note ok">{form.message}</div>
  {:else if !data.available}
    <div class="inline-note">{data.unavailableReason}</div>
  {:else}
    <form method="POST" action="?/reset" use:enhance>
      <input type="hidden" name="token" value={data.token} />
      <label>
        {text.auth.newPassword}
        <Input
          type="password"
          name="password"
          autocomplete="new-password"
          required
        />
        <span>{data.passwordPolicy}</span>
      </label>
      <Button type="submit">{text.auth.resetPasswordSubmit}</Button>
    </form>
  {/if}
</AuthCardPage>
