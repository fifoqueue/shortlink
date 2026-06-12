import type { SiteSettings } from '$lib/config';
import { serverMessage } from '$lib/i18n/ui-text';
import {
  countUsers,
  createEmailVerificationToken,
  createUser,
  hashEmailVerificationToken,
  verifyUserEmailToken,
} from './users';
import { sendVerificationEmail } from './email';
import { updateSettings } from './settings';
import {
  normalizeShortLinkDomainSettings,
  shortLinkDomainSchemeFromOrigin,
  shortLinkHostnameFromOrigin,
} from './url';

function verificationUrl(origin: string, token: string) {
  const url = new URL('/signup/verify', origin);
  url.searchParams.set('token', token);
  return url.toString();
}

export async function registrationAvailability(
  settings: SiteSettings,
  options: { passwordLoginEnabled?: boolean } = {},
) {
  const setupRequired = (await countUsers()) === 0;
  if (setupRequired) {
    return {
      allowed: true,
      reason: '',
      setupRequired,
    };
  }

  if (!settings.auth.registration.enabled) {
    return {
      allowed: false,
      reason: serverMessage('registrationDisabled'),
      setupRequired,
    };
  }

  const passwordLoginEnabled = options.passwordLoginEnabled ?? true;
  if (!passwordLoginEnabled) {
    return {
      allowed: false,
      reason: serverMessage('passwordLoginDisabled'),
      setupRequired,
    };
  }

  return { allowed: true, reason: '', setupRequired };
}

export async function registerUser(input: {
  settings: SiteSettings;
  origin: string;
  email: string;
  name: string;
  password: string;
  passwordLoginEnabled?: boolean;
}) {
  const { settings, origin, email, name, password, passwordLoginEnabled } =
    input;
  const availability = await registrationAvailability(settings, {
    passwordLoginEnabled,
  });
  if (!availability.allowed) throw new Error(availability.reason);

  const firstUser = availability.setupRequired;
  const verificationEnabled =
    settings.auth.emailVerification.enabled && !firstUser;
  const token = verificationEnabled ? createEmailVerificationToken() : '';
  const expiresAt = verificationEnabled
    ? new Date(
        Date.now() +
          settings.auth.emailVerification.tokenTtlHours * 60 * 60_000,
      )
    : null;

  const user = await createUser({
    email,
    name,
    password,
    isAdmin: firstUser,
    enabled: !verificationEnabled,
    emailVerifiedAt: verificationEnabled ? null : new Date(),
    emailVerificationTokenHash: token
      ? hashEmailVerificationToken(token)
      : null,
    emailVerificationExpiresAt: expiresAt,
    passwordPolicy: settings.auth.password,
  });

  if (verificationEnabled) {
    try {
      await sendVerificationEmail({
        settings,
        email: user.email,
        name: user.name,
        verificationUrl: verificationUrl(origin, token),
      });
    } catch (cause) {
      await user.destroy();
      throw cause;
    }
  }

  if (firstUser) {
    const defaultDomain = shortLinkHostnameFromOrigin(origin);
    const domains = normalizeShortLinkDomainSettings({
      defaultDomain,
      domains: settings.general.domains,
      domainSchemes: {
        ...settings.general.domainSchemes,
        [defaultDomain]: shortLinkDomainSchemeFromOrigin(origin),
      },
    });
    await updateSettings({
      ...settings,
      general: {
        ...settings.general,
        defaultDomain: domains.defaultDomain,
        domains: domains.domains,
        domainSchemes: domains.domainSchemes,
      },
    });
  }

  return {
    user,
    firstUser,
    verificationRequired: verificationEnabled,
  };
}

export async function verifySignupEmail(token: string) {
  return verifyUserEmailToken(token);
}
