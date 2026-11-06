import { assert, describe, it } from 'vitest';

import { encodeOAuth1Component, generateOAuth1Signature } from './oauth1.js';

// Expected outputs were captured from oauth-signature@1.5.0 (CryptoJS 3.1.9-1).
// Keep them independent of the replacement implementation.

describe('encodeOAuth1Component', () => {
  it.each([
    ['', ''],
    ['abcXYZ09-._~', 'abcXYZ09-._~'],
    ['hello world', 'hello%20world'],
    ["!'()*", '%21%27%28%29%2A'],
    ['%/+=&?#[]', '%25%2F%2B%3D%26%3F%23%5B%5D'],
    ['é', '%C3%A9'],
    ['你好', '%E4%BD%A0%E5%A5%BD'],
    ['👩‍💻', '%F0%9F%91%A9%E2%80%8D%F0%9F%92%BB'],
    ['e\u0301', 'e%CC%81'],
    ['\r\n\t', '%0D%0A%09'],
  ])('encodes %j', (input, expected) => {
    assert.equal(encodeOAuth1Component(input), expected);
  });
});

describe('generateOAuth1Signature', () => {
  it('preserves LTI launch signatures', () => {
    const signature = generateOAuth1Signature({
      method: 'POST',
      url: 'https://pl.example.com/pl/lti',
      parameters: {
        lti_message_type: 'basic-lti-launch-request',
        lti_version: 'LTI-1p0',
        resource_link_id: 'resource',
        oauth_consumer_key: 'course key',
        oauth_timestamp: '1793740000',
        oauth_nonce: 'fixednonce',
        user_id: 'learner',
        lis_person_name_full: 'Learner Name',
      },
      consumerSecret: 'shared secret',
    });

    assert.equal(signature, 'ZTlQK1dO3tgjaOUGjmcyxsS53ow=');
  });

  it('preserves outcome signatures with body hashes and escaped consumer secrets', () => {
    const signature = generateOAuth1Signature({
      method: 'POST',
      url: 'https://lms.example.com/lti/outcomes',
      parameters: {
        oauth_consumer_key: 'course key',
        oauth_version: '1.0',
        oauth_timestamp: '1793740000',
        oauth_nonce: 'fixednonce',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_body_hash: 'UyL3JhUgDmlEV/+Cwth803Z0WRM=',
      },
      consumerSecret: 'sëcret &/+=%',
    });

    assert.equal(signature, 'VBZ2DZxx9uZsF7l1qvlsAr6RgWg=');
  });

  it('signs the RFC 5849 example parameters with consumer-only credentials', () => {
    const signature = generateOAuth1Signature({
      method: 'POST',
      url: 'http://example.com/request',
      parameters: {
        b5: '=%3D',
        a3: ['a', '2 q'],
        'c@': '',
        a2: 'r b',
        c2: '',
        oauth_consumer_key: '9djdj82h48djs9d2',
        oauth_token: 'kkk9d7dh3k39sjv7',
        oauth_signature_method: 'HMAC-SHA1',
        oauth_timestamp: '137131201',
        oauth_nonce: '7d8f3e4a',
      },
      consumerSecret: 'j49sk3j29djd',
    });

    assert.equal(signature, 'Cz2XkNrhhu/mc60P6A1OxO2z6IM=');
  });

  it('preserves normalization of repeated and empty parameters', () => {
    const signature = generateOAuth1Signature({
      method: 'POST',
      url: 'https://example.com/lti',
      parameters: { a: ['z', 'é', '~', ''], a0: '!*', empty: [] },
      consumerSecret: 'secret',
    });

    assert.equal(signature, '6wfrDOT/jAZ6gKIzlPywbr3LPIQ=');
  });

  it.each([
    { url: 'https://example.com', expected: 'vDQO8LqERJLSSHQUVLr6g4WGOas=' },
    { url: 'https://example.com/', expected: 'RsSjVO07K2DJuliW/gJmLM2ti3s=' },
    { url: 'https://EXAMPLE.com:443/', expected: 'vDQO8LqERJLSSHQUVLr6g4WGOas=' },
    {
      url: 'https://example.com/lti?ignored=value#fragment',
      expected: '8wE680WVeroDSoJP8fhJ/BYD1Uw=',
    },
    {
      url: 'https://example.com:8443/a/../lti',
      expected: 'kuCshcg6fLshOWQsu1ric0KOiQ0=',
    },
    {
      url: 'https://example.com/%7euser/%41%2f',
      expected: 'h66aGDEa3yWHAVFoTU3syQOv2Uo=',
    },
  ])('preserves URL normalization for $url', ({ url, expected }) => {
    const signature = generateOAuth1Signature({
      method: 'POST',
      url,
      parameters: { a: 'value' },
      consumerSecret: 'secret',
    });

    assert.equal(signature, expected);
  });
});
