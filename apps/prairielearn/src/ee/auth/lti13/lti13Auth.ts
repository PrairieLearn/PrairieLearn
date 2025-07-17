import * as crypto from 'crypto';
import { URL } from 'url';
import { callbackify } from 'util';

import { type NextFunction, type Request, type Response, Router } from 'express';
import asyncHandler from 'express-async-handler';
import { Issuer, Strategy, type TokenSet } from 'openid-client';
import * as passport from 'passport';
import { z } from 'zod';

import { cache } from '@prairielearn/cache';
import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';
import { run } from '@prairielearn/run';

import * as authnLib from '../../../lib/authn.js';
import { setCookie } from '../../../lib/cookie.js';
import type { Lti13Instance } from '../../../lib/db-types.js';
import { HttpRedirect } from '../../../lib/redirect.js';
import { getCanonicalHost } from '../../../lib/url.js';
import { selectOptionalUserByUin, updateUserUid } from '../../../models/user.js';
import { Lti13Claim, Lti13ClaimSchema } from '../../lib/lti13.js';
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
    // Here and below, we use `lodash.get` to expand path representation in text to the object, like 'a[0].b.c'
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

// https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login
// Can be POST or GET
router.get('/login', asyncHandler(launchFlow));
router.post('/login', asyncHandler(launchFlow));

router.post(
  '/callback',
  asyncHandler(async (req, res) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);

    const lti13_claims = await authenticate(req, res);
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
        // To account for potential UID changes, we'll make a best-effort attempt to
        // find the user by their `sub` claim. If we can do that, we'll update the UID
        // if needed and proceed from there.
        const user = await selectOptionalUserByLti13Sub({
          lti13_instance_id: lti13_instance.id,
          sub: ltiClaim.get('sub'),
        });

        if (user && user.uid !== uid) {
          await updateUserUid({ user_id: user.user_id, uid });
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
      user_id: authedUser.user.user_id,
      lti13_instance_id: lti13_instance.id,
      sub: ltiClaim.get('sub'),
    });

    // Get the target_link out of the LTI request and redirect.
    res.redirect(ltiClaim.target_link_uri ?? '/pl');
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

//
// Schema to validate OIDC, LTI
//
const OIDCAuthResponseSchema = z.object({
  state: z.string(),
  id_token: z.string(),
  // also has utf8, authenticity_token, lti_storage_target
});

const OIDCLaunchFlowSchema = z.object({
  iss: z.string(),
  login_hint: z.string(),
  lti_message_hint: z.string().optional(),
  lti_deployment_id: z.string().optional(),
  client_id: z.string().optional(),
  target_link_uri: z.string(),
  // also has deployment_id, canvas_environment, canvas_region, lti_storage_target
});

//
// Helper functions
//
async function authenticate(req: Request, res: Response): Promise<any> {
  // https://www.imsglobal.org/spec/security/v1p0/#step-3-authentication-response
  OIDCAuthResponseSchema.passthrough().parse(req.body);

  const myPassport = await setupPassport(req.params.lti13_instance_id);
  return new Promise((resolve, reject) => {
    // Callback arguments described at
    // https://github.com/jaredhanson/passport/blob/33b92f96616642864844753a481df7c5b823e047/lib/middleware/authenticate.js#L34
    myPassport.authenticate('lti13', ((err, user, info) => {
      if (err) {
        // Replay attack fails here
        // "did not find expected authorization request details in session, req.session[\"oidc:localhost\"] is undefined"
        // Passport's cleanup of the session might take care of nonce reuse without us having to
        reject(err);
      } else if (!user) {
        // The authentication libraries under openid-connect will fail (silently) if the key length
        // is too small, like with the Canvas development keys. It triggers that error in PL here.
        reject(
          new AugmentedError('Authentication failed, before user validation.', {
            status: 400,
            data: {
              info_raw: info,
              info: info?.toString(),
            },
          }),
        );
      } else {
        resolve(user);
      }
    }) as passport.AuthenticateCallback)(req, res);
  });
}

async function launchFlow(req: Request, res: Response, next: NextFunction) {
  // https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login

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

  // Generate our own OIDC state, use it to toggle if testing is happening
  let state = crypto.randomBytes(28).toString('hex');
  if ('test' in parameters) {
    state = state.concat(STATE_TEST);
  }

  const myPassport = await setupPassport(req.params.lti13_instance_id);
  myPassport.authenticate('lti13', {
    response_type: 'id_token',
    lti_message_hint: parameters.lti_message_hint,
    login_hint: parameters.login_hint,
    prompt: 'none',
    response_mode: 'form_post',
    failWithError: true,
    state,
  } as passport.AuthenticateOptions)(req, res, next);
}

async function setupPassport(lti13_instance_id: string) {
  const lti13_instance = await selectLti13Instance(lti13_instance_id);

  const localPassport = new passport.Passport();
  const issuer = new Issuer(lti13_instance.issuer_params);
  const client = new issuer.Client(lti13_instance.client_params, lti13_instance.keystore);

  localPassport.use(
    'lti13',
    new Strategy(
      {
        client,
        passReqToCallback: true,
      },
      callbackify(verify),
    ),
  );

  return localPassport;
}

async function verify(req: Request, tokenSet: TokenSet) {
  const lti13_claims = Lti13ClaimSchema.parse(tokenSet.claims());

  // Check nonce to protect against reuse
  const nonceKey = `lti13auth-nonce:${req.params.lti13_instance_id}:${lti13_claims['nonce']}`;
  const cacheResult = await cache.get(nonceKey);
  if (cacheResult) {
    throw new HttpStatusError(500, 'Cannot reuse LTI 1.3 nonce, try login again');
  }
  await cache.set(nonceKey, true, 60 * 60 * 1000); // 60 minutes
  // Canvas OIDC logins expire after 3600 seconds

  // Save parameters about the platform back to the lti13_instance
  // https://www.imsglobal.org/spec/lti/v1p3#platform-instance-claim
  const params = {
    lti13_instance_id: req.params.lti13_instance_id,
    tool_platform_name:
      lti13_claims['https://purl.imsglobal.org/spec/lti/claim/tool_platform']?.name ?? null,
  };
  await queryAsync(sql.verify_upsert, params);

  return lti13_claims;
}
