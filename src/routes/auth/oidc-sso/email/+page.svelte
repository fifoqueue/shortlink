<script lang="ts">
  import { enhance } from '$app/forms';
  import AuthCardPage from '$lib/components/AuthCardPage.svelte';
  import type { SiteLocale, SiteSettings } from '$lib/config';

  let {
    data,
    form,
  }: {
    data: {
      locale: SiteLocale;
      siteName: string;
      theme: SiteSettings['theme'];
      customHead: string;
      title: string;
      description: string;
      submitLabel: string;
      verificationNotice: string;
      emailLabel: string;
      loginLabel: string;
    };
    form?: { message?: string; value?: string };
  } = $props();
</script>

<AuthCardPage
  locale={data.locale}
  siteName={data.siteName}
  theme={data.theme}
  customHead={data.customHead}
  title={data.title}
  description={data.description}
  toast={form?.message ? { message: form.message } : undefined}
  links={[{ href: '/login', label: data.loginLabel }]}
>
  <form method="POST" use:enhance>
    <label>
      {data.emailLabel}
      <input
        type="email"
        name="email"
        autocomplete="email"
        value={form?.value ?? ''}
        required
      />
    </label>
    <button type="submit">{data.submitLabel}</button>
  </form>

  {#if data.verificationNotice}
    <p class="hint">{data.verificationNotice}</p>
  {/if}
</AuthCardPage>
