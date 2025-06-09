import { Router } from 'express';
import asyncHandler from 'express-async-handler';
import jose from 'node-jose';

import { selectLti13Instance } from '../../models/lti13Instance.js';

const router = Router({ mergeParams: true });

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const lti13_instance = await selectLti13Instance(req.params.lti13_instance_id);
    const keystore = await jose.JWK.asKeyStore(lti13_instance.keystore || []);

    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    // Only extract the public keys, pass false
    res.end(JSON.stringify(keystore.toJSON(false), null, 2));
  }),
);

export default router;
