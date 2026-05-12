// Express's `Request` type references `express-serve-static-core.ParamsDictionary`
// and `qs.ParsedQs` internally, and these surface in our compiled `.d.ts` output
// (see `createSessionMiddleware`'s return type). Under yarn's flat hoisting the
// types resolve transitively through `@types/express`; under pnpm's strict
// hoisting they must be listed as direct dependencies *and* explicitly referenced
// here so knip doesn't flag them as unused.
// https://github.com/webpro-nl/knip/issues/753#issuecomment-2288382313
/// <reference types="express-serve-static-core" />
/// <reference types="qs" />
