<script lang="ts">
  import { resolve } from '$app/paths';
  import '$lib/styles/site-theme.css';
  import '$lib/styles/forms.css';

  let { customCss = true }: { customCss?: boolean } = $props();
</script>

<svelte:head>
  {#if customCss}
    <link rel="stylesheet" href={resolve('/custom.css')} />
  {/if}
</svelte:head>
