import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { Editor } from './editor.html.js';

import { PageLayout } from '#components/PageLayout.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const resLocals = res.locals;
    const pageTitle = 'Editor';
    const navPage = 'editor';
    res.send(
      PageLayout({
        resLocals,
        pageTitle,
        navContext: {
          type: resLocals.navbarType,
          page: navPage,
          subPage: 'file_view',
        },
        options: {
          fullWidth: true,
        },

        content: Editor(),
      }),
    );
  }),
);

export default router;
