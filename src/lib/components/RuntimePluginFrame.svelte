<script lang="ts">
  import { onMount } from 'svelte';
  import type {
    PluginConfig,
    PluginLocaleStrings,
    RuntimePluginFrameInit,
    RuntimePluginFrameMessage,
  } from '$lib/plugin-contracts';
  import type { SiteLocale } from '$lib/config';

  let {
    src,
    pluginId,
    config,
    adminData = undefined,
    locale,
    fallbackLocale,
    strings,
    pluginFieldName = null,
    pluginFieldValue = pluginId,
    actionFieldName = 'pluginAction',
  }: {
    src: string;
    pluginId: string;
    config: PluginConfig;
    adminData?: unknown;
    locale: SiteLocale;
    fallbackLocale: SiteLocale;
    strings: PluginLocaleStrings;
    pluginFieldName?: string | null;
    pluginFieldValue?: string;
    actionFieldName?: string;
  } = $props();

  let frame = $state<HTMLIFrameElement | null>(null);
  let height = $state(320);
  let fields = $state<
    Record<string, string | string[] | boolean | number | null>
  >({});

  const fieldEntries = $derived(Object.entries(fields));

  function initMessage(): RuntimePluginFrameInit {
    return {
      type: 'shortlink:init',
      pluginId,
      locale,
      fallbackLocale,
      strings: Object.fromEntries(
        Object.entries(strings).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      ),
      config,
      adminData,
    };
  }

  function sendInit() {
    frame?.contentWindow?.postMessage(initMessage(), '*');
  }

  function isFrameMessage(value: unknown): value is RuntimePluginFrameMessage {
    return (
      typeof value === 'object' &&
      value !== null &&
      'type' in value &&
      typeof value.type === 'string' &&
      value.type.startsWith('shortlink:')
    );
  }

  function applyFields(next: Record<string, unknown>) {
    fields = Object.fromEntries(
      Object.entries(next)
        .map(([key, value]) => {
          if (Array.isArray(value)) {
            return [
              key,
              value.map((item) => String(item)).filter(Boolean),
            ] as const;
          }
          if (
            typeof value === 'string' ||
            typeof value === 'boolean' ||
            typeof value === 'number' ||
            value === null
          ) {
            return [key, value] as const;
          }
          return [key, String(value ?? '')] as const;
        })
        .filter(([key]) => key),
    );
  }

  function submitAction(action: string, nextFields?: Record<string, unknown>) {
    fields = {
      ...fields,
      [actionFieldName]: action,
    };
    if (nextFields) applyFields({ ...fields, ...nextFields });
    frame?.closest('form')?.requestSubmit();
  }

  onMount(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame?.contentWindow) return;
      if (!isFrameMessage(event.data)) return;
      if (event.data.type === 'shortlink:resize') {
        height = Math.max(120, Math.min(2000, event.data.height));
      } else if (event.data.type === 'shortlink:set-fields') {
        applyFields(event.data.fields);
      } else if (event.data.type === 'shortlink:submit-action') {
        submitAction(event.data.action, event.data.fields);
      }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  });
</script>

{#each fieldEntries as [name, value] (name)}
  {#if Array.isArray(value)}
    {#each value as item, index (`${name}-${index}`)}
      <input type="hidden" {name} value={item} />
    {/each}
  {:else if typeof value === 'boolean'}
    <input type="hidden" {name} value={value ? 'true' : 'false'} />
  {:else if value !== null}
    <input type="hidden" {name} value={String(value)} />
  {/if}
{/each}

{#if pluginFieldName}
  <input type="hidden" name={pluginFieldName} value={pluginFieldValue} />
{/if}

<iframe
  bind:this={frame}
  class="runtime-plugin-frame"
  title={pluginId}
  {src}
  style={`height:${height}px`}
  sandbox="allow-forms allow-scripts"
  onload={sendInit}
></iframe>

<style>
  .runtime-plugin-frame {
    width: 100%;
    border: 1px solid
      var(--admin-border, var(--page-border, var(--border, #d1d5db)));
    border-radius: calc(var(--admin-radius, var(--page-radius, 14px)) * 0.55);
    background: var(--admin-surface, var(--page-surface, var(--surface, #fff)));
  }
</style>
