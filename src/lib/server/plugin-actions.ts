export function pluginActionName(form: FormData, field = 'pluginAction') {
  const submitterValue = form.get(`${field}Submit`);
  if (typeof submitterValue === 'string' && submitterValue.trim()) {
    return submitterValue.trim();
  }

  const values = form
    .getAll(field)
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean);
  return values.length ? values[values.length - 1] : '';
}
