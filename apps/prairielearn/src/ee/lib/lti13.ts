import { setTimeout as sleep } from 'timers/promises';

import { parseLinkHeader } from '@web3-storage/parse-link-header';
import type { Request } from 'express';
import _ from 'lodash';
import fetch, { type RequestInfo, type RequestInit, type Response } from 'node-fetch';
import { Issuer, type TokenSet } from 'openid-client';
import { z } from 'zod';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import {
  loadSqlEquiv,
  queryRow,
  queryRows,
  queryAsync,
  runInTransactionAsync,
} from '@prairielearn/postgres';

import {
  AssessmentInstanceSchema,
  DateFromISOString,
  Lti13InstanceSchema,
  Lti13CourseInstanceSchema,
  AssessmentSchema,
  UserSchema,
} from '../../lib/db-types.js';
import { features } from '../../lib/features/index.js';
import { type ServerJob } from '../../lib/server-jobs.js';
import { selectLti13Instance } from '../models/lti13Instance.js';

import { getInstitutionAuthenticationProviders } from './institution.js';

const sql = loadSqlEquiv(import.meta.url);

// Scope list at
// https://canvas.instructure.com/doc/api/file.lti_dev_key_config.html#anatomy-of-a-json-configuration
const TOKEN_SCOPES = [
  'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
  'https://purl.imsglobal.org/spec/lti-ags/scope/score',
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly',
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
    } catch (err) {
      throw new AugmentedError('LTI session invalid or timed out, please try logging in again.', {
        cause: err,
        status: 403,
      });
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

  get context_memberships_url() {
    this.assertValid();
    return this.claims['https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice']
      ?.context_memberships_url;
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

  const fiveMinutesInTheFuture = new Date(Date.now() + 5 * 60 * 1000);

  if (
    lti13_instance.access_token_expires_at &&
    lti13_instance.access_token_expires_at > fiveMinutesInTheFuture
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
    throw new HttpStatusError(400, 'Lineitems not defined');
  }
  const token = await getAccessToken(instance.lti13_instance.id);
  const fetchArray = await fetchRetryPaginated(instance.lti13_course_instance.lineitems_url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const lineitems = LineitemsSchema.array().parse(fetchArray);
  return lineitems.flat();
}

export async function getLineitem(instance: Lti13CombinedInstance, lineitem_id_url: string) {
  const token = await getAccessToken(instance.lti13_instance.id);
  const fetchRes = await fetchRetry(lineitem_id_url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  return LineitemSchema.parse(await fetchRes.json());
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
    throw new HttpStatusError(400, 'Lineitems not defined');
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
  const fetchRes = await fetchRetry(instance.lti13_course_instance.lineitems_url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-type': 'application/vnd.ims.lis.v2.lineitem+json',
    },
    body: JSON.stringify(createBody),
  });
  const item = LineitemSchema.parse(await fetchRes.json());

  job.info('Associating PrairieLearn assessment with the new assignment');

  await linkAssessment(instance.lti13_course_instance.id, assessment.id, item);
  job.info('Done.');
}

export async function queryAndLinkLineitem(
  instance: Lti13CombinedInstance,
  lineitem_id_url: string,
  unsafe_assessment_id: string | number,
) {
  const item = await getLineitem(instance, lineitem_id_url);

  if (item) {
    await linkAssessment(instance.lti13_course_instance.id, unsafe_assessment_id, item);
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
  unsafe_assessment_id: string | number,
  lineitem: Lineitem,
) {
  const assessment = await queryRow(
    sql.select_assessment_in_lti13_course_instance,
    {
      unsafe_assessment_id,
      lti13_course_instance_id,
    },
    AssessmentSchema,
  );

  if (assessment === null) {
    throw new HttpStatusError(403, 'Invalid assessment id');
  }

  await queryAsync(sql.upsert_lti13_assessment, {
    lti13_course_instance_id,
    lineitem_id_url: lineitem.id,
    lineitem: JSON.stringify(lineitem),
    assessment_id: assessment.id,
  });
}

/* Throttling notes
// https://canvas.instructure.com/doc/api/file.throttling.html
// 403 Forbidden (Rate Limit Exceeded)
// X-Request-Cost
// X-Rate-Limit-Remaining
*/

/**
 * Make HTTP fetch requests with retries
 *
 * @param input URL to visit
 * @param opts fetch options
 * @param incomingfetchRetryOpts options specific to fetchRetry
 * @returns Node fetch response object
 */
export async function fetchRetry(
  input: RequestInfo | URL,
  opts?: RequestInit | undefined,
  incomingfetchRetryOpts?: {
    retryLeft?: number;
    sleepMs?: number;
  },
): Promise<Response> {
  const fetchRetryOpts = {
    retryLeft: 5,
    sleepMs: 1000,
    ...incomingfetchRetryOpts,
  };
  try {
    const response = await fetch(input, opts);

    switch (response.status) {
      // 422 Unprocessable Entity, User not found in course or is not a student
      case 422:
        return response;
    }

    if (!response.ok) {
      throw new AugmentedError('LTI 1.3 fetch error, please try again', {
        data: {
          status: response.status,
          statusText: response.statusText,
          body: await response.text(),
        },
      });
    }
    return response;
  } catch (err) {
    fetchRetryOpts.retryLeft -= 1;
    if (fetchRetryOpts.retryLeft === 0) {
      throw err;
    }
    await sleep(fetchRetryOpts.sleepMs);
    return await fetchRetry(input, opts, fetchRetryOpts);
  }
}

/**
 * Pagination wrapper around fetchRetry
 *
 * @param input
 * @param opts
 * @param incomingfetchRetryOpts
 * @param input URL to visit
 * @param opts fetch options
 * @param incomingfetchRetryOpts options specific to fetchRetry
 * @returns Array of JSON responses from fetch
 */
export async function fetchRetryPaginated(
  input: RequestInfo | URL,
  opts?: RequestInit | undefined,
  incomingfetchRetryOpts?: {
    retryLeft?: number;
    sleepMs?: number;
  },
): Promise<unknown[]> {
  const output: unknown[] = [];

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await fetchRetry(input, opts, incomingfetchRetryOpts);
    output.push(await res.json());

    const parsed = parseLinkHeader(res.headers.get('link')) ?? {};
    if ('next' in parsed) {
      input = parsed.next.url;
    } else {
      return output;
    }
  }
}

// https://www.imsglobal.org/spec/lti-ags/v2p0#score-publish-service
export const Lti13ScoreSchema = z.object({
  scoreGiven: z.number(),
  scoreMaximum: z.number(),
  userId: z.string(),
  scoringUserId: z.string().optional(),
  activityProgress: z.enum(['Initialized', 'Started', 'InProgress', 'Submitted', 'Completed']),
  gradingProgress: z.enum(['FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady']),
  timestamp: DateFromISOString,
  submission: z.any().optional(),
  startedAt: DateFromISOString.optional(),
  submittedAt: DateFromISOString.optional(),
  comment: z.string().optional(),
});
export type Lti13Score = z.infer<typeof Lti13ScoreSchema>;

const UsersWithLti13SubSchema = UserSchema.extend({
  lti13_sub: z.string().nullable(),
});
type UsersWithLti13Sub = z.infer<typeof UsersWithLti13SubSchema>;

// https://www.imsglobal.org/spec/lti-nrps/v2p0/#sharing-of-personal-data
const ContextMembershipSchema = z.object({
  user_id: z.string(),
  roles: z.string().array(), // https://www.imsglobal.org/spec/lti/v1p3#role-vocabularies
  status: z.enum(['Active', 'Inactive', 'Deleted']).optional(),
  email: z.string().optional(),
});
type ContextMembership = z.infer<typeof ContextMembershipSchema>;

const ContextMembershipContainerSchema = z.object({
  id: z.string(),
  context: z.object({
    id: z.string(),
  }),
  members: ContextMembershipSchema.array(),
});

class Lti13ContextMembership {
  #memberships: Record<string, ContextMembership[]> = {};

  private constructor(memberships: ContextMembership[]) {
    // Turn array into an object for efficient lookups. We need to retain duplicates
    // so that we can detect and handle the case where two users have the same email.
    for (const member of memberships) {
      if (member.email === undefined) {
        continue;
      }
      this.#memberships[member.email] ??= [];
      this.#memberships[member.email].push(member);
    }
  }

  static async loadForInstance({
    lti13_instance,
    lti13_course_instance,
  }: Lti13CombinedInstance): Promise<Lti13ContextMembership> {
    if (lti13_course_instance.context_memberships_url === null) {
      throw new HttpStatusError(
        403,
        'LTI 1.3 course instance context_memberships_url not configured',
      );
    }

    const token = await getAccessToken(lti13_instance.id);
    const fetchArray = await fetchRetryPaginated(lti13_course_instance.context_memberships_url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-type': 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
      },
    });

    const containers = ContextMembershipContainerSchema.array().parse(fetchArray);
    const ltiMemberships = containers.flatMap((c) => {
      return c.members;
    });

    const filteredMemberships = ltiMemberships.filter((member: ContextMembership) => {
      // Skip invalid cases
      if (
        member.roles.includes('http://purl.imsglobal.org/vocab/lti/system/person#TestUser') ||
        !('email' in member)
      ) {
        return false;
      }

      return true;
    });

    return new Lti13ContextMembership(filteredMemberships);
  }

  /**
   * @param user The user to look up.
   * @returns The LTI 1.3 sub (user_id) for the user, or null if not found.
   */
  async lookup(user: UsersWithLti13Sub): Promise<string | null> {
    if (user.lti13_sub !== null) {
      return user.lti13_sub;
    }

    for (const match of ['uid', 'email']) {
      const memberResults = this.#memberships[user[match]];

      if (!memberResults) continue;

      // member.email cannot be duplicated in memberships
      if (memberResults.length > 1) return null;

      // The `user_id` that we get from the membership API is what we call `lti13_sub`.
      return memberResults[0].user_id;
    }

    // The user wan't found.
    return null;
  }
}

export async function updateLti13Scores(
  unsafe_assessment_id: string | number,
  instance: Lti13CombinedInstance,
  job: ServerJob,
) {
  // Get the assessment metadata
  const assessment = await queryRow(
    sql.select_assessment_for_lti13_scores,
    {
      unsafe_assessment_id,
      lti13_course_instance_id: instance.lti13_course_instance.id,
    },
    AssessmentSchema.extend({
      lti13_lineitem_id_url: z.string(),
      lti13_instance_id: z.string(),
      context_memberships_url: z.string(),
    }),
  );

  if (assessment === null) {
    throw new HttpStatusError(403, 'Invalid assessment.id');
  }

  job.info(`Sending grade data for ${assessment.tid} ${assessment.title}`);

  const token = await getAccessToken(instance.lti13_instance.id);

  const assessment_instances = await queryRows(
    sql.select_assessment_instances_for_scores,
    {
      assessment_id: assessment.id,
    },
    AssessmentInstanceSchema.extend({
      score_perc: z.number(), // not .nullable() from SQL query
      date: DateFromISOString, // not .nullable() from SQL query
      users: UsersWithLti13SubSchema.array(),
    }),
  );

  const memberships = await Lti13ContextMembership.loadForInstance(instance);
  const timestamp = new Date();

  for (const assessment_instance of assessment_instances) {
    for (const user of assessment_instance.users) {
      job.info(`ai=${assessment_instance.id}, ${assessment_instance.score_perc}% for ${user.name}`);

      const userId = await memberships.lookup(user);
      if (userId === null) {
        job.warn(`* Could not find LTI user information for ${user.name} ${user.uid}, skipping...`);
        continue;
      }

      /*
       https://www.imsglobal.org/spec/lti-ags/v2p0#score-service-media-type-and-schema
       Canvas has extensions we could use described at
       https://canvas.instructure.com/doc/api/score.html#method.lti/ims/scores.create
      */
      const score: Lti13Score = {
        timestamp,
        startedAt: assessment_instance.date,
        scoreGiven: assessment_instance.score_perc,
        scoreMaximum: 100,
        activityProgress: assessment_instance.open ? 'Submitted' : 'Completed',
        gradingProgress: 'FullyGraded',
        userId,
      };

      const res = await fetchRetry(assessment.lti13_lineitem_id_url + '/scores', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-type': 'application/vnd.ims.lis.v1.score+json',
        },
        body: JSON.stringify(score),
      });

      job.info(`\t${res.statusText}`);
      if (!res.ok) {
        job.warn(`\t${await res.text()}`);
      }
    }
  }
}
