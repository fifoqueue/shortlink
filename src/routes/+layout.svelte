<script lang="ts">
  import '$lib/styles/ui.css';
  import type { Snippet } from 'svelte';
  import FormSecurityTokenInjector from '$lib/components/FormSecurityTokenInjector.svelte';
  import type { LayoutData } from './$types';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();
</script>

<FormSecurityTokenInjector
  tokens={[data.securityFormTokens.csrf, data.securityFormTokens.webAction]}
/>
{@render children()}
