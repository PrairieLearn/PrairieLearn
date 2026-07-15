import { setTimeout as sleep } from 'timers/promises';

import { parseLinkHeader } from '@web3-storage/parse-link-header';
import { get } from 'es-toolkit/compat';
import type { Request } from 'express';
import * as jose from 'jose';
import * as client from 'openid-client';
import { z } from 'zod';

import { AugmentedError, HttpStatusError } from '@prairielearn/error';
import {
  execute,
  loadSqlEquiv,
  queryRow,
  queryRows,
  runInTransactionAsync,
} from '@prairielearn/postgres';
import { DateFromISOString, IdSchema } from '@prairielearn/zod';

import { selectAssessmentInstanceLastSubmissionDate } from '../../lib/assessment.js';
import { config } from '../../lib/config.js';
import {
  AssessmentSchema,
  type CourseInstance,
  Lti13CourseInstanceSchema,
  type Lti13Instance,
  Lti13InstanceSchema,
  UserSchema,
} from '../../lib/db-types.js';
import { type ServerJob } from '../../lib/server-jobs.js';
import { selectUsersWithCourseInstanceAccess } from '../../models/course-instances.js';
import { selectOptionalUserByUin } from '../../models/user.js';
import { selectOptionalUserByLti13Sub } from '../models/lti13-user.js';
import { selectLti13Instance } from '../models/lti13Instance.js';

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

const LineitemSchema = z.object({
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
type Lineitem = z.infer<typeof LineitemSchema>;

const LineitemsSchema = z.array(LineitemSchema);
export type Lineitems = z.infer<typeof LineitemsSchema>;

// Validate LTI 1.3
// https://www.imsglobal.org/spec/lti/v1p3#required-message-claims
const Lti13ClaimBaseSchema = z.object({
  'https://purl.imsglobal.org/spec/lti/claim/version': z.literal('1.3.0'),
  'https://purl.imsglobal.org/spec/lti/claim/deployment_id': z.string(),
  'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': z.string(),

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

  // https://www.imsglobal.org/spec/lti-ags/v2p0#assignment-and-grade-service-claim
  'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': z
    .object({
      lineitems: z.string().optional(),
      lineitem: z.string().optional(),
      scope: z.string().array(),
    })
    .optional(),

  // https://www.imsglobal.org/spec/lti-nrps/v2p0/#resource-link-membership-service
  'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': z
    .object({
      context_memberships_url: z.string(),
      service_versions: z.literal('2.0').array(),
    })
    .optional(),
});

// https://www.imsglobal.org/spec/lti/v1p3#required-message-claims
const Lti13ResourceLinkRequestSchema = Lti13ClaimBaseSchema.extend({
  'https://purl.imsglobal.org/spec/lti/claim/message_type': z.literal('LtiResourceLinkRequest'),
  'https://purl.imsglobal.org/spec/lti/claim/resource_link': z.object({
    id: z.string(),
    description: z.string().nullish(),
    title: z.string().nullish(),
  }),
});

// https://www.imsglobal.org/spec/lti-dl/v2p0#message-claims
const Lti13DeepLinkingRequestSchema = Lti13ClaimBaseSchema.extend({
  'https://purl.imsglobal.org/spec/lti/claim/message_type': z.literal('LtiDeepLinkingRequest'),
  'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': z.object({
    deep_link_return_url: z.string(),
    accept_types: z.string().array(),
    accept_presentation_document_targets: z.enum(['embed', 'iframe', 'window']).array(),
    accept_media_types: z.string().optional(),
    accept_multiple: z.boolean().optional(),
    accept_lineitem: z.boolean().optional(),
    auto_create: z.boolean().optional(),
    title: z.string().optional(),
    text: z.string().optional(),
    data: z.any().optional(),
  }),
});

export const Lti13ClaimSchema = z.discriminatedUnion(
  'https://purl.imsglobal.org/spec/lti/claim/message_type',
  [Lti13ResourceLinkRequestSchema, Lti13DeepLinkingRequestSchema],
);
type Lti13ClaimType = z.infer<typeof Lti13ClaimSchema>;

export const STUDENT_ROLE = 'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner';

export async function getOpenidClientConfig(
  lti13_instance: Lti13Instance,
  options?: client.ModifyAssertionOptions,
): Promise<client.Configuration> {
  const keystore = lti13_instance.keystore as jose.JSONWebKeySet | null | undefined;
  if (!keystore || !Array.isArray(keystore.keys) || keystore.keys.length === 0) {
    throw new Error('LTI 1.3 configuration error: no keys available in keystore');
  }

  const keyFromKeyStore = keystore.keys.at(-1);
  if (!keyFromKeyStore) {
    throw new Error('LTI 1.3 configuration error: unable to load key');
  }

  const cryptoKey = await jose.importJWK(keyFromKeyStore);
  if (cryptoKey instanceof Uint8Array) {
    throw new Error('LTI 1.3 configuration error: unsupported key type');
  }

  const openidClientConfig = new client.Configuration(
    lti13_instance.issuer_params,
    lti13_instance.client_params.client_id,
    lti13_instance.client_params,
    client.PrivateKeyJwt(
      {
        key: cryptoKey,
        kid: keyFromKeyStore.kid,
      },
      options,
    ),
  );

  // Only for testing
  if (config.devMode) {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    client.allowInsecureRequests(openidClientConfig);
  }

  return openidClientConfig;
}

export class Lti13Claim {
  private claims: Lti13ClaimType;
  private req: Request;
  private valid = false;

  constructor(req: Request) {
    try {
      this.claims = Lti13ClaimSchema.parse(req.session.lti13_claims);
    } catch (err: any) {
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

  /**
   * The resource link id for the launch. Only present on resource link requests
   * (e.g. the course-navigation launch), not deep linking requests. Returns null
   * when absent.
   */
  get resource_link_id(): string | null {
    this.assertValid();
    if (
      this.claims['https://purl.imsglobal.org/spec/lti/claim/message_type'] !==
      'LtiResourceLinkRequest'
    ) {
      return null;
    }
    return this.claims['https://purl.imsglobal.org/spec/lti/claim/resource_link'].id;
  }

  // Functions

  private assertValid() {
    if (!this.valid || Math.floor(Date.now() / 1000) > this.claims.exp) {
      this.valid = false;
      delete this.req.session.lti13_claims;
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
   */
  isRoleInstructor(): boolean {
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
    Student roles
    [
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Student',
      'http://purl.imsglobal.org/vocab/lis/v2/membership#Learner',
      'http://purl.imsglobal.org/vocab/lis/v2/system/person#User'
    ]
    Designer roles
    [
      'http://purl.imsglobal.org/vocab/lis/v2/institution/person#Instructor',
      'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
      'http://purl.imsglobal.org/vocab/lis/v2/system/person#User'
    ]
    */

    let role_instructor = this.roles.some((val: string) =>
      [
        'http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor',
        'http://purl.imsglobal.org/vocab/lis/v2/membership#ContentDeveloper',
      ].includes(val),
    );

    // TA roles may also have Instructor roles, so check this next. We don't
    // currently consider TAs to be instructors.
    if (
      this.roles.includes(
        'http://purl.imsglobal.org/vocab/lis/v2/membership/Instructor#TeachingAssistant',
      )
    ) {
      role_instructor = false;
    }

    return role_instructor;
  }

  get(property: Parameters<typeof get>[1]): any {
    this.assertValid();
    // Uses es-toolkit's get to expand path representation in text to the object, like 'a[0].b.c'
    return get(this.claims, property);
  }

  /**
   * Invalidate the object and remove the claims from the session
   */
  remove() {
    this.valid = false;
    delete this.req.session.lti13_claims;
    delete this.req.session.authn_lti13_instance_id;
  }
}

export async function getAccessToken(lti13_instance_id: string) {
  const lti13_instance = await selectLti13Instance(lti13_instance_id);

  const fiveMinutesInTheFuture = new Date(Date.now() + 5 * 60 * 1000);

  if (
    lti13_instance.access_tokenset &&
    lti13_instance.access_token_expires_at &&
    lti13_instance.access_token_expires_at > fiveMinutesInTheFuture
  ) {
    return lti13_instance.access_tokenset.access_token;
  }

  const modAssertion: client.ModifyAssertionOptions = {
    [client.modifyAssertion]: (_header, payload) => {
      // Canvas requires the `aud` claim the be (or contain) the token endpoint:
      // https://github.com/instructure/canvas-lms/blob/995169713440bd8305854d440b336911a734c38f/lib/canvas/oauth/client_credentials_provider.rb#L26-L29
      // https://github.com/instructure/canvas-lms/blob/995169713440bd8305854d440b336911a734c38f/lib/canvas/oauth/asymmetric_client_credentials_provider.rb#L24
      //
      // From what we can tell, the OIDC spec requires this as well, see "private key jwt"
      // here: https://openid.net/specs/openid-connect-core-1_0.html#rfc.section.9
      //
      // "The Audience SHOULD be the URL of the Authorization Server's Token Endpoint."
      //
      // However, `openid-client` changed their behavior in the following commit:
      // https://github.com/panva/openid-client/commit/0b05217e7f283b75fd93c27c0f8c647f37501a33
      //
      // There wasn't a justification provided and this seems to deviate from the OIDC spec.
      // See a discussion here: https://github.com/panva/openid-client/discussions/730
      payload.aud = [
        ...new Set(
          [lti13_instance.issuer_params.issuer, lti13_instance.issuer_params.token_endpoint].filter(
            Boolean,
          ),
        ),
      ];

      // FUTURE WORK: Tool SHOULD include the deployment ID as part of the JWT to request a token.
      // https://www.imsglobal.org/spec/lti/v1p3/#deployment-id
      // payload['https://purl.imsglobal.org/spec/lti/claim/deployment_id']
    },
  };

  const openidClientConfig = await getOpenidClientConfig(lti13_instance, modAssertion);

  // Fetch the token
  const tokenSet = await client.clientCredentialsGrant(openidClientConfig, {
    scope: TOKEN_SCOPES.join(' '),
  });

  // Store the token for reuse
  const expires_at = tokenSet.expires_in ? Date.now() + tokenSet.expires_in * 1000 : Date.now();

  await execute(sql.update_token, {
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

async function getLineitem(instance: Lti13CombinedInstance, lineitem_id_url: string) {
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
  await linkAssessment(instance.lti13_course_instance.id, unsafe_assessment_id, item);
}

export async function unlinkAssessment(
  lti13_course_instance_id: string,
  assessment_id: string | number,
) {
  await execute(sql.delete_lti13_assessment, {
    lti13_course_instance_id,
    assessment_id,
  });
}

async function linkAssessment(
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

  await execute(sql.upsert_lti13_assessment, {
    lti13_course_instance_id,
    lineitem_id_url: lineitem.id,
    lineitem: JSON.stringify(lineitem),
    assessment_id: assessment.id,
  });
}

/**
 * Recurse through nested object(s) to find the first instance of a key with a given name
 * and return that key's value.
 *
 * @param obj Object to inspect
 * @param targetKey Key to find
 * @returns Contents of the targetKey variable
 */
export function findValueByKey(obj: unknown, targetKey: string): unknown {
  if (typeof obj !== 'object' || obj === null) return undefined;
  if (Object.hasOwn(obj, targetKey)) {
    return (obj as Record<string, unknown>)[targetKey];
  }
  for (const key in obj) {
    if (typeof (obj as Record<string, unknown>)[key] === 'object') {
      const result = findValueByKey((obj as Record<string, unknown>)[key], targetKey);
      if (result !== undefined) {
        return result;
      }
    }
  }
  return undefined;
}

/**
 * Make HTTP fetch requests with retries
 *
 * @param input URL to visit
 * @param opts fetch options
 * @param incomingfetchRetryOpts options specific to fetchRetry
 * @param incomingfetchRetryOpts.retryLeft - Number of retries left
 * @param incomingfetchRetryOpts.sleepMs - Time to sleep between retries
 * @returns Node fetch response object
 */
export async function fetchRetry(
  input: RequestInfo | URL,
  opts?: RequestInit,
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

    if (response.ok) {
      return response;
    }

    let errorMsg: string;
    const resString = await response.text();

    try {
      // Try to pull the "message" property out of the error and highlight it.
      // Fall back to showing the full error text.
      //
      // Examples of LMS error messages are in the lti13.test.ts file.
      const resObject = JSON.parse(resString);

      errorMsg = (findValueByKey(resObject, 'message') ?? resString).toString();
    } catch {
      errorMsg = resString;
    }

    // Rate Limit Exceeded may return 403 or 429 depending on Canvas settings.
    // https://github.com/instructure/canvas-lms/blob/1c9f0bb8013ed69c4f2efe11fd483025469b7e6c/app/middleware/request_throttle.rb#L298-L305
    // Change to 429 to simplify handling of both cases.
    let status = response.status;
    if (
      response.status === 403 &&
      Number(response.headers.get('x-rate-limit-remaining') ?? 'NaN') === 0
    ) {
      status = 429;
    }

    throw new AugmentedError(`LTI 1.3 fetch error: ${response.statusText}: ${errorMsg}`, {
      status,
      data: {
        statusText: response.statusText,
        body: resString,
      },
    });
  } catch (err: any) {
    if (
      [429, 502, 503, 504].includes(err.status) ||
      // Network failures may be triggered by a lower-level socket failure, so
      // we check the code on the error code or the code of its cause (if it exists)
      [
        'ECONNRESET', // Existing TCP connection was forcibly closed by the peer.
        'ECONNREFUSED', // Target host actively refused the connection request.
        'ETIMEDOUT', // Connection or request timed out before completion.
        'ENETUNREACH', // Network path to the target host is unreachable.
        'EADDRINUSE', // No available local ports to bind for the outgoing connection.
        'EPIPE', // Connection closed/broken pipe while sending request data.
        'EAI_AGAIN', // DNS lookup failed temporarily; retry may succeed.
        'UND_ERR_CONNECT_TIMEOUT', // Undici-specific timeout while establishing connection.
        'UND_ERR_HEADERS_TIMEOUT', // Undici-specific timeout waiting for response headers.
        'UND_ERR_BODY_TIMEOUT', // Undici-specific timeout while receiving response body.
        'UND_ERR_SOCKET', // Undici reported a generic socket-level failure.
      ].includes(err.cause?.code ?? err.code) ||
      // HTTP parser errors
      (err.cause?.code ?? err.code)?.startsWith('HPE_')
    ) {
      // Retry logic
      fetchRetryOpts.retryLeft -= 1;
      if (fetchRetryOpts.retryLeft === 0) {
        throw err;
      }
      await sleep(fetchRetryOpts.sleepMs);
      return await fetchRetry(input, opts, {
        ...fetchRetryOpts,
        // Exponential backoff
        sleepMs: fetchRetryOpts.sleepMs * 2,
      });
    } else {
      // Error immediately
      throw err;
    }
  }
}

/**
 * Pagination wrapper around fetchRetry
 * @param input URL to visit
 * @param opts fetch options
 * @param incomingfetchRetryOpts options specific to fetchRetry
 * @param incomingfetchRetryOpts.retryLeft - Number of retries left
 * @param incomingfetchRetryOpts.sleepMs - Time to sleep between retries
 * @returns Array of JSON responses from fetch
 */
export async function fetchRetryPaginated(
  input: RequestInfo | URL,
  opts?: RequestInit,
  incomingfetchRetryOpts?: {
    retryLeft?: number;
    sleepMs?: number;
  },
): Promise<unknown[]> {
  const output: unknown[] = [];

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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const Lti13ScoreSchema = z.object({
  scoreGiven: z.number(),
  scoreMaximum: z.number(),
  userId: z.string(),
  scoringUserId: z.string().optional(),
  activityProgress: z.enum(['Initialized', 'Started', 'InProgress', 'Submitted', 'Completed']),
  gradingProgress: z.enum(['FullyGraded', 'Pending', 'PendingManual', 'Failed', 'NotReady']),
  timestamp: DateFromISOString,
  submission: z
    .object({
      startedAt: DateFromISOString.optional(),
      submittedAt: DateFromISOString.optional(),
    })
    .optional(),
  comment: z.string().optional(),
});
type Lti13Score = z.infer<typeof Lti13ScoreSchema>;

const UserWithLti13SubSchema = UserSchema.extend({
  lti13_sub: z.string().nullable(),
});
type UserWithLti13Sub = z.infer<typeof UserWithLti13SubSchema>;

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

/**
 * Appends a resource link id to a NRPS `context_memberships_url` so that the
 * platform resolves per-member `message[]` claims (including custom claims) for
 * that resource link. Returns the URL unchanged when no rlid is provided.
 *
 * https://www.imsglobal.org/spec/lti-nrps/v2p0/#resource-link-membership-service
 */
function appendRlidToMembershipsUrl(context_memberships_url: string, rlid: string | null): string {
  if (!rlid) return context_memberships_url;
  const url = new URL(context_memberships_url);
  url.searchParams.set('rlid', rlid);
  return url.toString();
}

class Lti13ContextMembership {
  #membershipsByEmail: Record<string, ContextMembership[]> = {};
  #membershipsBySub: Record<string, ContextMembership> = {};

  private constructor(memberships: ContextMembership[]) {
    // Turn array into an object for efficient lookups. We need to retain duplicates
    // so that we can detect and handle the case where two users have the same email.
    for (const member of memberships) {
      this.#membershipsBySub[member.user_id] = member;

      if (member.email === undefined) {
        continue;
      }
      this.#membershipsByEmail[member.email] ??= [];
      this.#membershipsByEmail[member.email].push(member);
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
        Accept: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
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
   * @param user The user to look up with optional lti13_sub
   * @returns The LTI 1.3 record for the user, or null if not found.
   */
  lookup(user: UserWithLti13Sub): ContextMembership | null {
    if (user.lti13_sub !== null) {
      return this.#membershipsBySub[user.lti13_sub] ?? null;
    }
    for (const match of ['uid', 'email'] as const) {
      const key = user[match];
      if (key == null) continue;

      const memberResults = this.#membershipsByEmail[key];

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!memberResults) continue;

      // member.email cannot be duplicated in memberships
      if (memberResults.length > 1) return null;

      return memberResults[0];
    }

    // The user wasn't found.
    return null;
  }
}

export async function updateLti13Scores({
  courseInstance,
  unsafe_assessment_id,
  instance,
  job,
}: {
  courseInstance: CourseInstance;
  unsafe_assessment_id: string | number;
  instance: Lti13CombinedInstance;
  job: ServerJob;
}) {
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

  job.info(`Working on assessment ${assessment.title} (${assessment.tid})`);

  const assessment_instances = await queryRows(
    sql.select_assessment_instances_for_scores,
    { assessment_id: assessment.id },
    z.object({
      id: IdSchema,
      score_perc: z.number(),
      date: DateFromISOString,
      open: z.boolean(),
      user: UserWithLti13SubSchema,
    }),
  );

  const courseStaff = await selectUsersWithCourseInstanceAccess({
    courseInstance,
    minimalRole: 'Student Data Viewer',
  });
  const courseStaffUids = new Set(courseStaff.map((staff) => staff.uid));

  const memberships = await Lti13ContextMembership.loadForInstance(instance);

  const timestamp = new Date();
  const counts = {
    success: 0,
    error: 0,
    not_sent: 0,
  };

  for (const assessment_instance of assessment_instances) {
    // Get/Refresh the token in the main loop in case it expires during the run.
    const token = await getAccessToken(instance.lti13_instance.id);

    const user = assessment_instance.user;
    const ltiUser = memberships.lookup(user);
    const isCourseStaff = courseStaffUids.has(user.uid);

    // User not found in LTI, reporting only
    if (ltiUser === null) {
      job.info(
        `Not sending grade ${assessment_instance.score_perc.toFixed(2)}% for ${user.uid}.` +
          ` Could not find ${isCourseStaff ? 'course staff' : 'student'} ${user.uid}` +
          ` in ${instance.lti13_instance.name} course ${instance.lti13_course_instance.context_label}`,
      );
      counts.not_sent++;
      continue;
    }

    // User is not a student in LTI, reporting only
    if (!ltiUser.roles.includes(STUDENT_ROLE)) {
      job.info(
        `Not sending grade ${assessment_instance.score_perc.toFixed(2)}% for ${user.uid}.` +
          ` ${isCourseStaff ? 'Course staff' : 'Student'} ${user.uid} is not a student` +
          ` in ${instance.lti13_instance.name} course ${instance.lti13_course_instance.context_label}`,
      );
      counts.not_sent++;
      continue;
    }

    job.info(`Sending grade ${assessment_instance.score_perc.toFixed(2)}% for ${user.uid}.`);

    const submittedAt = await selectAssessmentInstanceLastSubmissionDate(assessment_instance.id);

    /*
       https://www.imsglobal.org/spec/lti-ags/v2p0#score-service-media-type-and-schema
       Canvas has extensions we could use described at
       https://canvas.instructure.com/doc/api/score.html#method.lti/ims/scores.create
      */
    const score: Lti13Score = {
      timestamp,
      scoreGiven: assessment_instance.score_perc,
      scoreMaximum: 100,
      activityProgress: assessment_instance.open ? 'Submitted' : 'Completed',
      gradingProgress: 'FullyGraded',
      userId: ltiUser.user_id,
      submission: {
        startedAt: assessment_instance.date,
        submittedAt: submittedAt ?? undefined,
      },
    };

    try {
      await fetchRetry(assessment.lti13_lineitem_id_url + '/scores', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-type': 'application/vnd.ims.lis.v1.score+json',
        },
        body: JSON.stringify(score),
      });
      counts.success++;
    } catch (error: any) {
      counts.error++;
      job.warn(`\t${error.message}`);
      if (error instanceof AugmentedError && error.data.body) {
        job.verbose(error.data.body);
      }
    }
  }
  job.info('Done.\n\nSummary:');
  job.info(`${counts.success} score${counts.success === 1 ? '' : 's'} successfully sent.`);
  job.info(`${counts.error} score${counts.error === 1 ? '' : 's'} not sent due to errors.`);
  if (counts.error > 0 && counts.success === 0) {
    job.warn('\tNo scores successfully sent and errors are present.');
    job.warn(
      `\tIs the ${instance.lti13_instance.name} ${instance.lti13_course_instance.context_label} course published?`,
    );
  }
  job.info(`${counts.not_sent} score${counts.not_sent === 1 ? '' : 's'} skipped (not sent).`);
}

// Loose schema for the inspector: we want to dump members verbatim, so we only
// parse the few fields needed for match annotation and keep everything else.
const RosterMemberSchema = z
  .object({
    user_id: z.string(),
    // NRPS flattens the lis sourcedid onto the member rather than nesting it under
    // the lis claim the way a launch id_token does.
    lis_person_sourcedid: z.string().optional(),
    // Present only when the roster is fetched with a resource link id (`?rlid=`).
    message: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .loose();
type RosterMember = z.infer<typeof RosterMemberSchema>;

/**
 * Resolves the UIN for a roster member using the instance's configured
 * `uin_attribute` path. That path is written against the launch id_token, but NRPS
 * represents a member differently: standard claims and the lis sourcedid are
 * flattened onto the member, while per-resource-link claims (e.g. custom) live in
 * `message[]`. We rebuild a launch-claim-shaped object so the same path resolves
 * for the configurations seen in practice — both `…/claim/custom` and
 * `…/claim/lis`. Returns null when the attribute isn't configured or nothing
 * resolves to a non-empty value.
 */
function resolveRosterMemberUin(member: RosterMember, uin_attribute: string | null): string | null {
  if (!uin_attribute) return null;

  // `message[]` is typed as an array (each entry tagged with a message_type) and is
  // only present with `?rlid=`. Canvas only ever emits a single LtiResourceLinkRequest
  // entry, but merge any entries so a custom claim resolves regardless of position.
  // The lis sourcedid is the one claim NRPS flattens onto the member, so nest it back
  // under its claim. es-toolkit's `get` expands a path like 'a[0].b.c'.
  const claims = {
    ...member,
    ...Object.assign({}, ...(member.message ?? [])),
    'https://purl.imsglobal.org/spec/lti/claim/lis':
      member.lis_person_sourcedid != null
        ? { person_sourcedid: member.lis_person_sourcedid }
        : undefined,
  };

  const value = get(claims, uin_attribute);
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/**
 * Read-only NRPS roster inspector. Fetches the membership roster (optionally with
 * a resource link id so the platform resolves per-member custom claims), dumps the
 * raw per-member payloads, and annotates each member with how it could be matched
 * to a PrairieLearn user. Does not create or modify any enrollments or users.
 */
export async function inspectRoster({
  instance,
  rlid,
  job,
}: {
  instance: Lti13CombinedInstance;
  rlid: string | null;
  job: ServerJob;
}) {
  const { lti13_instance, lti13_course_instance } = instance;

  if (lti13_course_instance.context_memberships_url === null) {
    throw new HttpStatusError(
      403,
      'LTI 1.3 course instance context_memberships_url not configured',
    );
  }

  const url = appendRlidToMembershipsUrl(lti13_course_instance.context_memberships_url, rlid);

  job.info(
    `Fetching roster for ${lti13_instance.name}: ${lti13_course_instance.context_label ?? '(no context label)'}`,
  );
  job.info(`NRPS URL: ${url}`);
  if (rlid) {
    job.info(`Requesting per-member custom data for resource link id: ${rlid}`);
  } else {
    job.info('No resource link id selected; fetching a plain roster (no custom claims).');
  }

  const token = await getAccessToken(lti13_instance.id);
  const fetchArray = await fetchRetryPaginated(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
    },
  });

  const members = fetchArray
    .flatMap((container) => {
      const parsed = z.object({ members: z.array(z.unknown()).optional() }).safeParse(container);
      return parsed.success ? (parsed.data.members ?? []) : [];
    })
    .map((raw) => ({ raw, parsed: RosterMemberSchema.safeParse(raw) }));

  job.info(`\nFound ${members.length} member${members.length === 1 ? '' : 's'}.\n`);

  const counts = { by_sub: 0, by_uin: 0, unmatched: 0, unparseable: 0 };

  for (const { raw, parsed } of members) {
    job.info(JSON.stringify(raw, null, 2));

    if (!parsed.success) {
      counts.unparseable++;
      job.warn('  Could not parse member; skipping match annotation.');
      continue;
    }
    const member = parsed.data;

    const userBySub = await selectOptionalUserByLti13Sub({
      lti13_instance_id: lti13_instance.id,
      sub: member.user_id,
    });

    const uin = resolveRosterMemberUin(member, lti13_instance.uin_attribute);
    const userByUin =
      !userBySub && uin
        ? await selectOptionalUserByUin({ uin, institution_id: lti13_instance.institution_id })
        : null;

    if (userBySub) {
      counts.by_sub++;
      job.info(
        `  Matched by sub to PrairieLearn user ${userBySub.uid} (UIN ${userBySub.uin ?? 'none'}).`,
      );
    } else if (userByUin) {
      counts.by_uin++;
      job.info(`  Matched by UIN ${uin} to PrairieLearn user ${userByUin.uid}.`);
    } else {
      counts.unmatched++;
      job.info(
        `  No PrairieLearn user matched${uin ? ` (UIN ${uin} resolved but no user found)` : ''}.`,
      );
    }
  }

  job.info('\nDone.\n\nSummary:');
  job.info(`${counts.by_sub} matched by LTI sub.`);
  job.info(`${counts.by_uin} matched by UIN.`);
  job.info(`${counts.unmatched} unmatched.`);
  job.info(`${counts.unparseable} could not be parsed.`);

  // Whether the platform returned any per-member custom data (`message`). If a
  // resource link was requested but none came back, the rlid is likely stale.
  const anyMessage = members.some(
    ({ parsed }) => parsed.success && (parsed.data.message?.length ?? 0) > 0,
  );

  if (rlid && !anyMessage) {
    job.warn(
      '\nThe platform returned no per-member custom data (`message`). The selected resource link id may be stale.',
    );
    job.warn(
      'Have an instructor re-launch from the course navigation link to refresh custom data.',
    );
  }
}
