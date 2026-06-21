import type {
  PluginConfig,
  PluginLocaleStrings,
  PluginSlot,
  RuntimePluginSlotRender,
} from '$lib/plugin-contracts';

export type PublicCaptchaAction =
  | 'login'
  | 'signup'
  | 'link-create'
  | 'account-security-unlock';

export type PublicCaptchaChallenge = {
  provider:
    | 'turnstile'
    | 'hcaptcha'
    | 'recaptcha-v2'
    | 'recaptcha-v3'
    | 'recaptcha-invisible'
    | 'custom';
  siteKey: string;
  tokenFieldName: string;
  scriptUrl: string;
  customWidgetHtml: string;
  actions: Partial<Record<PublicCaptchaAction, true>>;
  strings: PluginLocaleStrings;
};

export type PublicPluginComponentSlotRender = {
  pluginId: string;
  slot: PluginSlot;
  config: PluginConfig;
  strings: PluginLocaleStrings;
};

export type PublicPluginSlots = {
  componentSlots: PublicPluginComponentSlotRender[];
  runtimeSlots: RuntimePluginSlotRender[];
};
