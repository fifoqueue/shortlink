import type { SiteLocale, SiteSettings } from '$lib/config';
import type { AuthenticatedUser, PluginSlot } from '$lib/plugin-contracts';
import type { PublicPluginSlots } from '$lib/public-plugin-slots';
import { loadRuntimePluginSlots } from '../../plugins/server';
import { loadBuiltinSlots } from './plugin-slots/builtin';
import { loadCaptchaSlots } from './plugin-slots/captcha';
import { slotSet } from './plugin-slots/shared';

export async function loadPublicPluginSlots(input: {
  settings: SiteSettings;
  locale: SiteLocale;
  fallbackLocale: SiteLocale;
  user: AuthenticatedUser | null;
  slots?: readonly PluginSlot[];
}): Promise<PublicPluginSlots> {
  const slots = slotSet(input.slots);
  return {
    componentSlots: [
      ...loadBuiltinSlots({
        settings: input.settings,
        locale: input.locale,
        fallbackLocale: input.fallbackLocale,
        slots,
      }),
      ...loadCaptchaSlots({ ...input, slots }),
    ],
    runtimeSlots: await loadRuntimePluginSlots({
      states: input.settings.plugins,
      locale: input.locale,
      fallbackLocale: input.fallbackLocale,
      user: input.user,
      slots: input.slots,
    }),
  };
}
