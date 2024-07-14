import { join } from 'path';

import type { Request } from 'express';
import _ from 'lodash';
import fetch from 'node-fetch';
import { Issuer, TokenSet } from 'openid-client';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryAsync } from '@prairielearn/postgres';

import { features } from '../../lib/features/index.js';
import { ServerJob } from '../../lib/server-jobs.js';
import { selectLti13Instance } from '../models/lti13Instance.js';

const sql = loadSqlEquiv(import.meta.url);

const TOKEN_SCOPES = [
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  //'https://purl.imsglobal.org/spec/lti-ags/scope/result.readonly',
  'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  //'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
  //'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem.readonly',
  //'https://canvas.instructure.com/lti/public_jwk/scope/update',
];

// Validate LTI 1.3
// https://www.imsglobal.org/spec/lti/v1p3#required-message-claims
export const Lti13ClaimSchema = z.object({
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
export type Lti13ClaimType = z.infer<typeof Lti13ClaimSchema>;

export class Lti13Claim {
  private claims: Lti13ClaimType;
  private req: Request;
  private valid = false;

  constructor(req: Request) {
    try {
      this.claims = Lti13ClaimSchema.passthrough().parse(req.session.lti13_claims);
    } catch {
      throw new HttpStatusError(
        403,
        'LTI session invalid or timed out, please try logging in again.',
      );
    }
    this.valid = true;
    this.req = req;

    // Check to see that it's not expired
    this.assertValid();

    console.log(JSON.stringify(this.claims, null, 2));
  }

  // Accessors

  get context() {
    this.assertValid();
    return this.claims['https://purl.imsglobal.org/spec/lti/claim/context'];
  }

  get roles() {
    this.assertValid();
    return this.claims['https://purl.imsglobal.org/spec/lti/claim/roles'];
  }

  get deployment_id() {
    this.assertValid();
    return this.claims['https://purl.imsglobal.org/spec/lti/claim/deployment_id'];
  }

  get target_link_uri() {
    this.assertValid();
    return this.claims['https://purl.imsglobal.org/spec/lti/claim/target_link_uri'];
  }

  get lineitems() {
    this.assertValid();
    return this.claims['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint']?.lineitems;
  }

  // Functions

  private assertValid() {
    if (!this.valid || Math.floor(Date.now() / 1000) > this.claims.exp) {
      this.valid = false;
      delete this.req.session['lti13_claims'];
      throw new HttpStatusError(
        403,
        'LTI session invalid or timed out, please try logging in again.',
      );
    }
  }

  isRoleTestUser() {
    this.assertValid();
    return this.roles.includes('http://purl.imsglobal.org/vocab/lti/system/person#TestUser');
  }

  /**
   * Return if user claim has roles for Instructor. Can toggle if a TA is considered an
   * instructor or not.
   *
   * @param {boolean} taIsInstructor [false]
   * @returns boolean
   */
  isRoleInstructor(taIsInstructor = false) {
    this.assertValid();
    /*
     TA roles from Canvas development system
     [
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Student',
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
      'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant',
      'http://purl.imsglobal.org/vocab/lis/v2/system/person#User'
    ]
    */

    let role_instructor = this.roles.some((val: string) =>
      ['Instructor', 'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'].includes(val),
    );

    if (
      !taIsInstructor &&
      this.roles.includes(
        'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant',
      )
    ) {
      role_instructor = false;
    }

    return role_instructor;
  }

  get(property: string): any {
    this.assertValid();
    // Uses lodash.get to expand path representation in text to the object, like 'a[0].b.c'
    return _.get(this.claims, property);
  }

  /**
   * Invalidate the object and remove the claims from the session
   */
  remove() {
    this.valid = false;
    delete this.req.session['lti13_claims'];
    delete this.req.session['authn_lti13_instance_id'];
  }
}

export async function validateLti13CourseInstance(
  resLocals: Record<string, any>,
): Promise<boolean> {
  const feature_enabled = await features.enabledFromLocals('lti13', resLocals);

  if (!feature_enabled) {
    return false;
  }

  return await queryRow(
    sql.select_ci_validation,
    {
      course_instance_id: resLocals.course_instance.id,
    },
    z.boolean(),
  );
}

export async function access_token(lti13_instance_id: string) {
  const lti13_instance = await selectLti13Instance(lti13_instance_id);

  let tokenSet: TokenSet = lti13_instance.access_tokenset;

  if (
    lti13_instance.access_token_expires_at &&
    lti13_instance.access_token_expires_at > new Date()
  ) {
    console.log('Token is valid');
  } else {
    console.log('Token expired');

    const issuer = new Issuer(lti13_instance.issuer_params);
    const client = new issuer.Client(lti13_instance.client_params, lti13_instance.keystore);

    tokenSet = await client.grant({
      grant_type: 'client_credentials',
      scope: TOKEN_SCOPES.join(' '),
    });

    // Store the token for reuse

    const expires_at = tokenSet.expires_at ? tokenSet.expires_at * 1000 : Date.now();

    await queryAsync(sql.update_token, {
      lti13_instance_id,
      tokenSet,
      expires_at: new Date(expires_at),
    });
  }
  console.log(tokenSet);
  return tokenSet.access_token;
}

/////////////////////////////////////////////////////////////////////////////////////////////////
export async function get_lineitems(instance: any, job: ServerJob, authn_user_id: number) {
  console.log(instance);

  const token = await access_token(instance.lti13_instance.id);

  job.info(`Token: ${token}`);
  job.info('Polling for line items');

  const response = await fetch(instance.lti13_course_instance.lineitems, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = await response.json();
  console.log(data);

  job.info(data.toString());

  /*
  // Make this a more targetted single row query
  const lti13_course_instance_result = await queryAsync(sql.get_course_instance, params);

  const lti13_course_instance = lti13_course_instance_result.rows[0];
  //console.log(JSON.stringify(lti13_course_instance, null, 3));

  const url = lti13_course_instance.ags_lineitems;

  // Validate here, error before moving on if we're missing things

  const token = await access_token(lti13_instance_id);

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  //console.log(response);
  const data = await response.json();

  for (const item of data) {
    console.log(item);

    await queryAsync(sql.update_lineitem, {
      lti13_instance_id,
      course_instance_id,
      lineitem_id: item.id,
      assessment_id: item?.resourceId,
      lineitem: JSON.stringify(item),
      active: true,
    });
  }

  job.info(JSON.stringify(data, null, 3));
  */
}
