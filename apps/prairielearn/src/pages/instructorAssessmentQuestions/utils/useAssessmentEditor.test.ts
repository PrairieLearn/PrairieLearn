import { describe, expect, it } from 'vitest';

import type {
  EditorState,
  QuestionAlternativeForm,
  TrackingId,
  ZoneAssessmentForm,
  ZoneQuestionBlockForm,
} from '../types.js';

import { createEditorReducer } from './useAssessmentEditor.js';

function tid(id: string): TrackingId {
  return id as unknown as TrackingId;
}

function makeQuestion(
  trackingId: string,
  overrides?: Partial<ZoneQuestionBlockForm>,
): ZoneQuestionBlockForm {
  return {
    trackingId: tid(trackingId),
    autoPoints: 1,
    ...overrides,
  } as ZoneQuestionBlockForm;
}

function makeAlternative(
  trackingId: string,
  overrides?: Partial<QuestionAlternativeForm>,
): QuestionAlternativeForm {
  return {
    trackingId: tid(trackingId),
    ...overrides,
  } as QuestionAlternativeForm;
}

function makeZone(
  trackingId: string,
  questions: ZoneQuestionBlockForm[],
  overrides?: Partial<ZoneAssessmentForm>,
): ZoneAssessmentForm {
  return {
    trackingId: tid(trackingId),
    questions,
    title: `Zone ${trackingId}`,
    ...overrides,
  } as ZoneAssessmentForm;
}

function makeState(overrides?: Partial<EditorState>): EditorState {
  return {
    zones: [],
    questionMetadata: {},
    collapsedGroups: new Set<string>(),
    collapsedZones: new Set<string>(),
    ...overrides,
  };
}

const MOCK_QUESTION_DATA = { question: { qid: 'test' } } as any;

describe('createEditorReducer', () => {
  it('question lifecycle: add, update, delete with metadata cleanup', () => {
    const initialState = makeState({
      zones: [makeZone('z1', [])],
    });
    const reducer = createEditorReducer(initialState);

    const q = makeQuestion('q1', { id: 'qid-1', autoPoints: 5 });

    let state = reducer(initialState, {
      type: 'ADD_QUESTION',
      zoneTrackingId: 'z1',
      question: q,
      questionData: MOCK_QUESTION_DATA,
    });
    expect(state.zones[0].questions).toHaveLength(1);
    expect(state.zones[0].questions[0].id).toBe('qid-1');
    expect(state.questionMetadata['qid-1']).toBe(MOCK_QUESTION_DATA);

    state = reducer(state, {
      type: 'UPDATE_QUESTION',
      questionTrackingId: 'q1',
      question: { autoPoints: 10 },
    });
    expect(state.zones[0].questions[0].autoPoints).toBe(10);

    state = reducer(state, {
      type: 'DELETE_QUESTION',
      questionTrackingId: 'q1',
      questionId: 'qid-1',
    });
    expect(state.zones[0].questions).toHaveLength(0);
    expect(state.questionMetadata['qid-1']).toBeUndefined();
  });

  it('alternative group lifecycle: add group, add/update/delete alternatives', () => {
    const altGroup = makeQuestion('ag1', {
      id: 'ag-qid',
      alternatives: [],
      numberChoose: 1,
      autoPoints: 3,
    });
    const initialState = makeState({
      zones: [makeZone('z1', [altGroup])],
    });
    const reducer = createEditorReducer(initialState);

    const alt1 = makeAlternative('a1', { id: 'alt-qid-1' });
    let state = reducer(initialState, {
      type: 'ADD_ALTERNATIVE',
      altGroupTrackingId: 'ag1',
      alternative: alt1,
      questionData: MOCK_QUESTION_DATA,
    });
    expect(state.zones[0].questions[0].alternatives).toHaveLength(1);
    expect(state.questionMetadata['alt-qid-1']).toBe(MOCK_QUESTION_DATA);

    const alt2 = makeAlternative('a2', { id: 'alt-qid-2' });
    state = reducer(state, {
      type: 'ADD_ALTERNATIVE',
      altGroupTrackingId: 'ag1',
      alternative: alt2,
    });
    expect(state.zones[0].questions[0].alternatives).toHaveLength(2);

    state = reducer(state, {
      type: 'UPDATE_QUESTION',
      questionTrackingId: 'ag1',
      question: { autoPoints: 7 },
      alternativeTrackingId: 'a1',
    });
    expect(state.zones[0].questions[0].alternatives![0].autoPoints).toBe(7);

    state = reducer(state, {
      type: 'DELETE_QUESTION',
      questionTrackingId: 'ag1',
      questionId: 'alt-qid-1',
      alternativeTrackingId: 'a1',
    });
    expect(state.zones[0].questions[0].alternatives).toHaveLength(1);
    expect(state.questionMetadata['alt-qid-1']).toBeUndefined();

    state = reducer(state, {
      type: 'DELETE_QUESTION',
      questionTrackingId: 'ag1',
      questionId: 'ag-qid',
    });
    expect(state.zones[0].questions).toHaveLength(0);
    expect(state.questionMetadata['ag-qid']).toBeUndefined();
    expect(state.questionMetadata['alt-qid-2']).toBeUndefined();
  });

  it('cross-zone reordering and zone deletion with metadata cleanup', () => {
    const q1 = makeQuestion('q1', { id: 'qid-1' });
    const q2 = makeQuestion('q2', { id: 'qid-2' });
    const q3 = makeQuestion('q3', { id: 'qid-3' });
    const altGroup = makeQuestion('ag1', {
      id: 'ag-qid',
      alternatives: [makeAlternative('a1', { id: 'alt-qid-1' })],
    });
    const initialState = makeState({
      zones: [makeZone('z1', [q1, q2]), makeZone('z2', [q3, altGroup])],
      questionMetadata: {
        'qid-1': MOCK_QUESTION_DATA,
        'qid-2': MOCK_QUESTION_DATA,
        'qid-3': MOCK_QUESTION_DATA,
        'ag-qid': MOCK_QUESTION_DATA,
        'alt-qid-1': MOCK_QUESTION_DATA,
      },
    });
    const reducer = createEditorReducer(initialState);

    let state = reducer(initialState, {
      type: 'REORDER_QUESTION',
      questionTrackingId: 'q1',
      toZoneTrackingId: 'z2',
      beforeQuestionTrackingId: 'q3',
    });
    expect(state.zones[0].questions.map((q) => q.trackingId)).toEqual([tid('q2')]);
    expect(state.zones[1].questions.map((q) => q.trackingId)).toEqual([
      tid('q1'),
      tid('q3'),
      tid('ag1'),
    ]);

    state = reducer(state, {
      type: 'REORDER_QUESTION',
      questionTrackingId: 'q1',
      toZoneTrackingId: 'z1',
      beforeQuestionTrackingId: null,
    });
    expect(state.zones[0].questions.map((q) => q.trackingId)).toEqual([tid('q2'), tid('q1')]);

    state = reducer(state, {
      type: 'DELETE_ZONE',
      zoneTrackingId: 'z2',
    });
    expect(state.zones).toHaveLength(1);
    expect(state.questionMetadata['qid-3']).toBeUndefined();
    expect(state.questionMetadata['ag-qid']).toBeUndefined();
    expect(state.questionMetadata['alt-qid-1']).toBeUndefined();
    expect(state.questionMetadata['qid-1']).toBe(MOCK_QUESTION_DATA);
    expect(state.questionMetadata['qid-2']).toBe(MOCK_QUESTION_DATA);
  });

  it('extract alternative to question and merge back into alt group', () => {
    const alt1 = makeAlternative('a1', { id: 'alt-qid-1', autoPoints: 5 });
    const alt2 = makeAlternative('a2', { id: 'alt-qid-2' });
    const altGroup = makeQuestion('ag1', {
      id: 'ag-qid',
      alternatives: [alt1, alt2],
      numberChoose: 1,
      autoPoints: 3,
      triesPerVariant: 2,
    });
    const standaloneQ = makeQuestion('q1', { id: 'qid-1' });
    const initialState = makeState({
      zones: [makeZone('z1', [altGroup, standaloneQ])],
    });
    const reducer = createEditorReducer(initialState);

    let state = reducer(initialState, {
      type: 'EXTRACT_ALTERNATIVE_TO_QUESTION',
      alternativeTrackingId: 'a1',
      toZoneTrackingId: 'z1',
      beforeQuestionTrackingId: 'q1',
    });

    expect(state.zones[0].questions[0].alternatives).toHaveLength(1);
    expect(state.zones[0].questions[0].alternatives![0].trackingId).toEqual(tid('a2'));

    const extracted = state.zones[0].questions[1];
    expect(extracted.trackingId).toEqual(tid('a1'));
    expect(extracted.id).toBe('alt-qid-1');
    expect(extracted.autoPoints).toBe(5);
    expect(extracted.triesPerVariant).toBeUndefined();

    expect(state.zones[0].questions[2].trackingId).toEqual(tid('q1'));

    state = reducer(state, {
      type: 'MERGE_QUESTION_INTO_ALT_GROUP',
      questionTrackingId: 'a1',
      toAltGroupTrackingId: 'ag1',
      beforeAlternativeTrackingId: 'a2',
    });

    expect(state.zones[0].questions[0].alternatives).toHaveLength(2);
    expect(state.zones[0].questions[0].alternatives![0].trackingId).toEqual(tid('a1'));
    expect(state.zones[0].questions[0].alternatives![1].trackingId).toEqual(tid('a2'));

    expect(state.zones[0].questions).toHaveLength(2);
  });

  it('REMOVE_QUESTION_BY_QID: standalone, alternative, and nonexistent', () => {
    const alt = makeAlternative('a1', { id: 'alt-qid' });
    const altGroup = makeQuestion('ag1', {
      id: 'ag-qid',
      alternatives: [alt],
    });
    const standalone = makeQuestion('q1', { id: 'standalone-qid' });
    const initialState = makeState({
      zones: [makeZone('z1', [standalone, altGroup])],
      questionMetadata: {
        'standalone-qid': MOCK_QUESTION_DATA,
        'alt-qid': MOCK_QUESTION_DATA,
        'ag-qid': MOCK_QUESTION_DATA,
      },
    });
    const reducer = createEditorReducer(initialState);

    let state = reducer(initialState, {
      type: 'REMOVE_QUESTION_BY_QID',
      qid: 'standalone-qid',
    });
    expect(state.zones[0].questions).toHaveLength(1);
    expect(state.questionMetadata['standalone-qid']).toBeUndefined();

    state = reducer(state, {
      type: 'REMOVE_QUESTION_BY_QID',
      qid: 'alt-qid',
    });
    expect(state.zones[0].questions[0].alternatives).toHaveLength(0);
    expect(state.questionMetadata['alt-qid']).toBeUndefined();

    const stateBeforeNoop = state;
    state = reducer(state, {
      type: 'REMOVE_QUESTION_BY_QID',
      qid: 'does-not-exist',
    });
    expect(state).toBe(stateBeforeNoop);
  });

  it('collapse state: toggle, collapse all, expand all', () => {
    const altGroup1 = makeQuestion('ag1', {
      alternatives: [makeAlternative('a1')],
    });
    const altGroup2 = makeQuestion('ag2', {
      alternatives: [makeAlternative('a2')],
    });
    const standalone = makeQuestion('q1');
    const initialState = makeState({
      zones: [makeZone('z1', [altGroup1, standalone, altGroup2])],
    });
    const reducer = createEditorReducer(initialState);

    let state = reducer(initialState, {
      type: 'TOGGLE_GROUP_COLLAPSE',
      trackingId: 'ag1',
    });
    expect(state.collapsedGroups.has('ag1')).toBe(true);
    expect(state.collapsedGroups.size).toBe(1);

    state = reducer(state, {
      type: 'TOGGLE_GROUP_COLLAPSE',
      trackingId: 'ag1',
    });
    expect(state.collapsedGroups.has('ag1')).toBe(false);
    expect(state.collapsedGroups.size).toBe(0);

    state = reducer(state, { type: 'COLLAPSE_ALL_GROUPS' });
    expect(state.collapsedGroups.size).toBe(2);
    expect(state.collapsedGroups.has('ag1')).toBe(true);
    expect(state.collapsedGroups.has('ag2')).toBe(true);
    expect(state.collapsedGroups.has('q1')).toBe(false);

    state = reducer(state, { type: 'EXPAND_ALL_GROUPS' });
    expect(state.collapsedGroups.size).toBe(0);
  });
});
