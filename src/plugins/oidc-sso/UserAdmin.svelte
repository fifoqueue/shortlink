<script lang="ts">
  import { enhance } from '$app/forms';
  import DangerConfirmButton from '$lib/components/DangerConfirmButton.svelte';
  import { defaultSiteLocale } from '$lib/config';
  import { keepFormValues } from '$lib/forms';
  import { pluginText } from '$lib/i18n/plugin';
  import type {
    PluginComponentProps,
    PluginLocaleKey,
  } from '$lib/plugin-contracts';

  type OidcConnection = {
    id: number;
    provider: string;
    providerName: string;
    subject: string;
    email: string | null;
    createdAt: string;
  };

  type OidcData = {
    connections: OidcConnection[];
  };

  let {
    integrationData,
    locale = defaultSiteLocale,
    strings = {},
  }: PluginComponentProps = $props();

  const data = $derived((integrationData ?? {}) as Partial<OidcData>);
  const connections = $derived(data.connections ?? []);

  function t(key: PluginLocaleKey) {
    return pluginText(strings, key);
  }
</script>

<section>
  <h2>{t('admin.oidcConnections')}</h2>
  {#if connections.length}
    <div class="connections">
      {#each connections as connection (connection.id)}
        <article>
          <div>
            <strong>{connection.providerName}</strong>
            <span>
              {connection.email ?? connection.subject} · {connection.subject}
            </span>
          </div>
          <form
            method="POST"
            action="?/integrationAction"
            use:enhance={keepFormValues}
          >
            <input type="hidden" name="integrationPlugin" value="oidc-sso" />
            <input type="hidden" name="integrationAction" value="unlink" />
            <input type="hidden" name="identityId" value={connection.id} />
            <input type="hidden" name="provider" value={connection.provider} />
            <DangerConfirmButton
              label={t('admin.forceUnlink')}
              {locale}
              title={t('admin.forceUnlinkTitle')}
              message={t('admin.forceUnlinkMessage')}
              details={[
                `${connection.providerName}: ${connection.email ?? connection.subject}`,
              ]}
              confirmLabel={t('admin.forceUnlink')}
            />
          </form>
        </article>
      {/each}
    </div>
  {:else}
    <p class="muted">{t('admin.emptyOidcConnections')}</p>
  {/if}
</section>

<style>
  section,
  form {
    display: grid;
    gap: 16px;
  }
  section {
    border-top: 1px solid var(--admin-border);
    padding-top: 18px;
  }
  h2,
  p {
    margin: 0;
  }
  h2 {
    font-size: 1.05rem;
  }
  .muted,
  article span {
    color: var(--admin-muted);
    line-height: 1.6;
  }
  .connections {
    display: grid;
    border: 1px solid var(--admin-border);
    border-radius: 12px;
    overflow: hidden;
  }
  article {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    border-top: 1px solid var(--admin-border);
    padding: 14px;
  }
  article:first-child {
    border-top: 0;
  }
  article strong,
  article span {
    display: block;
  }
  @media (max-width: 760px) {
    article {
      align-items: start;
      flex-direction: column;
    }
  }
</style>
