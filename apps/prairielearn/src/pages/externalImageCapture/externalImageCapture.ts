import * as express from 'express';
import asyncHandler from 'express-async-handler';
import { z } from 'zod';

import * as sqldb from '@prairielearn/postgres';
import { queryOptionalRow, queryRow } from '@prairielearn/postgres';

import { ExternalImageCaptureSchema, VariantSchema } from '../../lib/db-types.js';
import { imageUploaded } from '../../lib/externalImageCaptureSocket.js';
import { getFile, uploadFile } from '../../lib/file-store.js';
import { selectAndAuthzVariant, selectUserOwnsVariant } from '../../models/variant.js';

import { ExternalImageCapture, ExternalImageCaptureSuccess } from './externalImageCapture.html.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const router = express.Router({
    mergeParams: true,
});

router.get(
    '/answer_name/:answer_name',
    asyncHandler(async (req, res) => {
        res.send(ExternalImageCapture({
            resLocals: res.locals,
        }));
    })
)

router.get(
    '/answer_name/:answer_name/submitted_image',
    asyncHandler(async (req, res) => {
        const variantId = req.params.variant_id;
        const answer_name = req.params.answer_name;

        // Validate that the user has access to the variant
        const variant = await selectAndAuthzVariant({
            unsafe_variant_id: variantId,
            variant_course: res.locals.course,
            question_id: res.locals.question.id,
            course_instance_id: res.locals?.course_instance?.id,
            instance_question_id: res.locals.instance_question?.id,
            authz_data: res.locals.authz_data,
            authn_user: res.locals.authn_user,
            user: res.locals.user,
            is_administrator: res.locals.is_administrator,
            publicQuestionPreview: res.locals.public_question_preview,
        });

        console.log('variant', variant);

        if (!variant) {
            res.status(404).send('Variant not found');
            return;
        } 

        const externalImageCapture = await queryOptionalRow(
            sql.select_external_image_capture_by_variant_and_element,
            {
                variant_id: parseInt(variant.id),
                answer_name,
            },
            ExternalImageCaptureSchema
        );

        console.log('externalImageCapture', externalImageCapture, variant.id, answer_name);

        if (externalImageCapture) {
            const { contents, file } = await getFile(
                externalImageCapture.file_id
            );
            
            // res.setHeader('Content-Type', file.type || 'application/octet-stream');
            // res.setHeader('Content-Length', contents.length);
            
            // res.send(contents);
            const base64_contents = contents.toString('base64');
            res.json({
                filename: file.display_filename,
                type: file.type,
                data: base64_contents
            });
        } else {
            res.status(404).send();
        }
    })
)

router.post(
    '/answer_name/:answer_name',
    asyncHandler(async (req, res) => {
        // Validate that the user has access to the variant
        const variantId = req.params.variant_id;
        const answer_name = req.params.answer_name;
        const userId = res.locals.authn_user.user_id;

        // TODO: Use the correct no access pages, or make some new ones

        if (!variantId || !answer_name || !userId) {
            res.status(400).send('Missing required parameters');
            return;
        }

        // TODO: Use selectAndAuthzVariant. This checks that the user has access to the variant
        
        // TODO: Should this just be whether or not the user has write access?
        const userOwnsVariant = await selectUserOwnsVariant({
            user_id: userId,
            variant_id: variantId,
        });

        if (!userOwnsVariant) {
            res.status(403).send('Forbidden: You do not have access to this variant');
            return;
        }

        // Create a FileUpload object and ExternalImageCapture object
        const variant = await queryRow(
            sql.select_variant_by_id,
            { variant_id: variantId },
            VariantSchema.extend({
                assessment_id: z.string().nullable(),
                assessment_instance_id: z.string().nullable(),
            })
        )


        if (!variant.open) {
            res.status(403).send('Forbidden: This variant is not open');
            return;
        }

        console.log('body file', req.body.file);
        console.log('file file', req.file);

        if (!req.file?.buffer) {
            res.status(400).send('No file uploaded');
            return;
        }
        
        const file_id = await uploadFile({
            display_filename: 'external-image-capture.png',
            contents: req.file.buffer,
            type: 'image/png',
            assessment_id: variant.assessment_id ?? null,
            assessment_instance_id: variant.assessment_instance_id ?? null,
            // assessment_instance_id: null,
            // instance_question_id: variant.instance_question_id ?? null,
            instance_question_id: null,
            user_id: userId,
            authn_user_id: res.locals.authn_user.authn_user_id,
        });

        // Create the ExternalImageCapture record
        await sqldb.queryAsync(
            sql.insert_new_external_image_capture,
            {
                user_id: res.locals.authn_user.user_id,
                variant_id: variantId,
                answer_name,
                file_id,
            }
        );

        // Emit a socket event to notify the client that the image has been capture
        await imageUploaded(
            variantId,
            answer_name,
        );

        res.send(ExternalImageCaptureSuccess({
            resLocals: res.locals,
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