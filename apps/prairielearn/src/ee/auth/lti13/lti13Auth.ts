import { Router, type Request, Response, NextFunction } from 'express';
import asyncHandler = require('express-async-handler');
import { Issuer, Strategy, type StrategyVerifyCallbackReq, IdTokenClaims } from 'openid-client';
import * as passport from 'passport';
import { z } from 'zod';
import { get as _get } from 'lodash';

import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';
import * as error from '@prairielearn/error';
import * as authnLib from '../../../lib/authn';
import { selectLti13Instance } from '../../models/lti13Instance';
import { get as cacheGet, set as cacheSet } from '../../../lib/cache';
import { getInstitutionAuthenticationProviders } from '../../lib/institution';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

// Middleware to check access
router.use(
  asyncHandler(async (req, res, next) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);
    const instAuthProviders = await getInstitutionAuthenticationProviders(
      lti13_instance.institution_id,
    );

    if (!instAuthProviders.some((a) => a.name === 'LTI 1.3')) {
      throw error.make(404, 'Institution does not support LTI 1.3 authentication');
    }

    next();
  }),
);

// Express routes
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
      lti13_claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] ||
      '/pl';
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
});

const OIDCLaunchFlowSchema = z.object({
  iss: z.string(),
  login_hint: z.string(),
  target_link_uri: z.string(),
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
    description: z.string().nullable(),
    title: z.string().nullable(),
  }),
  sub: z.string(),
  'https://purl.imsglobal.org/spec/lti/claim/roles': z.string().array(),
});

//
// Helper functions
//

async function authenticate(req: Request, res: Response): Promise<any> {
  const myPassport = await setupPassport(req.params.lti13_instance_id);
  return new Promise((resolve, reject) => {
    // https://www.imsglobal.org/spec/security/v1p0/#step-3-authentication-response
    OIDCAuthResponseSchema.parse(req.body);

    // Callback arguments described at
    // https://github.com/jaredhanson/passport/blob/33b92f96616642864844753a481df7c5b823e047/lib/middleware/authenticate.js#L34
    myPassport.authenticate(`lti13`, ((err, user, info) => {
      if (err) {
        reject(err);
      } else if (!user) {
        // The authentication libraries under openid-connect will fail (silently) if the key length
        // is too small, like with the Canvas development keys. It triggers that error in PL here.
        reject(
          error.make(400, `Authentication failed, before user validation.`, {
            err,
            user,
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

  const parameters = { ...req.body, ...req.query };

  OIDCLaunchFlowSchema.parse(parameters);

  const myPassport = await setupPassport(req.params.lti13_instance_id);
  myPassport.authenticate('lti13', {
    response_type: 'id_token',
    lti_message_hint: parameters.lti_message_hint,
    login_hint: parameters.login_hint,
    prompt: 'none',
    response_mode: 'form_post',
    failWithError: true,
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
        client: client,
        passReqToCallback: true,
      },
      // Passport verify function
      validate,
    ),
  );

  return localPassport;
}

const validate: StrategyVerifyCallbackReq<IdTokenClaims> = async function (
  req: Request,
  tokenSet,
  done,
) {
  const lti13_claims = tokenSet.claims();

  try {
    LTI13Schema.parse(lti13_claims);
  } catch (err) {
    return done(err);
  }

  // Check nonce to protect against reuse
  const nonceKey = `lti13auth-nonce:${req.params.lti13_instance_id}:${lti13_claims['nonce']}`;
  const cacheResult = await cacheGet(nonceKey);
  if (cacheResult) {
    return done(error.make(500, 'Cannot reuse LTI 1.3 nonce, try login again'));
  }
  cacheSet(nonceKey, true, 60 * 60 * 1000); // 60 minutes
  // Canvas OIDC logins expire after 3600 seconds

  // Save parameters about the platform back to the lti13_instance
  // https://www.imsglobal.org/spec/lti/v1p3#platform-instance-claim
  const params = {
    lti13_instance_id: req.params.lti13_instance_id,
    tool_platform_name:
      (lti13_claims['https://purl.imsglobal.org/spec/lti/claim/tool_platform'] as any).name || null,
  };
  await queryAsync(sql.verify_upsert, params);

  return done(null, lti13_claims);
};
