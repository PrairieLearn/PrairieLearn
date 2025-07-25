import { Router } from 'express';
import asyncHandler from 'express-async-handler';

import { Editor } from './components/Editor.js';

import { PageLayout } from '../../components/PageLayout.js';
import { Hydrate } from '../../lib/preact.js';

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

        content: (
          <Hydrate>
            <Editor />
          </Hydrate>
        ),
      }),
    );
  }),
);

export default router;
