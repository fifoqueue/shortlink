import { isIP } from 'node:net';

function cleanIp(value: string) {
  const ip = value.trim().replace(/^"|"$/g, '');
  return ip.startsWith('::ffff:') ? ip.slice(7) : ip;
}

function normalizeIp(value: string) {
  const ip = cleanIp(value);
  if (isIP(ip)) return ip;

  if (ip.startsWith('[')) {
    const end = ip.indexOf(']');
    const bracketed = end >= 0 ? ip.slice(1, end) : '';
    return isIP(bracketed) ? bracketed : '';
  }

  const ipv4WithPort = ip.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::\d+)?$/);
  if (ipv4WithPort && isIP(ipv4WithPort[1])) return ipv4WithPort[1];

  return '';
}

function forwardedForIp(value: string) {
  for (const part of value.split(';')) {
    const [name, raw] = part.split('=');
    if (name?.trim().toLowerCase() !== 'for') continue;
    const ip = normalizeIp(raw ?? '');
    if (ip) return ip;
  }
  return '';
}

function proxyHeaderIp(headers: Headers, proxyIpHeaders: string[]) {
  for (const header of proxyIpHeaders) {
    const value = headers.get(header);
    if (!value) continue;

    if (header.toLowerCase() === 'forwarded') {
      for (const entry of value.split(',')) {
        const ip = forwardedForIp(entry);
        if (ip) return ip;
      }
      continue;
    }

    for (const entry of value.split(',')) {
      const ip = normalizeIp(entry);
      if (ip) return ip;
    }
  }

  return '';
}

export function getClientIp(
  request: Request,
  getClientAddress: () => string,
  trustProxyHeaders: boolean,
  proxyIpHeaders: string[],
) {
  const directIp = normalizeIp(getClientAddress()) || getClientAddress();
  if (!trustProxyHeaders) return directIp;
  return proxyHeaderIp(request.headers, proxyIpHeaders) || directIp;
}
