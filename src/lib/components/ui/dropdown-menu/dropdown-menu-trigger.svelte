<script lang="ts">
  import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';

  let {
    ref = $bindable(null),
    ...restProps
  }: DropdownMenuPrimitive.TriggerProps = $props();
</script>

<DropdownMenuPrimitive.Trigger
  type="button"
  bind:ref
  data-slot="dropdown-menu-trigger"
  {...restProps}
/>
