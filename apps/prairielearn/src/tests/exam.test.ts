import { afterAll, assert, beforeAll, describe, it } from 'vitest';

import * as sqldb from '@prairielearn/postgres';

import { SubmissionSchema, type Variant } from '../lib/db-types.js';

import * as helperAttachFiles from './helperAttachFiles.js';
import type { AttachFileLocals, DownloadAttachedFileLocals } from './helperAttachFiles.js';
import * as helperExam from './helperExam.js';
import type { TestExamQuestion } from './helperExam.js';
import * as helperQuestion from './helperQuestion.js';
import * as helperServer from './helperServer.js';

const sql = sqldb.loadSqlEquiv(import.meta.url);

const locals = {} as AttachFileLocals &
  DownloadAttachedFileLocals & {
    assessmentInstanceUrl: string;
    shouldHaveButtons: string[];
    postAction: string;
    question: TestExamQuestion & {
      /**
       * Saved variant data for this question. This is stored per-question rather than
       * on `locals` directly because partial credit tests iterate over multiple questions,
       * storing and restoring variants independently. If stored on `locals.savedVariant`,
       * each subsequent question's store would overwrite the previous one, causing the
       * wrong variant to be restored later.
       */
      savedVariant?: Variant;
      /** Saved CSRF token for this question. */
      questionSavedCsrfToken?: string;
    };
    expectedResult: {
      submission_score?: number | null;
      submission_correct?: boolean | null;
      instance_question_points?: number;
      instance_question_score_perc?: number;
      instance_question_auto_points?: number;
      instance_question_manual_points?: number;
      assessment_instance_points?: number;
      assessment_instance_score_perc?: number;
      instance_question_stats?: {
        first_submission_score: number | null;
        last_submission_score: number | null;
        submission_score_array: (number | null)[];
        incremental_submission_score_array: (number | null)[];
        incremental_submission_points_array: (number | null)[];
      };
    };
    questionBaseUrl: string;
    variant: Variant;
    savedVariant: Variant;
    getSubmittedAnswer: (variant: any) => object;
    csvData: string;
    expectedFeedback: {
      submission_id: string | null;
      qid: string;
      feedback: { manual?: string; msg?: string } | null;
    };
    questionSavedCsrfToken: string;
    submission_id_for_feedback: string;
    submission_id_preserve0: string;
    submission_id_preserve1: string;
    submission_id_preserveN: string;
    totalPoints: number;
  };

// each outer entry is a whole exam session
// each inner entry is a list of question submissions
//     score: value to submit, will be the percentage score for the submission
//     action: 'save', 'grade', 'store', 'save-stored-fail', 'grade-stored-fail'
//     sub_points: additional points awarded for this submission (NOT total points for the question)
//     open: true or false
const partialCreditTests = [
  [
    // answer every question correctly immediately
    { qid: 'partialCredit1', action: 'store', score: 0, sub_points: 0 },
    { qid: 'partialCredit2', action: 'store', score: 0, sub_points: 0 },
    { qid: 'partialCredit3', action: 'store', score: 0, sub_points: 0 },
    { qid: 'partialCredit1', action: 'grade', score: 100, sub_points: 19 },
    { qid: 'partialCredit2', action: 'grade', score: 100, sub_points: 9 },
    { qid: 'partialCredit3', action: 'grade', score: 100, sub_points: 13 },
    { qid: 'partialCredit1', action: 'check-closed', score: 0, sub_points: 0 },
    { qid: 'partialCredit2', action: 'check-closed', score: 0, sub_points: 0 },
    { qid: 'partialCredit3', action: 'check-closed', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit1',
      action: 'save-stored-fail',
      score: 0,
      sub_points: 0,
    },
    {
      qid: 'partialCredit2',
      action: 'grade-stored-fail',
      score: 0,
      sub_points: 0,
    },
    {
      qid: 'partialCredit3',
      action: 'save-stored-fail',
      score: 0,
      sub_points: 0,
    },
  ],
  [
    // answer questions correctly on the second try
    { qid: 'partialCredit1', action: 'store', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit1',
      action: 'grade',
      score: 100,
      sub_points: 19,
      stats: {
        first_submission_score: 1,
        last_submission_score: 1,
        submission_score_array: [1],
        incremental_submission_score_array: [1],
        incremental_submission_points_array: [19],
      },
    },
    { qid: 'partialCredit1', action: 'grade-stored-fail', score: 0, sub_points: 0 },
    { qid: 'partialCredit2', action: 'store', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 37,
      sub_points: 9 * 0.37,
      stats: {
        first_submission_score: 0.37,
        last_submission_score: 0.37,
        submission_score_array: [0.37],
        incremental_submission_score_array: [0.37],
        incremental_submission_points_array: [9 * 0.37],
      },
    },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 100,
      sub_points: 7 * (1 - 0.37),
      stats: {
        first_submission_score: 0.37,
        last_submission_score: 1,
        submission_score_array: [0.37, 1],
        incremental_submission_score_array: [0.37, 1 - 0.37],
        incremental_submission_points_array: [9 * 0.37, 7 * (1 - 0.37)],
      },
    },
    {
      qid: 'partialCredit2',
      action: 'save-stored-fail',
      score: 0,
      sub_points: 0,
    },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 71,
      sub_points: 13 * 0.71,
    },
    { qid: 'partialCredit3', action: 'store', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 100,
      sub_points: 13 * (1 - 0.71),
    },
    {
      qid: 'partialCredit3',
      action: 'grade-stored-fail',
      score: 0,
      sub_points: 0,
    },
    { qid: 'partialCredit1', action: 'check-closed', score: 0, sub_points: 0 },
    { qid: 'partialCredit2', action: 'check-closed', score: 0, sub_points: 0 },
    { qid: 'partialCredit3', action: 'check-closed', score: 0, sub_points: 0 },
  ],
  [
    // use all the attempts for each question
    {
      qid: 'partialCredit1',
      action: 'save',
      score: 100,
      sub_points: 0,
      stats: {
        first_submission_score: null,
        last_submission_score: null,
        submission_score_array: [],
        incremental_submission_score_array: [],
        incremental_submission_points_array: [],
      },
    },
    { qid: 'partialCredit1', action: 'store', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit1',
      action: 'grade',
      score: 24,
      sub_points: 19 * 0.24,
      stats: {
        first_submission_score: 0.24,
        last_submission_score: 0.24,
        submission_score_array: [0.24],
        incremental_submission_score_array: [0.24],
        incremental_submission_points_array: [19 * 0.24],
      },
    },
    { qid: 'partialCredit1', action: 'check-closed', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit1',
      action: 'save-stored-fail',
      score: 0,
      sub_points: 0,
    },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 0,
      sub_points: 0,
      stats: {
        first_submission_score: 0,
        last_submission_score: 0,
        submission_score_array: [0],
        incremental_submission_score_array: [0],
        incremental_submission_points_array: [0],
      },
    },
    {
      qid: 'partialCredit2',
      action: 'save',
      score: 97,
      sub_points: 0,
      stats: {
        first_submission_score: 0,
        last_submission_score: 0,
        submission_score_array: [0],
        incremental_submission_score_array: [0],
        incremental_submission_points_array: [0],
      },
    },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 14,
      sub_points: 7 * 0.14,
      stats: {
        first_submission_score: 0,
        last_submission_score: 0.14,
        submission_score_array: [0, 0.14],
        incremental_submission_score_array: [0, 0.14],
        incremental_submission_points_array: [0, 7 * 0.14],
      },
    },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 8,
      sub_points: 0,
      stats: {
        first_submission_score: 0,
        last_submission_score: 0.08,
        submission_score_array: [0, 0.14, 0.08],
        incremental_submission_score_array: [0, 0.14, 0],
        incremental_submission_points_array: [0, 7 * 0.14, 0],
      },
    },
    {
      qid: 'partialCredit2',
      action: 'save',
      score: 0,
      sub_points: 0,
      stats: {
        first_submission_score: 0,
        last_submission_score: 0.08,
        submission_score_array: [0, 0.14, 0.08],
        incremental_submission_score_array: [0, 0.14, 0],
        incremental_submission_points_array: [0, 7 * 0.14, 0],
      },
    },
    { qid: 'partialCredit2', action: 'store', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 27,
      sub_points: 3 * (0.27 - 0.14),
      stats: {
        first_submission_score: 0,
        last_submission_score: 0.27,
        submission_score_array: [0, 0.14, 0.08, 0.27],
        incremental_submission_score_array: [0, 0.14, 0, 0.27 - 0.14],
        incremental_submission_points_array: [0, 7 * 0.14, 0, 3 * (0.27 - 0.14)],
      },
    },
    { qid: 'partialCredit2', action: 'check-closed', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit2',
      action: 'grade-stored-fail',
      score: 0,
      sub_points: 0,
    },
    {
      qid: 'partialCredit3',
      action: 'save',
      score: 100,
      sub_points: 0,
      stats: {
        first_submission_score: null,
        last_submission_score: null,
        submission_score_array: [],
        incremental_submission_score_array: [],
        incremental_submission_points_array: [],
      },
    },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 63,
      sub_points: 13 * 0.63,
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.63,
        submission_score_array: [0.63],
        incremental_submission_score_array: [0.63],
        incremental_submission_points_array: [13 * 0.63],
      },
    },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 63,
      sub_points: 0,
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.63,
        submission_score_array: [0.63, 0.63],
        incremental_submission_score_array: [0.63, 0],
        incremental_submission_points_array: [13 * 0.63, 0],
      },
    },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 64,
      sub_points: 8 * (0.64 - 0.63),
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.64,
        submission_score_array: [0.63, 0.63, 0.64],
        incremental_submission_score_array: [0.63, 0, 0.64 - 0.63],
        incremental_submission_points_array: [13 * 0.63, 0, 8 * (0.64 - 0.63)],
      },
    },
    {
      qid: 'partialCredit3',
      action: 'save',
      score: 72,
      sub_points: 0,
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.64,
        submission_score_array: [0.63, 0.63, 0.64],
        incremental_submission_score_array: [0.63, 0, 0.64 - 0.63],
        incremental_submission_points_array: [13 * 0.63, 0, 8 * (0.64 - 0.63)],
      },
    },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 7,
      sub_points: 0,
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.07,
        submission_score_array: [0.63, 0.63, 0.64, 0.07],
        incremental_submission_score_array: [0.63, 0, 0.64 - 0.63, 0],
        incremental_submission_points_array: [13 * 0.63, 0, 8 * (0.64 - 0.63), 0],
      },
    },
    { qid: 'partialCredit3', action: 'store', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 97,
      sub_points: 0.1 * (0.97 - 0.64),
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.97,
        submission_score_array: [0.63, 0.63, 0.64, 0.07, 0.97],
        incremental_submission_score_array: [0.63, 0, 0.64 - 0.63, 0, 0.97 - 0.64],
        incremental_submission_points_array: [
          13 * 0.63,
          0,
          8 * (0.64 - 0.63),
          0,
          0.1 * (0.97 - 0.64),
        ],
      },
    },
    { qid: 'partialCredit3', action: 'check-closed', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit3',
      action: 'grade-stored-fail',
      score: 0,
      sub_points: 0,
    },
  ],
  [
    // same as above, but in an interspersed order
    {
      qid: 'partialCredit2',
      action: 'save',
      score: 97,
      sub_points: 0,
      stats: {
        first_submission_score: null,
        last_submission_score: null,
        submission_score_array: [],
        incremental_submission_score_array: [],
        incremental_submission_points_array: [],
      },
    },
    { qid: 'partialCredit2', action: 'store', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 63,
      sub_points: 13 * 0.63,
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.63,
        submission_score_array: [0.63],
        incremental_submission_score_array: [0.63],
        incremental_submission_points_array: [13 * 0.63],
      },
    },
    { qid: 'partialCredit1', action: 'store', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit3',
      action: 'save',
      score: 100,
      sub_points: 0,
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.63,
        submission_score_array: [0.63],
        incremental_submission_score_array: [0.63],
        incremental_submission_points_array: [13 * 0.63],
      },
    },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 0,
      sub_points: 0,
      stats: {
        first_submission_score: 0,
        last_submission_score: 0,
        submission_score_array: [0],
        incremental_submission_score_array: [0],
        incremental_submission_points_array: [0],
      },
    },
    {
      qid: 'partialCredit1',
      action: 'save',
      score: 100,
      sub_points: 0,
      stats: {
        first_submission_score: null,
        last_submission_score: null,
        submission_score_array: [],
        incremental_submission_score_array: [],
        incremental_submission_points_array: [],
      },
    },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 63,
      sub_points: 0,
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.63,
        submission_score_array: [0.63, 0.63],
        incremental_submission_score_array: [0.63, 0],
        incremental_submission_points_array: [13 * 0.63, 0],
      },
    },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 14,
      sub_points: 7 * 0.14,
      stats: {
        first_submission_score: 0,
        last_submission_score: 0.14,
        submission_score_array: [0, 0.14],
        incremental_submission_score_array: [0, 0.14],
        incremental_submission_points_array: [0, 7 * 0.14],
      },
    },
    {
      qid: 'partialCredit2',
      action: 'save',
      score: 0,
      sub_points: 0,
      stats: {
        first_submission_score: 0,
        last_submission_score: 0.14,
        submission_score_array: [0, 0.14],
        incremental_submission_score_array: [0, 0.14],
        incremental_submission_points_array: [0, 7 * 0.14],
      },
    },
    {
      qid: 'partialCredit3',
      action: 'save',
      score: 72,
      sub_points: 0,
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.63,
        submission_score_array: [0.63, 0.63],
        incremental_submission_score_array: [0.63, 0],
        incremental_submission_points_array: [13 * 0.63, 0],
      },
    },
    {
      qid: 'partialCredit1',
      action: 'grade',
      score: 24,
      sub_points: 19 * 0.24,
      stats: {
        first_submission_score: 0.24,
        last_submission_score: 0.24,
        submission_score_array: [0.24],
        incremental_submission_score_array: [0.24],
        incremental_submission_points_array: [19 * 0.24],
      },
    },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 64,
      sub_points: 8 * (0.64 - 0.63),
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.64,
        submission_score_array: [0.63, 0.63, 0.64],
        incremental_submission_score_array: [0.63, 0, 0.64 - 0.63],
        incremental_submission_points_array: [13 * 0.63, 0, 8 * (0.64 - 0.63)],
      },
    },
    { qid: 'partialCredit3', action: 'store', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 7,
      sub_points: 0,
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.07,
        submission_score_array: [0.63, 0.63, 0.64, 0.07],
        incremental_submission_score_array: [0.63, 0, 0.64 - 0.63, 0],
        incremental_submission_points_array: [13 * 0.63, 0, 8 * (0.64 - 0.63), 0],
      },
    },
    {
      qid: 'partialCredit1',
      action: 'save-stored-fail',
      score: 0,
      sub_points: 0,
    },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 8,
      sub_points: 0,
      stats: {
        first_submission_score: 0,
        last_submission_score: 0.08,
        submission_score_array: [0, 0.14, 0.08],
        incremental_submission_score_array: [0, 0.14, 0],
        incremental_submission_points_array: [0, 7 * 0.14, 0],
      },
    },
    { qid: 'partialCredit1', action: 'check-closed', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit3',
      action: 'grade',
      score: 97,
      sub_points: 0.1 * (0.97 - 0.64),
      stats: {
        first_submission_score: 0.63,
        last_submission_score: 0.97,
        submission_score_array: [0.63, 0.63, 0.64, 0.07, 0.97],
        incremental_submission_score_array: [0.63, 0, 0.64 - 0.63, 0, 0.97 - 0.64],
        incremental_submission_points_array: [
          13 * 0.63,
          0,
          8 * (0.64 - 0.63),
          0,
          0.1 * (0.97 - 0.64),
        ],
      },
    },
    {
      qid: 'partialCredit2',
      action: 'grade',
      score: 27,
      sub_points: 3 * (0.27 - 0.14),
      stats: {
        first_submission_score: 0,
        last_submission_score: 0.27,
        submission_score_array: [0, 0.14, 0.08, 0.27],
        incremental_submission_score_array: [0, 0.14, 0, 0.27 - 0.14],
        incremental_submission_points_array: [0, 7 * 0.14, 0, 3 * (0.27 - 0.14)],
      },
    },
    { qid: 'partialCredit3', action: 'check-closed', score: 0, sub_points: 0 },
    {
      qid: 'partialCredit3',
      action: 'grade-stored-fail',
      score: 0,
      sub_points: 0,
    },
    {
      qid: 'partialCredit2',
      action: 'grade-stored-fail',
      score: 0,
      sub_points: 0,
    },
    { qid: 'partialCredit2', action: 'check-closed', score: 0, sub_points: 0 },
  ],
];

describe('Exam assessment', { timeout: 60_000 }, function () {
  beforeAll(helperServer.before());

  afterAll(helperServer.after);

  let elemList;

  helperExam.startExam(locals, 'exam1-automaticTestSuite');

  describe('6. assessment_instance: set attach files page URL', function () {
    it('should succeed', function () {
      locals.attachFilesUrl = locals.assessmentInstanceUrl;
    });
  });

  describe('7. assessment_instance: attach text file', function () {
    const textFile = true;
    helperAttachFiles.attachFile(locals, textFile);
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('8. assessment_instance: delete attached text file', function () {
    helperAttachFiles.deleteAttachedFile(locals);
    helperAttachFiles.checkNoAttachedFiles(locals);
  });

  describe('9. assessment_instance: attach uploaded file', function () {
    const textFile = false;
    helperAttachFiles.attachFile(locals, textFile);
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('10. assessment_instance: delete attached uploaded file', function () {
    helperAttachFiles.deleteAttachedFile(locals);
    helperAttachFiles.checkNoAttachedFiles(locals);
  });

  describe('11. instance_question: attach files setup', function () {
    describe('setting up the question data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    describe('set attach files page URL', function () {
      it('should succeed', function () {
        locals.attachFilesUrl = locals.questionBaseUrl + '/' + locals.question.id;
      });
    });
  });

  describe('12. instance_question: attach text file', function () {
    const textFile = true;
    helperAttachFiles.attachFile(locals, textFile);
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('13. instance_question: delete attached text file', function () {
    helperAttachFiles.deleteAttachedFile(locals);
    helperAttachFiles.checkNoAttachedFiles(locals);
  });

  describe('14. instance_question: attach uploaded file', function () {
    const textFile = false;
    helperAttachFiles.attachFile(locals, textFile);
    helperAttachFiles.downloadAttachedFile(locals);
  });

  describe('15. instance_question: delete attached uploaded file', function () {
    helperAttachFiles.deleteAttachedFile(locals);
    helperAttachFiles.checkNoAttachedFiles(locals);
  });

  describe('16. save correct answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'save';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
        locals.expectedResult = {
          submission_score: null,
          submission_correct: null,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 21) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 0,
          assessment_instance_score_perc: (0 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            wx: variant.true_answer.wx,
            wy: variant.true_answer.wy,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('17. grade incorrect answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 21) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 0,
          assessment_instance_score_perc: (0 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            wx: -500,
            wy: 700,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('18. grade incorrect answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 5) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 0,
          assessment_instance_score_perc: (0 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c + 1,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('19. grade incorrect answer to question fossilFuelsRadio', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 17) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 0,
          assessment_instance_score_perc: (0 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            key: variant.true_answer.key === 'a' ? 'b' : 'a',
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('20. grade invalid answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
        locals.expectedResult = {
          submission_score: null,
          submission_correct: null,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 17) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 0,
          assessment_instance_score_perc: (0 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            c: 'not_a_number',
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
    describe('check the submission is not gradable', function () {
      it('should succeed', async () => {
        const submission = await sqldb.queryRow(sql.select_last_submission, SubmissionSchema);
        assert.isFalse(submission.gradable);
      });
    });
    describe('the submission panel contents', function () {
      it('should contain "Invalid"', function () {
        elemList = locals.$('div.submission-body :contains("Invalid")');
        assert.isAtLeast(elemList.length, 1);
      });
    });
  });

  describe('21. save incorrect answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'save';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c - 1,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('22. the brokenGeneration question', function () {
    describe('setting the question', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['tryAgain'];
        locals.postAction = 'save';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.brokenGeneration;
      });
      it('should result in no variants', async () => {
        const rowCount = await sqldb.execute(sql.select_variants_for_qid, {
          qid: locals.question.qid,
        });
        assert.equal(rowCount, 0);
      });
    });
    helperQuestion.getInstanceQuestion(locals, { errorExpected: true });
    describe('access the question', function () {
      it('should display "Broken question"', function () {
        elemList = locals.$('div.question-body:contains("Broken question")');
        assert.lengthOf(elemList, 1);
      });
      it('should have created one variant', async () => {
        const rowCount = await sqldb.execute(sql.select_variants_for_qid, {
          qid: locals.question.qid,
        });
        assert.equal(rowCount, 1);
      });
    });
    helperQuestion.getInstanceQuestion(locals, { errorExpected: true });
    describe('access the question again', function () {
      it('should display "Broken question"', function () {
        elemList = locals.$('div.question-body:contains("Broken question")');
        assert.lengthOf(elemList, 1);
      });
      it('should have created two variants', async () => {
        const rowCount = await sqldb.execute(sql.select_variants_for_qid, {
          qid: locals.question.qid,
        });
        assert.equal(rowCount, 2);
      });
    });
  });

  describe('23. load question addNumbers page and save data for later submission', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    describe('save data for later submission', function () {
      it('should succeed', function () {
        locals.savedVariant = structuredClone(locals.variant);
        locals.questionSavedCsrfToken = locals.__csrf_token;
      });
    });
  });

  describe('24. grade correct answer to question addNumbers', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
        locals.expectedResult = {
          submission_score: 1,
          submission_correct: true,
          instance_question_points: 3,
          instance_question_score_perc: (3 / 5) * 100,
          instance_question_auto_points: 3,
          instance_question_manual_points: 0,
          assessment_instance_points: 3,
          assessment_instance_score_perc: (3 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('25. save correct answer to saved question addNumbers page', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
        locals.postAction = 'save';
        locals.getSubmittedAnswer = function (variant) {
          return {
            c: variant.true_answer.c,
          };
        };
      });
    });
    describe('restore saved data for submission', function () {
      it('should succeed', function () {
        locals.variant = structuredClone(locals.savedVariant);
        locals.__csrf_token = locals.questionSavedCsrfToken;
      });
    });
    helperQuestion.postInstanceQuestionAndFail(locals, 400);
  });

  describe('26. save incorrect answer to question fossilFuelsRadio', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'save';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
        locals.expectedResult = {
          submission_score: null,
          submission_correct: null,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 17) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 3,
          assessment_instance_score_perc: (3 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (variant) {
          return {
            key: variant.true_answer.key === 'a' ? 'b' : 'a',
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('27. load question addVectors page and save data for later submission', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    describe('save data for later submission', function () {
      it('should succeed', function () {
        locals.savedVariant = structuredClone(locals.variant);
        locals.questionSavedCsrfToken = locals.__csrf_token;
      });
    });
  });

  describe('28. grade incorrect answer to question addVectors', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.postAction = 'grade';
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
        locals.expectedResult = {
          submission_score: 0,
          submission_correct: false,
          instance_question_points: 0,
          instance_question_score_perc: (0 / 11) * 100,
          instance_question_auto_points: 0,
          instance_question_manual_points: 0,
          assessment_instance_points: 3,
          assessment_instance_score_perc: (3 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
        };
        locals.getSubmittedAnswer = function (_variant) {
          return {
            wx: 2000,
            wy: -3000,
          };
        };
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    helperQuestion.postInstanceQuestion(locals);
    helperQuestion.checkQuestionScore(locals);
    helperQuestion.checkAssessmentScore(locals);
  });

  describe('29. submit correct answer to saved question addVectors page', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
        locals.postAction = 'save';
        locals.getSubmittedAnswer = function (variant) {
          return {
            wx: variant.true_answer.wx,
            wy: variant.true_answer.wy,
          };
        };
      });
    });
    describe('restore saved data for submission', function () {
      it('should succeed', function () {
        locals.variant = structuredClone(locals.savedVariant);
        locals.__csrf_token = locals.questionSavedCsrfToken;
      });
    });
    helperQuestion.postInstanceQuestionAndFail(locals, 400);
  });

  describe('30. load question fossilFuelsRadio page and save data for later submission', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.shouldHaveButtons = ['grade', 'save'];
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
      });
    });
    helperQuestion.getInstanceQuestion(locals);
    describe('save data for later submission', function () {
      it('should succeed', function () {
        locals.savedVariant = structuredClone(locals.variant);
        locals.questionSavedCsrfToken = locals.__csrf_token;
      });
    });
  });

  describe('31. close exam', function () {
    it('should succeed', async () => {
      await sqldb.executeRow(sql.close_all_assessment_instances, []);
    });
  });

  describe('32. save correct answer to saved question fossilFuelsRadio page', function () {
    describe('setting up the submission data', function () {
      it('should succeed', function () {
        locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
        locals.postAction = 'save';
        locals.getSubmittedAnswer = function (variant) {
          return {
            key: variant.true_answer.key,
          };
        };
      });
    });
    describe('restore saved data for submission', function () {
      it('should succeed', function () {
        locals.variant = structuredClone(locals.savedVariant);
        locals.__csrf_token = locals.questionSavedCsrfToken;
      });
    });
    helperQuestion.postInstanceQuestionAndFail(locals, 400);
  });

  describe('33. regrading', function () {
    describe('set forceMaxPoints = true for question addVectors', function () {
      it('should succeed', async () => {
        await sqldb.execute(sql.update_addVectors_force_max_points);
      });
    });
    helperQuestion.regradeAssessment(locals);
    describe('check the regrading succeeded', function () {
      describe('setting up the expected question addNumbers results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
          locals.expectedResult = {
            submission_score: 1,
            submission_correct: true,
            instance_question_points: 3,
            instance_question_score_perc: (3 / 5) * 100,
            instance_question_auto_points: 3,
            instance_question_manual_points: 0,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question addVectors results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
          locals.expectedResult = {
            submission_score: 0,
            submission_correct: false,
            instance_question_points: 21,
            instance_question_score_perc: (21 / 21) * 100,
            instance_question_auto_points: 11,
            instance_question_manual_points: 10,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question fossilFuelsRadio results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
          locals.expectedResult = {
            submission_score: null,
            submission_correct: null,
            instance_question_points: 0,
            instance_question_score_perc: (0 / 17) * 100,
            instance_question_auto_points: 0,
            instance_question_manual_points: 0,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected assessment results', function () {
        it('should succeed', function () {
          locals.expectedResult = {
            assessment_instance_points: 24,
            assessment_instance_score_perc:
              (24 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
          };
        });
      });
      helperQuestion.checkAssessmentScore(locals);
    });
  });

  describe('34. instance question score_perc uploads', function () {
    describe('prepare the CSV upload data', function () {
      it('should succeed', function () {
        locals.csvData =
          'uid,instance,qid,score_perc,feedback\n' +
          'dev@example.com,1,addNumbers,40,feedback numbers\n' +
          'dev@example.com,1,addVectors,50,feedback vectors\n' +
          'dev@example.com,1,fossilFuelsRadio,,\n';
      });
    });
    helperQuestion.uploadInstanceQuestionScores(locals);
    describe('check the instance question score upload succeeded', function () {
      describe('setting up the expected question addNumbers results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
          locals.expectedResult = {
            instance_question_points: 2,
            instance_question_score_perc: (2 / 5) * 100,
            instance_question_auto_points: 3,
            instance_question_manual_points: -1,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question addVectors results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
          locals.expectedResult = {
            instance_question_points: 10.5,
            instance_question_score_perc: (10.5 / 21) * 100,
            instance_question_auto_points: 11,
            instance_question_manual_points: -0.5,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question fossilFuelsRadio results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
          locals.expectedResult = {
            instance_question_points: 0,
            instance_question_score_perc: (0 / 17) * 100,
            instance_question_auto_points: 0,
            instance_question_manual_points: 0,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected assessment results', function () {
        it('should succeed', function () {
          locals.expectedResult = {
            assessment_instance_points: 12.5,
            assessment_instance_score_perc:
              (12.5 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
          };
        });
      });
      helperQuestion.checkAssessmentScore(locals);
      describe('setting up the expected feedback for addNumbers', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: null,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: { manual: 'feedback numbers' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addVectors', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: null,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors.qid,
            feedback: { manual: 'feedback vectors' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for fossilFuelsRadio', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: null,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio.qid,
            feedback: null,
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
    });
  });

  describe('35. instance question points uploads', function () {
    describe('prepare the CSV upload data', function () {
      it('should get the submission_ids for addNumbers', async () => {
        const result = await sqldb.queryRows(
          sql.select_submissions_by_qid,
          { qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid },
          SubmissionSchema,
        );
        const rowCount = result.length;
        // make sure we've got lots of submissions to make the later checks work
        assert.isAtLeast(rowCount, 4);
        // we are going to add feedback to one of the submissions
        locals.submission_id_for_feedback = result[2].id;
        // all the the other submissions should not be modified
        locals.submission_id_preserve0 = result[0].id;
        locals.submission_id_preserve1 = result[1].id;
        locals.submission_id_preserveN = result[rowCount - 1].id;
      });
      it('should succeed', function () {
        locals.csvData =
          'uid,instance,qid,points,submission_id,feedback_json\n' +
          'dev@example.com,1,addNumbers,4.7,' +
          locals.submission_id_for_feedback +
          ',"{""msg"":""feedback numbers 2""}"\n' +
          'dev@example.com,1,addVectors,1.2,,\n';
      });
    });
    helperQuestion.uploadInstanceQuestionScores(locals);
    describe('check the instance question score upload succeeded', function () {
      describe('setting up the expected question addNumbers results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
          locals.expectedResult = {
            instance_question_points: 4.7,
            instance_question_score_perc: (4.7 / 5) * 100,
            instance_question_auto_points: 3,
            instance_question_manual_points: 1.7,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question addVectors results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
          locals.expectedResult = {
            instance_question_points: 1.2,
            instance_question_score_perc: (1.2 / 21) * 100,
            instance_question_auto_points: 11,
            instance_question_manual_points: -9.8,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question fossilFuelsRadio results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
          locals.expectedResult = {
            instance_question_points: 0,
            instance_question_score_perc: (0 / 17) * 100,
            instance_question_auto_points: 0,
            instance_question_manual_points: 0,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected assessment results', function () {
        it('should succeed', function () {
          locals.expectedResult = {
            assessment_instance_points: 5.9,
            assessment_instance_score_perc:
              (5.9 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
          };
        });
      });
      helperQuestion.checkAssessmentScore(locals);
      describe('setting up the expected feedback for addNumbers, submission with new feedback', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_for_feedback,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: { msg: 'feedback numbers 2' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addNumbers, submission with preserved feedback 0', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_preserve0,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: {},
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addNumbers, submission with preserved feedback 1', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_preserve1,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: null,
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addNumbers, submission with preserved feedback N', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_preserveN,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: { manual: 'feedback numbers' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addVectors', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: null,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors.qid,
            feedback: { manual: 'feedback vectors' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for fossilFuelsRadio', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: null,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio.qid,
            feedback: null,
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
    });
  });

  describe('36. assessment instance score_perc uploads', function () {
    describe('prepare the CSV upload data', function () {
      it('should succeed', function () {
        locals.csvData = 'uid,instance,score_perc\n' + 'dev@example.com,1,43.7\n';
      });
    });
    helperQuestion.uploadAssessmentInstanceScores(locals);
    describe('check the assessment instance score upload succeeded', function () {
      describe('setting up the expected question addNumbers results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
          locals.expectedResult = {
            instance_question_points: 4.7,
            instance_question_score_perc: (4.7 / 5) * 100,
            instance_question_auto_points: 3,
            instance_question_manual_points: 1.7,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question addVectors results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
          locals.expectedResult = {
            instance_question_points: 1.2,
            instance_question_score_perc: (1.2 / 21) * 100,
            instance_question_auto_points: 11,
            instance_question_manual_points: -9.8,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question fossilFuelsRadio results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
          locals.expectedResult = {
            instance_question_points: 0,
            instance_question_score_perc: (0 / 17) * 100,
            instance_question_auto_points: 0,
            instance_question_manual_points: 0,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected assessment results', function () {
        it('should succeed', function () {
          locals.expectedResult = {
            assessment_instance_points: (43.7 / 100) * helperExam.exam1AutomaticTestSuite.maxPoints,
            assessment_instance_score_perc: 43.7,
          };
        });
      });
      helperQuestion.checkAssessmentScore(locals);
    });
  });

  describe('37. assessment instance points uploads', function () {
    describe('prepare the CSV upload data', function () {
      it('should succeed', function () {
        locals.csvData = 'uid,instance,points\n' + 'dev@example.com,1,29.6\n';
      });
    });
    helperQuestion.uploadAssessmentInstanceScores(locals);
    describe('check the assessment instance score upload succeeded', function () {
      describe('setting up the expected question addNumbers results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
          locals.expectedResult = {
            instance_question_points: 4.7,
            instance_question_score_perc: (4.7 / 5) * 100,
            instance_question_auto_points: 3,
            instance_question_manual_points: 1.7,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question addVectors results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
          locals.expectedResult = {
            instance_question_points: 1.2,
            instance_question_score_perc: (1.2 / 21) * 100,
            instance_question_auto_points: 11,
            instance_question_manual_points: -9.8,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question fossilFuelsRadio results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
          locals.expectedResult = {
            instance_question_points: 0,
            instance_question_score_perc: (0 / 17) * 100,
            instance_question_auto_points: 0,
            instance_question_manual_points: 0,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected assessment results', function () {
        it('should succeed', function () {
          locals.expectedResult = {
            assessment_instance_points: 29.6,
            assessment_instance_score_perc:
              (29.6 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
          };
        });
      });
      helperQuestion.checkAssessmentScore(locals);
    });
  });

  describe('38. instance question split points uploads', function () {
    describe('prepare the CSV upload data', function () {
      it('should get the submission_ids for addNumbers', async () => {
        const result = await sqldb.queryRows(
          sql.select_submissions_by_qid,
          { qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid },
          SubmissionSchema,
        );
        const rowCount = result.length;
        // make sure we've got lots of submissions to make the later checks work
        assert.isAtLeast(rowCount, 4);
        // we are going to add feedback to one of the submissions
        locals.submission_id_for_feedback = result[2].id;
        // all the the other submissions should not be modified
        locals.submission_id_preserve0 = result[0].id;
        locals.submission_id_preserve1 = result[1].id;
        locals.submission_id_preserveN = result[rowCount - 1].id;
      });
      it('should succeed', function () {
        locals.csvData =
          'uid,instance,qid,manual_points,auto_points,submission_id,feedback_json\n' +
          'dev@example.com,1,addNumbers,1.3,2.2,' +
          locals.submission_id_for_feedback +
          ',"{""msg"":""feedback numbers 2""}"\n' +
          'dev@example.com,1,addVectors,,10.7,,\n' +
          'dev@example.com,1,fossilFuelsRadio,2.9,,,\n';
      });
    });
    helperQuestion.uploadInstanceQuestionScores(locals);
    describe('check the instance question score upload succeeded', function () {
      describe('setting up the expected question addNumbers results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
          locals.expectedResult = {
            instance_question_points: 3.5,
            instance_question_score_perc: (3.5 / 5) * 100,
            instance_question_auto_points: 2.2,
            instance_question_manual_points: 1.3,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question addVectors results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
          locals.expectedResult = {
            instance_question_points: 0.9,
            instance_question_score_perc: (0.9 / 21) * 100,
            instance_question_auto_points: 10.7,
            instance_question_manual_points: -9.8,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question fossilFuelsRadio results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
          locals.expectedResult = {
            instance_question_points: 2.9,
            instance_question_score_perc: (2.9 / 17) * 100,
            instance_question_auto_points: 0,
            instance_question_manual_points: 2.9,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected assessment results', function () {
        it('should succeed', function () {
          locals.expectedResult = {
            assessment_instance_points: 7.3,
            assessment_instance_score_perc:
              (7.3 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
          };
        });
      });
      helperQuestion.checkAssessmentScore(locals);
      describe('setting up the expected feedback for addNumbers, submission with new feedback', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_for_feedback,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: { msg: 'feedback numbers 2' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addNumbers, submission with preserved feedback 0', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_preserve0,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: {},
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addNumbers, submission with preserved feedback 1', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_preserve1,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: null,
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addNumbers, submission with preserved feedback N', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_preserveN,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: { manual: 'feedback numbers' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addVectors', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: null,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors.qid,
            feedback: { manual: 'feedback vectors' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for fossilFuelsRadio', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: null,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio.qid,
            feedback: null,
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
    });
  });

  describe('39. instance question split score_perc uploads', function () {
    describe('prepare the CSV upload data', function () {
      it('should get the submission_ids for addNumbers', async () => {
        const result = await sqldb.queryRows(
          sql.select_submissions_by_qid,
          { qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid },
          SubmissionSchema,
        );
        const rowCount = result.length;
        // make sure we've got lots of submissions to make the later checks work
        assert.isAtLeast(rowCount, 4);
        // we are going to add feedback to one of the submissions
        locals.submission_id_for_feedback = result[2].id;
        // all the the other submissions should not be modified
        locals.submission_id_preserve0 = result[0].id;
        locals.submission_id_preserve1 = result[1].id;
        locals.submission_id_preserveN = result[rowCount - 1].id;
      });
      it('should succeed', function () {
        locals.csvData =
          'uid,instance,qid,manual_score_perc,auto_score_perc,submission_id,feedback_json\n' +
          'dev@example.com,1,addNumbers,60,44,' +
          locals.submission_id_for_feedback +
          ',"{""msg"":""feedback numbers 2""}"\n' +
          'dev@example.com,1,addVectors,20,,,\n' +
          'dev@example.com,1,fossilFuelsRadio,,30,,\n';
      });
    });
    helperQuestion.uploadInstanceQuestionScores(locals);
    describe('check the instance question score upload succeeded', function () {
      describe('setting up the expected question addNumbers results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers;
          locals.expectedResult = {
            instance_question_points: 2.2,
            instance_question_score_perc: (2.2 / 5) * 100,
            instance_question_auto_points: 2.2,
            instance_question_manual_points: 0, // no max manual points
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question addVectors results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors;
          locals.expectedResult = {
            instance_question_points: 12.7,
            instance_question_score_perc: (12.7 / 21) * 100,
            instance_question_auto_points: 10.7,
            instance_question_manual_points: 2,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected question fossilFuelsRadio results', function () {
        it('should succeed', function () {
          locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio;
          locals.expectedResult = {
            instance_question_points: 8,
            instance_question_score_perc: (8 / 17) * 100,
            instance_question_auto_points: 5.1,
            instance_question_manual_points: 2.9,
          };
        });
      });
      helperQuestion.checkQuestionScore(locals);
      describe('setting up the expected assessment results', function () {
        it('should succeed', function () {
          locals.expectedResult = {
            assessment_instance_points: 22.9,
            assessment_instance_score_perc:
              (22.9 / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
          };
        });
      });
      helperQuestion.checkAssessmentScore(locals);
      describe('setting up the expected feedback for addNumbers, submission with new feedback', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_for_feedback,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: { msg: 'feedback numbers 2' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addNumbers, submission with preserved feedback 0', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_preserve0,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: {},
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addNumbers, submission with preserved feedback 1', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_preserve1,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: null,
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addNumbers, submission with preserved feedback N', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: locals.submission_id_preserveN,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addNumbers.qid,
            feedback: { manual: 'feedback numbers' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for addVectors', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: null,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.addVectors.qid,
            feedback: { manual: 'feedback vectors' },
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
      describe('setting up the expected feedback for fossilFuelsRadio', function () {
        it('should succeed', function () {
          locals.expectedFeedback = {
            submission_id: null,
            qid: helperExam.exam1AutomaticTestSuite.keyedQuestions.fossilFuelsRadio.qid,
            feedback: null,
          };
        });
      });
      helperQuestion.checkQuestionFeedback(locals);
    });
  });

  partialCreditTests.forEach(function (partialCreditTest, iPartialCreditTest) {
    describe(`partial credit test #${iPartialCreditTest + 1}`, function () {
      describe('server', function () {
        it('should shut down', async function () {
          await helperServer.after();
        });
        it('should start up', async function () {
          await helperServer.before()();
        });
      });

      helperExam.startExam(locals, 'exam1-automaticTestSuite');

      partialCreditTest.forEach(function (questionTest, iQuestionTest) {
        describe(`${questionTest.action} answer number #${iQuestionTest + 1} for question ${
          questionTest.qid
        } with score ${questionTest.score}`, function () {
          describe('setting up the submission data', function () {
            it('should succeed', function () {
              if (questionTest.action === 'check-closed') {
                locals.shouldHaveButtons = [];
              } else {
                locals.shouldHaveButtons = ['grade', 'save'];
              }
              locals.postAction = questionTest.action;
              locals.question = helperExam.exam1AutomaticTestSuite.keyedQuestions[questionTest.qid];
              locals.question.points! += questionTest.sub_points;
              locals.totalPoints += questionTest.sub_points;
              locals.expectedResult = {
                submission_score: questionTest.action === 'save' ? null : questionTest.score / 100,
                submission_correct:
                  questionTest.action === 'save' ? null : questionTest.score === 100,
                instance_question_points: locals.question.points,
                instance_question_score_perc:
                  (locals.question.points! / locals.question.maxPoints) * 100,
                instance_question_auto_points: locals.question.points,
                instance_question_manual_points: 0,
                assessment_instance_points: locals.totalPoints,
                assessment_instance_score_perc:
                  (locals.totalPoints / helperExam.exam1AutomaticTestSuite.maxPoints) * 100,
                instance_question_stats: questionTest.stats,
              };
              locals.getSubmittedAnswer = function (_variant) {
                return {
                  s: String(questionTest.score),
                };
              };
            });
          });
          if (questionTest.action === 'store') {
            helperQuestion.getInstanceQuestion(locals);
            describe('saving submission data', function () {
              it('should succeed', function () {
                locals.question.savedVariant = structuredClone(locals.variant);
                locals.question.questionSavedCsrfToken = locals.__csrf_token;
              });
            });
          } else if (questionTest.action === 'save-stored-fail') {
            describe('restoring submission data', function () {
              it('should succeed', function () {
                locals.postAction = 'save';
                locals.variant = structuredClone(locals.question.savedVariant)!;
                locals.__csrf_token = locals.question.questionSavedCsrfToken!;
              });
            });
            helperQuestion.postInstanceQuestionAndFail(locals, 400);
          } else if (questionTest.action === 'grade-stored-fail') {
            describe('restoring submission data', function () {
              it('should succeed', function () {
                locals.postAction = 'grade';
                locals.variant = structuredClone(locals.question.savedVariant)!;
                locals.__csrf_token = locals.question.questionSavedCsrfToken!;
              });
            });
            helperQuestion.postInstanceQuestionAndFail(locals, 400);
          } else if (questionTest.action === 'check-closed') {
            helperQuestion.getInstanceQuestion(locals);
          } else if (questionTest.action === 'save' || questionTest.action === 'grade') {
            helperQuestion.getInstanceQuestion(locals);
            helperQuestion.postInstanceQuestion(locals);
            helperQuestion.checkQuestionScore(locals);
            helperQuestion.checkQuestionStats(locals);
            helperQuestion.checkAssessmentScore(locals);
          } else {
            throw new Error('unknown action: ' + questionTest.action);
          }
        });
      });
    });
  });
});
