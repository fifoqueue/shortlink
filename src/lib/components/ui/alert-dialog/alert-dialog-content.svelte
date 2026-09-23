<script lang="ts">
  import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
  import {
    cn,
    type WithoutChild,
    type WithoutChildrenOrChild,
  } from '$lib/utils.js';
  import AlertDialogOverlay from './alert-dialog-overlay.svelte';
  import AlertDialogPortal from './alert-dialog-portal.svelte';
  import type { ComponentProps } from 'svelte';

  let {
    ref = $bindable(null),
    class: className,
    size = 'default',
    portalProps,
    ...restProps
  }: WithoutChild<AlertDialogPrimitive.ContentProps> & {
    size?: 'default' | 'sm';
    portalProps?: WithoutChildrenOrChild<
      ComponentProps<typeof AlertDialogPortal>
    >;
  } = $props();
</script>

<AlertDialogPortal {...portalProps}>
  <AlertDialogOverlay />
  <AlertDialogPrimitive.Content
    bind:ref
    data-slot="alert-dialog-content"
    data-size={size}
    class={cn(
      'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 bg-popover text-popover-foreground fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] -translate-x-1/2 -translate-y-1/2 gap-5 overflow-y-auto rounded-lg border border-border p-6 shadow-lg outline-none duration-100',
      size === 'sm' ? 'max-w-sm' : 'max-w-md',
      className,
    )}
    {...restProps}
  />
</AlertDialogPortal>
