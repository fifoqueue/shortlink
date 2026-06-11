<script lang="ts">
  import LegalDocumentPage from '$lib/components/LegalDocumentPage.svelte';
  import type { SiteLocale } from '$lib/config';
  import { uiText } from '$lib/i18n/ui-text';

  let { data } = $props();
  const text = $derived(uiText(data.settings.general.language as SiteLocale));
</script>

<LegalDocumentPage
  settings={data.settings}
  title={data.settings.legal.termsTitle || text.legal.terms}
  content={data.settings.legal.termsContent}
  fallbackContent={text.legal.termsFallback}
/>
