import type {
  GradingFormState,
  InstanceQuestionGradingPanelProps,
} from './InstanceQuestionGradingPanel.types.js';

export function roundPoints(points: number): number {
  return Math.round(points * 100) / 100;
}

export function pointsValue(points: number): string {
  return `${roundPoints(points) || 0}`;
}

export function percentageValue(points: number, maxPoints: number): string {
  return pointsValue((points * 100) / maxPoints);
}

export function createFormState(
  data: InstanceQuestionGradingPanelProps,
  current?: GradingFormState,
): GradingFormState {
  const maxRubricPoints =
    data.assessmentQuestion.maxManualPoints || data.assessmentQuestion.maxPoints;
  const rubricItemIds = new Set(data.rubricData?.items.map((item) => item.id));
  const selectedRubricItemIds = current
    ? new Set([...current.selectedRubricItemIds].filter((id) => rubricItemIds.has(id)))
    : new Set(
        Object.entries(data.submission.rubricGrading?.rubricItems ?? {})
          .filter(([, item]) => item.score)
          .map(([id]) => id),
      );
  const adjustmentPoints = current
    ? current.adjustmentPoints
    : data.submission.rubricGrading?.adjustPoints
      ? pointsValue(data.submission.rubricGrading.adjustPoints)
      : '';
  const adjustmentPercentage = current
    ? current.adjustmentPercentage
    : adjustmentPoints
      ? percentageValue(Number(adjustmentPoints), maxRubricPoints)
      : '';

  return syncRubricScore(data, {
    adjustmentPercentage,
    adjustmentPoints,
    autoEditing: current?.autoEditing ?? false,
    autoPercentage:
      current?.autoPercentage ??
      percentageValue(
        data.instanceQuestion.autoPoints,
        data.assessmentQuestion.maxAutoPoints || data.assessmentQuestion.maxPoints,
      ),
    autoPoints: current?.autoPoints ?? pointsValue(data.instanceQuestion.autoPoints),
    closeIssueIds: current?.closeIssueIds ?? new Set(),
    feedback: current?.feedback ?? data.submission.feedback,
    manualPercentage:
      current?.manualPercentage ??
      percentageValue(
        data.instanceQuestion.manualPoints,
        data.assessmentQuestion.maxManualPoints || data.assessmentQuestion.maxPoints,
      ),
    manualPoints: current?.manualPoints ?? pointsValue(data.instanceQuestion.manualPoints),
    selectedGroupId: current?.selectedGroupId ?? data.selectedInstanceQuestionGroupId,
    selectedRubricItemIds,
    showAdjustment: current?.showAdjustment ?? Boolean(data.submission.rubricGrading?.adjustPoints),
    showSubmissionsAssignedToMeOnly:
      current?.showSubmissionsAssignedToMeOnly ?? data.showSubmissionsAssignedToMeOnly,
    skipGradedSubmissions: current?.skipGradedSubmissions ?? data.skipGradedSubmissions,
  });
}

export function syncRubricScore(
  data: InstanceQuestionGradingPanelProps,
  state: GradingFormState,
): GradingFormState {
  if (!data.rubricData) return state;

  const itemPoints = data.rubricData.items
    .filter((item) => state.selectedRubricItemIds.has(item.id))
    .reduce((sum, item) => sum + item.points, data.rubricData.startingPoints);
  const maxRubricPoints =
    (data.rubricData.replaceAutoPoints
      ? data.assessmentQuestion.maxPoints
      : data.assessmentQuestion.maxManualPoints) + data.rubricData.maxExtraPoints;
  const rubricPoints =
    Math.min(Math.max(roundPoints(itemPoints), data.rubricData.minPoints), maxRubricPoints) +
    Number(state.adjustmentPoints || 0);
  const manualPoints =
    rubricPoints - (data.rubricData.replaceAutoPoints ? Number(state.autoPoints) : 0);

  return {
    ...state,
    manualPercentage: percentageValue(
      manualPoints,
      data.assessmentQuestion.maxManualPoints || data.assessmentQuestion.maxPoints,
    ),
    manualPoints: pointsValue(manualPoints),
  };
}
