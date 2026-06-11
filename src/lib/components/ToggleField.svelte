<script lang="ts">
  let {
    name,
    label = '',
    checked = $bindable(false),
    disabled = false,
    value,
    form,
    ariaLabel,
    required = false,
    onchange,
    class: className = '',
  }: {
    name?: string;
    label?: string;
    checked?: boolean;
    disabled?: boolean;
    value?: string | number;
    form?: string;
    ariaLabel?: string;
    required?: boolean;
    onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
    class?: string;
  } = $props();
</script>

<label
  class={['toggle', className, label ? '' : 'icon-only']
    .filter(Boolean)
    .join(' ')}
>
  <input
    type="checkbox"
    {name}
    bind:checked
    {disabled}
    {value}
    {form}
    aria-label={ariaLabel}
    {required}
    {onchange}
  />
  {#if label}
    <span>{label}</span>
  {/if}
</label>

<style>
  .toggle {
    display: flex;
    min-height: var(--toggle-min-height, 28px);
    align-items: center;
    gap: 9px;
    color: var(--toggle-label, #455148);
    font-size: var(--toggle-font-size, 0.82rem);
    font-weight: 750;
  }
  .toggle.icon-only {
    width: 18px;
    min-height: 18px;
    gap: 0;
  }
  .toggle input {
    position: relative;
    width: 18px;
    height: 18px;
    flex: none;
    appearance: none;
    border: 1px solid var(--toggle-border, #aebbb2);
    border-radius: 6px;
    padding: 0;
    background: var(--toggle-surface, #fff);
    cursor: pointer;
    transition:
      background 0.15s,
      border-color 0.15s,
      box-shadow 0.15s;
  }
  .toggle input:hover {
    border-color: var(--toggle-primary, #215e40);
  }
  .toggle input:focus-visible {
    outline: 0;
    box-shadow: 0 0 0 3px var(--toggle-focus, rgb(33 94 64 / 18%));
  }
  .toggle input:checked {
    border-color: var(--toggle-primary, #215e40);
    background:
      url("data:image/svg+xml,%3csvg viewBox='0 0 16 16' fill='none' xmlns='http://www.w3.org/2000/svg'%3e%3cpath d='M3.5 8.2 6.6 11.2 12.8 4.8' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/%3e%3c/svg%3e")
        center / 14px 14px no-repeat,
      var(--toggle-primary, #215e40);
  }
  .toggle input:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }
</style>
