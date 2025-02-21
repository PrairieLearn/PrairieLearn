import { Router } from 'express';

import { html } from '@prairielearn/html';

import { SideNav } from '../../components/SideNav.html.js';

const router = Router();

router.get('/', async (req, res) => {
  const sideNavOpen = req.session.show_side_nav ?? true;

  if (sideNavOpen) {
    return html`
      <div id="side-nav" class="app-side-nav">
        ${SideNav({
          resLocals: res.locals,
          page: res.locals.navPage,
          subPage: res.locals.navSubPage,
        })}
      </div>
    `;
  } else {
    return '';
  }
});

router.put('/', async (req, res) => {
  req.session.show_side_nav = !req.session.show_side_nav;

  console.log('req.session.show_side_nav', req.session.show_side_nav);

  if (req.session.show_side_nav) {
    // return html`
    //   <div id="side-nav" class="app-side-nav">
    //     ${SideNav({
    //       resLocals: res.locals,
    //       page: res.locals.navPage,
    //       subPage: res.locals.navSubPage,
    //     })}
    //   </div>
    // `;
    return SideNav({
      resLocals: res.locals,
      page: res.locals.navPage,
      subPage: res.locals.navSubPage,
    });
  } else {
    return '';
  }
});

export default router;
