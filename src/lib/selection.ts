export function selectedAllowedCount(selected: string[], allowed: string[]) {
  const allowedSet = new Set(allowed);
  return selected.filter((item) => allowedSet.has(item)).length;
}

export function allAllowedSelected(selected: string[], allowed: string[]) {
  return allowed.length > 0 && allowed.every((item) => selected.includes(item));
}

export function reconcileSelection(selected: string[], allowed: string[]) {
  const allowedSet = new Set(allowed);
  return selected.filter((item) => allowedSet.has(item));
}

export function toggleSelection(
  selected: string[],
  value: string,
  checked: boolean,
) {
  return checked
    ? [...new Set([...selected, value])]
    : selected.filter((item) => item !== value);
}

export function selectAll(allowed: string[], checked: boolean) {
  return checked ? [...allowed] : [];
}
