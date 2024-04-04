import { Router, type Request, Response, NextFunction } from 'express';
import asyncHandler = require('express-async-handler');
import { Issuer, Strategy, type TokenSet } from 'openid-client';
import * as passport from 'passport';
import { z } from 'zod';
import { get as _get } from 'lodash';
import { callbackify } from 'util';
import * as crypto from 'crypto';
import { URL } from 'url';

import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import { cache } from '@prairielearn/cache';
import * as authnLib from '../../../lib/authn';
import { selectLti13Instance } from '../../models/lti13Instance';
import { Lti13Test } from './lti13Auth.html';
import { getCanonicalHost } from '../../../lib/url';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

const StateTest = '-StateTest';

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

    let uid: string;
    let uin: string | null;
    let name: string | null;

    // UID checking
    if (!lti13_instance.uid_attribute) {
      throw error.make(500, 'LTI 1.3 instance configuration missing required UID attribute');
    } else {
      // Uses lodash.get to expand path representation in text to the object, like 'a[0].b.c'
      // Reasonable default is "email"
      // Points back to OIDC Standard Claims https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
      uid = _get(lti13_claims, lti13_instance.uid_attribute);
      if (!uid) {
        // Canvas Student View does not include a uid but has a deterministic role, nicer error message
        if (
          lti13_claims['https://purl.imsglobal.org/spec/lti/claim/roles']?.includes(
            'http://purl.imsglobal.org/vocab/lti/system/person#TestUser',
          )
        ) {
          throw error.make(
            403,
            `Student View / Test user not supported. Use access modes within PrairieLearn to view as a student.`,
          );
        } else {
          // Error about missing UID
          throw error.make(
            500,
            `Missing UID data from LTI 1.3 login (claim ${lti13_instance.uid_attribute} missing or empty)`,
          );
        }
      }
    }

    // UIN checking, if attribute defined value must be present
    uin = null;
    if (lti13_instance.uin_attribute) {
      // Uses lodash.get to expand path representation in text to the object, like 'a[0].b.c'
      // Might look like ["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]
      uin = _get(lti13_claims, lti13_instance.uin_attribute);
      if (!uin) {
        throw error.make(
          500,
          `Missing UIN data from LTI 1.3 login (claim ${lti13_instance.uin_attribute} missing or empty)`,
        );
      }
    }

    // Name checking, not an error
    // LTI 1.3 spec defines sharing name as a MAY https://www.imsglobal.org/spec/lti/v1p3#users-and-roles
    // but discourages (MUST NOT) using other attributes for unique identifier
    name = null;
    if (lti13_instance.name_attribute) {
      // Uses lodash.get to expand path representation in text to the object, like 'a[0].b.c'
      // Reasonable default is "name"
      // Points back to OIDC Standard Claims https://openid.net/specs/openid-connect-core-1_0.html#StandardClaims
      name = _get(lti13_claims, lti13_instance.name_attribute);
    }

    const userInfo = {
      uid,
      uin,
      name,
      provider: 'LTI 1.3',
      institution_id: lti13_instance.institution_id,
    };

    if (req.body.state.endsWith(StateTest)) {
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
      sub: lti13_claims.sub,
    });

    // Get the target_link out of the LTI request and redirect
    const redirUrl =
      lti13_claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] ?? '/pl';
    res.redirect(redirUrl);
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

// Validate LTI 1.3
// https://www.imsglobal.org/spec/lti/v1p3#required-message-claims
const LTI13Schema = z.object({
  'https://purl.imsglobal.org/spec/lti/claim/message_type': z.literal('LtiResourceLinkRequest'),
  'https://purl.imsglobal.org/spec/lti/claim/version': z.literal('1.3.0'),
  'https://purl.imsglobal.org/spec/lti/claim/deployment_id': z.string(),
  'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': z.string(),
  'https://purl.imsglobal.org/spec/lti/claim/resource_link': z.object({
    id: z.string(),
    description: z.string().nullish(),
    title: z.string().nullish(),
  }),
  // https://www.imsglobal.org/spec/security/v1p0/#tool-jwt
  // https://www.imsglobal.org/spec/security/v1p0/#id-token
  iss: z.string(),
  aud: z.string(),
  sub: z.string(),
  exp: z.number(),
  iat: z.number(),
  azp: z.string().optional(),
  nonce: z.string(),

  given_name: z.string().optional(),
  family_name: z.string().optional(),
  name: z.string().optional(),
  email: z.string().optional(),
  locale: z.string().optional(),
  // Could be more from OIDC Standard Claims
  'https://purl.imsglobal.org/spec/lti/claim/roles': z.string().array(),

  'https://purl.imsglobal.org/spec/lti/claim/context': z
    .object({
      id: z.string(),
      type: z.string().array().nullish(),
      label: z.string().nullish(),
      title: z.string().nullish(),
    })
    .nullish(),

  'https://purl.imsglobal.org/spec/lti/claim/tool_platform': z
    .object({
      guid: z.string().max(255),
      name: z.string().optional(),
      contact_email: z.string().optional(),
      description: z.string().optional(),
      url: z.string().optional(),
      product_family_code: z.string().optional(),
      version: z.string().optional(),
    })
    .nullish(),

  'https://purl.imsglobal.org/spec/lti/claim/role_scope_mentor': z.string().array().nullish(),

  'https://purl.imsglobal.org/spec/lti/claim/launch_presentation': z
    .object({
      document_target: z.string().optional(),
      height: z.number().optional(),
      width: z.number().optional(),
      return_url: z.string().optional(),
      locale: z.string().optional(),
    })
    .nullish(),

  'https://purl.imsglobal.org/spec/lti/claim/lis': z.any().nullish(),
  'https://purl.imsglobal.org/spec/lti/claim/custom': z.any().nullish(),

  // https://www.imsglobal.org/spec/lti/v1p3#vendor-specific-extension-claims
  // My development Canvas sends their own named extension as a top level property
  // "https://www.instructure.com/placement": "course_navigation"
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
    myPassport.authenticate(`lti13`, ((err, user, info) => {
      if (err) {
        // Replay attack fails here
        // "did not find expected authorization request details in session, req.session[\"oidc:localhost\"] is undefined"
        // Passport's cleanup of the session might take care of nonce reuse without us having to
        reject(err);
      } else if (!user) {
        // The authentication libraries under openid-connect will fail (silently) if the key length
        // is too small, like with the Canvas development keys. It triggers that error in PL here.
        reject(
          error.make(400, 'Authentication failed, before user validation.', {
            info_raw: info,
            info: info?.toString(),
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
    state = state.concat(StateTest);
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
  const lti13_claims = LTI13Schema.passthrough().parse(tokenSet.claims());

  // Check nonce to protect against reuse
  const nonceKey = `lti13auth-nonce:${req.params.lti13_instance_id}:${lti13_claims['nonce']}`;
  const cacheResult = await cache.get(nonceKey);
  if (cacheResult) {
    throw error.make(500, 'Cannot reuse LTI 1.3 nonce, try login again');
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
