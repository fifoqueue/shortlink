<script lang="ts">
  import CustomHead from './CustomHead.svelte';
  import '$lib/styles/site-theme.css';
  import '$lib/styles/forms.css';

  let { customHead = '' }: { customHead?: string } = $props();
</script>

<CustomHead html={customHead} />
