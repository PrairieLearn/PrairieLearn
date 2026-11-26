import { type Response, Router } from 'express';
import { z } from 'zod';

import { PageLayout } from '../../../components/PageLayout.js';
import type { OauthClient, User } from '../../../lib/db-types.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import {
  OAUTH_SCOPES,
  OAUTH_SCOPE_NAMES,
  type OauthScope,
  getMcpResource,
  getOauthIssuer,
  isOauthScope,
} from '../../lib/oauth/config.js';
import { selectConnectableCourses } from '../../lib/oauth/connectable-courses.js';
import { createAuthorizationCode } from '../../lib/oauth/flow.js';
import { describeRedirectUri, isRegisteredRedirectUri } from '../../lib/oauth/redirect-uri.js';
import { selectOptionalOauthClientByClientId } from '../../models/oauth-client.js';

const router = Router();

// The authorization request (RFC 6749 section 4.1.1, with PKCE and RFC 8707's `resource`). The
// approval form posts the same fields back, so both requests are checked the same way.
const AuthorizeParamsSchema = z.object({
  response_type: z.string().optional(),
  client_id: z.string().optional(),
  redirect_uri: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  state: z.string().optional(),
  scope: z.string().optional(),
  resource: z.string().optional(),
});
type AuthorizeParams = z.infer<typeof AuthorizeParamsSchema>;

const ApprovalSchema = AuthorizeParamsSchema.extend({
  __action: z.enum(['approve', 'deny']),
  scopes: z.union([z.string(), z.array(z.string())]).optional(),
  course_ids: z.union([z.string(), z.array(z.string())]).optional(),
});

interface AuthorizeRequest {
  client: OauthClient;
  redirect_uri: string;
  code_challenge: string;
  state: string | undefined;
  scopes: OauthScope[];
}

type CheckedAuthorizeRequest =
  // The client or redirect URI can't be trusted, so the user is told instead of being sent there.
  | { status: 'invalid'; message: string }
  // The request is wrong in a way the client should hear about.
  | { status: 'rejected'; redirect: string }
  | ({ status: 'ok' } & AuthorizeRequest);

/** The client's redirect URI with the response parameters, including `iss` (RFC 9207). */
function redirectTo(redirect_uri: string, state: string | undefined, params: object) {
  const url = new URL(redirect_uri);
  for (const [key, value] of Object.entries({ ...params, state, iss: getOauthIssuer() })) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.href;
}

async function checkAuthorizeRequest(params: AuthorizeParams): Promise<CheckedAuthorizeRequest> {
  const client = await selectOptionalOauthClientByClientId(params.client_id);
  if (!client) {
    return { status: 'invalid', message: 'This app is not registered with PrairieLearn.' };
  }
  const { redirect_uri, state } = params;
  if (redirect_uri === undefined || !isRegisteredRedirectUri(client.redirect_uris, redirect_uri)) {
    return {
      status: 'invalid',
      message: 'This app asked to send you to an address it did not register.',
    };
  }
  const reject = (error: string, error_description: string): CheckedAuthorizeRequest => ({
    status: 'rejected',
    redirect: redirectTo(redirect_uri, state, { error, error_description }),
  });
  if (params.response_type !== 'code') {
    return reject('unsupported_response_type', 'response_type must be code.');
  }
  if (!params.code_challenge || params.code_challenge_method !== 'S256') {
    return reject('invalid_request', 'A code_challenge with method S256 is required.');
  }
  if (params.resource !== undefined && params.resource !== getMcpResource()) {
    return reject('invalid_target', `resource must be ${getMcpResource()}.`);
  }
  const requested = (params.scope ?? '').split(' ').filter(isOauthScope);
  return {
    status: 'ok',
    client,
    redirect_uri,
    code_challenge: params.code_challenge,
    state,
    // A client that names no scope we know is offered them all; the user picks.
    scopes: requested.length > 0 ? requested : OAUTH_SCOPE_NAMES,
  };
}

function toArray(value: string | string[] | undefined) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function ApprovalForm({
  request,
  params,
  courses,
  userName,
  csrfToken,
  error,
}: {
  request: AuthorizeRequest;
  params: AuthorizeParams;
  courses: Awaited<ReturnType<typeof selectConnectableCourses>>;
  userName: string;
  csrfToken: string;
  error?: string;
}) {
  return (
    <div className="card mx-auto" style={{ maxWidth: '36rem' }}>
      <div className="card-body">
        <h1 className="h4">Connect {request.client.client_name} to PrairieLearn?</h1>
        <p className="text-muted">
          You are signed in as {userName}. If you allow this, you'll return to{' '}
          {describeRedirectUri(request.redirect_uri)}.
        </p>
        <div className="alert alert-warning" role="alert">
          <i className="bi bi-exclamation-triangle me-2" aria-hidden="true" />
          PrairieLearn can't verify this app's name. Only continue if you started this from an agent
          you trust.
        </div>
        {error && (
          <div className="alert alert-danger" role="alert">
            {error}
          </div>
        )}
        <form method="POST" action="/pl/oauth/authorize">
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          {Object.entries(params).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}

          <fieldset className="mb-3">
            <legend className="h6">This agent will be able to</legend>
            {request.scopes.map((scope) => (
              <div key={scope} className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  name="scopes"
                  value={scope}
                  id={`scope-${scope}`}
                  defaultChecked
                />
                <label className="form-check-label" htmlFor={`scope-${scope}`}>
                  {OAUTH_SCOPES[scope]}
                </label>
              </div>
            ))}
            <div className="form-text">It can always read PrairieLearn's skills.</div>
          </fieldset>

          <fieldset className="mb-3">
            <legend className="h6">In these courses</legend>
            {courses.length === 0 && (
              <p className="text-muted mb-0">
                None of your courses can be connected to an agent. You need to be an editor or owner
                of a course that has this feature turned on.
              </p>
            )}
            {courses.map((course) => (
              <div key={course.id} className="form-check">
                <input
                  className="form-check-input"
                  type="checkbox"
                  name="course_ids"
                  value={course.id}
                  id={`course-${course.id}`}
                />
                <label className="form-check-label" htmlFor={`course-${course.id}`}>
                  {course.name} <span className="badge text-bg-secondary">{course.role}</span>
                  {!course.can_read_data && (
                    <div className="form-text mt-0">
                      Sync only. Reading course data needs the Owner role.
                    </div>
                  )}
                </label>
              </div>
            ))}
          </fieldset>

          <p className="small text-muted">
            Course data this agent reads is sent to the AI provider it uses. Access ends after 90
            days.
          </p>
          <div className="d-flex justify-content-end gap-2">
            <button
              type="submit"
              name="__action"
              value="deny"
              className="btn btn-outline-secondary"
            >
              Cancel
            </button>
            {courses.length > 0 && (
              <button type="submit" name="__action" value="approve" className="btn btn-primary">
                Allow
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function InvalidRequest({ message }: { message: string }) {
  return (
    <div className="card mx-auto" style={{ maxWidth: '36rem' }}>
      <div className="card-body">
        <h1 className="h4">This connection request can't be completed</h1>
        <p className="mb-0">{message}</p>
      </div>
    </div>
  );
}

/** Sends the approval form, or the reason the request can't be approved. */
async function sendApprovalPage(
  res: Response,
  params: AuthorizeParams,
  request: Exclude<CheckedAuthorizeRequest, { status: 'rejected' }>,
  error?: string,
) {
  const user: User = res.locals.authn_user;
  res.status(request.status === 'ok' && !error ? 200 : 400).send(
    PageLayout({
      resLocals: res.locals,
      pageTitle: 'Connect an agent',
      navContext: { type: 'plain', page: 'user_settings' },
      content:
        request.status === 'ok' ? (
          <ApprovalForm
            request={request}
            params={params}
            courses={await selectConnectableCourses(user)}
            userName={user.name ?? user.uid}
            csrfToken={res.locals.__csrf_token}
            error={error}
          />
        ) : (
          <InvalidRequest message={request.message} />
        ),
    }),
  );
}

router.get(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const params = AuthorizeParamsSchema.parse(req.query);
    const request = await checkAuthorizeRequest(params);
    if (request.status === 'rejected') {
      res.redirect(303, request.redirect);
      return;
    }
    await sendApprovalPage(res, params, request);
  }),
);

router.post(
  '/',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const { __action, scopes, course_ids, ...params } = ApprovalSchema.parse(req.body);
    const request = await checkAuthorizeRequest(params);
    if (request.status === 'rejected') {
      res.redirect(303, request.redirect);
      return;
    }
    if (request.status === 'invalid') {
      await sendApprovalPage(res, params, request);
      return;
    }
    if (__action === 'deny') {
      res.redirect(
        303,
        redirectTo(request.redirect_uri, request.state, {
          error: 'access_denied',
          error_description: 'The user did not allow the connection.',
        }),
      );
      return;
    }

    // Only what was offered on the page can be approved, whatever the form posts.
    const courses = await selectConnectableCourses(res.locals.authn_user);
    const approvedScopes = request.scopes.filter((scope) => toArray(scopes).includes(scope));
    const approvedCourses = courses.filter((course) => toArray(course_ids).includes(course.id));
    if (approvedScopes.length === 0 || approvedCourses.length === 0) {
      await sendApprovalPage(
        res,
        params,
        request,
        'Choose at least one permission and one course.',
      );
      return;
    }

    const code = await createAuthorizationCode({
      user_id: res.locals.authn_user.id,
      client: request.client,
      scopes: approvedScopes,
      course_ids: approvedCourses.map((course) => course.id),
      redirect_uri: request.redirect_uri,
      code_challenge: request.code_challenge,
    });
    res.redirect(303, redirectTo(request.redirect_uri, request.state, { code }));
  }),
);

export default router;
