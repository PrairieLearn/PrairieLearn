import { describe, expect, it } from 'vitest';

import { buildImportPayload, getIncludedQuestionCount } from './instructorQtiImport.payload.js';
import type {
  AssessmentOverrides,
  QuestionOverrides,
  SerializedConversionResult,
  SerializedQuestionOutput,
} from './instructorQtiImport.types.js';

function makeQuestion(directoryName: string, title = directoryName): SerializedQuestionOutput {
  return {
    draftId: 'draft',
    originalDirectoryName: directoryName,
    directoryName,
    sourceId: `${directoryName}-source`,
    infoJson: {
      uuid: `${directoryName}-uuid`,
      title,
      topic: 'Imported',
      tags: ['imported'],
      type: 'v3',
    },
    questionHtml: '<pl-question-panel></pl-question-panel>',
    clientFiles: {},
    skippedVideos: [],
    copiedExternalImageFileCount: 0,
  };
}

function makeAssessment(
  directoryName: string,
  questions: SerializedQuestionOutput[],
): SerializedConversionResult {
  return {
    draftId: 'draft',
    sourceId: `${directoryName}-source`,
    sourceType: 'assessment',
    title: directoryName,
    questions,
    warnings: [],
    assessment: {
      directoryName,
      infoJson: {
        uuid: `${directoryName}-uuid`,
        type: 'Homework',
        title: directoryName,
        set: 'Homework',
        number: '1',
        allowAccess: [],
        zones: [
          {
            title: 'Questions',
            questions: questions.map((q) => ({ id: q.directoryName, autoPoints: 1 })),
          },
        ],
      },
    },
  };
}

function makeBank(
  directoryName: string,
  questions: SerializedQuestionOutput[],
): SerializedConversionResult {
  return {
    draftId: 'draft',
    sourceId: `${directoryName}-source`,
    sourceType: 'question-bank',
    title: directoryName,
    questions,
    warnings: [],
    directoryName,
  };
}

function makeOverride(result: SerializedConversionResult): AssessmentOverrides {
  return {
    title: result.title,
    type: 'Homework',
    set: 'Homework',
    number: '1',
    included: true,
  };
}

function makeQuestionOverrides(
  results: SerializedConversionResult[],
  edits: Record<string, Partial<QuestionOverrides>> = {},
): Map<string, QuestionOverrides> {
  const overrides = new Map<string, QuestionOverrides>();
  for (const result of results) {
    for (const q of result.questions) {
      overrides.set(q.directoryName, {
        title: q.infoJson.title,
        topic: q.infoJson.topic,
        tags: [...q.infoJson.tags],
        included: true,
        originalDirName: q.directoryName,
        collides: false,
        collisionStrategy: 'overwrite',
        ...edits[q.directoryName],
      });
    }
  }
  return overrides;
}

function build(
  results: SerializedConversionResult[],
  {
    courseInstanceId = '1',
    edits,
    existingDirs = new Set<string>(),
    overrides = results.map(makeOverride),
  }: {
    courseInstanceId?: string | null;
    edits?: Record<string, Partial<QuestionOverrides>>;
    existingDirs?: Set<string>;
    overrides?: AssessmentOverrides[];
  } = {},
) {
  return buildImportPayload({
    results,
    overrides,
    questionOverrides: makeQuestionOverrides(results, edits),
    existingDirs,
    courseInstanceId,
  });
}

const q1 = makeQuestion('imported/quiz/q1', 'Question 1');
const q2 = makeQuestion('imported/quiz/q2', 'Question 2');

describe('buildImportPayload', () => {
  it('flattens quizzes into standalone questions without a course instance', () => {
    const payload = build([makeAssessment('quiz', [q1, q2])], { courseInstanceId: null });

    expect(payload).toEqual({
      courseInstanceId: null,
      assessments: [],
      questions: [
        {
          draftId: 'draft',
          originalDirectoryName: 'imported/quiz/q1',
          directoryName: 'imported/quiz/q1',
          infoJson: q1.infoJson,
          overwrite: false,
        },
        {
          draftId: 'draft',
          originalDirectoryName: 'imported/quiz/q2',
          directoryName: 'imported/quiz/q2',
          infoJson: q2.infoJson,
          overwrite: false,
        },
      ],
    });
  });

  it('keeps quizzes as assessments when a course instance is selected', () => {
    const payload = build([makeAssessment('quiz', [q1, q2])]);

    expect(payload.courseInstanceId).toBe('1');
    expect(payload.questions).toEqual([]);
    expect(payload.assessments).toHaveLength(1);
    expect(payload.assessments?.[0]).toMatchObject({
      directoryName: 'quiz',
      infoJson: {
        title: 'quiz',
        type: 'Homework',
        set: 'Homework',
        number: '1',
        zones: [
          {
            title: 'Questions',
            questions: [
              { id: 'imported/quiz/q1', autoPoints: 1 },
              { id: 'imported/quiz/q2', autoPoints: 1 },
            ],
          },
        ],
      },
    });
    expect(payload.assessments?.[0].questions.map((q) => q.directoryName)).toEqual([
      'imported/quiz/q1',
      'imported/quiz/q2',
    ]);
  });

  it('imports question bank questions as standalone questions alongside assessments', () => {
    const bankQuestion = makeQuestion('imported/bank/b1');
    const payload = build([makeAssessment('quiz', [q1]), makeBank('bank', [bankQuestion])]);

    expect(payload.assessments?.map((a) => a.directoryName)).toEqual(['quiz']);
    expect(payload.questions?.map((q) => q.directoryName)).toEqual(['imported/bank/b1']);
  });

  it('deduplicates standalone questions shared across results', () => {
    const payload = build([makeAssessment('quiz', [q1]), makeBank('bank', [q1])], {
      courseInstanceId: null,
    });

    expect(payload.questions?.map((q) => q.directoryName)).toEqual(['imported/quiz/q1']);
  });

  it('drops excluded questions and results in both branches', () => {
    const results = [makeAssessment('quiz', [q1, q2]), makeAssessment('empty', [q1])];
    const overrides = results.map(makeOverride);
    overrides[1].included = false;
    const edits = { 'imported/quiz/q2': { included: false } };

    const withInstance = build(results, { overrides, edits });
    expect(withInstance.assessments?.map((a) => a.directoryName)).toEqual(['quiz']);
    expect(withInstance.assessments?.[0].questions.map((q) => q.directoryName)).toEqual([
      'imported/quiz/q1',
    ]);
    expect(withInstance.assessments?.[0].infoJson.zones).toEqual([
      { title: 'Questions', questions: [{ id: 'imported/quiz/q1', autoPoints: 1 }] },
    ]);

    const withoutInstance = build(results, { overrides, edits, courseInstanceId: null });
    expect(withoutInstance.assessments).toEqual([]);
    expect(withoutInstance.questions?.map((q) => q.directoryName)).toEqual(['imported/quiz/q1']);
  });

  it('applies reviewer edits to assessment and question metadata', () => {
    const results = [makeAssessment('quiz', [q1])];
    const overrides: AssessmentOverrides[] = [
      { title: 'Week 1 Quiz', type: 'Exam', set: 'Exam', number: '3', included: true },
    ];
    const edits = {
      'imported/quiz/q1': { title: 'Renamed', topic: 'Algebra', tags: ['imported', 'week1'] },
    };

    const payload = build(results, { overrides, edits });

    expect(payload.assessments?.[0].infoJson).toMatchObject({
      title: 'Week 1 Quiz',
      type: 'Exam',
      set: 'Exam',
      number: '3',
    });
    expect(payload.assessments?.[0].questions[0].infoJson).toMatchObject({
      title: 'Renamed',
      topic: 'Algebra',
      tags: ['imported', 'week1'],
    });
  });

  it('renames colliding questions consistently across the payload', () => {
    const existingDirs = new Set(['imported/quiz/q1', 'imported/quiz/q1-2']);
    const edits = {
      'imported/quiz/q1': { collides: true, collisionStrategy: 'rename' as const },
      'imported/quiz/q2': { collides: true, collisionStrategy: 'overwrite' as const },
    };

    const withInstance = build([makeAssessment('quiz', [q1, q2])], { existingDirs, edits });
    expect(withInstance.assessments?.[0].questions).toMatchObject([
      { directoryName: 'imported/quiz/q1-3', overwrite: false },
      { directoryName: 'imported/quiz/q2', overwrite: true },
    ]);
    expect(withInstance.assessments?.[0].infoJson).toMatchObject({
      zones: [{ questions: [{ id: 'imported/quiz/q1-3' }, { id: 'imported/quiz/q2' }] }],
    });

    const withoutInstance = build([makeAssessment('quiz', [q1, q2])], {
      existingDirs,
      edits,
      courseInstanceId: null,
    });
    expect(withoutInstance.questions).toMatchObject([
      { directoryName: 'imported/quiz/q1-3', overwrite: false },
      { directoryName: 'imported/quiz/q2', overwrite: true },
    ]);
  });

  it('suffixes assessments that resolve to the same directory name', () => {
    const payload = build([
      makeAssessment('quiz', [q1]),
      makeAssessment('quiz', [makeQuestion('imported/quiz-2/q1')]),
    ]);

    expect(payload.assessments?.map((a) => a.directoryName)).toEqual(['quiz', 'quiz-2']);
  });
});

describe('getIncludedQuestionCount', () => {
  it('counts questions that are not excluded', () => {
    const result = makeAssessment('quiz', [q1, q2]);
    const overrides = makeQuestionOverrides([result], {
      'imported/quiz/q2': { included: false },
    });

    expect(getIncludedQuestionCount(result, overrides)).toBe(1);
    expect(getIncludedQuestionCount(result, new Map())).toBe(2);
  });
});
