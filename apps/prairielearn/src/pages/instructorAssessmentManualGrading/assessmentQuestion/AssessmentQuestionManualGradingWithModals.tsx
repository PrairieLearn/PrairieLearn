import { useState } from 'preact/compat';

import { GroupInfoModal } from './GroupInfoModal.js';
import AssessmentQuestionManualGrading, {
  type AssessmentQuestionManualGradingWrapperProps,
} from './assessmentQuestionTable.js';

type AssessmentQuestionManualGradingWithModalsProps = Omit<
  AssessmentQuestionManualGradingWrapperProps,
  'onShowGroupSelectedModal' | 'onShowGroupAllModal' | 'onShowGroupUngroupedModal'
>;

export function AssessmentQuestionManualGradingWithModals(
  props: AssessmentQuestionManualGradingWithModalsProps,
) {
  const [showSelectedModal, setShowSelectedModal] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);
  const [showUngroupedModal, setShowUngroupedModal] = useState(false);
  const [selectedIdsForGrouping, setSelectedIdsForGrouping] = useState<string[]>([]);

  const handleShowSelectedModal = (ids: string[]) => {
    setSelectedIdsForGrouping(ids);
    setShowSelectedModal(true);
  };

  return (
    <>
      <AssessmentQuestionManualGrading
        {...props}
        onShowGroupSelectedModal={handleShowSelectedModal}
        onShowGroupAllModal={() => setShowAllModal(true)}
        onShowGroupUngroupedModal={() => setShowUngroupedModal(true)}
      />

      <GroupInfoModal
        modalFor="selected"
        numOpenInstances={props.numOpenInstances}
        csrfToken={props.csrfToken}
        show={showSelectedModal}
        selectedIds={selectedIdsForGrouping}
        onHide={() => setShowSelectedModal(false)}
      />

      <GroupInfoModal
        modalFor="all"
        numOpenInstances={props.numOpenInstances}
        csrfToken={props.csrfToken}
        show={showAllModal}
        onHide={() => setShowAllModal(false)}
      />

      <GroupInfoModal
        modalFor="ungrouped"
        numOpenInstances={props.numOpenInstances}
        csrfToken={props.csrfToken}
        show={showUngroupedModal}
        onHide={() => setShowUngroupedModal(false)}
      />
    </>
  );
}

AssessmentQuestionManualGradingWithModals.displayName = 'AssessmentQuestionManualGradingWithModals';
