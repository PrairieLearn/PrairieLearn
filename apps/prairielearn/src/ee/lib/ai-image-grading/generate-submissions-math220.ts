import fs from 'fs';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import type { Request, Response } from 'express';
import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { deleteAllAssessmentInstancesForAssessment, makeAssessmentInstance } from '../../../lib/assessment.js';
import { EnrollmentSchema, InstanceQuestionSchema, RubricItemSchema } from '../../../lib/db-types.js';
import { saveSubmission } from '../../../lib/grading.js';
import * as manualGrading from '../../../lib/manualGrading.js';
import { ensureVariant } from '../../../lib/question-variant.js';
import { selectAssessmentById } from '../../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../../models/course-instances.js';
import { selectCourseById } from '../../../models/course.js';
import { selectQuestionById } from '../../../models/question.js';

const FILE_SUBMISSIONS: Record<string, string[]> = {
    'cos-sin-1': [
        '1a.jpg'
    ],
    'cosine-sine-2': [
        '1b.jpg'
    ],
    'piecewise-continuous_2': [
        '2.jpg'
    ],
    'function-limit-1': [
        '3a.jpg'
    ],
    'function-limit-2': [
        '3b.jpg'
    ],
    'derivative-1': ['4a.jpg'],
    'derivative-2': ['4b.jpg'],
    'derivative-3': ['4c.jpg'],
    'derivative-4': ['4d.jpg'],
    'implicit-differentiation': ['5.jpg'],
    'ladder-and-the-wall_2': ['6.jpg'],
    'full-limit-evaluation': ['7.jpg'],
    'max-product': ['8.jpg'],
    'definite-integral-substitution': ['9.jpg'],
    'riemann-sum': ['10.jpg'],
    'area-between-curves': ['11.jpg'],
    'volume-of-solid': ['12a.jpg', '12b.jpg', '12c.jpg'],
    'derivative-ec': ['20.jpg'],
    'car-approach': ['21.jpg']
};

export async function generateSubmissions(
    req: Request, res: Response
) {
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
        EnrollmentSchema.extend({
            user_uid: z.string()
        })
    );

    // Find the assessments
    const assessment = await selectAssessmentById(
        '254'
    );

    // Delete all assessment instances for the assessment
    await deleteAllAssessmentInstancesForAssessment(
        assessment.id,
        courseInstance.id
    );

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);

    // Retrieve the names of all folders in the submissions directory
    const submissionsDir = path.join(__dirname, 'submissions');
    if (!fs.existsSync(submissionsDir)) {
        throw new Error(`Submissions directory does not exist: ${submissionsDir}`);
    }
    const submissionFolders = fs.readdirSync(submissionsDir)
        .filter(file => file !== '.gitignore' && fs.statSync(path.join(submissionsDir, file)).isDirectory());

    // Ensure that the number of submission folders matches the number of enrollments
    if (submissionFolders.length > enrollments.length) {
        throw new Error(`Number of submission folders (${submissionFolders.length}) is greater than number of enrollments (${enrollments.length})`);
    }

    const nameToSubmissionFolder: Record<string, string> = {};

    // Load the student-submitted responses from student_submitted_responses.json
    const student_submitted_responses_path = path.join(
        __dirname,
        'student_submitted_responses.json'
    );
    if (!fs.existsSync(student_submitted_responses_path)) {
        throw new Error(`Student submitted responses file does not exist: ${student_submitted_responses_path}`);
    }
    const studentSubmittedResponses = JSON.parse(
        fs.readFileSync(student_submitted_responses_path, 'utf-8')
    );

    for (let i = 0; i < enrollments.length; i++) {
    // for (let i = 0; i < 1; i++) {
        const enrolled_student = enrollments[i];

        const submission_folder = path.join(
            __dirname,
            'submissions',
            submissionFolders[i]
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

        nameToSubmissionFolder[enrolled_student.user_uid] = submission_folder;

        const instance_questions = await queryRows(
            sql.select_instance_questions,
            { assessment_instance_id: new_assessment_instance_id },
            InstanceQuestionSchema.extend({
                instance_question_id: z.string(),
                max_points: z.number().nullable(),
                manual_rubric_id: z.string().nullable(),
                question_id: z.string()
            })
        );
        
        for (const instance_question of instance_questions) {
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
            console.log(question.qid, submission_filenames);
            const submitted_answer: Record<string, any> = {};

            const submitted_files: { name: string; contents: string; mimetype: string }[] = [];

            for (const filename of submission_filenames) {
                const currentPath = path.join(
                    submission_folder,
                    filename.replace('.jpg', '.jpeg') // Ensure the file extension matches
                );
                // Retrieve the base-64 encoded image, stored locally 
                const encodedData = fs.readFileSync(currentPath, {
                    encoding: 'base64'
                });

                const dataWithPrefix = `data:image/jpeg;base64,${encodedData}`;

                const file = {
                    name: filename,
                    contents: encodedData,
                    mimetype: 'image/jpeg',
                };

                submitted_answer[filename] = dataWithPrefix;
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
            
            const {
                submission_id
            } = await saveSubmission(
                submission_data,
                variant,
                question,
                course,
            );

            // Insert student grades
            console.log(' rubric id', instance_question.manual_rubric_id)
            const rubric_items = await queryRows(
                sql.select_rubric_items,
                { rubric_id: instance_question.manual_rubric_id },
                RubricItemSchema
            );

            // Determine the rubric items that were selected for the student.
            const submission_id_for_file = submissionFolders[i].replace('_redacted.pdf', '');
            const selected_rubric_items = studentSubmittedResponses[question.qid][submission_id_for_file] || [];

            const selected_rubric_item_ids: string[] = [];
            let pts_change = 0;
            for (const col of selected_rubric_items) {
                let col_found = false;
                for (const rubric_item of rubric_items) {
                    if (rubric_item.description === col) {
                        pts_change += rubric_item.points;
                        selected_rubric_item_ids.push(rubric_item.id);
                        col_found = true;
                        break;
                    }
                }
                if (!col_found) {
                    throw new Error(`Rubric item with description "${col}" not found in rubric items for question ${question.qid}`);
                }
            }

            if (!instance_question.manual_rubric_id) {
                throw new Error(`Instance question ${instance_question.instance_question_id} does not have a manual rubric id`);
            }
        

            console.log('instance_question', instance_question);

            if (!instance_question.max_points) {
                throw new Error(`Instance question points not found for assessment instance ${new_assessment_instance_id}`);
            }

            // const { modified_at_conflict, grading_job_id } =
            await manualGrading.updateInstanceQuestionScore(
                assessment.id,
                instance_question.instance_question_id,
                submission_id,
                null,
                {
                    manual_score_perc: null,
                    manual_points: instance_question.max_points + pts_change,
                    auto_score_perc: null,
                    auto_points: null,
                    feedback: { manual: '' },
                    manual_rubric_data: {
                        rubric_id: instance_question.manual_rubric_id,
                        applied_rubric_items:selected_rubric_item_ids.map(id => ({
                            rubric_item_id: id,
                        })),
                        adjust_points: null
                    },
                },
                res.locals.authn_user.user_id,
            );
            console.log('selected_rubric_item_ids', question.qid, selected_rubric_item_ids);
        }            
        console.log('nameToSubmissionFolder: ', JSON.stringify(nameToSubmissionFolder, null, 2));
    }
}