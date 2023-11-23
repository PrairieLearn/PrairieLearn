# `@prairielearn/signed-token`

A package for generating signed tokens. Useful for CSRF tokens or generally to round-trip trusted data through an untrusted client.

## Usage

```ts
import {
  generateSignedToken,
  getCheckedSignedTokenData,
  checkSignedToken,
} from '@prairielearn/signed-token';

const token = generateSignedToken({ foo: 'bar' }, 'SECRET_KEY');

console.log(getCheckedSignedTokenData(token, 'SECRET_KEY', { maxAge: 60 * 1000 }));
// { foo: 'bar' }

console.log(checkSignedToken(token, { foo: 'bar' }, 'SECRET_KEY', { maxAge: 60 * 1000 }));
// true

console.log(checkSignedToken(token, { foo: 'baz' }, 'SECRET_KEY', { maxAge: 60 * 1000 }));
// false
```
