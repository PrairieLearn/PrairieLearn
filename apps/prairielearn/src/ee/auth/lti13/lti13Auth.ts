import * as crypto from 'crypto';
import { URL } from 'url';

import { type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';
import * as client from 'openid-client';
import { z } from 'zod';

import { cache } from '@prairielearn/cache';
import { HttpStatusError } from '@prairielearn/error';
import { execute, loadSqlEquiv } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import * as authnLib from '../../../lib/authn.js';
import { setCookie } from '../../../lib/cookie.js';
import type { Lti13Instance } from '../../../lib/db-types.js';
import { HttpRedirect } from '../../../lib/redirect.js';
import { getCanonicalHost } from '../../../lib/url.js';
import { selectOptionalUserByUin, updateUserUid } from '../../../models/user.js';
import { Lti13Claim, Lti13ClaimSchema, getOpenidClientConfig } from '../../lib/lti13.js';
import { selectOptionalUserByLti13Sub, updateLti13UserSub } from '../../models/lti13-user.js';
import { selectLti13Instance } from '../../models/lti13Instance.js';

import { Lti13AuthIframe, Lti13AuthRequired, Lti13Test } from './lti13Auth.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

const STATE_TEST = '-StateTest';

function getClaimUserAttributes({
  claim,
  lti13_instance,
}: {
  claim: Lti13Claim;
  lti13_instance: Lti13Instance;
}) {
  let uin: string | null = null;
  let uid: string | null = null;
  let name: string | null = null;
  let email: string | null = null;

  if (lti13_instance.uin_attribute) {
    // Here and below, we use es-toolkit's get to expand path representation in text to the object, like 'a[0].b.c'
    // Might look like ["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]
    uin = claim.get(lti13_instance.uin_attribute);
  }

  if (lti13_instance.uid_attribute) {
    // Reasonable default is "email"
    // Points back to OIDC Standard Claims https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
    uid = claim.get(lti13_instance.uid_attribute);
  }

  if (lti13_instance.name_attribute) {
    // Reasonable default is "name"
    // Points back to OIDC Standard Claims https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
    name = claim.get(lti13_instance.name_attribute);
  }

  if (lti13_instance.email_attribute) {
    // Reasonable default is "email"
    // Points back to OIDC Standard Claims https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
    email = claim.get(lti13_instance.email_attribute);
  }

  return { uin, uid, name, email };
}

const OIDCLaunchFlowSchema = z.object({
  iss: z.string(),
  login_hint: z.string(),
  lti_message_hint: z.string().optional(),
  lti_deployment_id: z.string().optional(),
  client_id: z.string().optional(),
  target_link_uri: z.string(),
  // also has canvas_environment, canvas_region, lti_storage_target
});

router.get('/login', asyncHandler(launchFlow));
router.post('/login', asyncHandler(launchFlow));

async function launchFlow(req: Request, res: Response) {
  // https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login
  // Can be POST or GET

  const parameters = OIDCLaunchFlowSchema.passthrough().parse({ ...req.body, ...req.query });

  // If the authentication request is coming from an iframe, intercept the parameters
  // and offer a small form to open in a new window.
  // SECURITY NOTE: We intentionally remove security headers CSP and X-Frame-Options
  // only for this specific response to allow iframe embedding during LTI 1.3 auth to
  // offer a redirect/POST in a new window.
  // This is a controlled exception to our security policy for LTI compatibility.
  if (req.headers['sec-fetch-dest'] === 'iframe') {
    res.removeHeader('content-security-policy');
    res.removeHeader('x-frame-options');
    res.end(Lti13AuthIframe({ parameters }));
    return;
  }

  const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);

  const openidClientConfig = await getOpenidClientConfig(lti13_instance);

  // Generate our own OIDC state, use it to toggle if testing is happening
  let state = crypto.randomBytes(28).toString('hex');
  if ('test' in parameters) {
    state = state.concat(STATE_TEST);
  }
  const nonce = client.randomNonce();

  // Save for later
  req.session.lti13_state = {
    state,
    nonce,
  };

  // https://www.imsglobal.org/spec/security/v1p0/#step-2-authentication-request
  const requestParameters: Record<string, string> = {
    scope: 'openid',
    response_type: 'id_token',
    client_id: lti13_instance.client_params.client_id,
    redirect_uri: lti13_instance.client_params.redirect_uris[0],
    login_hint: parameters.login_hint,
    state,
    response_mode: 'form_post',
    nonce,
    prompt: 'none',
  };

  // If these parameters were offered, they must be included back:
  // https://www.imsglobal.org/spec/lti/v1p3#additional-login-parameters
  for (const key of ['lti_message_hint', 'lti_deployment_id'] as const) {
    const value = parameters[key];
    if (value != null) {
      requestParameters[key] = value;
    }
  }

  const redirectTo = client.buildAuthorizationUrl(openidClientConfig, requestParameters);
  res.redirect(redirectTo.href);
}

const OIDCAuthResponseSchema = z.union([
  // https://www.imsglobal.org/spec/security/v1p0/#step-3-authentication-response
  z.object({
    state: z.string(),
    id_token: z.string(),
    // also has utf8, authenticity_token, lti_storage_target
  }),
  // https://openid.net/specs/openid-connect-core-1_0.html#AuthError
  z.object({
    state: z.string(),
    error: z.string(),
    error_description: z.string().optional(),
    error_uri: z.string().optional(),
  }),
]);

router.post(
  '/callback',
  asyncHandler(async (req, res) => {
    const authResponse = OIDCAuthResponseSchema.parse(req.body);

    if ('error' in authResponse) {
      // e.g. launch_no_longer_valid
      throw new HttpStatusError(
        400,
        `Error code: ${authResponse.error} ${authResponse.error_description}`,
      );
    }

    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);

    const openidClientConfig = await getOpenidClientConfig(lti13_instance);

    // Needed for implicit flow
    client.useIdTokenResponseType(openidClientConfig);

    // URL href doesn't matter, openid-client only uses the url.hash to pass properties
    // into client.implicitAuthentication
    const url = new URL('https://example.com/');
    url.hash = new URLSearchParams({
      state: authResponse.state,
      id_token: authResponse.id_token,
    }).toString();

    const lti13_claims = Lti13ClaimSchema.parse(
      await client.implicitAuthentication(openidClientConfig, url, req.session.lti13_state.nonce, {
        expectedState: req.session.lti13_state.state,
      }),
    );

    // Check nonce to protect against reuse
    const nonceKey = `lti13auth-nonce:${req.params.lti13_instance_id}:${lti13_claims.nonce}`;
    const cacheResult = await cache.get(nonceKey);
    if (cacheResult) {
      throw new HttpStatusError(500, 'Cannot reuse LTI 1.3 nonce, try login again');
    }
    cache.set(nonceKey, true, 60 * 60 * 1000); // 60 minutes
    // Canvas OIDC logins expire after 3600 seconds

    // Remove auth state from session
    delete req.session.lti13_state;

    // Save parameters about the platform back to the lti13_instance
    // https://www.imsglobal.org/spec/lti/v1p3#platform-instance-claim
    await execute(sql.verify_upsert, {
      lti13_instance_id: req.params.lti13_instance_id,
      tool_platform_name:
        lti13_claims['https://purl.imsglobal.org/spec/lti/claim/tool_platform']?.name ?? null,
    });

    // If we get here, auth succeeded and lti13_claims is populated

    // Put the LTI 1.3 claims in the session
    req.session.lti13_claims = lti13_claims;
    req.session.authn_lti13_instance_id = lti13_instance.id;

    const ltiClaim = new Lti13Claim(req);

    const inStateTest = req.body.state.endsWith(STATE_TEST);

    if (inStateTest) {
      res.end(
        Lti13Test({
          lti13_claims,
          resLocals: res.locals,
          userInfo: getClaimUserAttributes({ lti13_instance, claim: ltiClaim }),
          lti13_instance,
          url: new URL(`/pl/lti13_instance/${lti13_instance.id}/auth/login`, getCanonicalHost(req)),
        }),
      );
      return;
    }

    const { uin, uid, name, email } = getClaimUserAttributes({ lti13_instance, claim: ltiClaim });

    const resolvedUid = await run(async () => {
      if (lti13_instance.uid_attribute) {
        if (!uid) {
          // Canvas Student View does not include a uid but has a deterministic role, nicer error message
          if (ltiClaim.isRoleTestUser()) {
            throw new HttpStatusError(
              403,
              'Student View / Test user not supported. Use access modes within PrairieLearn to view as a student.',
            );
          } else {
            // Error about missing UID
            throw new HttpStatusError(
              500,
              `Missing UID data from LTI 1.3 login (claim ${lti13_instance.uid_attribute} missing or empty)`,
            );
          }
        }

        // If the `uid_attribute` is present, we must have a claim for it by this point.
        //
        // It's possible that the UID for a user may have changed, but we may or may not
        // have a UIN attribute here. To account for a missing UIN, we'll try to find an
        // existing user by their `sub` claim. If we do, and the UIDs don't match, we'll
        // update the UID for that existing user.
        //
        // This is trusting that `sub` is immutable for a given user, which the LTI spec
        // requires. Note that `sub` is scoped to an LTI 1.3 instance.
        const user = await selectOptionalUserByLti13Sub({
          lti13_instance_id: lti13_instance.id,
          sub: ltiClaim.get('sub'),
        });

        if (user && user.uid !== uid) {
          await updateUserUid({ user_id: user.id, uid });
        }

        // We still have a valid UID; pass it back.
        return uid;
      } else if (lti13_instance.uin_attribute) {
        if (!uin) {
          // Error about missing UIN
          throw new HttpStatusError(
            500,
            `Missing UIN data from LTI 1.3 login (claim ${lti13_instance.uin_attribute} missing or empty)`,
          );
        }

        // If the `uin_attribute` is present, we must have a claim for it by this point.
        //
        // Without a UIN, we can't use the LTI 1.3 auth flow to create a user directly.
        // Instead, there are two things that can happen:
        //
        // - The user could have already authenticated before via SAML or another
        //   auth provider. In this case, we'll look them up by UIN/institution_id.
        //   If we find them, we use that UID and proceed as normal.
        // - The user has never authed via another auth provider. We'll have to
        //   force them through another auth provider. We'll shove their UIN and
        //   LTI 1.3 `sub` into the session so that, after they've authed, we can
        //   check that the UINs match, create the user, and then add the LTI 1.3
        //   `sub` to the user.

        const user = await selectOptionalUserByUin({
          uin,
          institution_id: lti13_instance.institution_id,
        });

        if (user) return user.uid;

        // We couldn't locate the user by their UIN, so they're a new user.
        //
        // We'll force them through the normal auth flow to pick up a UID and
        // associate the user account with this information.

        // Remember the user's details for after auth.
        req.session.lti13_pending_uin = uin;
        req.session.lti13_pending_sub = ltiClaim.get('sub');
        req.session.lti13_pending_instance_id = lti13_instance.id;

        // Remember where the user was headed so we can redirect them after auth.
        if (ltiClaim.target_link_uri) {
          setCookie(res, ['preAuthUrl', 'pl2_pre_auth_url'], ltiClaim.target_link_uri);
        }

        throw new HttpRedirect(`/pl/lti13_instance/${lti13_instance.id}/auth/auth_required`);
      } else {
        throw new HttpStatusError(
          500,
          'LTI 1.3 instance must have at least one of uid_attribute or uin_attribute configured',
        );
      }
    });

    const authedUser = await authnLib.loadUser(req, res, {
      uin,
      uid: resolvedUid,
      name,
      email,
      provider: 'LTI 1.3',
      institution_id: lti13_instance.institution_id,
    });

    // Record the LTI 1.3 user's subject id.
    await updateLti13UserSub({
      user_id: authedUser.user.id,
      lti13_instance_id: lti13_instance.id,
      sub: ltiClaim.get('sub'),
    });

    // Get the target_link out of the LTI request and redirect.
    res.redirect(ltiClaim.target_link_uri);
  }),
);

router.get(
  '/auth_required',
  asyncHandler(async (req, res) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);
    res.send(
      Lti13AuthRequired({
        institution_id: lti13_instance.institution_id,
        resLocals: res.locals,
      }),
    );
  }),
);

export default router;
