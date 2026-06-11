import { env } from '$env/dynamic/private';

export function baseUrl(origin: string) {
  return (env.PRIVATE_BASE_URL || origin).replace(/\/$/, '');
}

export function shortUrl(origin: string, code: string) {
  return `${baseUrl(origin)}/${code}`;
}
