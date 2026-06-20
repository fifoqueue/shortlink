<script lang="ts">
  import type { PluginComponentProps } from '$lib/plugin-contracts';
  import PermissionAdminSubpage from './admin-subpage/PermissionAdminSubpage.svelte';

  let props: PluginComponentProps = $props();
</script>

<PermissionAdminSubpage {...props} />
