import { Router } from 'express';
import asyncHandler = require('express-async-handler');
import * as jose from 'node-jose';
import { z } from 'zod';
import { sortBy } from 'lodash';

import * as error from '@prairielearn/error';
import { loadSqlEquiv, queryAsync, queryRows } from '@prairielearn/postgres';
import { flash } from '@prairielearn/flash';

import { getInstitution } from '../../lib/institution';
import { InstitutionAdminLti13 } from './institutionAdminLti13.html';
import { Lti13Instance, Lti13InstanceSchema } from '../../../lib/db-types';
import { getCanonicalHost } from '../../../lib/url';
import { config } from '../../../lib/config';
import { LTI13InstancePlatforms } from './institutionAdminLti13.types';

const sql = loadSqlEquiv(__filename);
const router = Router({ mergeParams: true });

// Middleware to check for feature and access
router.use(
  asyncHandler(async (req, res, next) => {
    if (!res.locals.lti13_enabled) {
      throw error.make(403, 'Access denied (feature not available)');
    }
    next();
  }),
);

router.get(
  '/:unsafe_lti13_instance_id?',
  asyncHandler(async (req, res) => {
    const institution = await getInstitution(req.params.institution_id);
    const lti13Instances = await queryRows(
      sql.select_instances,
      {
        institution_id: req.params.institution_id,
      },
      Lti13InstanceSchema,
    );

    const platform_defaults_hardcoded: LTI13InstancePlatforms = [
      {
        platform: 'Unknown',
        display_order: 0,
        issuer_params: {},
      },
      {
        platform: 'Canvas Production',
        display_order: 10,
        issuer_params: {
          issuer: 'https://canvas.instructure.com',
          jwks_uri: 'https://sso.canvaslms.com/api/lti/security/jwks',
          token_endpoint: 'https://sso.canvaslms.com/login/oauth2/token',
          authorization_endpoint: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
        },
        custom_fields: {
          uin: '$Canvas.user.sisIntegrationId',
        },
      },
    ];

    const platform_defaults = sortBy(
      [...platform_defaults_hardcoded, ...config.lti13InstancePlatforms],
      ['display_order', 'platform'],
    );

    let paramInstance: Lti13Instance | undefined;

    // Handle the / (no id passed case)
    if (typeof req.params.unsafe_lti13_instance_id === 'undefined') {
      if (lti13Instances.length > 0) {
        return res.redirect(
          `/pl/institution/${institution.id}/admin/lti13/${lti13Instances[0].id}`,
        );
      }
      // else continue through, the html.ts page handles the 0 instances case
    } else {
      // id passed should be valid
      paramInstance = lti13Instances.find(({ id }) => id === req.params.unsafe_lti13_instance_id);

      if (!paramInstance) {
        throw error.make(404, `LTI 1.3 instance ${req.params.unsafe_lti13_instance_id} not found`);
      }
    }

    res.send(
      InstitutionAdminLti13({
        institution,
        lti13Instances,
        instance: paramInstance ?? null,
        resLocals: res.locals,
        platform_defaults,
        canonicalHost: getCanonicalHost(req),
      }),
    );
  }),
);

router.post(
  '/:unsafe_lti13_instance_id?',
  asyncHandler(async (req, res) => {
    if (req.body.__action === 'add_key') {
      const keystoreJson = await queryAsync(sql.select_keystore, {
        unsafe_lti13_instance_id: req.params.unsafe_lti13_instance_id,
        institution_id: req.params.institution_id,
      });
      const keystore = await jose.JWK.asKeyStore(keystoreJson?.rows[0]?.keystore || []);

      const kid = new Date().toUTCString();
      // RSA256 minimum keysize of 2048 bits
      await keystore.generate('RSA', 2048, {
        alg: 'RS256',
        use: 'sig',
        kid,
      });

      await queryAsync(sql.update_keystore, {
        unsafe_lti13_instance_id: req.params.unsafe_lti13_instance_id,
        institution_id: req.params.institution_id,
        // true to include private keys
        keystore: keystore.toJSON(true),
      });
      flash('success', `Key ${kid} added.`);
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_keys') {
      await queryAsync(sql.update_keystore, {
        unsafe_lti13_instance_id: req.params.unsafe_lti13_instance_id,
        institution_id: req.params.institution_id,
        keystore: null,
      });
      flash('success', `All keys deleted.`);
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'delete_key') {
      const keystoreJson = await queryAsync(sql.select_keystore, {
        unsafe_lti13_instance_id: req.params.unsafe_lti13_instance_id,
        institution_id: req.params.institution_id,
      });
      const keystore = await jose.JWK.asKeyStore(keystoreJson?.rows[0]?.keystore || []);

      const key = keystore.get(req.body.kid);

      // Validate the key before removal because keystore.get() returns the first key
      if (req.body.kid === key.kid) {
        keystore.remove(key);

        await queryAsync(sql.update_keystore, {
          unsafe_lti13_instance_id: req.params.unsafe_lti13_instance_id,
          institution_id: req.params.institution_id,
          // true to include private keys
          keystore: keystore.toJSON(true),
        });
        flash('success', `Key ${key.kid} deleted.`);
        return res.redirect(req.originalUrl);
      } else {
        throw error.make(500, 'error removing key');
      }
    } else if (req.body.__action === 'update_platform') {
      const url = getCanonicalHost(req);

      const client_params = {
        client_id: req.body.client_id || null,
        redirect_uris: [
          `${url}/pl/lti13_instance/${req.params.unsafe_lti13_instance_id}/auth/callback`,
        ],
        token_endpoint_auth_method: 'private_key_jwt',
        token_endpoint_auth_signing_alg: 'RS256',
      };

      await queryAsync(sql.update_platform, {
        unsafe_lti13_instance_id: req.params.unsafe_lti13_instance_id,
        institution_id: req.params.institution_id,
        issuer_params: req.body.issuer_params,
        platform: req.body.platform,
        client_params,
        custom_fields: req.body.custom_fields,
      });
      flash('success', `Platform updated.`);
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'add_instance') {
      const new_li = await queryRows(
        sql.insert_instance,
        {
          institution_id: req.params.institution_id,
          name_attr: 'name',
          uid_attr: 'email',
          uin_attr: '["https://purl.imsglobal.org/spec/lti/claim/custom"]["uin"]',
        },
        z.string(),
      );
      flash('success', `Instance #${new_li} added.`);

      return res.redirect(`/pl/institution/${req.params.institution_id}/admin/lti13/${new_li}`);
    } else if (req.body.__action === 'update_name') {
      await queryAsync(sql.update_name, {
        name: req.body.name,
        institution_id: req.params.institution_id,
        unsafe_lti13_instance_id: req.params.unsafe_lti13_instance_id,
      });
      flash('success', `Name updated.`);
      return res.redirect(req.originalUrl);
    } else if (req.body.__action === 'save_pl_config') {
      await queryAsync(sql.update_pl_config, {
        name_attribute: req.body.name_attribute,
        uid_attribute: req.body.uid_attribute,
        uin_attribute: req.body.uin_attribute,
        institution_id: req.params.institution_id,
        unsafe_lti13_instance_id: req.params.unsafe_lti13_instance_id,
      });
      flash('success', `PrairieLearn config updated.`);
      res.redirect(req.originalUrl);
    } else if (req.body.__action === 'remove_instance') {
      await queryAsync(sql.remove_instance, {
        institution_id: req.params.institution_id,
        unsafe_lti13_instance_id: req.params.unsafe_lti13_instance_id,
      });
      flash('success', `Instance deleted.`);
      return res.redirect(req.originalUrl);
    } else {
      throw error.make(400, `unknown __action: ${req.body.__action}`);
    }
  }),
);

export default router;
