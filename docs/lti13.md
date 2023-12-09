
# LTI 1.3 configuration

LTI 1.3 is available in early beta. Reach out to support@prairielearn.com to get it setup.

Learning Tools Interoperability (LTI) provides app integration between Learning Management Systems (LMS) like Canvas, Moodle, etc. and PrairieLearn. It includes features like single sign on from the LMS, with course context information and roles. Version 1.3 enlarges LTI to include an API for asynchronous two-way updates relating to assessments, scores, and rosters.

LTI 1.3 is configured on an institution level by establishing a trust relationship between the LMS and PrairieLearn. LMSes can decide where to apply that integration (per course, per account, per institution).

## Information LMS administrators will provide

LTI 1.3 configuration
- Information about your LMS: type, self-hosted or cloud-provider hosted, etc.
- Typical 1.3 endpoints for your LMS
  - Issuer, JWKS URL, URL endpoints for token and authorization
- Client ID for PrairieLearn from the LMS LTI configuration

PrairieLearn institution configuration (see the [SAML SSO](saml.md) for definitions)
- What do email addresses from the institution look like? (Or other UID value)
- What is appropriate for the UIN?
- What LTI claims should we use for:
  - name (typically `name` from LTI 1.3/OIDC)
  - UID (typically `email` from LTI 1.3/OIDC)
  - UIN (probably a custom LTI variable)


## Information PrairieLearn administrators will provide

LTI 1.3 configuration
- A JSON configuration URL to setup your LMS to work with PL
  - This could be imported into the LMS programmatically or read by a human
- A JWKS key set URL for PL public key exchange

## LMS setup

### LTI Advantage Services

Make sure these are enabled for PL in your institution.

- Create and view assignment data in the gradebook
- View assignment data in the gradebook associated with the tool
- View submission data for assignments associated with the tool
- Create and update submission results for assignments associated with the tool
- Retrieve user data associated with the context the tool is in

### Anonymous logins not allowed

You must configure your LMS to send user identifying claims. Anonymous logins are not supported.

Canvas calls this: Privacy Public

### Placements

PrairieLearn recommends 'Course Navigation' placements, as described in the configuration JSON. More placements may be added in the future.
