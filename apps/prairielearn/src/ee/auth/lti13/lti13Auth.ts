import { Router, type Request, Response, NextFunction } from 'express';
import asyncHandler = require('express-async-handler');
import { Issuer, Strategy, type StrategyVerifyCallbackReq, IdTokenClaims } from 'openid-client';
import passport = require('passport');
import { z } from 'zod';
import { get as _get } from 'lodash';

import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';
import error = require('@prairielearn/error');
import * as authnLib from '../../../lib/authn';
import { selectLti13Instance } from '../../models/lti13Instance';
import { get as cacheGet, set as cacheSet } from '../../../lib/cache';
import { getInstitutionAuthenticationProviders } from '../../lib/institution';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

// Middleware to check access, setup passport for later functions
router.use(
  asyncHandler(async (req, res, next) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);
    const instAuthProviders = await getInstitutionAuthenticationProviders(
      lti13_instance.institution_id,
    );

    if (
      !instAuthProviders.some((a) => {
        return a.name === 'LTI 1.3';
      })
    ) {
      throw error.make(404, 'Institution does not support LTI 1.3 authentication');
    }

    //console.log(req.method, req.path);
    //console.log(JSON.stringify(req.session, null, 3));
    //console.log(req.body);
    //console.log(req.query);

    res.locals.lti13_passport = new passport.Passport();
    const issuer = new Issuer(lti13_instance.issuer_params);
    const client = new issuer.Client(lti13_instance.client_params, lti13_instance.keystore);

    res.locals.lti13_passport.use(
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

    next();
  }),
);

router.get('/login', launchFlow);
router.post('/login', launchFlow);
function launchFlow(req: Request, res: Response, next: NextFunction) {
  // https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login

  const parameters = { ...req.body, ...req.query };

  const OIDCLaunchFlowSchema = z.object({
    iss: z.string(),
    login_hint: z.string(),
    target_link_uri: z.string(),
  });

  try {
    OIDCLaunchFlowSchema.parse(parameters);
  } catch (err) {
    return next(err);
  }

  res.locals.lti13_passport.authenticate('lti13', {
    response_type: 'id_token',
    lti_message_hint: parameters.lti_message_hint,
    login_hint: parameters.login_hint,
    prompt: 'none',
    response_mode: 'form_post',
    failWithError: true,
    failureMessage: true,
    failureRedirect: '/pl/error',
  } as passport.AuthenticateOptions)(req, res, next);
}

router.post(
  '/callback',
  asyncHandler(async (req, res) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);

    req.session.lti13_claims = await authenticate(req, res);
    // If we get here, auth succeeded and lti13_claims is populated

    //console.log(JSON.stringify(req.session.lti13_claims, null, 2));

    let uid: string;
    let uin: string | null;
    let name: string | null;

    // UID checking
    if (!lti13_instance.uid_attribute) {
      throw error.make(500, 'LTI 1.3 instance configuration missing required UID attribute');
    } else {
      uid = _get(req.session.lti13_claims, lti13_instance.uid_attribute);
      if (!uid) {
        // Canvas Student View does not include a uid but has a deterministic role, kind error message
        if (
          req.session.lti13_claims['https://purl.imsglobal.org/spec/lti/claim/roles']?.includes(
            'http://purl.imsglobal.org/vocab/lti/system/person#TestUser',
          )
        ) {
          throw error.make(
            403,
            `Student View / Test user not supported.
            Use access modes within PrairieLearn to view as a student.`,
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
      uin = _get(req.session.lti13_claims, lti13_instance.uin_attribute);
      if (!uin) {
        throw error.make(
          500,
          `Missing UIN data from LTI 1.3 login (claim ${lti13_instance.uin_attribute} missing or empty)`,
        );
      }
    }

    // Name checking, not an error
    name = null;
    if (lti13_instance.name_attribute) {
      name = _get(req.session.lti13_claims, lti13_instance.name_attribute);
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
      sub: req.session.lti13_claims.sub,
    });

    // Get the target_link out of the LTI request and redirect
    const redirUrl =
      req.session.lti13_claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] ||
      '/pl';
    res.redirect(redirUrl);
  }),
);

const validate: StrategyVerifyCallbackReq<IdTokenClaims> = async function (
  req: Request,
  tokenSet,
  done,
) {
  const lti13_claims = tokenSet.claims();

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

function authenticate(req: Request, res: Response): Promise<any> {
  return new Promise((resolve, reject) => {
    // https://www.imsglobal.org/spec/security/v1p0/#step-3-authentication-response
    const OIDCAuthResponseSchema = z.object({
      state: z.string(),
      id_token: z.string(),
    });
    OIDCAuthResponseSchema.parse(req.body);

    res.locals.lti13_passport.authenticate(`lti13`, ((err, user, extra) => {
      if (err) {
        reject(err);
      } else if (!user) {
        // The authentication libraries under openid-connect will fail (silently) if the key length
        // is too small, like with the Canvas development keys. It triggers that error in PL here.
        reject(new Error(`Authentication failed, before user validation. ${extra}`));
      } else {
        resolve(user);
      }
    }) as passport.AuthenticateCallback)(req, res);
  });
}

export default router;
