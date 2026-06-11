import {
  defaultSiteLocale,
  defaultSettings,
  type SiteLocale,
  type SiteSettings,
} from '$lib/config';
import { formatText, serverMessage, uiText } from '$lib/i18n/ui-text';

export type PasswordPolicy = SiteSettings['auth']['password'];

export function passwordPolicyDescription(
  policy: PasswordPolicy,
  locale: SiteLocale = defaultSiteLocale,
) {
  const text = uiText(locale).auth;
  const parts = [
    formatText(text.passwordPolicyMinimum, { length: policy.minLength }),
  ];
  if (policy.requireLetters) {
    parts.push(text.passwordPolicyLetters);
  }
  if (policy.requireNumbers) {
    parts.push(text.passwordPolicyNumbers);
  }
  if (policy.requireSymbols) {
    parts.push(text.passwordPolicySymbols);
  }
  return parts.join(', ');
}

export function validatePassword(
  password: string,
  policy: PasswordPolicy = defaultSettings.auth.password,
  _label = 'password',
) {
  if (password.length < policy.minLength) {
    throw new Error(
      serverMessage('passwordMinLength', { min: policy.minLength }),
    );
  }
  if (policy.requireLetters && !/[A-Za-z]/.test(password)) {
    throw new Error(serverMessage('passwordRequiresLetters'));
  }
  if (policy.requireNumbers && !/\d/.test(password)) {
    throw new Error(serverMessage('passwordRequiresNumbers'));
  }
  if (policy.requireSymbols && !/[^A-Za-z0-9]/.test(password)) {
    throw new Error(serverMessage('passwordRequiresSymbols'));
  }
}
