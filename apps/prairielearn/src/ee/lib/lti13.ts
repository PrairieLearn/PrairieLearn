import { setTimeout as sleep } from 'timers/promises';

import { parseLinkHeader } from '@web3-storage/parse-link-header';
import type { Request } from 'express';
import _ from 'lodash';
import fetch, { RequestInfo, RequestInit } from 'node-fetch';
import { Issuer, TokenSet } from 'openid-client';
import { z } from 'zod';

import { HttpStatusError, makeWithData } from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryAsync, runInTransactionAsync } from '@prairielearn/postgres';

import {
  DateFromISOString,
  Lti13InstanceSchema,
  Lti13CourseInstanceSchema,
} from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { ServerJob } from '../../lib/server-jobs.js';
import { selectLti13Instance } from '../models/lti13Instance.js';

import { getInstitutionAuthenticationProviders } from './institution.js';

const sql = loadSqlEquiv(import.meta.url);

// Scope list at
// https://canvas.instructure.com/doc/api/file.lti_dev_key_config.html#anatomy-of-a-json-configuration
const TOKEN_SCOPES = [
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  'https://purl.imsglobal.org/spec/lti-ags/scope/score',
];

export const Lti13CombinedInstanceSchema = z.object({
  lti13_course_instance: Lti13CourseInstanceSchema,
  lti13_instance: Lti13InstanceSchema,
});
export type Lti13CombinedInstance = z.infer<typeof Lti13CombinedInstanceSchema>;

export const LineitemSchema = z.object({
  id: z.string(),
  label: z.string(),
  scoreMaximum: z.number(),
  resourceId: z.string().optional(),
  resourceLinkId: z.string().optional(),
  tag: z.string().optional(),
  startDateTime: DateFromISOString.optional(),
  endDateTime: DateFromISOString.optional(),
  gradesReleased: z.boolean().optional(),
  'https://canvas.instructure.com/lti/submission_type': z
    .object({
      type: z.enum(['none', 'external_tool']).optional(),
      external_tool_url: z.string().optional(),
    })
    .optional(),
});
export type Lineitem = z.infer<typeof LineitemSchema>;

export const LineitemsSchema = z.array(LineitemSchema);
export type Lineitems = z.infer<typeof LineitemsSchema>;

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

  get(property: _.PropertyPath): any {
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

  const hasLti13CourseInstance = await queryRow(
    sql.select_ci_validation,
    {
      course_instance_id: resLocals.course_instance.id,
    },
    z.boolean(),
  );

  if (!hasLti13CourseInstance) {
    return false;
  }

  const instAuthProviders = await getInstitutionAuthenticationProviders(resLocals.institution.id);
  return instAuthProviders.some((a) => a.name === 'LTI 1.3');
}

export async function getAccessToken(lti13_instance_id: string) {
  const lti13_instance = await selectLti13Instance(lti13_instance_id);

  let tokenSet: TokenSet = lti13_instance.access_tokenset;

  // -5 minute buffer to refresh tokens before they expire
  if (
    lti13_instance.access_token_expires_at &&
    lti13_instance.access_token_expires_at > new Date(Date.now() - 5 * 60 * 1000)
  ) {
    return tokenSet.access_token;
  }

  // Fetch the token
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
    access_tokenset: tokenSet,
    access_token_expires_at: new Date(expires_at),
  });
  return tokenSet.access_token;
}

export async function getLineitems(instance: Lti13CombinedInstance) {
  if (instance.lti13_course_instance.lineitems_url == null) {
    throw new Error('Lineitems not defined');
  }
  const token = await getAccessToken(instance.lti13_instance.id);
  const lineitems = LineitemsSchema.parse(
    await fetchRetry(instance.lti13_course_instance.lineitems_url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }),
  );

  return lineitems;
}

export async function getLineitem(instance: Lti13CombinedInstance, lineitem_id_url: string) {
  const token = await getAccessToken(instance.lti13_instance.id);
  const lineitem = LineitemSchema.parse(
    await fetchRetry(lineitem_id_url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }),
  );

  return lineitem;
}

export async function syncLineitems(instance: Lti13CombinedInstance, job: ServerJob) {
  job.info(
    `Polling for external assignments from ${instance.lti13_instance.name} ${instance.lti13_course_instance.context_label}`,
  );
  const lineitems = await getLineitems(instance);
  job.info(`Found ${lineitems.length} assignments.`);

  const lineitems_import = lineitems.map((item) => {
    return {
      lineitem: item,
      lineitem_id_url: item.id,
      lti13_course_instance_id: instance.lti13_course_instance.id,
    };
  });

  await runInTransactionAsync(async () => {
    const output = await queryRow(
      sql.sync_lti13_assessments,
      {
        lti13_course_instance_id: instance.lti13_course_instance.id,
        lineitems_import: JSON.stringify(lineitems_import),
      },
      z.object({
        updated: z.string(),
        deleted: z.string(),
      }),
    );

    job.info(
      `\nSummary of PrairieLearn changes: ${output.updated} updated, ${output.deleted} deleted.`,
    );
  });
  job.info('Done.');
}

export async function createAndLinkLineitem(
  instance: Lti13CombinedInstance,
  job: ServerJob,
  assessment: {
    label: string;
    id: string;
    url: string;
  },
) {
  if (instance.lti13_course_instance.lineitems_url == null) {
    throw new Error('Lineitems not defined');
  }

  const createBody: Omit<Lineitem, 'id'> = {
    scoreMaximum: 100,
    label: assessment.label,
    resourceId: assessment.id,
    'https://canvas.instructure.com/lti/submission_type': {
      type: 'external_tool',
      external_tool_url: assessment.url,
    },
  };

  job.info(
    `Creating assignment for ${assessment.label} in ${instance.lti13_instance.name} ${instance.lti13_course_instance.context_label}`,
  );

  const token = await getAccessToken(instance.lti13_instance.id);
  const item = LineitemSchema.parse(
    await fetchRetry(instance.lti13_course_instance.lineitems_url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-type': 'application/vnd.ims.lis.v2.lineitem+json',
      },
      body: JSON.stringify(createBody),
    }),
  );

  job.info('Associating PrairieLearn assessment with the new assignment');

  await linkAssessment(instance.lti13_course_instance.id, assessment.id, item);
  job.info('Done.');
}

export async function queryAndLinkLineitem(
  instance: Lti13CombinedInstance,
  lineitem_id_url: string,
  assessment_id: string | number,
) {
  const item = await getLineitem(instance, lineitem_id_url);

  if (item) {
    await linkAssessment(instance.lti13_course_instance.id, assessment_id, item);
  } else {
    throw new HttpStatusError(400, 'Lineitem not found');
  }
}

export async function unlinkAssessment(
  lti13_course_instance_id: string,
  assessment_id: string | number,
) {
  await queryAsync(sql.delete_lti13_assessment, {
    lti13_course_instance_id,
    assessment_id,
  });
}

export async function linkAssessment(
  lti13_course_instance_id: string,
  assessment_id: string | number,
  lineitem: Lineitem,
) {
  await queryAsync(sql.upsert_lti13_assessment, {
    lti13_course_instance_id,
    lineitem_id_url: lineitem.id,
    lineitem: JSON.stringify(lineitem),
    assessment_id,
  });
}

/* Throttling notes
// https://canvas.instructure.com/doc/api/file.throttling.html
// 403 Forbidden (Rate Limit Exceeded)
// X-Request-Cost
// X-Rate-Limit-Remaining
*/
export async function fetchRetry(
  input: RequestInfo | URL,
  opts?: RequestInit | undefined,
  incomingfetchRetryOpts?: {
    retryLeft?: number;
    sleepMs?: number;
  },
) {
  const fetchRetryOpts = {
    retryLeft: 5,
    sleepMs: 1000,
    ...incomingfetchRetryOpts,
  };
  try {
    const response = await fetch(input, opts);

    if (!response.ok) {
      throw makeWithData('LTI 1.3 fetch error, please try again', {
        status: response.status,
        statusText: response.statusText,
        body: response.text(),
      });
    }

    const parsed = parseLinkHeader(response.headers.get('link')) ?? {};
    if ('next' in parsed) {
      const results = await response.json();

      if (Array.isArray(results)) {
        return results.concat(await fetchRetry(parsed.next.url, opts, fetchRetryOpts));
      }
    }

    return await response.json();
  } catch (err) {
    fetchRetryOpts.retryLeft -= 1;
    if (fetchRetryOpts.retryLeft === 0) {
      throw err;
    }
    await sleep(fetchRetryOpts.sleepMs);
    return await fetchRetry(input, opts, fetchRetryOpts);
  }
}
