import { Router } from 'express';

import { html } from '@prairielearn/html';

import { SideNav } from '../../components/SideNav.html.js';

const router = Router();

router.put('/', async (req, res) => {
  req.session.show_side_nav = !(req.session.show_side_nav ?? true);

  if (req.session.show_side_nav) {
    res.send(
      html`
        <div id="side-nav" class="app-side-nav">
          ${SideNav({
            resLocals: res.locals,
            page: req.body.navPage,
            subPage: req.body.navSubPage,
          })}
        </div>
      `.toString(),
    );
  } else {
    res.send(html` <div id="side-nav" class="app-side-nav"></div> `.toString());
  }
});

export default router;
