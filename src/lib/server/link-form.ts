import { stringValue } from './settings';
import { formatText, type UiText } from '$lib/i18n/ui-text';
import type {
  DeleteLinksResult,
  LinkCodeSelection,
  LinkOperationsInput,
  LinkPreviewInput,
} from './shortener';

export function linkCodesFromForm(form: FormData) {
  const singleCode = stringValue(form, 'singleCode');
  if (singleCode) return [singleCode];
  return form
    .getAll('codes')
    .map((code) => String(code).trim())
    .filter(Boolean);
}

function parseLinkSelection(
  value: FormDataEntryValue,
): LinkCodeSelection | null {
  const raw = String(value);
  if (raw.includes('\t')) {
    const [domain, code] = raw.split('\t', 2);
    const normalizedCode = (code ?? '').trim();
    return normalizedCode
      ? { code: normalizedCode, domain: domain || undefined }
      : null;
  }
  const code = raw.trim();
  return code ? { code } : null;
}

export function linkSelectionsFromForm(form: FormData) {
  const single = form.get('singleLink');
  const values = single ? [single] : form.getAll('links');
  if (values.length > 0) {
    return values
      .map(parseLinkSelection)
      .filter((value): value is LinkCodeSelection => value !== null);
  }
  return linkCodesFromForm(form).map((code) => ({ code }));
}

export function linkPreviewFromForm(form: FormData): LinkPreviewInput {
  return {
    title: stringValue(form, 'previewTitle'),
    description: stringValue(form, 'previewDescription'),
    imageUrl: stringValue(form, 'previewImageUrl'),
    themeColor: stringValue(form, 'themeColor'),
  };
}

export function partialLinkPreviewFromForm(
  form: FormData,
): LinkPreviewInput | undefined {
  const preview: LinkPreviewInput = {};
  if (form.has('previewTitle'))
    preview.title = stringValue(form, 'previewTitle');
  if (form.has('previewDescription')) {
    preview.description = stringValue(form, 'previewDescription');
  }
  if (form.has('previewImageUrl')) {
    preview.imageUrl = stringValue(form, 'previewImageUrl');
  }
  if (form.has('themeColor'))
    preview.themeColor = stringValue(form, 'themeColor');

  return Object.keys(preview).length > 0 ? preview : undefined;
}

function expiresAtFromForm(form: FormData) {
  return stringValue(form, 'expiresAt');
}

export function linkOperationsFromForm(form: FormData): LinkOperationsInput {
  const operations: LinkOperationsInput = {
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
  };

  if (form.has('redirectRules')) {
    operations.redirectRules = stringValue(form, 'redirectRules');
  }

  return operations;
}

export function partialLinkOperationsFromForm(
  form: FormData,
): LinkOperationsInput | undefined {
  const operations: LinkOperationsInput = {};
  if (form.has('tags')) operations.tags = stringValue(form, 'tags');
  if (form.has('expiresAt')) operations.expiresAt = expiresAtFromForm(form);
  if (form.has('maxClicks')) {
    operations.maxClicks = stringValue(form, 'maxClicks');
  }
  if (form.has('password')) operations.password = stringValue(form, 'password');
  if (form.has('clearPassword')) {
    operations.clearPassword = form.get('clearPassword') === 'on';
  }
  if (form.has('utmSource'))
    operations.utmSource = stringValue(form, 'utmSource');
  if (form.has('utmMedium'))
    operations.utmMedium = stringValue(form, 'utmMedium');
  if (form.has('utmCampaign')) {
    operations.utmCampaign = stringValue(form, 'utmCampaign');
  }
  if (form.has('utmTerm')) operations.utmTerm = stringValue(form, 'utmTerm');
  if (form.has('utmContent')) {
    operations.utmContent = stringValue(form, 'utmContent');
  }
  if (form.has('redirectRules')) {
    operations.redirectRules = stringValue(form, 'redirectRules');
  }

  return Object.keys(operations).length > 0 ? operations : undefined;
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
