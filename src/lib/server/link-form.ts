import { stringValue } from './settings';
import { formatText, type UiText } from '$lib/i18n/ui-text';
import type {
  DeleteLinksResult,
  LinkOperationsInput,
  LinkPreviewInput,
} from './shortener';

export const EXPIRES_AT_REQUIRES_DATE = '__expires_at_requires_date__';

export function linkCodesFromForm(form: FormData) {
  const singleCode = stringValue(form, 'singleCode');
  if (singleCode) return [singleCode];
  return form
    .getAll('codes')
    .map((code) => String(code).trim())
    .filter(Boolean);
}

export function linkPreviewFromForm(form: FormData): LinkPreviewInput {
  return {
    title: stringValue(form, 'previewTitle'),
    description: stringValue(form, 'previewDescription'),
    imageUrl: stringValue(form, 'previewImageUrl'),
    themeColor: stringValue(form, 'themeColor'),
  };
}

function expiresAtFromForm(form: FormData) {
  const directValue = stringValue(form, 'expiresAt');
  if (directValue) return directValue;

  const date = stringValue(form, 'expiresAtDate');
  const time = stringValue(form, 'expiresAtTime');
  if (!date) return time ? EXPIRES_AT_REQUIRES_DATE : '';

  return `${date}T${time || '23:59'}`;
}

export function linkOperationsFromForm(form: FormData): LinkOperationsInput {
  return {
    tags: stringValue(form, 'tags'),
    expiresAt: expiresAtFromForm(form),
    maxClicks: stringValue(form, 'maxClicks'),
    password: stringValue(form, 'password'),
    clearPassword: form.get('clearPassword') === 'on',
    utmSource: stringValue(form, 'utmSource'),
    utmMedium: stringValue(form, 'utmMedium'),
    utmCampaign: stringValue(form, 'utmCampaign'),
    utmTerm: stringValue(form, 'utmTerm'),
    utmContent: stringValue(form, 'utmContent'),
    mobileUrl: stringValue(form, 'mobileUrl'),
    desktopUrl: stringValue(form, 'desktopUrl'),
    abUrl: stringValue(form, 'abUrl'),
    abPercent: stringValue(form, 'abPercent'),
  };
}

export function deleteLinksMessage(
  result: DeleteLinksResult,
  {
    includePolicyDetails = true,
    text,
  }: { includePolicyDetails?: boolean; text: UiText['messages'] },
) {
  const details = [
    includePolicyDetails && result.tooManyClicks
      ? formatText(text.deleteExceededClickLimit, {
          count: result.tooManyClicks,
        })
      : '',
    includePolicyDetails && result.denied
      ? formatText(text.deleteDeniedCount, { count: result.denied })
      : '',
    includePolicyDetails && result.disabled
      ? formatText(text.deleteDisabledCount, { count: result.disabled })
      : '',
    result.notFound
      ? formatText(text.deleteNotFoundCount, { count: result.notFound })
      : '',
  ].filter(Boolean);

  return [
    result.deleted
      ? formatText(text.linksDeleted, { count: result.deleted })
      : '',
    details.length
      ? formatText(text.linksNotProcessed, { details: details.join(', ') })
      : '',
  ]
    .filter(Boolean)
    .join(' ');
}
