import type { RubricItem } from '../../../lib/db-types.js';

export interface SubmissionDebugData {
    instance_question_id: string;
    assessment_question_id: string;
    link_to_instance_question: string;
    answer: string;
    cluster: string;
    images: string[];
    rubric_items: RubricItem[];
}
