import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as assets from '../../lib/assets.js';
import { withConfig } from '../../tests/utils/config.js';

import { AuthLoginInstitution } from './authLogin.html.js';

describe('authLogin', () => {
  // Bare minimum to be able to render the page programmatically.
  beforeAll(() => assets.init());
  afterAll(() => assets.close());

  describe('service-specific login', () => {
    it('renders login page with service query parameter', () => {
      const html = AuthLoginInstitution({
        showUnsupportedMessage: false,
        supportedProviders: [{ name: 'SAML', is_default: true }],
        institutionId: '1',
        service: 'PrairieTest',
        resLocals: {},
      });

      assert.include(html, 'Sign in to continue to PrairieTest');
    });
  });

  describe('institution-specific login', () => {
    it('renders institution login page with supported providers', async () => {
      const html = await withConfig({ hasOauth: true, hasAzure: true, isEnterprise: true }, () =>
        AuthLoginInstitution({
          showUnsupportedMessage: false,
          supportedProviders: [
            { name: 'SAML', is_default: true },
            { name: 'Google', is_default: false },
            { name: 'Azure', is_default: false },
          ],
          institutionId: '1',
          service: null,
          resLocals: {},
        }),
      );

      assert.include(html, 'Sign in with institution single sign-on');
      assert.include(html, 'Sign in with Google');
      assert.include(html, 'Sign in with Microsoft');
    });

    it('handles supported non-LTI providers with only default', () => {
      const html = AuthLoginInstitution({
        showUnsupportedMessage: false,
        supportedProviders: [{ name: 'SAML', is_default: true }],
        institutionId: '1',
        service: null,
        resLocals: {},
      });

      // If just a single option is shown, we don't need the labels for preferred and other providers.
      assert.notInclude(html, 'Preferred method');
      assert.notInclude(html, 'Other methods');
    });

    it('handles supported non-LTI providers with multiple options', async () => {
      const html = await withConfig({ hasOauth: true }, () =>
        AuthLoginInstitution({
          showUnsupportedMessage: false,
          supportedProviders: [
            { name: 'SAML', is_default: true },
            { name: 'Google', is_default: false },
          ],
          institutionId: '1',
          service: null,
          resLocals: {},
        }),
      );

      assert.include(html, 'Preferred method');
      assert.include(html, 'Other methods');
    });

    it('renders alert when there are no supported providers', async () => {
      const html = await withConfig({ hasOauth: false, hasAzure: false }, () =>
        AuthLoginInstitution({
          showUnsupportedMessage: false,
          supportedProviders: [],
          institutionId: '1',
          service: null,
          resLocals: {},
        }),
      );

      assert.include(html, 'No authentication methods found.');
    });

    it('renders alert when supported providers are not enabled', async () => {
      const html = await withConfig({ hasOauth: false, hasAzure: false }, () =>
        AuthLoginInstitution({
          showUnsupportedMessage: false,
          supportedProviders: [
            { name: 'Google', is_default: false },
            { name: 'Azure', is_default: false },
          ],
          institutionId: '1',
          service: null,
          resLocals: {},
        }),
      );

      assert.include(html, 'No authentication methods found.');
    });

    it('renders alert when only LTI providers are available', async () => {
      const html = await withConfig({ hasOauth: false, hasAzure: false }, () =>
        AuthLoginInstitution({
          showUnsupportedMessage: false,
          supportedProviders: [
            { name: 'LTI', is_default: true },
            { name: 'LTI 1.3', is_default: false },
          ],
          institutionId: '1',
          service: null,
          resLocals: {},
        }),
      );

      assert.include(
        html,
        "You must start a session from your course's Learning Management System (LMS).",
      );
    });
  });

  describe('unsupported provider message', () => {
    it('handles no supported providers', () => {
      const html = AuthLoginInstitution({
        showUnsupportedMessage: true,
        supportedProviders: [],
        institutionId: '1',
        service: null,
        resLocals: {},
      });

      assert.include(
        html,
        'The authentication method you tried to use is not supported by your institution.',
      );
      assert.include(html, 'Contact your institution for more information.');
    });

    it('handles LTI providers', () => {
      const html = AuthLoginInstitution({
        showUnsupportedMessage: true,
        supportedProviders: [
          { name: 'LTI', is_default: true },
          { name: 'LTI 1.3', is_default: false },
        ],
        institutionId: '1',
        service: null,
        resLocals: {},
      });

      assert.include(
        html,
        'The authentication method you tried to use is not supported by your institution.',
      );
      // This uses `assert.match(...)` to avoid the need to handle HTML escaping.
      assert.match(
        html,
        /You must start a session from your course.*s Learning Management System \(LMS\)\./,
      );
    });

    it('does not render unsupported provider message if not shown', () => {
      const html = AuthLoginInstitution({
        showUnsupportedMessage: false,
        supportedProviders: [{ name: 'SAML', is_default: true }],
        institutionId: '1',
        service: null,
        resLocals: {},
      });

      assert.notInclude(
        html,
        'The authentication method you tried to use is not supported by your institution.',
      );
    });
  });
});
