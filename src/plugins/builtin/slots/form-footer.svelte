<script lang="ts">
  import type { PluginComponentProps } from '$lib/plugin-contracts';

  let { config }: PluginComponentProps = $props();
  const text = $derived(typeof config.text === 'string' ? config.text : '');
</script>

{#if text}
  <p>
    <span aria-hidden="true">i</span>
    {text}
  </p>
{/if}

<style>
  p {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    margin: 12px 4px 1px;
    color: var(--muted);
    font-size: 0.75rem;
    line-height: 1.6;
  }
  span {
    display: inline-grid;
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid currentColor;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: 800;
    line-height: 1;
  }
</style>
