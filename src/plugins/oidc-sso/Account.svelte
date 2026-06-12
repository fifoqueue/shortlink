<script lang="ts">
  import { enhance } from '$app/forms';
  import { resolve } from '$app/paths';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import { defaultSiteLocale } from '$lib/config';
  import { keepFormValues } from '$lib/forms';
  import { pluginText } from '$lib/i18n/plugin';
  import { formatText } from '$lib/i18n/ui-text';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';

  type OidcProvider = {
    id: string;
    name: string;
    connected: boolean;
    connectionId: number | null;
    email: string | null;
    subject: string | null;
  };

  type OidcData = {
    providers: OidcProvider[];
  };

  let {
    integrationData,
    locale = defaultSiteLocale,
    strings = {},
  }: PluginComponentProps = $props();

  const data = $derived((integrationData ?? {}) as Partial<OidcData>);
  const providers = $derived(data.providers ?? []);

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }
</script>

{#if providers.length}
  <section>
    <h2>{t('account.oidcConnections')}</h2>
    <div class="connections">
      {#each providers as provider (provider.id)}
        <article>
          <div>
            <strong>{provider.name}</strong>
            <span>
              {provider.connected
                ? (provider.email ?? provider.subject ?? t('account.connected'))
                : t('account.disconnected')}
            </span>
          </div>
          {#if provider.connected && provider.connectionId}
            <form
              method="POST"
              action="?/pluginAction"
              use:enhance={keepFormValues}
            >
              <input type="hidden" name="pluginId" value="oidc-sso" />
              <input type="hidden" name="pluginAction" value="unlink" />
              <input type="hidden" name="providerId" value={provider.id} />
              <input
                type="hidden"
                name="identityId"
                value={provider.connectionId}
              />
              <DangerConfirmButton
                label={t('account.unlink')}
                title={formatText(t('account.unlinkTitle'), {
                  provider: provider.name,
                })}
                message={t('account.unlinkMessage')}
                confirmLabel={t('account.unlink')}
                {locale}
              />
            </form>
          {:else}
            <a
              class="button"
              href={resolve(
                `/account/connections/oidc-sso/${provider.id}/start?returnTo=/account`,
              )}
            >
              {t('account.connect')}
            </a>
          {/if}
        </article>
      {/each}
    </div>
  </section>
{/if}

<style>
  section {
    display: grid;
    gap: 14px;
    border: 1px solid var(--page-border);
    border-radius: var(--page-radius);
    padding: 26px;
    background: var(--page-surface);
  }
  h2 {
    margin: 0;
    font-size: 1.05rem;
  }
  .connections {
    display: grid;
  }
  article {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: 1px solid var(--page-border);
    padding: 12px 0;
  }
  article:first-child {
    border-top: 0;
  }
  article strong,
  article span {
    display: block;
  }
  article span {
    margin: 0;
    color: var(--page-muted);
    line-height: 1.6;
  }
  form {
    display: grid;
    gap: 14px;
  }
  .button {
    display: inline-flex;
    width: fit-content;
    min-height: 40px;
    align-items: center;
    border: 0;
    border-radius: 10px;
    padding: 10px 15px;
    background: var(--page-primary);
    color: var(--page-primary-contrast);
    font: inherit;
    font-weight: 850;
    text-decoration: none;
    cursor: pointer;
  }
  @media (max-width: 720px) {
    article {
      align-items: start;
      flex-direction: column;
    }
  }
</style>
