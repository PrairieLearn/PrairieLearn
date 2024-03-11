import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import * as jose from 'node-jose';
import { getCanonicalHost } from '../../../lib/url';
import { URL } from 'url';
import { selectLti13Instance } from '../../models/lti13Instance';
import { cloneDeep } from 'lodash';

const router = Router({ mergeParams: true });

router.get(
  '/jwks',
  asyncHandler(async (req, res) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);
    const keystore = await jose.JWK.asKeyStore(lti13_instance.keystore || []);

    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    // Only extract the public keys, pass false
    res.end(JSON.stringify(keystore.toJSON(false), null, 2));
  }),
);

const ltiConfig = {
  title: 'PrairieLearn',
  description: 'The best platform for online assessments',
  oidc_initiation_url: 'PLACEHOLDER--will be replaced later',
  target_link_uri: 'PLACEHOLDER--will be replaced later',
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
            target_link_uri: 'PLACEHOLDER--will be replaced later',
            windowTarget: '_blank',
          },
        ],
      },
    },
  ],
  custom_fields: {},
  public_jwk_url: 'PLACEHOLDER--will be replaced later',
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

    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);

    const lmsConfig = cloneDeep(ltiConfig);
    const host = getCanonicalHost(req);
    const url = new URL(host);

    lmsConfig.oidc_initiation_url = `${host}/pl/lti13_instance/${lti13_instance.id}/auth/login`;
    lmsConfig.target_link_uri = `${host}/pl/lti13_instance/${lti13_instance.id}/auth/callback`;

    // Use URL to extract just the hostname
    lmsConfig.extensions[0].domain = url.hostname || '';
    lmsConfig.extensions[0].settings.placements[0].target_link_uri = `${host}/pl/lti13_instance/${lti13_instance.id}/course_navigation`;

    lmsConfig.public_jwk_url = `${host}/pl/lti13_instance/${lti13_instance.id}/jwks`;
    lmsConfig.custom_fields = lti13_instance.custom_fields;

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(lmsConfig, null, 2));
  }),
);

export default router;
