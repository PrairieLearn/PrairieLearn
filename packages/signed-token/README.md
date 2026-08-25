# `@prairielearn/signed-token`

A package for generating signed tokens. Useful for CSRF tokens or generally to round-trip trusted data through an untrusted client.

## Usage

```ts
import {
  checkSignedToken,
  checkSignedTokenPrefix,
  generatePrefixCsrfToken,
  generateSignedToken,
  getCheckedSignedTokenData,
} from '@prairielearn/signed-token';

const token = generateSignedToken({ foo: 'bar' }, 'SECRET_KEY');

console.log(getCheckedSignedTokenData(token, 'SECRET_KEY', { maxAge: 60 * 1000 }));
// { foo: 'bar' }

console.log(checkSignedToken(token, { foo: 'bar' }, 'SECRET_KEY', { maxAge: 60 * 1000 }));
// true

console.log(checkSignedToken(token, { foo: 'baz' }, 'SECRET_KEY', { maxAge: 60 * 1000 }));
// false
```

The key argument can also be an ordered, nonempty array. New tokens are always signed with the first key, while verification accepts a signature from any configured key. This supports rotation without invalidating tokens that were signed before a key change:

```ts
const oldToken = generateSignedToken({ foo: 'bar' }, 'OLD_SECRET_KEY');
const token = generateSignedToken({ foo: 'bar' }, ['NEW_SECRET_KEY', 'OLD_SECRET_KEY']);

console.log(checkSignedToken(token, { foo: 'bar' }, 'NEW_SECRET_KEY'));
// true

console.log(getCheckedSignedTokenData(oldToken, ['NEW_SECRET_KEY', 'OLD_SECRET_KEY']));
// { foo: 'bar' }
```

Prefix-based CSRF tokens allow a token to cover a URL and all of its sub-routes. Any additional
properties are treated as claims and must match exactly during validation. At least one defined
claim is required, and the internal `type` property is reserved:

```ts
const token = generatePrefixCsrfToken({ url: '/api/trpc', user_id: '123' }, 'SECRET_KEY');

console.log(
  checkSignedTokenPrefix(token, { url: '/api/trpc/users.list', user_id: '123' }, 'SECRET_KEY'),
);
// true
```
