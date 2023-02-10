# Summary

Define and standardize how user information is stored and used with express-sessions.

# Usage

For now, only ephemeral data with expiry of a day. Data that doesn't need to live forever, just for a few page loads or across different pages.

- LTI state data
- Something where we're using secondary cookies?
  - password?
  - admin user emulating
- Error or response messages

Eventually, we could hold longer term data (with longer expiration or refreshes).

- replace the `pl_authn` cookie

# Access

Deserialized into `req.session`

Routes that require information in `req.session` should check for its presence and
redirect if needed. If `passport` is configured, data might also be in `req.user`.

## Top level variables

`req.session.lti13_claims`: Data from LTI 1.3
