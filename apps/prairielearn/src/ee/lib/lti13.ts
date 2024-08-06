import type { Request } from 'express';
import _ from 'lodash';
import fetch, { Response, RequestInfo, RequestInit } from 'node-fetch';
import { Issuer, TokenSet } from 'openid-client';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';
import { loadSqlEquiv, queryRow, queryAsync, runInTransactionAsync } from '@prairielearn/postgres';

import {
  DateFromISOString,
  Lti13InstanceSchema,
  Lti13CourseInstanceSchema,
} from '../../lib/db-types.js';
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

export const Lti13CombinedInstanceSchema = z.object({
  lti13_course_instance: Lti13CourseInstanceSchema,
  lti13_instance: Lti13InstanceSchema,
});
export type Lti13CombinedInstance = z.infer<typeof Lti13CombinedInstanceSchema>;

export const Lti13LineitemSchema = z.object({
  id: z.string(),
  label: z.string(),
  scoreMaximum: z.number(),
  resourceId: z.string().optional(),
  resourceLinkId: z.string().optional(),
  tag: z.string().optional(),
  startDateTime: DateFromISOString.optional(),
  endDateTime: DateFromISOString.optional(),
  gradesReleased: z.boolean().optional(),
  'https://canvas.instructure.com/lti/submission_type': z.object({
    type: z.enum(['none', 'external_tool']).optional(),
    external_tool_url: z.string().optional(),
  }),
});
export type Lti13LineitemType = z.infer<typeof Lti13LineitemSchema>;

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
    return tokenSet.access_token;
  } else {
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
    return tokenSet.access_token;
  }
}

export async function get_lineitems(instance: Lti13CombinedInstance) {
  if (instance.lti13_course_instance.lineitems == null) {
    throw new Error('Lineitems not defined');
  }
  const token = await access_token(instance.lti13_instance.id);
  const response = await fetchRetry(instance.lti13_course_instance.lineitems, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const data = (await response.json()) as Lti13LineitemType[];
  //console.log(data);
  return data;
}

/*
 * Canvas supports an API call to get a single lineitem.
 * https://canvas.instructure.com/doc/api/line_items.html#method.lti/ims/line_items.show
 * But in testing Dave discovered its output might not be the same as
 * lineitems (plural).
 *
 * So instead of a get_lineitem() function, let's get_lineitems and filter.
 */

/////////////////////////////////////////////////////////////////////////////////////////////////
export async function sync_lineitems(instance: Lti13CombinedInstance, job: ServerJob) {
  job.info(
    `Polling for external assignments from ${instance.lti13_instance.name} ${instance.lti13_course_instance.context_label}`,
  );

  const data = await get_lineitems(instance);

  await runInTransactionAsync(async () => {
    await queryAsync(sql.create_lineitems_temp, {});

    for (const item of data) {
      job.info(`* ${item.label}`);

      await queryAsync(sql.insert_lineitems_temp, {
        lti13_course_instance_id: instance.lti13_course_instance.id,
        lineitem_id: item.id,
        lineitem: JSON.stringify(item),
      });
    }

    const output = await queryRow(
      sql.sync_lti13_lineitems,
      {
        lti13_course_instance_id: instance.lti13_course_instance.id,
      },
      z.object({
        updated: z.string(),
        deleted: z.string(),
      }),
    );

    job.info(
      `\nSummary of PrairieLearn changes: ${output.updated} updated, ${output.deleted} deleted.`,
    );
    job.info('Done.');
  });
}

export async function create_and_link_lineitem(
  instance: any,
  job: ServerJob,
  assessment: {
    label: string;
    id: string;
    url: string;
  },
) {
  const createBody: Lti13LineitemType = {
    id: 'new_lineitem', // will be ignored/overwritten by the LMS platform
    scoreMaximum: 100,
    label: assessment.label,
    resourceId: assessment.id,
    // tag ???
    // startDateTime null
    // endDateTime null
    'https://canvas.instructure.com/lti/submission_type': {
      type: 'external_tool',
      external_tool_url: assessment.url,
    },
  };

  job.info(
    `Creating assignment for ${assessment.label} in ${instance.lti13_instance.name} ${instance.lti13_course_instance.context_label}`,
  );

  const token = await access_token(instance.lti13_instance.id);
  const response = await fetchRetry(instance.lti13_course_instance.lineitems, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-type': 'application/vnd.ims.lis.v2.lineitem+json',
    },
    body: JSON.stringify(createBody),
  });

  const item = (await response.json()) as Lti13LineitemType;

  job.info('Associating PrairieLearn assessment with the new assignment');

  await link_assessment(instance.lti13_course_instance.id, assessment.id, item);
  job.info('Done.');
}

export async function query_and_link_lineitem(
  instance: any,
  lineitem_id: string,
  assessment_id: string | number,
) {
  const lineitems = await get_lineitems(instance);
  const item = lineitems.find(({ id }) => id === lineitem_id);

  if (item) {
    await link_assessment(instance.lti13_course_instance.id, assessment_id, item);
  } else {
    throw new HttpStatusError(400, 'Lineitem not found');
  }
}

export async function unlink_assessment(
  lti13_course_instance_id: string,
  assessment_id: string | number,
) {
  await queryAsync(sql.delete_lineitem_by_assessment_id, {
    lti13_course_instance_id,
    assessment_id,
  });
}

export async function link_assessment(
  lti13_course_instance_id: string,
  assessment_id: string | number,
  lineitem: Lti13LineitemType,
) {
  await queryAsync(sql.update_lineitem, {
    lti13_course_instance_id,
    lineitem_id: lineitem.id,
    lineitem: JSON.stringify(lineitem),
    assessment_id,
  });
}

function sleep(delay: number) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// based on https://github.com/greatjapa/node-fetch-retry/blob/master/index.js
// https://httpbin.org/status/403
// TODO: Check for throttling
// https://canvas.instructure.com/doc/api/file.throttling.html
// 403 Forbidden (Rate Limit Exceeded)
// X-Request-Cost
// X-Rate-Limit-Remaining

//await fetchRetry('https://httpbin.org/status/403');

async function fetchRetry(input: RequestInfo | URL, opts?: RequestInit | undefined) {
  let retryLeft = 5;
  let response: Response;
  while (retryLeft >= 0) {
    try {
      response = await fetch(input, opts);
      if (response.ok) {
        break;
      } else {
        throw new HttpStatusError(response.status, response.statusText);
      }
    } catch (err) {
      if (retryLeft === 0) {
        throw err;
      }
      await sleep(1000);
    } finally {
      retryLeft -= 1;
    }
  }
  return response;
}
