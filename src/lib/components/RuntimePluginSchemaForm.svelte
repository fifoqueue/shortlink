<script lang="ts">
  import ToggleField from '$lib/components/ToggleField.svelte';
  import type {
    RuntimePluginAdminField,
    RuntimePluginAdminSchema,
  } from '$lib/plugin-contracts';

  let { schema }: { schema: RuntimePluginAdminSchema } = $props();

  function textValue(field: RuntimePluginAdminField) {
    return 'value' in field ? String(field.value ?? '') : '';
  }

  function numberValue(field: RuntimePluginAdminField) {
    return field.type === 'number' && typeof field.value === 'number'
      ? String(field.value)
      : '';
  }
</script>

<div class="runtime-schema">
  {#each schema.fields as field (field.name)}
    {#if field.type === 'checkbox'}
      <div class="field">
        <ToggleField
          name={field.name}
          label={field.label}
          checked={field.checked === true}
          disabled={false}
        />
        {#if field.help}
          <small>{field.help}</small>
        {/if}
      </div>
    {:else if field.type === 'textarea'}
      <label class="field">
        <span>{field.label}</span>
        <textarea
          name={field.name}
          rows={field.rows ?? 4}
          maxlength={field.maxlength}
          placeholder={field.placeholder ?? ''}
          required={field.required === true}>{textValue(field)}</textarea
        >
        {#if field.help}
          <small>{field.help}</small>
        {/if}
      </label>
    {:else if field.type === 'select'}
      <label class="field">
        <span>{field.label}</span>
        <select
          name={field.name}
          value={field.value ?? ''}
          required={field.required === true}
        >
          {#each field.options as option (option.value)}
            <option value={option.value}>{option.label}</option>
          {/each}
        </select>
        {#if field.help}
          <small>{field.help}</small>
        {/if}
      </label>
    {:else if field.type === 'number'}
      <label class="field">
        <span>{field.label}</span>
        <input
          type="number"
          name={field.name}
          value={numberValue(field)}
          min={field.min}
          max={field.max}
          step={field.step}
          required={field.required === true}
        />
        {#if field.help}
          <small>{field.help}</small>
        {/if}
      </label>
    {:else}
      <label class="field">
        <span>{field.label}</span>
        <input
          type={field.type}
          name={field.name}
          value={textValue(field)}
          maxlength={field.maxlength}
          placeholder={field.placeholder ?? ''}
          required={field.required === true}
        />
        {#if field.help}
          <small>{field.help}</small>
        {/if}
      </label>
    {/if}
  {/each}
</div>

<style>
  .runtime-schema {
    display: grid;
    gap: 14px;
  }
  .field {
    display: grid;
    gap: 8px;
    color: var(--admin-text, var(--page-text, var(--text, #111827)));
    font-size: 0.86rem;
    font-weight: 750;
  }
  .field small {
    color: var(--admin-muted, var(--page-muted, var(--muted, #6b7280)));
    font-size: 0.76rem;
    font-weight: 650;
    line-height: 1.5;
  }
  .field :global(input:not([type='checkbox']):not([type='radio'])),
  .field textarea,
  .field select {
    width: 100%;
    min-height: var(--form-control-height, 44px);
    border: 1px solid
      var(--admin-border, var(--page-border, var(--border, #d1d5db)));
    border-radius: var(--form-control-radius, 10px);
    padding: 11px 12px;
    background: var(--admin-surface, var(--page-surface, var(--surface, #fff)));
    color: var(--admin-text, var(--page-text, var(--text, #111827)));
    outline: none;
  }
  .field select {
    height: var(--form-control-height, 44px);
    padding-top: 0;
    padding-bottom: 0;
    line-height: 1.2;
  }
  .field textarea {
    resize: vertical;
    line-height: 1.5;
  }
</style>
