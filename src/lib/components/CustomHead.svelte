<script lang="ts">
  let { html = '' }: { html?: string } = $props();
</script>

<svelte:head>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html html.trim()}
</svelte:head>
