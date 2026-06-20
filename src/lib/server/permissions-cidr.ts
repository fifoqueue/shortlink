import { isIP } from 'node:net';
import { serverMessage } from '$lib/i18n/ui-text';

export interface NormalizedCidr {
  cidr: string;
  family: number;
  startHex: string;
  endHex: string;
}

function parseIpv4ToBigInt(value: string) {
  if (isIP(value) !== 4) return null;
  const parts = value.split('.').map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts.reduce((result, part) => (result << 8n) + BigInt(part), 0n);
}

function ipv4FromBigInt(value: bigint) {
  return [24n, 16n, 8n, 0n]
    .map((shift) => Number((value >> shift) & 255n))
    .join('.');
}

function ipv6InputToHextets(value: string) {
  let normalized = value.toLowerCase();
  const embeddedIpv4 = /(^|:)(\d{1,3}(?:\.\d{1,3}){3})$/.exec(normalized);
  if (embeddedIpv4) {
    const ipv4 = parseIpv4ToBigInt(embeddedIpv4[2]);
    if (ipv4 === null) return null;
    const high = Number((ipv4 >> 16n) & 0xffffn).toString(16);
    const low = Number(ipv4 & 0xffffn).toString(16);
    normalized = `${normalized.slice(0, embeddedIpv4.index + embeddedIpv4[1].length)}${high}:${low}`;
  }

  const doubleColonParts = normalized.split('::');
  if (doubleColonParts.length > 2) return null;

  const left = doubleColonParts[0]
    ? doubleColonParts[0].split(':').filter(Boolean)
    : [];
  const right = doubleColonParts[1]
    ? doubleColonParts[1].split(':').filter(Boolean)
    : [];
  const missing = 8 - left.length - right.length;
  if (doubleColonParts.length === 1 && missing !== 0) return null;
  if (doubleColonParts.length === 2 && missing < 1) return null;

  const hextets = [...left, ...Array(Math.max(0, missing)).fill('0'), ...right];
  if (
    hextets.length !== 8 ||
    hextets.some((part) => !/^[0-9a-f]{1,4}$/.test(part))
  ) {
    return null;
  }
  return hextets.map((part) => Number.parseInt(part, 16));
}

function parseIpv6ToBigInt(value: string) {
  if (isIP(value) !== 6) return null;
  const hextets = ipv6InputToHextets(value);
  if (!hextets) return null;
  return hextets.reduce((result, part) => (result << 16n) + BigInt(part), 0n);
}

function ipv6FromBigInt(value: bigint) {
  const hextets = Array.from({ length: 8 }, (_, index) =>
    Number((value >> BigInt((7 - index) * 16)) & 0xffffn).toString(16),
  );
  let bestStart = -1;
  let bestLength = 0;
  for (let index = 0; index < hextets.length; index += 1) {
    if (hextets[index] !== '0') continue;
    let end = index;
    while (end < hextets.length && hextets[end] === '0') end += 1;
    const length = end - index;
    if (length > bestLength && length >= 2) {
      bestStart = index;
      bestLength = length;
    }
    index = end - 1;
  }
  if (bestStart === -1) return hextets.join(':');

  const before = hextets.slice(0, bestStart).join(':');
  const after = hextets.slice(bestStart + bestLength).join(':');
  if (!before && !after) return '::';
  if (!before) return `::${after}`;
  if (!after) return `${before}::`;
  return `${before}::${after}`;
}

function hexAddress(value: bigint, family: number) {
  return value.toString(16).padStart(family === 4 ? 8 : 32, '0');
}

function cidrBounds(address: bigint, family: number, prefix: number) {
  const bits = BigInt(family === 4 ? 32 : 128);
  const hostBits = bits - BigInt(prefix);
  const addressSpace = 1n << bits;
  const fullMask = addressSpace - 1n;
  const networkMask = prefix === 0 ? 0n : (fullMask << hostBits) & fullMask;
  const start = address & networkMask;
  const end = start | (fullMask ^ networkMask);
  return { start, end };
}

export function parseCidr(value: string): NormalizedCidr {
  const normalized = value.trim().toLowerCase();
  const match = /^(.+)\/(\d{1,3})$/.exec(normalized);
  if (!match) {
    throw new Error(serverMessage('ipRuleCidrRequired', { value }));
  }

  const addressText = match[1];
  const prefix = Number(match[2]);
  const family = isIP(addressText);
  if (family !== 4 && family !== 6) {
    throw new Error(serverMessage('ipRuleInvalidAddress', { value }));
  }
  const maxPrefix = family === 4 ? 32 : 128;
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > maxPrefix) {
    throw new Error(
      serverMessage('ipRuleInvalidPrefix', { value, max: maxPrefix }),
    );
  }

  const address =
    family === 4
      ? parseIpv4ToBigInt(addressText)
      : parseIpv6ToBigInt(addressText);
  if (address === null) {
    throw new Error(serverMessage('ipRuleParseFailed', { value }));
  }

  const { start, end } = cidrBounds(address, family, prefix);
  const canonicalAddress =
    family === 4 ? ipv4FromBigInt(start) : ipv6FromBigInt(start);
  return {
    cidr: `${canonicalAddress}/${prefix}`,
    family,
    startHex: hexAddress(start, family),
    endHex: hexAddress(end, family),
  };
}

function ipAddressForMatch(value: string) {
  const normalized = value.trim().toLowerCase();
  const family = isIP(normalized);
  if (family === 4) {
    const address = parseIpv4ToBigInt(normalized);
    return address === null ? null : { family, address };
  }
  if (family === 6) {
    const address = parseIpv6ToBigInt(normalized);
    return address === null ? null : { family, address };
  }
  return null;
}

export function ipMatchesCidr(ip: string, rule: string) {
  const address = ipAddressForMatch(ip);
  if (!address) return false;
  let cidr: NormalizedCidr;
  try {
    cidr = parseCidr(rule);
  } catch {
    return false;
  }
  if (address.family !== cidr.family) return false;
  const start = BigInt(`0x${cidr.startHex}`);
  const end = BigInt(`0x${cidr.endHex}`);
  return address.address >= start && address.address <= end;
}
