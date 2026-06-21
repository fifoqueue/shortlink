import type { SiteLocale, SiteSettings } from '$lib/config';
import type { AuthenticatedUser, PluginSlot } from '$lib/plugin-contracts';
import type {
  PublicCaptchaAction,
  PublicCaptchaChallenge,
  PublicPluginComponentSlotRender,
} from '$lib/public-plugin-slots';
import {
  isActionProtected,
  normalizeCaptchaConfig,
  scriptUrlForProvider,
  type CaptchaAction,
} from '../../../plugins/captcha/config';
import { publicPluginStrings, slotAllowed } from './shared';

const captchaActionSlots: Record<PublicCaptchaAction, PluginSlot> = {
  login: 'login-extra',
  signup: 'signup-extra',
  'link-create': 'form-extra',
  'account-security-unlock': 'account-security-unlock',
};

export function loadCaptchaSlots(input: {
  settings: SiteSettings;
  locale: SiteLocale;
  fallbackLocale: SiteLocale;
  user: AuthenticatedUser | null;
  slots: ReadonlySet<PluginSlot> | null;
}): PublicPluginComponentSlotRender[] {
  if (input.user?.isAdmin === true) return [];
  const state = input.settings.plugins.captcha;
  if (!state?.enabled) return [];

  const config = normalizeCaptchaConfig(state.config);
  if (config.provider === 'none') return [];
  const provider = config.provider;

  const actions = (
    [
      'login',
      'signup',
      'link-create',
      'account-security-unlock',
    ] satisfies PublicCaptchaAction[]
  ).filter(
    (action) =>
      slotAllowed(input.slots, captchaActionSlots[action]) &&
      isActionProtected(config, action as CaptchaAction),
  );

  const challenge = (action: PublicCaptchaAction): PublicCaptchaChallenge => ({
    provider,
    siteKey: config.siteKey,
    tokenFieldName: config.tokenFieldName,
    scriptUrl: scriptUrlForProvider(config),
    customWidgetHtml:
      config.provider === 'custom' ? config.customWidgetHtml : '',
    actions: { [action]: true },
    strings: publicPluginStrings('captcha', input.locale, input.fallbackLocale),
  });

  return actions.map((action) => ({
    pluginId: 'captcha',
    slot: captchaActionSlots[action],
    config: { challenge: challenge(action) },
    strings: publicPluginStrings('captcha', input.locale, input.fallbackLocale),
  }));
}
