import assert from 'node:assert/strict';
import {
  normalizeOidcConfig,
  parseTokenRequestBody,
} from '../src/plugins/oidc-sso/config.ts';

for (const flow of ['oidc', 'oauth']) {
  const provider = normalizeOidcConfig({
    providers: [
      {
        id: 'legacy',
        name: 'Legacy provider',
        flow,
        issuerUrl: 'https://example.test',
        clientId: 'client',
        authorizationRequestQuery: 'prompt=login',
        extraRequestQuery: 'legacy=value',
        extraRequestHeaders: 'Authorization | legacy',
        tokenRequestBody: 'audience=account',
      },
    ],
  }).providers[0];
  assert.equal(Object.hasOwn(provider, 'authorizationRequestQuery'), false);
  assert.equal(Object.hasOwn(provider, 'extraRequestQuery'), false);
  assert.equal(Object.hasOwn(provider, 'extraRequestHeaders'), false);
  assert.equal(provider.clientId, 'client');
  assert.equal(provider.flow, flow);
  assert.equal(
    parseTokenRequestBody(provider.tokenRequestBody, () => new Error()).get(
      'audience',
    ),
    'account',
  );
}

console.log(
  'OIDC/OAuth legacy request settings are discarded; token body retained.',
);
