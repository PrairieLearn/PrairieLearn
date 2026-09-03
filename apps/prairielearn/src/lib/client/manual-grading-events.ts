const INSTANCE_QUESTION_GRADING_PANEL_UPDATE_EVENT = 'instance-question-grading-panel-update';

export interface InstanceQuestionGradingPanelUpdate<T> {
  gradingPanelProps: T;
  preserveValues: boolean;
}

interface DocumentWithPendingGradingPanelUpdate extends Document {
  prairieLearnPendingGradingPanelUpdate?: InstanceQuestionGradingPanelUpdate<unknown>;
}

/**
 * Sends data between the independently hydrated rubric/AI controls and grading panel.
 *
 * A pending value closes a small hydration race: an AI job can complete before the grading
 * panel has subscribed to the event. The active subscriber consumes the value synchronously, so
 * it is only retained when no grading panel is ready yet.
 */
export function dispatchInstanceQuestionGradingPanelUpdate<T>(
  detail: InstanceQuestionGradingPanelUpdate<T>,
): void {
  const target = document as DocumentWithPendingGradingPanelUpdate;
  target.prairieLearnPendingGradingPanelUpdate = detail;
  document.dispatchEvent(new CustomEvent(INSTANCE_QUESTION_GRADING_PANEL_UPDATE_EVENT, { detail }));
}

export function subscribeToInstanceQuestionGradingPanelUpdates<T>(
  callback: (detail: InstanceQuestionGradingPanelUpdate<T>) => void,
): () => void {
  const target = document as DocumentWithPendingGradingPanelUpdate;
  const handleUpdate = (event: Event) => {
    delete target.prairieLearnPendingGradingPanelUpdate;
    callback((event as CustomEvent<InstanceQuestionGradingPanelUpdate<T>>).detail);
  };

  document.addEventListener(INSTANCE_QUESTION_GRADING_PANEL_UPDATE_EVENT, handleUpdate);
  const pendingUpdate = target.prairieLearnPendingGradingPanelUpdate;
  if (pendingUpdate) {
    delete target.prairieLearnPendingGradingPanelUpdate;
    callback(pendingUpdate as InstanceQuestionGradingPanelUpdate<T>);
  }

  return () =>
    document.removeEventListener(INSTANCE_QUESTION_GRADING_PANEL_UPDATE_EVENT, handleUpdate);
}
