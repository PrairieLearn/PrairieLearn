import { Router } from 'express';
import { z } from 'zod';

import { HttpStatusError } from '@prairielearn/error';

import { PageLayout } from '../../../components/PageLayout.js';
import { features } from '../../../lib/features/index.js';
import { typedAsyncHandler } from '../../../lib/res-locals.js';
import { OAUTH_SCOPES, OAUTH_SCOPE_NAMES, getMcpResource } from '../../lib/oauth/config.js';
import { getOauthProvider } from '../../lib/oauth/provider.js';

const router = Router();

/**
 * The website that approving sends the user to, or null if it is an app on the user's own
 * computer: a loopback address or an app's own URL scheme, which the library allows only for
 * those. The access goes wherever the user is sent.
 */
function websiteHost(redirectUri: unknown) {
  const url = typeof redirectUri === 'string' ? URL.parse(redirectUri) : null;
  return url?.protocol === 'https:' ? url.host : null;
}

function ApprovalForm({
  clientName,
  redirectUri,
  userName,
  csrfToken,
}: {
  clientName: string;
  redirectUri: unknown;
  userName: string;
  csrfToken: string;
}) {
  const website = websiteHost(redirectUri);
  return (
    <div className="card mx-auto" style={{ maxWidth: '36rem' }}>
      <div className="card-body">
        <h1 className="h4">Connect {clientName} to PrairieLearn?</h1>
        <p className="text-muted">
          You are signed in as {userName}. If you allow this, you'll return to{' '}
          {website ?? 'an app on this computer'}.
        </p>
        {website && (
          // Any app can register under any name. One on the user's computer is already trusted
          // with it, but a website could pose as a known agent to receive the access.
          <div className="alert alert-warning" role="alert">
            <i className="bi bi-exclamation-triangle me-2" aria-hidden="true" />
            This agent's access will go to <strong>{website}</strong>. PrairieLearn can't verify the
            name it gave, so only continue if you started this from an agent on that site.
          </div>
        )}
        <h2 className="h6">This agent will be able to</h2>
        <ul>
          {OAUTH_SCOPE_NAMES.map((scope) => (
            <li key={scope}>{OAUTH_SCOPES[scope]}</li>
          ))}
        </ul>
        <p className="small text-muted">Access ends after 90 days.</p>
        <form method="POST" className="d-flex justify-content-end gap-2">
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="submit" name="__action" value="deny" className="btn btn-outline-secondary">
            Cancel
          </button>
          <button type="submit" name="__action" value="approve" className="btn btn-primary">
            Allow
          </button>
        </form>
      </div>
    </div>
  );
}

router.use(
  typedAsyncHandler<'plain'>(async (req, res, next) => {
    const { authn_user } = res.locals;
    const enabled = await features.enabled('mcp-server', {
      institution_id: authn_user.institution_id,
      user_id: authn_user.id,
    });
    if (!enabled) throw new HttpStatusError(403, 'Connecting agents is not turned on for you.');
    next();
  }),
);

router.get(
  '/:uid',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const provider = getOauthProvider();
    const { params } = await provider.interactionDetails(req, res);
    const client = await provider.Client.find(z.string().parse(params.client_id));
    if (!client) throw new HttpStatusError(400, 'This app is not registered with PrairieLearn.');
    const { authn_user } = res.locals;
    res.send(
      PageLayout({
        resLocals: res.locals,
        pageTitle: 'Connect an agent',
        navContext: { type: 'plain', page: 'user_settings' },
        content: (
          <ApprovalForm
            clientName={client.clientName ?? 'An unnamed app'}
            redirectUri={params.redirect_uri}
            userName={authn_user.name ?? authn_user.uid}
            csrfToken={res.locals.__csrf_token}
          />
        ),
      }),
    );
  }),
);

router.post(
  '/:uid',
  typedAsyncHandler<'plain'>(async (req, res) => {
    const provider = getOauthProvider();
    const { params } = await provider.interactionDetails(req, res);
    const { __action } = z.object({ __action: z.enum(['approve', 'deny']) }).parse(req.body);
    if (__action === 'deny') {
      await provider.interactionFinished(req, res, {
        error: 'access_denied',
        error_description: 'The user did not allow the connection.',
      });
      return;
    }

    const accountId = res.locals.authn_user.id;
    const grant = new provider.Grant({ accountId, clientId: z.string().parse(params.client_id) });
    // The scopes are the MCP server's, and its tokens are the only ones issued. The library also
    // has to know them as its own, because agents name them when they register, and then expects
    // them granted as its own too.
    grant.addOIDCScope(OAUTH_SCOPE_NAMES.join(' '));
    grant.addResourceScope(getMcpResource(), OAUTH_SCOPE_NAMES.join(' '));
    const grantId = await grant.save();
    await provider.interactionFinished(req, res, {
      // PrairieLearn's session says who the user is. The library keeps a session of its own, which
      // is made to end with the browser's so that it can't outlast PrairieLearn's and approve a
      // later request as someone who has signed out. If it holds a different user anyway, the
      // library ends it before continuing.
      login: { accountId, remember: false },
      consent: { grantId },
    });
  }),
);

export default router;
