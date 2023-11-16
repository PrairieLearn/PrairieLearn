import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import { Issuer, Strategy } from 'openid-client';
import passport = require('passport');
import { z } from 'zod';
import { get as _get } from 'lodash';

import { loadSqlEquiv, queryAsync } from '@prairielearn/postgres';
import error = require('@prairielearn/error');
import * as authnLib from '../../../lib/authn';
import { selectLti13Instance } from '../../models/lti13Instance';
import { get as cacheGet, set as cacheSet } from '../../../lib/cache';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

const lti13_issuers = {};

// Middleware to cache passport setup
router.use(
  asyncHandler(async (req, res, next) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);

    console.log(req.method, req.path);
    //console.log(req.session);
    //console.log(req.body);
    //console.log(req.query);

    // Cache the passport setup, only do it once
    // Do we even need to cache this?
    if (!(lti13_instance.id in lti13_issuers)) {
      console.log(`Initializing ${lti13_instance.id} in passport`);

      lti13_issuers[lti13_instance.id] = new Issuer(lti13_instance.issuer_params);
      const client = new lti13_issuers[lti13_instance.id].Client(
        lti13_instance.client_params,
        lti13_instance.keystore,
      );
      passport.use(
        `lti13_instance_${lti13_instance.id}`,
        new Strategy(
          {
            client: client,
            passReqToCallback: true,
          },
          // Passport verify function
          validate,
        ),
      );
    }
    next();
  }),
);

const OIDCLaunchFlowSchema = z.object({
  iss: z.string(),
  login_hint: z.string(),
  target_link_uri: z.string(),
});

// TODO Handle the GET case
router.post('/login', (req, res, next) => {
  // https://www.imsglobal.org/spec/security/v1p0/#step-1-third-party-initiated-login

  OIDCLaunchFlowSchema.parse(req.body);

  passport.authenticate(`lti13_instance_${req.params.lti13_instance_id}`, {
    response_type: 'id_token',
    lti_message_hint: req.body.lti_message_hint,
    login_hint: req.body.login_hint,
    prompt: 'none',
    response_mode: 'form_post',
    failWithError: true,
    failureMessage: true,
    failureRedirect: '/pl/error',
  } as passport.AuthenticateOptions)(req, res, next);
  // Type assertion instead of type annotation allows extra properties
  // 'response_type' is required but not in the base type
  // https://stackoverflow.com/questions/31816061/why-am-i-getting-an-error-object-literal-may-only-specify-known-properties
});

router.post(
  '/callback',
  asyncHandler(async (req, res) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);

    /* TODO Check if LTI 1.3 auth is enabled for this institution, ala

        // Fetch this institution's attribute mappings.
        const institutionId = req.params.institution_id;
        const institutionSamlProvider = await getInstitutionSamlProvider(institutionId);
        if (!institutionSamlProvider) {
          throw error.make(404, 'Institution does not support SAML authentication');
        }
    */

    req.session.lti13_claims = await authenticate(req, res);
    // If we get here, auth succeeded and lti13_claims is populated

    //console.log(JSON.stringify(req.session.lti13_claims, null, 3));

    const institutionId = lti13_instance.institution_id;

    console.log(lti13_instance);

    interface userInfoType {
      uid: string;
      uin: string | null;
      name: string;
      provider: string;
      institution_id: string;
    }

    const userInfo: userInfoType = {
      uid: _get(req.session.lti13_claims, lti13_instance.uid_attribute || 'email'),
      uin: _get(req.session.lti13_claims, lti13_instance.uin_attribute || 'BROKEN'),
      name: _get(req.session.lti13_claims, lti13_instance.name_attribute || 'name'),
      provider: 'LTI 1.3',
      institution_id: institutionId,
    };

    // Test User does not send a uid, so maybe something to fall back to `sub` as UIN if no UID? (Anon)
    // Also, roles: http://purl.imsglobal.org/vocab/lti/system/person#TestUser
    if (
      req.session.lti13_claims['https://purl.imsglobal.org/spec/lti/claim/roles']?.includes(
        'http://purl.imsglobal.org/vocab/lti/system/person#TestUser',
      )
    ) {
      // Eventually error here with a note about switching to student view inside PL
      // For now, hack something in so that dev makes it easy to toggle to a new student
      userInfo.uid = 'test-student@example.com';
    }

    // Zod validation of userInfo here?
    /*
    if (!authUid || !authName) {
      throw new Error('Missing one or more attributes');
    }
    */

    // AUTHENTICATE

    console.log(userInfo);
    await authnLib.loadUser(req, res, userInfo);

    // TODO represent user_id / sub / lti13_instance_id in lti13_users table
    // TODO include which authorized CI they linked to (unneeded here?) to put in session

    /*
    await queryAsync(sql.update_lti13_users, {
      user_id: res.locals.authn_user.user_id,
      pl_lti13_instance_id: req.params.lti13_instance_id,
      sub: req.session.lti13_claims.sub,
    });
    */

    /*
    // Identify course instance and redirect
    const deployment_id =
      req.session.lti13_claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'];
    const context = req.session.lti13_claims['https://purl.imsglobal.org/spec/lti/claim/context'];

    const CIparams = {
      instance_id: lti13_instance.id,
      deployment_id,
      context_id: context.id,
    };

    const CIresult = await queryAsync(sql.get_course_instance, CIparams);

    // TODO change this to req.session.lti13_authn.course_instance_id
    req.session.authn_lti13_course_instance_id = CIresult.rows[0]?.course_instance_id;
    */

    // Get the target_link out of the LTI request and redirect
    const redirUrl =
      req.session.lti13_claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'] ||
      '/pl';
    res.redirect(redirUrl);
  }),
);

const validate: StrategyVerifyCallbackReq = async function (req, tokenSet, done) {
  //const validate = async function (req, tokenSet, done) {
  //console.log("INSIDE FUNCTION");
  //console.log("tokenSet",tokenSet);
  //console.log("tokenSet.claims()",tokenSet.claims())

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
  LTI13Schema.parse(lti13_claims);

  // Check nonce to protect against reuse
  const nonceKey = `lti13auth-nonce:${req.params.lti13_instance_id}:${lti13_claims['nonce']}`;
  const cacheResult = await cacheGet(nonceKey);
  if (cacheResult) {
    return done(error.make(500, 'Cannot reuse LTI 1.3 nonce, try login again'));
  }
  cacheSet(nonceKey, true, 60 * 60 * 1000); // 60 minutes

  // Save parameters about the platform here
  // https://www.imsglobal.org/spec/lti/v1p3#platform-instance-claim
  const params = {
    //lti13_instance_id: req.res.locals.lti13_instance.id,
    lti13_instance_id: req.params.lti13_instance_id,
    tool_platform_name:
      lti13_claims['https://purl.imsglobal.org/spec/lti/claim/tool_platform'].name || null,
    //    platform:
    //      lti13_claims['https://purl.imsglobal.org/spec/lti/claim/tool_platform'].product_family_code ||
    //      null,
  };
  await queryAsync(sql.verify_upsert, params);

  done(null, lti13_claims);
};

function authenticate(req, res): Promise<any> {
  return new Promise((resolve, reject) => {
    const OIDCAuthResponseSchema = z.object({
      state: z.string(),
      id_token: z.string(),
    });
    OIDCAuthResponseSchema.parse(req.body);

    passport.authenticate(`lti13_instance_${req.params.lti13_instance_id}`, (err, user, extra) => {
      if (err) {
        reject(err);
      } else if (!user) {
        // The authentication libraries under openid-connect will fail (silently) if the key length
        // is too small, like with the Canvas development keys. It triggers that error in PL here.
        reject(new Error(`Authentication failed, before user validation. ${extra}`));
      } else {
        resolve(user);
      }
    })(req, res);
  });
}

export default router;
