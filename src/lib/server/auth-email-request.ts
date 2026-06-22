import { fail, redirect, type RequestEvent } from '@sveltejs/kit';
import type { SiteLocale, SiteSettings } from '$lib/config';
import { uiText, type UiText } from '$lib/i18n/ui-text';
import { accountRecoveryAvailability } from '$lib/server/account-recovery';
import {
  localizedAuthMessage,
  passwordLoginEnabled,
  publicAuthPageData,
  requestClientIp,
} from '$lib/server/auth-page';
import {
  effectivePermissionsForEvent,
  type EffectivePermissions,
} from '$lib/server/permissions';
import { getSettings, stringValue } from '$lib/server/settings';

type RecoveryEmailRequestKind = 'passwordReset' | 'resendVerification';

type RecoveryEmailMessageConfig = {
  disabled: string;
  success: keyof UiText['messages'];
  failure: keyof UiText['messages'];
};

export type RecoveryEmailRequestContext = {
  settings: SiteSettings;
  permissions: EffectivePermissions;
  origin: string;
  ip: string;
  email: string;
  passwordLoginEnabled: boolean;
};

const recoveryEmailMessages = {
  passwordReset: {
    disabled: 'passwordResetDisabled',
    success: 'passwordResetRequested',
    failure: 'passwordResetFailed',
  },
  resendVerification: {
    disabled: 'resendVerificationDisabled',
    success: 'resendVerificationRequested',
    failure: 'resendVerificationFailed',
  },
} satisfies Record<RecoveryEmailRequestKind, RecoveryEmailMessageConfig>;

function disabledRecoveryEmailRequestMessage(
  settings: SiteSettings,
  locale: SiteLocale,
  kind: RecoveryEmailRequestKind,
) {
  return localizedAuthMessage(
    settings,
    locale,
    recoveryEmailMessages[kind].disabled,
  );
}

function recoveryEmailRequestAvailability(
  settings: SiteSettings,
  locale: SiteLocale,
  permissions: EffectivePermissions,
  kind: RecoveryEmailRequestKind,
) {
  const enabledPasswordLogin =
    kind === 'passwordReset'
      ? passwordLoginEnabled(settings, locale, permissions.auth.providers)
      : true;
  const availability = accountRecoveryAvailability({
    settings,
    permissions,
    passwordLoginEnabled: enabledPasswordLogin,
  });

  return {
    available: availability[kind],
    passwordLoginEnabled: enabledPasswordLogin,
  };
}

export async function loadRecoveryEmailRequestPage(
  event: Pick<RequestEvent, 'getClientAddress' | 'locals' | 'request'>,
  kind: RecoveryEmailRequestKind,
) {
  if (event.locals.user) redirect(303, '/account');
  const settings = await getSettings();
  const permissions = await effectivePermissionsForEvent(event);
  const { available } = recoveryEmailRequestAvailability(
    settings,
    event.locals.locale,
    permissions,
    kind,
  );

  return {
    ...publicAuthPageData(settings, event.locals),
    available,
    unavailableReason: available
      ? ''
      : disabledRecoveryEmailRequestMessage(
          settings,
          event.locals.locale,
          kind,
        ),
  };
}

export async function handleRecoveryEmailRequest(
  event: RequestEvent,
  kind: RecoveryEmailRequestKind,
  send: (context: RecoveryEmailRequestContext) => Promise<unknown>,
) {
  const settings = await getSettings();
  const messages = recoveryEmailMessages[kind];
  const text = uiText(event.locals.locale, settings.i18n.defaultLocale);
  const permissions = await effectivePermissionsForEvent(event);
  const { available, passwordLoginEnabled } = recoveryEmailRequestAvailability(
    settings,
    event.locals.locale,
    permissions,
    kind,
  );
  const form = await event.request.formData();
  const values = { email: stringValue(form, 'email') };

  if (!available) {
    return fail(403, {
      values,
      message: disabledRecoveryEmailRequestMessage(
        settings,
        event.locals.locale,
        kind,
      ),
    });
  }

  try {
    await send({
      settings,
      permissions,
      origin: event.url.origin,
      ip: requestClientIp(settings, event.request, event.getClientAddress),
      email: values.email,
      passwordLoginEnabled,
    });
    return {
      ok: true,
      values,
      message: text.messages[messages.success],
    };
  } catch (cause) {
    return fail(400, {
      values,
      message:
        cause instanceof Error
          ? localizedAuthMessage(settings, event.locals.locale, cause.message)
          : text.messages[messages.failure],
    });
  }
}
