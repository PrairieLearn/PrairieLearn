import clsx from 'clsx';

import { html } from '@prairielearn/html';

import { getNavPageTabs } from '../lib/navPageTabs.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';

import { type NavPage, type NavSubPage, type TabInfo } from './Navbar.types.js';

export function ContextNavigation({
  resLocals,
  navPage,
  navSubPage,
  embedded = false,
}: {
  resLocals: UntypedResLocals;
  navPage: NavPage;
  navSubPage: NavSubPage;
  /**
   * When true, the tabs render inline inside the shared navigation bar next to
   * the assessment switcher.
   */
  embedded?: boolean;
}) {
  if (!navPage) return '';

  const navPagesTabs: Partial<Record<Exclude<NavPage, undefined>, TabInfo[]>> = getNavPageTabs();
  const navPageTabs = navPagesTabs[navPage];

  // Some navPages do not have tabs
  if (!navPageTabs) return '';

  return html`
    <nav class="${clsx(embedded && 'flex-grow-1 flex-shrink-0')}">
      <ul class="${clsx('nav nav-tabs pl-nav-tabs-bar', !embedded && 'pt-2 px-3 bg-light')}">
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
  resLocals: UntypedResLocals;
  tabInfo: TabInfo;
}) {
  const { urlPrefix } = resLocals;
  const { activeSubPage, iconClasses, tabLabel, htmlSuffix, renderCondition } = tabInfo;

  if (renderCondition != null && !renderCondition(resLocals)) return '';

  const urlSuffix =
    typeof tabInfo.urlSuffix === 'function' ? tabInfo.urlSuffix(resLocals) : tabInfo.urlSuffix;

  const active =
    navSubPage === activeSubPage ||
    (Array.isArray(activeSubPage) && navSubPage != null && activeSubPage.includes(navSubPage));

  return html`
    <li class="nav-item">
      <a
        class="${clsx('nav-link d-flex align-items-center', active && 'active text-dark')}"
        href="${urlPrefix}${urlSuffix}"
      >
        <i class="me-1 ${iconClasses}"></i>${tabLabel}${htmlSuffix?.(resLocals) || ''}
      </a>
    </li>
  `;
}
