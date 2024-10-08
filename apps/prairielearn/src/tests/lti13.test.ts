import { assert } from 'chai';
import express from 'express';
import fetchCookie from 'fetch-cookie';
import getPort from 'get-port';
import * as jose from 'jose';
import { step } from 'mocha-steps';
import nodeJose from 'node-jose';
import { z } from 'zod';

import { queryAsync, queryOptionalRow } from '@prairielearn/postgres';

import { fetchRetry, fetchRetryPaginated, getAccessToken } from '../ee/lib/lti13.js';
import { config } from '../lib/config.js';
import { Lti13UserSchema } from '../lib/db-types.js';
import { selectUserByUid } from '../models/user.js';

import { fetchCheerio } from './helperClient.js';
import * as helperServer from './helperServer.js';

const CLIENT_ID = 'prairielearn_test_lms';

const siteUrl = 'http://localhost:' + config.serverPort;

async function withServer<T>(app: express.Express, port: number, fn: () => Promise<T>) {
  const server = app.listen(port);

  await new Promise<void>((resolve, reject) => {
    server.on('listening', () => resolve());
    server.on('error', (err) => reject(err));
  });

  try {
    return await fn();
  } finally {
    server.close();
  }
}

describe('LTI 1.3', () => {
  let oidcProviderPort: number;
  let keystore: nodeJose.JWK.KeyStore;

  before(async () => {
    config.isEnterprise = true;
    config.features.lti13 = true;
    await helperServer.before()();

    // We need to give the default institution a `uid_regexp`.
    await queryAsync("UPDATE institutions SET uid_regexp = '@example\\.com$'", {});

    // Allocate an available port for the OIDC provider.
    oidcProviderPort = await getPort();

    keystore = nodeJose.JWK.createKeyStore();
    await keystore.generate('RSA', 2048, {
      alg: 'RS256',
      use: 'sig',
      kid: 'test',
    });
  });

  after(async () => {
    helperServer.after();
    config.isEnterprise = false;
    config.features = {};
  });

  step('create an LTI instance', async () => {
    // Load the LTI admin page.
    const ltiInstancesResponse = await fetchCheerio(
      `${siteUrl}/pl/administrator/institution/1/lti13`,
    );
    assert.equal(ltiInstancesResponse.status, 200);

    const newInstanceButton = ltiInstancesResponse.$('button:contains(Add a new LTI 1.3 instance)');
    const newInstanceForm = newInstanceButton.closest('form');

    // Create a new LTI instance.
    const createInstanceResponse = await fetchCheerio(
      `${siteUrl}/pl/administrator/institution/1/lti13`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __csrf_token: newInstanceForm.find('input[name=__csrf_token]').val() as string,
          __action: newInstanceButton.attr('value') as string,
        }),
      },
    );
    assert.equal(createInstanceResponse.status, 200);

    // Let's see how far we can get without customizing anything in the instance...
  });

  step('configure an LTI instance', async () => {
    const ltiInstanceResponse = await fetchCheerio(
      `${siteUrl}/pl/administrator/institution/1/lti13/1`,
    );
    assert.equal(ltiInstanceResponse.status, 200);

    const savePlatformOptionsButton = ltiInstanceResponse.$(
      'button:contains(Save platform options)',
    );
    const platformOptionsForm = savePlatformOptionsButton.closest('form');

    // Update the platform options.
    const updatePlatformOptionsResponse = await fetchCheerio(
      `${siteUrl}/pl/administrator/institution/1/lti13/1`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __csrf_token: platformOptionsForm.find('input[name=__csrf_token]').val() as string,
          __action: platformOptionsForm.find('input[name=__action]').val() as string,
          platform: 'Unknown',
          issuer_params: JSON.stringify({
            issuer: `http://localhost:${oidcProviderPort}`,
            authorization_endpoint: `http://localhost:${oidcProviderPort}/auth`,
            jwks_uri: `http://localhost:${oidcProviderPort}/jwks`,
            token_endpoint: `http://localhost:${oidcProviderPort}/token`,
          }),
          custom_fields: '{}',
          client_id: CLIENT_ID,
        }),
      },
    );
    assert.equal(updatePlatformOptionsResponse.status, 200);

    const addKeyButton = updatePlatformOptionsResponse.$('button:contains(Add key to keystore)');
    const keystoreForm = addKeyButton.closest('form');

    // Create a key
    const createKeyResponse = await fetchCheerio(
      `${siteUrl}/pl/administrator/institution/1/lti13/1`,
      {
        method: 'POST',
        body: new URLSearchParams({
          __csrf_token: keystoreForm.find('input[name=__csrf_token]').val() as string,
          __action: addKeyButton.attr('value') as string,
        }),
      },
    );
    assert.equal(createKeyResponse.status, 200);
  });

  step('enable LTI 1.3 as an authentication provider', async () => {
    const ssoResponse = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/sso`);
    assert.equal(ssoResponse.status, 200);

    const saveButton = ssoResponse.$('button:contains(Save)');
    const form = saveButton.closest('form');
    const lti13Label = form.find('label:contains(LTI 1.3)');
    const lti13Input = lti13Label.closest('div').find('input');

    const enableLtiResponse = await fetchCheerio(`${siteUrl}/pl/administrator/institution/1/sso`, {
      method: 'POST',
      body: new URLSearchParams({
        __csrf_token: form.find('input[name=__csrf_token]').val() as string,
        __action: saveButton.attr('value') as string,
        enabled_authn_provider_ids: lti13Input.attr('value') as string,
      }),
    });
    assert.equal(enableLtiResponse.status, 200);
  });

  step('perform login', async () => {
    // `openid-client` relies on the session to store state, so we need to use
    // a cookie-aware version of fetch.
    const fetchWithCookies = fetchCookie(fetchCheerio);

    const startLoginResponse = await fetchWithCookies(`${siteUrl}/pl/lti13_instance/1/auth/login`, {
      method: 'POST',
      body: new URLSearchParams({
        iss: siteUrl,
        login_hint: 'fef15674-ae78-4763-b915-6fe3dbf42c67',
        target_link_uri: `${siteUrl}/pl/lti13_instance/1/course_navigation`,
      }),
      redirect: 'manual',
    });
    assert.equal(startLoginResponse.status, 302);

    const redirectUrl = new URL(startLoginResponse.headers.get('location') as string);
    assert.equal(redirectUrl.hostname, 'localhost');
    assert.equal(redirectUrl.pathname, '/auth');
    assert.equal(redirectUrl.searchParams.get('client_id'), CLIENT_ID);
    assert.equal(redirectUrl.searchParams.get('scope'), 'openid');
    assert.equal(redirectUrl.searchParams.get('response_type'), 'id_token');
    assert.equal(redirectUrl.searchParams.get('response_mode'), 'form_post');
    assert.equal(
      redirectUrl.searchParams.get('redirect_uri'),
      `${siteUrl}/pl/lti13_instance/1/auth/callback`,
    );
    assert.equal(
      redirectUrl.searchParams.get('login_hint'),
      'fef15674-ae78-4763-b915-6fe3dbf42c67',
    );
    assert.ok(redirectUrl.searchParams.get('nonce'));
    assert.ok(redirectUrl.searchParams.get('state'));

    const redirectUri = redirectUrl.searchParams.get('redirect_uri') as string;
    const nonce = redirectUrl.searchParams.get('nonce') as string;
    const state = redirectUrl.searchParams.get('state') as string;

    const key = keystore.get('test');
    const joseKey = await jose.importJWK(key.toJSON(true) as any);
    const fakeIdToken = await new jose.SignJWT({
      nonce,
      // The below values are based on data observed by Dave during an actual
      // login with Canvas.
      'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiResourceLinkRequest',
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id':
        '7fdce954-4c33-47c9-97b4-e435dbbed9bb',
      // This MUST match the value in the login request.
      'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': `${siteUrl}/pl/lti13_instance/1/course_navigation`,
      'https://purl.imsglobal.org/spec/lti/claim/resource_link': {
        id: 'f6bc7a50-448c-4469-94f7-54d6ea882c2a',
        title: 'Test Course',
      },
      'https://purl.imsglobal.org/spec/lti/claim/roles': [
        'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
        'http://purl.imsglobal.org/vocab/lis/v2/system/person#User',
      ],
      'https://purl.imsglobal.org/spec/lti/claim/context': {
        id: 'f6bc7a50-448c-4469-94f7-54d6ea882c2a',
        type: ['http://purl.imsglobal.org/vocab/lis/v2/course#CourseOffering'],
        label: 'TEST 101',
        title: 'Test Course',
      },
      name: 'Test User',
      email: 'test-user@example.com',
      'https://purl.imsglobal.org/spec/lti/claim/custom': {
        uin: '123456789',
      },
      'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
        scope: [
          'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
          'https://purl.imsglobal.org/spec/lti-ags/scope/score',
        ],
        errors: {
          errors: {},
        },
        lineitems: `https://localhost:${oidcProviderPort}/api/lti/courses/1/line_items`,
        validation_context: null,
      },
    })
      .setProtectedHeader({ alg: 'RS256' })
      .setIssuer(`http://localhost:${oidcProviderPort}`)
      .setIssuedAt()
      .setExpirationTime('1h')
      .setSubject('a555090c-8355-4b58-b315-247612cc22f0')
      .setAudience(CLIENT_ID)
      .sign(joseKey);

    // Run a server to respond to JWKS requests.
    const app = express();
    app.get('/jwks', (req, res) => {
      res.setHeader('Content-Type', 'application/json');
      // Pass `false` to `toJSON` to only include public keys.
      res.end(JSON.stringify(keystore.toJSON(false)));
    });

    const finishLoginResponse = await withServer(app, oidcProviderPort, async () => {
      return await fetchWithCookies(redirectUri, {
        method: 'POST',
        body: new URLSearchParams({
          nonce,
          state,
          id_token: fakeIdToken,
        }),
      });
    });

    assert.equal(finishLoginResponse.status, 200);
    // Inspect more into this response for output that is for Instructors vs for Students
    // Setup link to a course instance (database modification)
    // Confirm the redirect passes through to the course

    const repeatLoginTestNonce = await withServer(app, oidcProviderPort, async () => {
      return await fetchWithCookies(redirectUri, {
        method: 'POST',
        body: new URLSearchParams({
          nonce,
          state,
          id_token: fakeIdToken,
        }),
        redirect: 'manual',
      });
    });

    // This should fail for nonce reuse
    assert.equal(repeatLoginTestNonce.status, 500);
  });

  step('validate login', async () => {
    // There should be a new user.
    const user = await selectUserByUid('test-user@example.com');
    assert.ok(user);
    assert.equal(user?.uid, 'test-user@example.com');
    assert.equal(user?.name, 'Test User');
    assert.equal(user?.uin, '123456789');
    assert.equal(user?.institution_id, '1');

    // The new user should have an entry in `lti13_users`.
    const ltiUser = await queryOptionalRow(
      'SELECT * FROM lti13_users WHERE user_id = $user_id',
      {
        user_id: user?.user_id,
      },
      Lti13UserSchema,
    );
    assert.ok(ltiUser);
    assert.equal(ltiUser?.sub, 'a555090c-8355-4b58-b315-247612cc22f0');
    assert.equal(ltiUser?.lti13_instance_id, '1');
  });

  step('malformed requests fail', async () => {
    const fetchWithCookies = fetchCookie(fetchCheerio);

    // Malformed login
    const startBadLoginResponse = await fetchWithCookies(
      `${siteUrl}/pl/lti13_instance/1/auth/login`,
      {
        method: 'POST',
        body: new URLSearchParams({
          iss: siteUrl,
          // Missing required login_hint
          //login_hint: 'fef15674-ae78-4763-b915-6fe3dbf42c67',
          target_link_uri: `${siteUrl}/pl/lti13_instance/1/course_navigation`,
        }),
        redirect: 'manual',
      },
    );
    assert.equal(startBadLoginResponse.status, 500);

    // Successful login to test malformed response
    const startLoginResponse = await fetchWithCookies(`${siteUrl}/pl/lti13_instance/1/auth/login`, {
      method: 'POST',
      body: new URLSearchParams({
        iss: siteUrl,
        login_hint: 'fef15674-ae78-4763-b915-6fe3dbf42c67',
        target_link_uri: `${siteUrl}/pl/lti13_instance/1/course_navigation`,
      }),
      redirect: 'manual',
    });
    assert.equal(startLoginResponse.status, 302);

    const redirectUrl = new URL(startLoginResponse.headers.get('location') as string);

    assert.ok(redirectUrl.searchParams.get('state'));

    const redirectUri = redirectUrl.searchParams.get('redirect_uri') as string;
    const nonce = redirectUrl.searchParams.get('nonce') as string;

    // Not a real token, not running a JWKS server, so not a full test
    // Just making sure if state is missing that PL errors
    const finishBadLoginResponse = await fetchWithCookies(redirectUri, {
      method: 'POST',
      body: new URLSearchParams({
        nonce,
        // Missing state parameter
        //state,
        id_token: 'junkjunkjunk',
      }),
      redirect: 'manual',
    });

    assert.equal(finishBadLoginResponse.status, 500);
  });

  step('request access token', async () => {
    const ACCESS_TOKEN = '33679293-edd6-4415-af36-03113feb8447';

    // Run a server to respond to token requests.
    const app = express();
    app.use(express.urlencoded({ extended: true }));

    app.post('/token', async (req, res) => {
      assert.equal(req.body.grant_type, 'client_credentials');
      assert.equal(req.body.client_id, CLIENT_ID);
      assert.equal(
        req.body.client_assertion_type,
        'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      );

      // Decodes but does not validate
      const jwt = JSON.parse(
        Buffer.from(req.body.client_assertion.split('.')[1], 'base64').toString(),
      );
      assert.equal(jwt.iss, CLIENT_ID);
      assert.property(jwt, 'jti');

      res.send(
        JSON.stringify({
          access_token: ACCESS_TOKEN,
          stenotype: 'bearer',
          expires_in: 3600,
          scope: req.body.scope,
        }),
      );
    });

    await withServer(app, oidcProviderPort, async () => {
      const result = await getAccessToken('1');
      assert.equal(result, ACCESS_TOKEN);
    });
  });
});

describe('fetchRetry()', async () => {
  let apiProviderPort: number;
  const app = express();
  let baseUrl: string;

  let apiCount: number;

  // Thanks chatGPT
  const products = [
    'Apple',
    'Banana',
    'Cherry',
    'Date',
    'Eggplant',
    'Fig',
    'Grapes',
    'Honeydew',
    'Iceberg',
    'Jackfruit',
    'Kiwi',
    'Lemon',
    'Mango',
    'Nectarine',
    'Orange',
    'Papaya',
    'Quince',
    'Raspberry',
    'Strawberry',
    'Tomato',
    'Ugli fruit',
    'Vanilla',
    'Watermelon',
    'Xigua',
    'Yam',
    'Zucchini',
  ];

  const productApi = (req, res) => {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const totalPages = Math.ceil(products.length / limit);

    // Base URL for links
    const baseUrl = `${req.protocol}://${req.get('host')}${req.baseUrl}${req.path}`;

    // Generate Link Header
    const links: string[] = [];

    if (page < totalPages) {
      links.push(`<${baseUrl}?page=${page + 1}&limit=${limit}>; rel="next"`);
    }
    if (page > 1) {
      links.push(`<${baseUrl}?page=${page - 1}&limit=${limit}>; rel="prev"`);
    }
    links.push(`<${baseUrl}?page=1&limit=${limit}>; rel="first"`);
    links.push(`<${baseUrl}?page=${totalPages}&limit=${limit}>; rel="last"`);

    res.set('Link', links.join(', '));

    const returning = products.slice(startIndex, endIndex);
    res.json(returning);
  };

  function respond403(res) {
    console.warn('Throwing 403, attempt ' + apiCount);
    res.status(403).json([]);
  }

  before(async () => {
    apiProviderPort = await getPort();
    baseUrl = `http://localhost:${apiProviderPort}/`;
    // Run a server to respond to API requests.
    app.use(express.urlencoded({ extended: true }));

    app.use((req, res, next) => {
      apiCount++;
      next();
    });

    app.get('/403all', async (req, res) => {
      respond403(res);
    });

    app.get('/403oddAttempt', async (req, res) => {
      if (apiCount % 2 === 1) {
        respond403(res);
      } else {
        productApi(req, res);
      }
    });

    app.get('/', productApi);
  });

  step('should return the full list by iterating', async () => {
    apiCount = 0;
    await withServer(app, apiProviderPort, async () => {
      const resultArray = await fetchRetryPaginated(baseUrl, {}, { sleepMs: 100 });
      assert.equal(resultArray.length, 3);
      // Unwrap to one combined array
      const products = z.string().array().array().parse(resultArray);
      const fullList = products.flat();
      assert.equal(fullList.length, 26);
      assert.equal(apiCount, 3);
    });
  });

  step('should return the full list with a large limit', async () => {
    apiCount = 0;
    await withServer(app, apiProviderPort, async () => {
      const res = await fetchRetry(baseUrl + '?limit=100', {}, { sleepMs: 100 });
      const products = z
        .string()
        .array()
        .parse(await res.json());
      const fullList = products.flat();
      assert.equal(fullList.length, 26);
      assert.equal(apiCount, 1);
    });
  });

  step('should throw an error on all 403s', async () => {
    apiCount = 0;
    await withServer(app, apiProviderPort, async () => {
      await assert.isRejected(fetchRetry(baseUrl + '403all', {}, { sleepMs: 100 }), /fetch error/);
      assert.equal(apiCount, 5);
    });
  });

  step('should return the full list by iterating with intermittant 403s', async () => {
    apiCount = 0;
    await withServer(app, apiProviderPort, async () => {
      const resultArray = await fetchRetryPaginated(
        baseUrl + '403oddAttempt',
        {},
        { sleepMs: 100 },
      );
      assert.equal(resultArray.length, 3);
      const products = z.string().array().array().parse(resultArray);
      const fullList = products.flat();
      assert.equal(fullList.length, 26);
      assert.equal(apiCount, 6);
    });
  });
});
