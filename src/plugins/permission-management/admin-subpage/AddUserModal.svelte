<script lang="ts">
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/button';
  import { Input } from '$lib/components/ui/input';
  import { Textarea } from '$lib/components/ui/textarea';
  import { enhance } from '$app/forms';
  import { keepFormValues } from '$lib/forms';
  import type { PluginLocaleKey } from '$lib/plugin-contracts';
  import type { GroupUser } from './types';

  let {
    user,
    t,
    formatText,
    onClose,
  }: {
    user: GroupUser;
    t: (key: PluginLocaleKey) => string;
    formatText: (
      key: PluginLocaleKey,
      values: Record<string, string | number>,
    ) => string;
    onClose: () => void;
  } = $props();
</script>

<Dialog.Root
  open
  onOpenChange={(open) => {
    if (!open) onClose();
  }}
>
  <Dialog.Content
    portalProps={{ disabled: true }}
    showCloseButton={false}
    class="max-h-[85dvh] overflow-y-auto sm:max-w-lg"
  >
    <Dialog.Header>
      <Dialog.Title>{t('admin.addUserToGroup')}</Dialog.Title>
      <Dialog.Description
        >{formatText('admin.addUserToGroupDescription', {
          name: user.name,
        })}</Dialog.Description
      >
    </Dialog.Header>
    <form method="POST" action="?/pluginAction" use:enhance={keepFormValues}>
      <input type="hidden" name="pluginAction" value="addGroupUser" />
      <input type="hidden" name="userId" value={user.id} />
      <label
        >{t('admin.expirationDateTime')}<Input
          name="expiresAt"
          type="datetime-local"
          step="60"
        /></label
      >
      <label
        >{t('admin.assignmentReason')}<Textarea
          name="reason"
          rows={4}
          maxlength={1000}
          placeholder={t('admin.assignmentReasonPlaceholder')}
        /></label
      >
      <label class="checkbox-row"
        ><input name="reasonPublic" type="checkbox" /><span
          >{t('admin.assignmentReasonPublicCheckbox')}</span
        ></label
      >
      <Dialog.Footer>
        <Button type="button" variant="outline" onclick={onClose}
          >{t('admin.cancel')}</Button
        >
        <Button type="submit">{t('admin.add')}</Button>
      </Dialog.Footer>
    </form>
  </Dialog.Content>
</Dialog.Root>
