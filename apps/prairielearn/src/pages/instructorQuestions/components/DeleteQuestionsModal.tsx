import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Button, Modal } from 'react-bootstrap';

import type { SafeQuestionsPageData } from '../../../components/QuestionsTable.shared.js';
import { getAppError } from '../../../lib/client/errors.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

import { BulkQuestionErrorAlert } from './BulkQuestionErrorAlert.js';
import { type QuestionZoneMembership, SelectedQuestionList } from './SelectedQuestionList.js';
import { useInvalidateQuestionsList } from './useInvalidateQuestionsList.js';

interface PreviewZone {
  assessmentId: string;
  assessmentLabel: string;
  courseInstanceShortName: string;
  zoneIndex: number;
  zoneTitle: string | null;
  affectedQids: string[];
  wouldBeEmpty: boolean;
}

function buildZoneMembershipsByQid(
  zones: PreviewZone[],
): Map<string, QuestionZoneMembership[]> {
  const byQid = new Map<string, QuestionZoneMembership[]>();
  for (const zone of zones) {
    const membership: QuestionZoneMembership = {
      assessmentId: zone.assessmentId,
      assessmentLabel: zone.assessmentLabel,
      courseInstanceShortName: zone.courseInstanceShortName,
      zoneIndex: zone.zoneIndex,
      zoneTitle: zone.zoneTitle,
      wouldEmptyZone: zone.wouldBeEmpty,
    };
    for (const qid of zone.affectedQids) {
      const existing = byQid.get(qid);
      if (existing) {
        existing.push(membership);
      } else {
        byQid.set(qid, [membership]);
      }
    }
  }
  for (const memberships of byQid.values()) {
    memberships.sort((a, b) =>
      `${a.courseInstanceShortName}:${a.assessmentLabel}:${a.zoneIndex}`.localeCompare(
        `${b.courseInstanceShortName}:${b.assessmentLabel}:${b.zoneIndex}`,
        undefined,
        { numeric: true },
      ),
    );
  }
  return byQid;
}

export function DeleteQuestionsModal({
  show,
  onHide,
  selectedQuestions,
  questionIds,
  urlPrefix,
  clearSelection,
  onActionSuccess,
}: {
  show: boolean;
  onHide: () => void;
  selectedQuestions: SafeQuestionsPageData[];
  questionIds: string[];
  urlPrefix: string;
  clearSelection: () => void;
  onActionSuccess: (message: string) => void;
}) {
  const trpc = useTRPC();
  const invalidateQuestionsList = useInvalidateQuestionsList();

  const previewQuery = useQuery({
    ...trpc.questions.previewDeletion.queryOptions(
      { questionIds },
      { enabled: show && questionIds.length > 0 },
    ),
  });
  const zoneMembershipsByQid = useMemo(
    () => buildZoneMembershipsByQid(previewQuery.data?.zones ?? []),
    [previewQuery.data],
  );
  const emptiedZoneCount = previewQuery.data?.zones.filter((zone) => zone.wouldBeEmpty).length ?? 0;

  const mutation = useMutation({
    ...trpc.questions.deleteQuestions.mutationOptions(),
    onSuccess: async ({ deletedCount }) => {
      await invalidateQuestionsList();
      onActionSuccess(`Deleted ${deletedCount} ${deletedCount === 1 ? 'question' : 'questions'}.`);
      clearSelection();
      onHide();
    },
  });
  const appError = getAppError<QuestionsError['DeleteQuestions']>(mutation.error);
  const isPlural = selectedQuestions.length !== 1;

  return (
    <Modal
      show={show}
      size="lg"
      aria-labelledby="bulk-delete-questions-modal-title"
      onHide={onHide}
      onExited={() => mutation.reset()}
    >
      <Modal.Header closeButton>
        <Modal.Title id="bulk-delete-questions-modal-title">Delete selected questions</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p>
          Are you sure you want to delete{' '}
          <strong>
            {selectedQuestions.length} {isPlural ? 'questions' : 'question'}
          </strong>
          ?
        </p>
        {emptiedZoneCount > 0 && (
          <p className="text-warning-emphasis mb-2">
            <i className="bi bi-exclamation-triangle-fill me-1" aria-hidden="true" />
            {emptiedZoneCount === 1
              ? 'One assessment zone will be removed because it would contain no questions.'
              : `${emptiedZoneCount} assessment zones will be removed because they would contain no questions.`}
          </p>
        )}
        <SelectedQuestionList
          questions={selectedQuestions}
          zoneMembershipsByQid={zoneMembershipsByQid}
        />
        <BulkQuestionErrorAlert error={appError} urlPrefix={urlPrefix} />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Cancel
        </Button>
        <Button
          variant="danger"
          disabled={mutation.isPending}
          onClick={() => mutation.mutate({ questionIds })}
        >
          Delete {selectedQuestions.length}{' '}
          {selectedQuestions.length === 1 ? 'question' : 'questions'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
