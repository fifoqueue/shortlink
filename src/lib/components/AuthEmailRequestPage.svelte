<script lang="ts">
  import { enhance } from '$app/forms';
  import type {
    AuthEmailRequestForm,
    AuthEmailRequestPageData,
  } from '$lib/auth-email-request';
  import AuthCardPage from '$lib/components/AuthCardPage.svelte';

  let {
    data,
    form,
    title,
    description,
    emailLabel,
    submitLabel,
    loginLabel,
    homeLabel,
  }: {
    data: AuthEmailRequestPageData;
    form?: AuthEmailRequestForm;
    title: string;
    description: string;
    emailLabel: string;
    submitLabel: string;
    loginLabel: string;
    homeLabel: string;
  } = $props();
</script>

<AuthCardPage
  locale={data.locale}
  siteName={data.siteName}
  theme={data.theme}
  customHead={data.customHead}
  {title}
  {description}
  toast={form?.message ? { message: form.message, ok: form.ok } : undefined}
  links={[
    { href: '/login', label: loginLabel, primary: true },
    { href: '/', label: homeLabel },
  ]}
>
  {#if !data.available}
    <div class="inline-note">{data.unavailableReason}</div>
  {:else}
    <form method="POST" action="?/request" use:enhance>
      <label>
        {emailLabel}
        <input
          type="email"
          name="email"
          autocomplete="email"
          value={form?.values?.email ?? ''}
          required
        />
      </label>
      <button type="submit">{submitLabel}</button>
    </form>
  {/if}
</AuthCardPage>
