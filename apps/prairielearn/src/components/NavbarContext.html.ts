import { html } from '@prairielearn/html';

import { getNavPageTabs } from '../lib/navPageTabs.js';

import { type NavPage, type NavSubPage, type TabInfo } from './Navbar.types.js';

export function ContextNavigation({
  resLocals,
  navPage,
  navSubPage,
}: {
  resLocals: Record<string, any>;
  navPage: NavPage;
  navSubPage: NavSubPage;
}) {
  if (!navPage) return '';

  const navPagesTabs = getNavPageTabs(resLocals.has_enhanced_navigation);
  const navPageTabs = navPagesTabs[navPage];

  // Some navPages do not have tabs
  if (!navPageTabs) return '';

  return html`
    <nav>
      <ul
        class="
          nav 
          nav-tabs 
          pl-nav-tabs-bar 
          pt-2
          px-3 
          bg-light
        "
      >
        ${navPageTabs.map((tabInfo) => NavbarTab({ navSubPage, resLocals, tabInfo }))}
      </ul>
    </nav>
  `;
}

function NavbarTab({
  navSubPage,
  resLocals,
  tabInfo,
}: {
  navSubPage: NavSubPage;
  resLocals: Record<string, any>;
  tabInfo: TabInfo;
}) {
  const { urlPrefix } = resLocals;
  const { activeSubPage, iconClasses, tabLabel, htmlSuffix, renderCondition } = tabInfo;

  if (renderCondition != null && !renderCondition(resLocals)) return '';

  const urlSuffix =
    typeof tabInfo.urlSuffix === 'function' ? tabInfo.urlSuffix(resLocals) : tabInfo.urlSuffix;

  const activeClasses =
    navSubPage === activeSubPage ||
    (Array.isArray(activeSubPage) && navSubPage != null && activeSubPage.includes(navSubPage))
      ? 'active text-dark'
      : 'text-secondary';

  return html`
    <li class="nav-item">
      <a
        class="nav-link d-flex align-items-center ${activeClasses}"
        href="${urlPrefix}${urlSuffix}"
      >
        <i class="me-1 ${iconClasses}"></i>${tabLabel}${htmlSuffix?.(resLocals) || ''}
      </a>
    </li>
  `;
}
