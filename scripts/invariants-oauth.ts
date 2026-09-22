import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { Cookies } from '@sveltejs/kit';
import type { PluginLocaleContext } from '$lib/plugin-contracts';
import { findIdentity } from '$lib/server/user-identities';
import {
  createLoginUrl,
  finishLogin,
  testProvider,
} from '$plugins/oidc-sso/auth';
import { normalizeOidcConfig } from '$plugins/oidc-sso/config';
import plugin from '$plugins/oidc-sso/plugin';

export async function checkOAuth() {
  const subject = randomUUID();
  const appOrigin = 'https://invariants.example.test';
  const context: PluginLocaleContext = {
    locale: 'en',
    fallbackLocale: 'en',
    strings: plugin.translations?.en?.strings ?? {},
  };
  const jar = new Map<string, string>();
  const cookies = {
    get(name: string) {
      return jar.get(name);
    },
    set(name: string, value: string) {
      jar.set(name, value);
    },
    delete(name: string) {
      jar.delete(name);
    },
  } as unknown as Cookies;
  const requests: Array<{
    path: string;
    method: string;
    body: URLSearchParams;
    authorization: string;
  }> = [];
  let origin = '';
  let includeAccessToken = true;
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const path = new URL(request.url ?? '/', origin).pathname;
    requests.push({
      path,
      method: request.method ?? '',
      body: new URLSearchParams(Buffer.concat(chunks).toString()),
      authorization: request.headers.authorization ?? '',
    });
    response.setHeader('content-type', 'application/json');
    if (path === '/metadata') {
      response.end(
        JSON.stringify({
          issuer: origin,
          authorization_endpoint: `${origin}/authorize`,
          token_endpoint: `${origin}/token`,
          userinfo_endpoint: `${origin}/userinfo`,
        }),
      );
    } else if (path === '/token') {
      response.end(
        JSON.stringify(
          includeAccessToken
            ? { access_token: 'fixture-token', token_type: 'Bearer' }
            : {
                sub: subject,
                email: `${subject}@example.test`,
                email_verified: true,
              },
        ),
      );
    } else if (path === '/userinfo') {
      response.end(
        JSON.stringify({
          profile: {
            id: subject,
            name: 'OAuth fixture',
            email: `${subject}@example.test`,
            verified: true,
          },
        }),
      );
    } else {
      response.writeHead(400);
      response.end(
        JSON.stringify({ error: 'Code exchange must use the token endpoint' }),
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  origin = `http://127.0.0.1:${address.port}`;
  try {
    const config = normalizeOidcConfig({
      providers: [
        {
          id: `fixture-${subject}`,
          name: 'OAuth fixture',
          flow: 'oauth',
          issuerUrl: '',
          clientId: 'fixture-client',
          clientAuthMethod: 'none',
          scopes: '',
          authorizationEndpoint: `${origin}/authorize`,
          tokenEndpoint: `${origin}/token`,
          userInfoEndpoint: `${origin}/userinfo`,
          subjectPath: 'profile.id',
          namePath: 'profile.name',
          emailPath: 'profile.email',
          emailVerifiedPath: 'profile.verified',
          emailTrustMode: 'verified-claim',
          tokenRequestBody: 'audience=account',
          authorizationHintParameter: 'login_hint',
          loginInputName: 'login_hint',
        },
      ],
    });
    const provider = config.providers[0];
    const loginUrl = await createLoginUrl(
      cookies,
      appOrigin,
      config,
      provider.id,
      '/account',
      context,
      new URLSearchParams({ login_hint: 'user@example.test' }),
    );
    assert.equal(loginUrl.pathname, '/authorize');
    assert.equal(loginUrl.searchParams.has('scope'), false);
    assert.equal(loginUrl.searchParams.get('login_hint'), 'user@example.test');
    const callback = new URL(
      `/auth/oidc-sso/callback?code=fixture-code&state=${encodeURIComponent(loginUrl.searchParams.get('state')!)}`,
      appOrigin,
    );
    assert.equal(
      await finishLogin(cookies, callback, config, context),
      '/account',
    );
    const tokenRequest = requests.find((request) => request.path === '/token');
    assert.ok(tokenRequest);
    assert.equal(tokenRequest.method, 'POST');
    assert.equal(tokenRequest.body.get('grant_type'), 'authorization_code');
    assert.equal(tokenRequest.body.get('client_id'), 'fixture-client');
    assert.equal(
      tokenRequest.body.get('redirect_uri'),
      `${appOrigin}/auth/oidc-sso/callback`,
    );
    assert.equal(tokenRequest.body.get('audience'), 'account');
    assert.ok(tokenRequest.body.get('code_verifier'));
    assert.equal(
      requests.some((request) => request.path === '/authorize'),
      false,
      'An empty scope must never send code exchange to authorization',
    );
    assert.equal(
      requests.find((request) => request.path === '/userinfo')?.authorization,
      'Bearer fixture-token',
    );
    assert.ok(
      await findIdentity(`oidc-sso:${provider.id}`, subject),
      'OAuth profile JSON mapping must retain account linking',
    );

    assert.equal(
      await testProvider(
        {
          ...provider,
          oauthMetadataSource: 'metadata-url',
          oauthMetadataUrl: `${origin}/metadata`,
          authorizationEndpoint: '',
          tokenEndpoint: '',
          userInfoEndpoint: '',
        },
        context,
      ),
      `${origin}/authorize`,
      'Explicit OAuth server metadata discovery remains supported',
    );
    await assert.rejects(
      createLoginUrl(
        cookies,
        appOrigin,
        { providers: [{ ...provider, tokenEndpoint: '' }] },
        provider.id,
        '/account',
        context,
      ),
      /token endpoint is missing/i,
    );

    includeAccessToken = false;
    const invalidLogin = await createLoginUrl(
      cookies,
      appOrigin,
      config,
      provider.id,
      '/account',
      context,
    );
    const invalidCallback = new URL(
      `/auth/oidc-sso/callback?code=fixture-code&state=${encodeURIComponent(invalidLogin.searchParams.get('state')!)}`,
      appOrigin,
    );
    await assert.rejects(
      finishLogin(cookies, invalidCallback, config, context),
      /token response is invalid/i,
    );
    assert.equal(
      requests.filter((request) => request.path === '/userinfo').length,
      1,
      'Identity-only token responses must fail before profile lookup',
    );
    const defaults = normalizeOidcConfig({
      providers: [
        {
          id: 'defaults',
          name: 'Defaults',
          issuerUrl: origin,
          clientId: 'client',
        },
      ],
    }).providers[0];
    assert.equal(defaults.flow, 'oidc');
    assert.equal(defaults.scopes, 'openid profile email');
    assert.equal(defaults.subjectPath, 'sub');
    console.log(
      'OAuth invariants: token-endpoint exchange with empty scope, PKCE, profile mapping, metadata discovery and access-token requirement passed',
    );
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((cause) => (cause ? reject(cause) : resolve())),
    );
  }
}
