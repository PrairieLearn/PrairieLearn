# LTI 1.3 configuration

LTI 1.3 is available in early beta. Reach out to support@prairielearn.com to get it set up.

Learning Tools Interoperability (LTI) provides app integration between Learning Management Systems (LMSes) like Canvas, Moodle, etc. and PrairieLearn. It includes single sign on from the LMS with additional features like course context information and roles. Version 1.3 enhances LTI to include an API for asynchronous two-way updates for assessments, scores, and rosters.

LTI 1.3 is configured on an institution level by establishing a trust relationship between the LMS and PrairieLearn. LMSes can decide where to apply that integration (per course, per account, per institution).

## Information LMS administrators will provide

LTI 1.3 configuration

- Information about your LMS: type, self-hosted or cloud-provider hosted, etc.
- Typical LTI 1.3 OIDC authentication for your LMS
  - Issuer, JWK or JWK key set URL, URL endpoints for token and authorization
- Client ID for PrairieLearn from the LMS LTI configuration

PrairieLearn institution configuration (see the [SAML SSO doc](saml.md) for our definitions)

- What do email addresses from the institution look like? (Or other UID value)
- What is appropriate for the UIN?
- What LTI claims should we use for:
  - Name (typically `name` from LTI 1.3/OIDC)
  - UID (typically `email` from LTI 1.3/OIDC)
  - UIN (probably a custom LTI property)

## Information PrairieLearn administrators will provide

LTI 1.3 configuration

- A JSON configuration URL to set up your LMS to work with PrairieLearn
  - This could be imported into the LMS programmatically (it was designed for Canvas) or read by a human and includes the OIDC authentication URLs
- A JWKS key set URL for public key exchange with PrairieLearn

## LMS setup

### LTI Advantage Services

The services of LTI 1.3 that do grade passback, assessment setup, or roster syncing have their own specific standards and configuration. Make sure these "scopes" are enabled for PrairieLearn in your LMS to use this functionality.

Canvas uses these terms in their config as something to enable for the PrairieLearn LTI developer key:

- Create and view assignment data in the gradebook
- View assignment data in the gradebook associated with the tool
- View submission data for assignments associated with the tool
- Create and update submission results for assignments associated with the tool
- Retrieve user data associated with the context the tool is in

More technically, make sure the [AGS](https://www.imsglobal.org/spec/lti-ags/v2p0) `score` and `lineitem` scopes are enabled as well as [NRPS](https://www.imsglobal.org/spec/lti-nrps/v2p0/) `contextmembership.readonly`.

### Anonymous logins not allowed

You must configure your LMS to send user identifying claims. Anonymous logins are not supported with PrairieLearn. Canvas calls this "Privacy Public".

### Placements

PrairieLearn recommends 'Course Navigation' placements, as described in the configuration JSON. More placements may be added in the future.
