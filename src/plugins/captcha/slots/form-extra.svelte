<script lang="ts">
  import type { PluginComponentProps } from '$lib/plugin-contracts';
  import CaptchaField from '../CaptchaField.svelte';
  import { captchaChallengeFromConfig } from '../slot';

  let { config, strings = {} }: PluginComponentProps = $props();
  const challenge = $derived(captchaChallengeFromConfig(config));
</script>

{#if challenge}
  <CaptchaField {challenge} {strings} action="link-create" />
{/if}
