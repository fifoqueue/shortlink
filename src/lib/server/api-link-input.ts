export function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function scalarValue(value: unknown) {
  if (value === undefined || value === null) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  return '';
}

function isScalarInput(value: unknown) {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  );
}

function setFirstScalar(form: FormData, name: string, values: unknown[]) {
  if (form.has(name)) return;
  const value = values.find((item) => item !== undefined);
  if (value !== undefined) form.set(name, scalarValue(value));
}

export function formDataFromJson(body: Record<string, unknown>) {
  const form = new FormData();

  for (const [key, value] of Object.entries(body)) {
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (isScalarInput(item)) form.append(key, scalarValue(item));
      });
      continue;
    }

    if (!isScalarInput(value)) continue;
    form.append(key, scalarValue(value));
  }

  if (body.clearPassword === true) form.set('clearPassword', 'on');

  const preview = recordValue(body.preview);
  setFirstScalar(form, 'previewTitle', [body.previewTitle, preview.title]);
  setFirstScalar(form, 'previewDescription', [
    body.previewDescription,
    preview.description,
  ]);
  setFirstScalar(form, 'previewImageUrl', [
    body.previewImageUrl,
    preview.imageUrl,
  ]);
  setFirstScalar(form, 'themeColor', [body.themeColor, preview.themeColor]);

  const routing = recordValue(body.routing);
  const redirectRules = body.redirectRules ?? routing.redirectRules;
  if (redirectRules !== undefined && !form.has('redirectRules')) {
    form.set(
      'redirectRules',
      Array.isArray(redirectRules)
        ? JSON.stringify(redirectRules)
        : scalarValue(redirectRules),
    );
  }

  return form;
}
