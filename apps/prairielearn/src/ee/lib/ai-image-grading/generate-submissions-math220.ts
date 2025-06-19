import { z } from 'zod';

import { loadSqlEquiv, queryRows } from '@prairielearn/postgres';

import { makeAssessmentInstance } from '../../../lib/assessment.js';
import { EnrollmentSchema, InstanceQuestionSchema } from '../../../lib/db-types.js';
import { ensureVariant } from '../../../lib/question-variant.js';
import { selectAssessmentById } from '../../../models/assessment.js';
import { selectCourseInstanceByShortName } from '../../../models/course-instances.js';
import { selectCourseById } from '../../../models/course.js';
import { selectQuestionById } from '../../../models/question.js';

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
        '1'
    );

    for (const enrolled_student of enrollments) {
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
                question_id: z.string()
            })
        );

        console.log('instance_questions', instance_questions);
        
        for (const instance_question of instance_questions) {
            // Get the question
            const question = await selectQuestionById(
                instance_question.question_id
            );
            
            // Generate a variant for each question
            const variant = await ensureVariant(
                question.id,
                instance_question.id,
                enrolled_student.user_id,
                enrolled_student.user_id,
                courseInstance.id,
                course,
                course,
                {},
                false,
                null,
            );
            console.log('Variant', variant.id);
            
        //     // Generate a submission for each question
        //     const submission_data = {
        //         variant_id: variant.id,
        //         user_id: enrolled_student.user_id,
        //         auth_user_id: enrolled_student.user_id,
        //         submitted_answer: {},
        //     };
            
        //     await saveSubmission(
        //         submission_data,
        //         variant,
        //         question,
        //         course,
        //     );

            
        //     // console.log('instance_question', instance_question);


        }            
        // break;

    }
    return;
}