import assert from 'node:assert/strict';
import {
  isPublicAddress,
  resolvePublicAddress,
} from '../src/lib/server/public-address.ts';
import {
  linkMatchesOwner,
  ownerWhere,
} from '../src/lib/server/link-ownership.ts';

for (const address of [
  '127.0.0.1',
  '10.0.0.1',
  '172.16.0.1',
  '192.168.1.1',
  '169.254.169.254',
  '100.64.0.1',
  '0.0.0.0',
  '224.0.0.1',
  '192.0.2.1',
  '::1',
  '::',
  'fc00::1',
  'fe80::1',
  '::ffff:127.0.0.1',
  '::ffff:169.254.169.254',
  '2001:db8::1',
  '64:ff9b::7f00:1',
]) {
  assert.equal(
    isPublicAddress(address),
    false,
    `${address} must not be fetched`,
  );
}
for (const address of [
  '8.8.8.8',
  '1.1.1.1',
  '2606:4700:4700::1111',
  '::ffff:8.8.8.8',
]) {
  assert.equal(isPublicAddress(address), true, `${address} is public`);
}
for (const url of [
  'http://127.1',
  'http://2130706433',
  'http://0x7f000001',
  'http://[::ffff:127.0.0.1]',
  'file:///etc/passwd',
  'https://user:password@8.8.8.8',
]) {
  await assert.rejects(resolvePublicAddress(new URL(url)), undefined, url);
}
assert.equal(await resolvePublicAddress(new URL('https://8.8.8.8')), '8.8.8.8');

const anonymousLink = {
  creatorUserId: null,
  creatorSessionId: 'owner-session',
};
const accountLink = { creatorUserId: 7, creatorSessionId: 'owner-session' };
assert.equal(
  linkMatchesOwner(anonymousLink, {
    sessionId: 'other-session',
    ipHash: 'same-ip',
  }),
  false,
);
assert.equal(linkMatchesOwner(anonymousLink, { ipHash: 'same-ip' }), false);
assert.equal(
  linkMatchesOwner(anonymousLink, { sessionId: 'owner-session' }),
  true,
);
assert.equal(
  linkMatchesOwner(accountLink, { sessionId: 'owner-session' }),
  false,
);
assert.equal(linkMatchesOwner(accountLink, { userId: 7 }), true);
assert.equal(
  linkMatchesOwner(accountLink, { userId: 8, sessionId: 'owner-session' }),
  false,
);
assert.deepEqual(ownerWhere({ ipHash: 'same-ip' }), { id: -1 });
assert.deepEqual(ownerWhere({ sessionId: 'owner-session' }), {
  creatorUserId: null,
  creatorSessionId: 'owner-session',
});
console.log('Public-address and link-ownership regression checks passed.');
