import * as express from 'express';
import asyncHandler from 'express-async-handler';

// import * as sqldb from '@prairielearn/postgres';

import { ExternalImageCapture } from './externalImageCapture.html.js';

// const sql = sqldb.loadSqlEquiv(import.meta.url);

const router = express.Router({
    mergeParams: true,
});

router.get(
    '/element/:element_uuid',
    asyncHandler(async (req, res) => {
        res.send(ExternalImageCapture({
            resLocals: res.locals,
            variantId: req.params.variant_id,
            elementUUID: req.params.element_uuid,
        }));
    })
)

// router.post(
//     '/',
//     asyncHandler(async (req, res) => {
//         // Validate that the user has access to the instance question
//         const instance_question_id = req.body.instance_question_id;

//         if (!instance_question_id) {
//             res.status(400).send('Missing instance_question_id');
//             return;
//         }

//         const instanceQuestion = await sqldb.queryRow(
//             sql.select_instance_question,
//             { instance_question_id },
//             InstanceQuestionSchema
//         );

//         if (instanceQuestion.authn_user_id !== req.session.authnUserId) {
//             res.status(403).send('Forbidden: You do not have access to this instance question');
//             return;
//         }

//         if (!instanceQuestion.open) {
//             res.status(403).send('Forbidden: This instance question is not open');
//             return;
//         }

//         // Enusre that the external image capture does not yet exist for this instance question
//         // and element_uuid

//         const captureExists = await sqldb.queryRow(
//             sql.select_external_image_capture_exists,
//             {
//                 instance_question_id,
//                 element_uuid: req.body.element_uuid || null,
//             },
//             z.boolean()
//         );

//         if (captureExists) {
//             res.status(400).send('External image capture already exists for this instance question and element_uuid');
//             return;
//         }

//         await sqldb.queryAsync(
//             sql.insert_new_external_image_capture,
//             {
//                 authn_user_id: req.session.authnUserId,
//                 instance_question_id,
//                 element_uuid: req.body.element_uuid || null,
//             }
//         )
//     }),
// )

export default router;