import { describe, expect, it } from 'vitest';

import type {
  EditorState,
  QuestionAlternativeForm,
  StandaloneQuestionBlockForm,
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
    collapsedPools: new Set<string>(),
    collapsedZones: new Set<string>(),
    dismissedBanners: new Set<string>(),
    selectedItem: null,
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
      question: q as StandaloneQuestionBlockForm,
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

  it('alternative pool lifecycle: add pool, add/update/delete alternatives', () => {
    const altPool = makeQuestion('ag1', {
      alternatives: [],
      numberChoose: 1,
      autoPoints: 3,
    });
    const initialState = makeState({
      zones: [makeZone('z1', [altPool])],
    });
    const reducer = createEditorReducer(initialState);

    const alt1 = makeAlternative('a1', { id: 'alt-qid-1' });
    let state = reducer(initialState, {
      type: 'ADD_ALTERNATIVE',
      altPoolTrackingId: 'ag1',
      alternative: alt1,
      questionData: MOCK_QUESTION_DATA,
    });
    expect(state.zones[0].questions[0].alternatives).toHaveLength(1);
    expect(state.questionMetadata['alt-qid-1']).toBe(MOCK_QUESTION_DATA);

    const alt2 = makeAlternative('a2', { id: 'alt-qid-2' });
    state = reducer(state, {
      type: 'ADD_ALTERNATIVE',
      altPoolTrackingId: 'ag1',
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
      questionId: '',
    });
    expect(state.zones[0].questions).toHaveLength(0);
    expect(state.questionMetadata['alt-qid-2']).toBeUndefined();
  });

  it('cross-zone reordering and zone deletion with metadata cleanup', () => {
    const q1 = makeQuestion('q1', { id: 'qid-1' });
    const q2 = makeQuestion('q2', { id: 'qid-2' });
    const q3 = makeQuestion('q3', { id: 'qid-3' });
    const altPool = makeQuestion('ag1', {
      alternatives: [makeAlternative('a1', { id: 'alt-qid-1' })],
    });
    const initialState = makeState({
      zones: [makeZone('z1', [q1, q2]), makeZone('z2', [q3, altPool])],
      questionMetadata: {
        'qid-1': MOCK_QUESTION_DATA,
        'qid-2': MOCK_QUESTION_DATA,
        'qid-3': MOCK_QUESTION_DATA,
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
    expect(state.questionMetadata['alt-qid-1']).toBeUndefined();
    expect(state.questionMetadata['qid-1']).toBe(MOCK_QUESTION_DATA);
    expect(state.questionMetadata['qid-2']).toBe(MOCK_QUESTION_DATA);
  });

  it('extract alternative to question and merge back into alt pool', () => {
    const alt1 = makeAlternative('a1', { id: 'alt-qid-1', autoPoints: 5 });
    const alt2 = makeAlternative('a2', { id: 'alt-qid-2' });
    const altPool = makeQuestion('ag1', {
      alternatives: [alt1, alt2],
      numberChoose: 1,
      autoPoints: 3,
      triesPerVariant: 2,
    });
    const standaloneQ = makeQuestion('q1', { id: 'qid-1' });
    const initialState = makeState({
      zones: [makeZone('z1', [altPool, standaloneQ])],
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
    expect(extracted.triesPerVariant).toBe(2);

    expect(state.zones[0].questions[2].trackingId).toEqual(tid('q1'));

    state = reducer(state, {
      type: 'MERGE_QUESTION_INTO_ALT_POOL',
      questionTrackingId: 'a1',
      toAltPoolTrackingId: 'ag1',
      beforeAlternativeTrackingId: 'a2',
    });

    expect(state.zones[0].questions[0].alternatives).toHaveLength(2);
    expect(state.zones[0].questions[0].alternatives![0].trackingId).toEqual(tid('a1'));
    expect(state.zones[0].questions[0].alternatives![1].trackingId).toEqual(tid('a2'));

    expect(state.zones[0].questions).toHaveLength(2);
  });

  it('extract alternative inherits points from parent alt pool', () => {
    // alt1 has no own points — it inherits autoPoints from the pool
    const alt1 = makeAlternative('a1', { id: 'alt-qid-1' });
    // alt2 has its own autoPoints, which should be preserved
    const alt2 = makeAlternative('a2', { id: 'alt-qid-2', autoPoints: 7 });
    const altPool = makeQuestion('ag1', {
      alternatives: [alt1, alt2],
      numberChoose: 1,
      autoPoints: 3,
      manualPoints: 2,
    });
    const initialState = makeState({
      zones: [makeZone('z1', [altPool])],
    });
    const reducer = createEditorReducer(initialState);

    // Extract alt1 (inheriting points) to standalone
    let state = reducer(initialState, {
      type: 'EXTRACT_ALTERNATIVE_TO_QUESTION',
      alternativeTrackingId: 'a1',
      toZoneTrackingId: 'z1',
      beforeQuestionTrackingId: null,
    });

    const extracted1 = state.zones[0].questions[1];
    expect(extracted1.trackingId).toEqual(tid('a1'));
    // Should inherit autoPoints and manualPoints from the pool
    expect(extracted1.autoPoints).toBe(3);
    expect(extracted1.manualPoints).toBe(2);

    // Extract alt2 (own points) to standalone
    state = reducer(state, {
      type: 'EXTRACT_ALTERNATIVE_TO_QUESTION',
      alternativeTrackingId: 'a2',
      toZoneTrackingId: 'z1',
      beforeQuestionTrackingId: null,
    });

    const extracted2 = state.zones[0].questions[2];
    expect(extracted2.trackingId).toEqual(tid('a2'));
    // Should keep its own autoPoints, inherit manualPoints from pool
    expect(extracted2.autoPoints).toBe(7);
    expect(extracted2.manualPoints).toBe(2);
  });

  it('extract alternative inherits non-point fields from parent alt pool', () => {
    // alt has no own settings — inherits everything from the pool
    const alt = makeAlternative('a1', { id: 'alt-qid-1' });
    // alt2 has its own triesPerVariant override
    const alt2 = makeAlternative('a2', {
      id: 'alt-qid-2',
      triesPerVariant: 5,
      allowRealTimeGrading: true,
    });
    const altPool = makeQuestion('ag1', {
      alternatives: [alt, alt2],
      numberChoose: 1,
      autoPoints: 3,
      triesPerVariant: 2,
      allowRealTimeGrading: false,
      gradeRateMinutes: 10,
      forceMaxPoints: true,
      advanceScorePerc: 50,
    });
    const initialState = makeState({
      zones: [makeZone('z1', [altPool])],
    });
    const reducer = createEditorReducer(initialState);

    // Extract alt (inheriting all settings) to standalone
    let state = reducer(initialState, {
      type: 'EXTRACT_ALTERNATIVE_TO_QUESTION',
      alternativeTrackingId: 'a1',
      toZoneTrackingId: 'z1',
      beforeQuestionTrackingId: null,
    });

    const extracted = state.zones[0].questions[1];
    expect(extracted.triesPerVariant).toBe(2);
    expect(extracted.allowRealTimeGrading).toBe(false);
    expect(extracted.gradeRateMinutes).toBe(10);
    expect(extracted.forceMaxPoints).toBe(true);
    expect(extracted.advanceScorePerc).toBe(50);

    // Extract alt2 (has own overrides) to standalone
    state = reducer(state, {
      type: 'EXTRACT_ALTERNATIVE_TO_QUESTION',
      alternativeTrackingId: 'a2',
      toZoneTrackingId: 'z1',
      beforeQuestionTrackingId: null,
    });

    const extracted2 = state.zones[0].questions[2];
    // Should keep its own overrides
    expect(extracted2.triesPerVariant).toBe(5);
    expect(extracted2.allowRealTimeGrading).toBe(true);
    // Should inherit the rest from the pool
    expect(extracted2.gradeRateMinutes).toBe(10);
    expect(extracted2.forceMaxPoints).toBe(true);
    expect(extracted2.advanceScorePerc).toBe(50);
  });

  it('reorder alternative across pools then extract inherits from final pool', () => {
    // alt has no own points — inherits from whichever pool it's in
    const alt = makeAlternative('a1', { id: 'alt-qid-1' });
    const altPoolA = makeQuestion('agA', {
      alternatives: [alt],
      numberChoose: 1,
      autoPoints: 5,
    });
    const altPoolB = makeQuestion('agB', {
      alternatives: [makeAlternative('b1', { id: 'alt-qid-B1' })],
      numberChoose: 1,
      autoPoints: 10,
      manualPoints: 3,
    });
    const initialState = makeState({
      zones: [makeZone('z1', [altPoolA, altPoolB])],
    });
    const reducer = createEditorReducer(initialState);

    // Move alt from pool A to pool B
    let state = reducer(initialState, {
      type: 'REORDER_ALTERNATIVE',
      alternativeTrackingId: 'a1',
      toAltPoolTrackingId: 'agB',
      beforeAlternativeTrackingId: null,
    });

    expect(state.zones[0].questions[1].alternatives).toHaveLength(2);

    // Extract alt (now in pool B) to standalone
    state = reducer(state, {
      type: 'EXTRACT_ALTERNATIVE_TO_QUESTION',
      alternativeTrackingId: 'a1',
      toZoneTrackingId: 'z1',
      beforeQuestionTrackingId: null,
    });

    const extracted = state.zones[0].questions[2];
    expect(extracted.trackingId).toEqual(tid('a1'));
    // Should inherit from pool B (current parent), not pool A (original parent)
    expect(extracted.autoPoints).toBe(10);
    expect(extracted.manualPoints).toBe(3);
  });

  it('REMOVE_QUESTION_BY_QID: standalone, alternative, and nonexistent', () => {
    const alt = makeAlternative('a1', { id: 'alt-qid' });
    const altPool = makeQuestion('ag1', {
      alternatives: [alt],
    });
    const standalone = makeQuestion('q1', { id: 'standalone-qid' });
    const initialState = makeState({
      zones: [makeZone('z1', [standalone, altPool])],
      questionMetadata: {
        'standalone-qid': MOCK_QUESTION_DATA,
        'alt-qid': MOCK_QUESTION_DATA,
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
    const altPool1 = makeQuestion('ag1', {
      alternatives: [makeAlternative('a1')],
    });
    const altPool2 = makeQuestion('ag2', {
      alternatives: [makeAlternative('a2')],
    });
    const standalone = makeQuestion('q1');
    const initialState = makeState({
      zones: [makeZone('z1', [altPool1, standalone, altPool2])],
    });
    const reducer = createEditorReducer(initialState);

    let state = reducer(initialState, {
      type: 'TOGGLE_POOL_COLLAPSE',
      trackingId: 'ag1',
    });
    expect(state.collapsedPools.has('ag1')).toBe(true);
    expect(state.collapsedPools.size).toBe(1);

    state = reducer(state, {
      type: 'TOGGLE_POOL_COLLAPSE',
      trackingId: 'ag1',
    });
    expect(state.collapsedPools.has('ag1')).toBe(false);
    expect(state.collapsedPools.size).toBe(0);

    state = reducer(state, { type: 'COLLAPSE_ALL_POOLS' });
    expect(state.collapsedPools.size).toBe(2);
    expect(state.collapsedPools.has('ag1')).toBe(true);
    expect(state.collapsedPools.has('ag2')).toBe(true);
    expect(state.collapsedPools.has('q1')).toBe(false);

    state = reducer(state, { type: 'EXPAND_ALL_POOLS' });
    expect(state.collapsedPools.size).toBe(0);
  });

  it('QUESTION_PICKED removes duplicate when QID already exists in assessment', () => {
    const existingQ = makeQuestion('q-existing', { id: 'shared-qid', autoPoints: 99 });
    const initialState = makeState({
      zones: [makeZone('z1', [existingQ]), makeZone('z2', [])],
      questionMetadata: {
        'shared-qid': { question: { grading_method: 'Internal' } } as any,
      },
      // Picker is open in z2
      selectedItem: { type: 'picker', zoneTrackingId: tid('z2') as string },
    });
    const reducer = createEditorReducer(initialState);

    const newMetadata = { question: { grading_method: 'Internal' } } as any;
    const state = reducer(initialState, {
      type: 'QUESTION_PICKED',
      qid: 'shared-qid',
      metadata: newMetadata,
      expectedSelectedItem: initialState.selectedItem,
    });

    // Old entry removed from z1
    expect(state.zones[0].questions).toHaveLength(0);
    // New entry added to z2 with fresh defaults (not the old autoPoints: 99)
    expect(state.zones[1].questions).toHaveLength(1);
    expect(state.zones[1].questions[0].id).toBe('shared-qid');
    expect(state.zones[1].questions[0].autoPoints).toBe(1);
    // Metadata updated
    expect(state.questionMetadata['shared-qid']).toBe(newMetadata);
  });

  it('QUESTION_PICKED clears stale preferences when changing a question QID', () => {
    const standalone = makeQuestion('q1', {
      id: 'old-qid',
      preferences: { oldPref: 'stale' },
    });
    const altPool = makeQuestion('ag1', {
      alternatives: [
        makeAlternative('a1', {
          id: 'old-alt-qid',
          preferences: { oldAltPref: true },
        }),
      ],
    });
    const initialState = makeState({
      zones: [makeZone('z1', [standalone, altPool])],
      questionMetadata: {
        'old-qid': { question: { grading_method: 'Internal' } } as any,
        'old-alt-qid': { question: { grading_method: 'Internal' } } as any,
      },
      selectedItem: {
        type: 'picker',
        zoneTrackingId: 'z1',
        returnToSelection: { type: 'question', questionTrackingId: 'q1' },
      },
    });
    const reducer = createEditorReducer(initialState);

    const standaloneState = reducer(initialState, {
      type: 'QUESTION_PICKED',
      qid: 'new-qid',
      metadata: { question: { grading_method: 'Internal' } } as any,
      expectedSelectedItem: initialState.selectedItem,
    });

    expect(standaloneState.zones[0].questions[0].id).toBe('new-qid');
    expect(standaloneState.zones[0].questions[0].preferences).toBeUndefined();

    const alternativePicker = {
      type: 'picker' as const,
      zoneTrackingId: 'z1',
      returnToSelection: {
        type: 'alternative' as const,
        questionTrackingId: 'ag1',
        alternativeTrackingId: 'a1',
      },
    };
    const alternativeState = reducer(
      {
        ...standaloneState,
        selectedItem: alternativePicker,
      },
      {
        type: 'QUESTION_PICKED',
        qid: 'new-alt-qid',
        metadata: { question: { grading_method: 'Internal' } } as any,
        expectedSelectedItem: alternativePicker,
      },
    );

    expect(alternativeState.zones[0].questions[1].alternatives?.[0].id).toBe('new-alt-qid');
    expect(alternativeState.zones[0].questions[1].alternatives?.[0].preferences).toBeUndefined();
  });
});
