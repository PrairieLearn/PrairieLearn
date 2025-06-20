import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { deleteAllAssessmentInstancesForAssessment, makeAssessmentInstance } from '../../../lib/assessment.js';
import { EnrollmentSchema, InstanceQuestionSchema } from '../../../lib/db-types.js';
import { saveSubmission } from '../../../lib/grading.js';
import { ensureVariant } from '../../../lib/question-variant.js';
import { selectAssessmentById } from '../../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../../models/course-instances.js';
import { selectCourseById } from '../../../models/course.js';
import { selectQuestionById } from '../../../models/question.js';

const FILE_SUBMISSIONS: Record<string, string[]> = {
    'derivatives-of-functions': [
        '1a.jpeg',
        '1b.jpeg',
        '1c.jpeg'
    ],
    'linearization': [
        '2a.jpeg',
        '2b.jpeg'
    ],
    'mvt': [
        '3a.jpeg',
        '3b.jpeg'
    ],
    'limit-evaluation': [
        '4.jpeg'
    ],
    'logarithmic-differentiation': [
        '5.jpeg'
    ],
    'implicit-differentiation': [
        '6.jpeg'
    ],
    'ladder-and-the-wall': [
        '7.jpeg'
    ],
    'abs-min-max': [
        '8.jpeg'
    ],
    'function-analysis': [
        '9.jpeg'
    ]
};

export async function generateSubmissions() {
    const sql = loadSqlEquiv(import.meta.filename);

    // Get the course
    const course = await selectCourseById('33');

    // Get the courseInstance
    const courseInstance = await selectCourseInstanceByShortName({
        course_id: '33',
        short_name: 'FA25'
    });

    // Find all students enrolled in the course instance
    const enrollments = await queryRows(
        sql.select_course_instance_enrollments,
        { course_instance_id: courseInstance.id },
        EnrollmentSchema
    );

    // Find the assessments
    const assessment = await selectAssessmentById(
        '253'
    );

    // Delete all assessment instances for the assessment
    await deleteAllAssessmentInstancesForAssessment(
        assessment.id,
        courseInstance.id
    );

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    for (let i = 0; i < enrollments.length; i++) {
        const enrolled_student = enrollments[i];


        const submission_folder = path.join(
            __dirname,
            'submissions',
            `submission_${i + 1}`
        )
        
        const new_assessment_instance_id = await makeAssessmentInstance({
            assessment,
            user_id: enrolled_student.user_id,
            authn_user_id: enrolled_student.user_id,
            mode: 'Exam',
            time_limit_min: null,
            date: new Date(),
            client_fingerprint_id: null
        });

        console.log('new_assessment_instance_id', new_assessment_instance_id);

        const instance_questions = await queryRows(
            sql.select_instance_questions,
            { assessment_instance_id: new_assessment_instance_id },
            InstanceQuestionSchema.extend({
                instance_question_id: z.string(),
                question_id: z.string()
            })
        );
        
        for (const instance_question of instance_questions) {
            console.log('instance_question', instance_question);

            // Get the question
            const question = await selectQuestionById(
                instance_question.question_id
            );
            if (!question.qid) {
                throw new Error(`Question ${question.id} does not have a qid`);
            }
            
            // Generate a variant for each question
            const variant = await ensureVariant(
                question.id,
                instance_question.instance_question_id,
                enrolled_student.user_id,
                enrolled_student.user_id,
                courseInstance.id,
                course,
                course,
                {},
                false,
                null,
            );

            // Retrieve submitted files
            const submission_filenames = FILE_SUBMISSIONS[question.qid];
            const submitted_answer: Record<string, any> = {};

            const submitted_files: { name: string; contents: string; mimetype: string }[] = [];

            for (const filename of submission_filenames) {
                const currentPath = path.join(
                    submission_folder,
                    filename
                );
                // Retrieve the base-64 encoded image, stored locally 
                const fileBuffer = fs.readFileSync(currentPath);
                const base64_content = fileBuffer.toString('base64');

                const file = {
                    name: filename,
                    contents: base64_content,
                    mimetype: 'image/jpeg',
                };

                submitted_answer[filename] = fileBuffer.toString('base64');
                submitted_files.push(file);
            }

            submitted_answer._files = submitted_files;
            
            // Generate a submission for each question
            const submission_data = {
                variant_id: variant.id,
                user_id: enrolled_student.user_id,
                auth_user_id: enrolled_student.user_id,
                submitted_answer,
            };
            
            await saveSubmission(
                submission_data,
                variant,
                question,
                course,
            );
        }            
        // break;

    }
    return;
}