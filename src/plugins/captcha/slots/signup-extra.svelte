<script lang="ts">
  import type { PluginComponentProps } from '$lib/plugin-contracts';
  import CaptchaField from '../CaptchaField.svelte';

  let { config, user = null, strings = {} }: PluginComponentProps = $props();
</script>

<CaptchaField {config} {user} {strings} action="signup" />
