import { assert, describe, it } from 'vitest';

import { resolveSamlAttributes } from './router.js';

function makeProvider(
  overrides: Partial<Parameters<typeof resolveSamlAttributes>[0]> = {},
): Parameters<typeof resolveSamlAttributes>[0] {
  return {
    uid_attribute: null,
    uin_attribute: null,
    name_attribute: null,
    given_name_attribute: null,
    family_name_attribute: null,
    email_attribute: null,
    ...overrides,
  };
}

describe('resolveSamlAttributes', () => {
  describe('name resolution', () => {
    it('uses name_attribute when only it is configured', () => {
      const result = resolveSamlAttributes(makeProvider({ name_attribute: 'displayName' }), {
        displayName: 'Joe Smith',
      });
      assert.equal(result.name, 'Joe Smith');
      assert.isNull(result.givenName);
      assert.isNull(result.familyName);
      assert.isTrue(result.hasNameMapping);
    });

    it('uses given + family name when both are configured and present', () => {
      const result = resolveSamlAttributes(
        makeProvider({ given_name_attribute: 'givenName', family_name_attribute: 'sn' }),
        { givenName: 'Joe', sn: 'Smith' },
      );
      assert.equal(result.name, 'Joe Smith');
      assert.equal(result.givenName, 'Joe');
      assert.equal(result.familyName, 'Smith');
      assert.isTrue(result.hasNameMapping);
    });

    it('given + family take precedence over name_attribute', () => {
      const result = resolveSamlAttributes(
        makeProvider({
          name_attribute: 'displayName',
          given_name_attribute: 'givenName',
          family_name_attribute: 'sn',
        }),
        { displayName: 'Smith, Joe', givenName: 'Joe', sn: 'Smith' },
      );
      assert.equal(result.name, 'Joe Smith');
    });

    it('falls back to name_attribute when given name value is missing', () => {
      const result = resolveSamlAttributes(
        makeProvider({
          name_attribute: 'displayName',
          given_name_attribute: 'givenName',
          family_name_attribute: 'sn',
        }),
        { displayName: 'Joe Smith', sn: 'Smith' },
      );
      assert.equal(result.name, 'Joe Smith');
      assert.isNull(result.givenName);
      assert.equal(result.familyName, 'Smith');
    });

    it('falls back to name_attribute when family name value is missing', () => {
      const result = resolveSamlAttributes(
        makeProvider({
          name_attribute: 'displayName',
          given_name_attribute: 'givenName',
          family_name_attribute: 'sn',
        }),
        { displayName: 'Joe Smith', givenName: 'Joe' },
      );
      assert.equal(result.name, 'Joe Smith');
      assert.equal(result.givenName, 'Joe');
      assert.isNull(result.familyName);
    });

    it('returns null when only split name is configured but values are missing', () => {
      const result = resolveSamlAttributes(
        makeProvider({ given_name_attribute: 'givenName', family_name_attribute: 'sn' }),
        {},
      );
      assert.isNull(result.name);
      assert.isTrue(result.hasNameMapping);
    });

    it('returns null when no name mapping is configured', () => {
      const result = resolveSamlAttributes(makeProvider(), { displayName: 'Joe Smith' });
      assert.isNull(result.name);
      assert.isFalse(result.hasNameMapping);
    });

    it('reports no name mapping when only one of given/family is configured', () => {
      const result = resolveSamlAttributes(makeProvider({ given_name_attribute: 'givenName' }), {
        givenName: 'Joe',
      });
      assert.isNull(result.name);
      assert.isFalse(result.hasNameMapping);
    });
  });

  describe('empty string normalization', () => {
    it('treats empty attribute values as null', () => {
      const result = resolveSamlAttributes(
        makeProvider({
          uid_attribute: 'uid',
          uin_attribute: 'uin',
          name_attribute: 'displayName',
          email_attribute: 'mail',
        }),
        { uid: '', uin: '', displayName: '', mail: '' },
      );
      assert.isNull(result.uid);
      assert.isNull(result.uin);
      assert.isNull(result.name);
      assert.isNull(result.email);
    });

    it('treats whitespace-only attribute values as null', () => {
      const result = resolveSamlAttributes(
        makeProvider({ given_name_attribute: 'givenName', family_name_attribute: 'sn' }),
        { givenName: '   ', sn: '   ' },
      );
      assert.isNull(result.givenName);
      assert.isNull(result.familyName);
      assert.isNull(result.name);
    });
  });

  describe('whitespace trimming', () => {
    it('trims whitespace from all attribute values', () => {
      const result = resolveSamlAttributes(
        makeProvider({
          uid_attribute: 'uid',
          uin_attribute: 'uin',
          name_attribute: 'displayName',
          email_attribute: 'mail',
        }),
        {
          uid: '  jsmith@example.com  ',
          uin: ' 12345 ',
          displayName: ' Joe Smith ',
          mail: ' joe@example.com ',
        },
      );
      assert.equal(result.uid, 'jsmith@example.com');
      assert.equal(result.uin, '12345');
      assert.equal(result.name, 'Joe Smith');
      assert.equal(result.email, 'joe@example.com');
    });

    it('trims whitespace from given and family name values', () => {
      const result = resolveSamlAttributes(
        makeProvider({ given_name_attribute: 'givenName', family_name_attribute: 'sn' }),
        { givenName: ' Joe ', sn: ' Smith ' },
      );
      assert.equal(result.name, 'Joe Smith');
      assert.equal(result.givenName, 'Joe');
      assert.equal(result.familyName, 'Smith');
    });
  });

  describe('uid, uin, and email resolution', () => {
    it('resolves all standard attributes', () => {
      const result = resolveSamlAttributes(
        makeProvider({
          uid_attribute: 'eppn',
          uin_attribute: 'studentId',
          name_attribute: 'displayName',
          email_attribute: 'mail',
        }),
        {
          eppn: 'jsmith@example.com',
          studentId: '12345',
          displayName: 'Joe Smith',
          mail: 'joe@example.com',
        },
      );
      assert.equal(result.uid, 'jsmith@example.com');
      assert.equal(result.uin, '12345');
      assert.equal(result.name, 'Joe Smith');
      assert.equal(result.email, 'joe@example.com');
    });

    it('returns null for unconfigured attributes', () => {
      const result = resolveSamlAttributes(makeProvider(), {});
      assert.isNull(result.uid);
      assert.isNull(result.uin);
      assert.isNull(result.name);
      assert.isNull(result.email);
    });

    it('returns null when configured attribute is missing from response', () => {
      const result = resolveSamlAttributes(
        makeProvider({ uid_attribute: 'eppn', email_attribute: 'mail' }),
        {},
      );
      assert.isNull(result.uid);
      assert.isNull(result.email);
    });
  });
});
