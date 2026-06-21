<script lang="ts">
  import type { PluginComponentProps } from '$lib/plugin-contracts';

  let { config }: PluginComponentProps = $props();
  const html = $derived(typeof config.html === 'string' ? config.html : '');
</script>

{#if html}
  <aside>
    <div class="content">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html html}
    </div>
  </aside>
{/if}

<style>
  aside {
    display: flex;
    min-height: 40px;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 8px 20px;
    background: var(--primary);
    color: var(--primary-contrast);
    font-size: 0.82rem;
    font-weight: 700;
    text-align: center;
  }
  .content :global(*) {
    margin-top: 0;
    margin-bottom: 0;
  }
  .content :global(a) {
    color: inherit;
    font-weight: 900;
  }
</style>
