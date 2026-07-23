import { assert, describe, it } from 'vitest';

import { Navbar } from './Navbar.js';

function renderNavbar({
  navPage = 'assessment_instance',
  mode = 'Exam',
  reservationId = '1',
}: {
  navPage?: 'assessment_instance' | 'home';
  mode?: 'Exam' | 'Public' | null;
  reservationId?: string | null;
}) {
  return Navbar({
    resLocals: {
      authn_is_administrator: false,
      authn_user: { id: '1', name: 'Student', uid: 'student@example.com' },
      authz_result: { mode },
      cheating_report_reservation_id: reservationId,
      lockdown_browser: false,
    },
    navPage,
    navbarType: 'plain',
  }).toString();
}

describe('ReportCheatingControl', () => {
  it('renders for an active exam assessment', () => {
    const navbar = renderNavbar({});
    assert.include(navbar, 'Report cheating');
    assert.include(navbar, 'class="btn btn-danger btn-sm');
    assert.include(navbar, 'name="submission_id"');
  });

  it('does not render outside the active exam assessment', () => {
    assert.notInclude(renderNavbar({ navPage: 'home' }), 'Report cheating');
    assert.notInclude(renderNavbar({ mode: 'Public' }), 'Report cheating');
    assert.notInclude(renderNavbar({ reservationId: null }), 'Report cheating');
  });
});
