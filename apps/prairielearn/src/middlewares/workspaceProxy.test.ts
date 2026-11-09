import { assert, describe, it } from 'vitest';

import { rewriteWorkspaceContainerCookie } from './workspaceProxy.js';

describe('workspace proxy', () => {
  it('makes container cookies usable in a partitioned cross-origin iframe', () => {
    assert.equal(
      rewriteWorkspaceContainerCookie(
        'session=abc; Domain=container; Path=/app; HttpOnly; SameSite=Lax',
      ),
      'session=abc; Path=/app; HttpOnly; Secure; SameSite=None; Partitioned',
    );
    assert.isNull(rewriteWorkspaceContainerCookie('__Host-pl_workspace_authz=overwrite; Path=/'));
    assert.isNull(rewriteWorkspaceContainerCookie('__Host-pl_workspace_session=overwrite; Path=/'));
  });
});
