import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import jose = require('node-jose');
import { getCanonicalHost } from '../../../lib/url';

const router = Router({ mergeParams: true });

router.get(
  '/jwks',
  asyncHandler(async (req, res) => {
    const keystore = await jose.JWK.asKeyStore(res.locals.lti13_instance.keystore || []);

    res.setHeader('Content-type', 'application/json; charset=UTF-8');
    // Only extract the public keys, pass false
    res.end(JSON.stringify(keystore.toJSON(false), null, '  '));
  }),
);

const ltiConfig = {
  title: 'PrairieLearn',
  description: 'The best platform for online assessments',
  oidc_initiation_url: 'replace',
  target_link_uri: 'replace',
  extensions: [
    {
      domain: 'replace',
      platform: 'canvas.instructure.com',
      privacy_level: 'public',
      settings: {
        text: 'PrairieLearn',
        placements: [
          {
            text: 'PrairieLearn',
            enabled: true,
            placement: 'course_navigation',
            default: 'disabled',
            message_type: 'LtiResourceLinkRequest',
            target_link_url: 'replace',
          },
        ],
      },
    },
  ],
  custom_fields: {
    uin: '$Canvas.user.sisIntegrationId',
  },
  public_jwk_url: 'replace',
  scopes: [
    'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
    'https://purl.imsglobal.org/spec/lti-ags/scope/score',
    'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
  ],
};

router.get(
  '/config',
  asyncHandler(async (req, res) => {
    // This function is largely Canvas-specific. If different LMSes have different imports,
    // we can extend this to look at the LTI 1.3 instance `platform` and respond accordingly.
    //
    // https://canvas.instructure.com/doc/api/file.lti_dev_key_config.html#anatomy-of-a-json-configuration
    //
    // The file is human readable on purpose to support manual configuration in the LMS.

    const url = getCanonicalHost(req);

    ltiConfig.oidc_initiation_url = `${url}/pl/lti13_instance/${res.locals.lti13_instance.id}/auth/login`;
    ltiConfig.target_link_uri = `${url}/pl/lti13_instance/${res.locals.lti13_instance.id}/auth/callback`;

    ltiConfig.extensions[0].domain = req.get('host') || '';
    ltiConfig.extensions[0].settings.placements[0].target_link_url = `${url}/pl/lti13_instance/${res.locals.lti13_instance.id}/course_navigation`;

    ltiConfig.public_jwk_url = `${url}/pl/lti13_instance/${res.locals.lti13_instance.id}/jwks`;

    res.setHeader('Content-type', 'application/json');
    res.end(JSON.stringify(ltiConfig, null, 3));
  }),
);

export default router;
