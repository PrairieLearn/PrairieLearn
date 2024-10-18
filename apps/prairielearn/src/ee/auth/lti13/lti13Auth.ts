import * as crypto from 'crypto';
import { URL } from 'url';
import { callbackify } from 'util';

import { Router, type Request, type Response, type NextFunction } from 'express';
import asyncHandler from 'express-async-handler';
import { Issuer, Strategy, type TokenSet } from 'openid-client';
import * as passport from 'passport';
import { z } from 'zod';

import { cache } from '@prairielearn/cache';
import { HttpStatusError, AugmentedError } from '@prairielearn/error';
import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';

import * as authnLib from '../../../lib/authn.js';
import { getCanonicalHost } from '../../../lib/url.js';
import { Lti13ClaimSchema, Lti13Claim } from '../../lib/lti13.js';
import { selectLti13Instance } from '../../models/lti13Instance.js';

import { Lti13Test } from './lti13Auth.html.js';

const sql = loadSqlEquiv(import.meta.url);
const router = Router({ mergeParams: true });

const STATE_TEST = '-StateTest';

//
// Express routes
//
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

    // UID checking
    let uid: string;
    if (!lti13_instance.uid_attribute) {
      throw new HttpStatusError(
        500,
        'LTI 1.3 instance configuration missing required UID attribute',
      );
    } else {
      // Reasonable default is "email"
      // Points back to OIDC Standard Claims https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
      uid = ltiClaim.get(lti13_instance.uid_attribute);
      if (!uid && !inStateTest) {
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
    }

    // UIN checking, if attribute defined value must be present
    let uin: string | null = null;
    if (lti13_instance.uin_attribute) {
      // Uses lodash.get to expand path representation in text to the object, like 'a[0].b.c'
      // Might look like ["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]
      uin = ltiClaim.get(lti13_instance.uin_attribute);
      if (!uin && !inStateTest) {
        throw new HttpStatusError(
          500,
          `Missing UIN data from LTI 1.3 login (claim ${lti13_instance.uin_attribute} missing or empty)`,
        );
      }
    }

    // Name checking, not an error
    // LTI 1.3 spec defines sharing name as a MAY https://www.imsglobal.org/spec/lti/v1p3#users-and-roles
    // but discourages (MUST NOT) using other attributes for unique identifier
    let name: string | null = null;
    if (lti13_instance.name_attribute) {
      // Uses lodash.get to expand path representation in text to the object, like 'a[0].b.c'
      // Reasonable default is "name"
      // Points back to OIDC Standard Claims https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
      name = ltiClaim.get(lti13_instance.name_attribute);
    }

    let email: string | null = null;
    if (lti13_instance.email_attribute) {
      // Uses lodash.get to expand path representation in text to the object, like 'a[0].b.c'
      // Reasonable default is "email"
      // Points back to OIDC Standard Claims https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
      email = ltiClaim.get(lti13_instance.email_attribute);
    }

    const userInfo = {
      uid,
      uin,
      name,
      email,
      provider: 'LTI 1.3',
      institution_id: lti13_instance.institution_id,
    };

    if (inStateTest) {
      res.end(
        Lti13Test({
          lti13_claims,
          resLocals: res.locals,
          userInfo,
          lti13_instance,
          url: new URL(`/pl/lti13_instance/${lti13_instance.id}/auth/login`, getCanonicalHost(req)),
        }),
      );
      return;
    }

    // AUTHENTICATE
    await authnLib.loadUser(req, res, userInfo);

    // Record the LTI 1.3 user's subject id
    await queryAsync(sql.update_lti13_users, {
      user_id: res.locals.authn_user.user_id,
      lti13_instance_id: lti13_instance.id,
      sub: ltiClaim.get('sub'),
    });

    // Get the target_link out of the LTI request and redirect
    res.redirect(ltiClaim.target_link_uri ?? '/pl');
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
  const lti13_claims = Lti13ClaimSchema.passthrough().parse(tokenSet.claims());

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
