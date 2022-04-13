# Summary

This RFC discusses transitioning PL to use express-session and passport strategies
for its authentication and auth cookie management.

This change is referenced by (or is a dependency for):
* LTI 1.3 implementation with Canvas

## Sessions

Issue #5416 Implement server-side sessions

What should the session store be?
* Postgresql table?
    * If so, we probably want to craft our own session store based on our sqldb?
    * https://github.com/voxpelli/node-connect-pg-simple is a reference
    * Or we could run the simple connector with the same DB credentials?
* Redis?
    * Might be preferable based on TTL and auto cleanup that would need to be implemented in our database session store

What tools do we need for session management?
* Reports
* Ability to destroy sessions

Unknowns
* Session expiration and renewal? What does that look like?
* Look at session-stores that support the "touch" function, and the session `rolling` option?

## Auth strategies
* Shibboleth: Currently getting proxied with custom headers from httpd/mod_shib.
    * WIP switching to passport and Shibboleth OpenIDConnect using https://github.com/panva/node-openid-client
* Google: Currently using `googleapis` for OAuth2. Convert to `passport-google-oauth20`
* Microsoft: Already using passport and `azuread-openidconnect`
* devAuth: Currently the default case when in `config.devMode` that overrides any other auth strategy (see #1509)
    * Make devAuth a full auth strategy, perhaps the default chosen with in devMode with the ability to pick other enabled logins or options.
    * Include any of the testing authentication setups: `loadtest`, `test_student`, `test_instructor` in `middlewares/authn.js`
    * Can be simply and directly done with req.logIn(), no strategy needed

## Integration with PL
In addition to updating the individual authentication strategies above to use
sessions and passport, we need to standardize how PrairieLearn stores and interprets
the data from the various sessions. Our current convention puts things in `res.locals.authn_*` objects, but should that be addressed with this update?

A first pass would be to alter `middlewares/authn.js` to get session information and populate the existing `res.locals.authn_*` objects. That would limit the scope of the change, but perhaps not add much enlargement that sessions or passport could offer?

A more advanced pass would be to update the rest of the pages and middlewares to get that information from the session or passport directly.

## Enlargements

* Consider switching roles (emulating a student or a student role) to happen through the session management rather than being handled by individual pages (or middlewares?)

* Allow multiple logged in sessions at the same time, choosing between auth scoped to course_instances where appropriate (LTI authentication and Shib with the same session cookies)

### Passport

req.user object for a logged in user

req.isAuthenticate() returns a boolean

req.logOut() destroys the session

req.logIn() - used by strategies, not called directly

Uses sessions, req.session.passport.user

https://stackoverflow.com/questions/27637609/understanding-passport-serialize-deserialize

passport.serializeUser
- Might take generic information from the authentication strategy (email?) and map it to a `users.user_id`
- This is what is saved in req.session.passport.user

passport.deserializeUser
- Looks up the user object and populates `req.user`
- This is equivalent to the `middlewares/authn.js:154 sql.select_user` lookup that happens on each page view

We could store more ready information in the session directly so we wouldn't have to hit the DB each time. But then we'd need a strategy for updating the session if any of that data changed, or periodically.

It's not clear if using req.user is a complexity of passport and passport strategies that benefits us or not.

We could, for example, write into something in req.session directly as a part of the auth strategy and not use the passport abstraction. However, the fact we would be using multiple passport-strategies means using the passport model would make things
consistent.
