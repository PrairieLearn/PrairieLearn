# SAML SSO configuration

SAML SSO is available for users of us.prairielearn.com and ca.prairielearn.com. Reach out to support@prairielearn.com to get it set up.

## Required attributes

PrairieLearn requires that SAML identity providers (IdPs) make three attributes available.

### Name

The full name of the user, e.g. "Joe Smith". This attribute is often named `displayName` or `urn:oid:2.16.840.1.113730.3.1.241`.

### UID

An identifier with an institution-specific suffix, e.g. "jsmith@example.com". This attribute is often named `eppn`, `eduPersonPrincipalName`, or `urn:oid:1.3.6.1.4.1.5923.1.1.1.6`.

This attribute is allowed to change. For instance, at many institutions, someone who changes their name will receive an updated identifier. The next time they log in to PrairieLearn, their UID will be updated to reflect the latest value from the IdP.

Note that this will often look like an email, but does not need to be routable as such.

### UIN

An **immutable** identifier for a given user. A student/staff ID number is typically a good fit, although this varies from institution to institution.

This attribute's value _must never change_ for a given individual, even if they change their name or email. To be more precise, this value _must_ be **persistent** (stable across multiple login sessions) and **non-reassignable** (must never be reassigned from one individual to another).

This value will be visible to instructors and included in gradebook downloads, so it _should_ be a value with a useful meaning to instructors and across other campus services.

For institutions using PrairieTest, this value can be used when deploying ID-card-based check-in for exams, so it's beneficial if this value is derivable (either directly or indirectly) from swiping or tapping an individual's institutional ID card.
