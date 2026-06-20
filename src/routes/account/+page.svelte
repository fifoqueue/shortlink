<script lang="ts">
  import AccountPage from '$lib/components/account/AccountPage.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form?: ActionData } = $props();
  const normalizedForm = $derived(form ?? undefined);
</script>

<AccountPage {data} form={normalizedForm} />
