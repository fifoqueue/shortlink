import { lookup } from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export function isPublicAddress(address: string) {
  try {
    // process() normalizes IPv4-mapped IPv6 before checking reserved ranges.
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

export async function resolvePublicAddress(url: URL) {
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error('Only public HTTP and HTTPS addresses can be checked.');
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = ipaddr.isValid(hostname)
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !isPublicAddress(address))
  ) {
    throw new Error(
      'Private and reserved network addresses cannot be checked.',
    );
  }
  return addresses[0].address;
}
