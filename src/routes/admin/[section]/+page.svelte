<script lang="ts">
  import AdminSectionPage from '$lib/components/admin/AdminSectionPage.svelte';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form?: ActionData } = $props();
  const normalizedForm = $derived(form ?? undefined);
</script>

<AdminSectionPage {data} form={normalizedForm} />
