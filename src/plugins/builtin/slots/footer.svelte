<script lang="ts">
  import { pluginText } from '$lib/i18n/plugin';
  import type { PluginComponentProps } from '$lib/plugin-contracts';

  let { config, strings = {} }: PluginComponentProps = $props();
  const externalLinksLabel = $derived(
    pluginText(strings, 'public.externalLinks'),
  );
  const links = $derived(
    Array.isArray(config.socialLinks)
      ? config.socialLinks.filter(
          (link): link is { label: string; url: string } =>
            typeof link === 'object' &&
            link !== null &&
            'label' in link &&
            'url' in link &&
            typeof link.label === 'string' &&
            typeof link.url === 'string',
        )
      : [],
  );
</script>

{#if config.socialLinksEnabled === true}
  <nav aria-label={externalLinksLabel}>
    {#each links as link (link.url)}
      <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
      <a href={link.url} target="_blank" rel="noreferrer">{link.label}</a>
    {/each}
  </nav>
{/if}

<style>
  nav {
    display: flex;
    gap: 18px;
  }
  a {
    color: inherit;
    font-weight: 750;
    text-decoration: none;
  }
</style>
