<script lang="ts">
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

  function closeOnBackdrop(event: MouseEvent) {
    if (event.target === event.currentTarget) onClose();
  }
</script>

<div class="modal-backdrop" role="presentation" onclick={closeOnBackdrop}>
  <div
    class="assignment-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="add-user-modal-title"
    tabindex="-1"
  >
    <div>
      <h2 id="add-user-modal-title">{t('admin.addUserToGroup')}</h2>
      <p class="muted">
        {formatText('admin.addUserToGroupDescription', { name: user.name })}
      </p>
    </div>
    <form method="POST" action="?/pluginAction" use:enhance={keepFormValues}>
      <input type="hidden" name="pluginAction" value="addGroupUser" />
      <input type="hidden" name="userId" value={user.id} />
      <label>
        {t('admin.expirationDateTime')}
        <input name="expiresAt" type="datetime-local" step="60" />
      </label>
      <label>
        {t('admin.assignmentReason')}
        <textarea
          name="reason"
          rows="4"
          maxlength="1000"
          placeholder={t('admin.assignmentReasonPlaceholder')}
        ></textarea>
      </label>
      <label class="checkbox-row">
        <input name="reasonPublic" type="checkbox" />
        <span>{t('admin.assignmentReasonPublicCheckbox')}</span>
      </label>
      <div class="modal-actions">
        <button type="button" class="secondary" onclick={onClose}
          >{t('admin.cancel')}</button
        >
        <button type="submit">{t('admin.add')}</button>
      </div>
    </form>
  </div>
</div>
