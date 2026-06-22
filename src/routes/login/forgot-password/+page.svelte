<script lang="ts">
  import type {
    AuthEmailRequestForm,
    AuthEmailRequestPageData,
  } from '$lib/auth-email-request';
  import AuthEmailRequestPage from '$lib/components/AuthEmailRequestPage.svelte';
  import { uiText } from '$lib/i18n/ui-text';

  let {
    data,
    form,
  }: {
    data: AuthEmailRequestPageData;
    form?: AuthEmailRequestForm;
  } = $props();

  const text = $derived(uiText(data.locale, data.defaultLocale));
</script>

<AuthEmailRequestPage
  {data}
  {form}
  title={text.auth.forgotPasswordTitle}
  description={text.auth.forgotPasswordDescription}
  emailLabel={text.auth.email}
  submitLabel={text.auth.sendPasswordResetEmail}
  loginLabel={text.common.login}
  homeLabel={text.common.home}
/>
