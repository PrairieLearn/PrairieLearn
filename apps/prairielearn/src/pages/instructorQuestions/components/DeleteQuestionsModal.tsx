import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Alert, Button, Modal } from 'react-bootstrap';

import type { SafeQuestionsPageData } from '../../../components/QuestionsTable.shared.js';
import { getAppError } from '../../../lib/client/errors.js';
import { useTRPC } from '../../../trpc/course/context.js';
import type { QuestionsError } from '../../../trpc/course/questions.js';

import { BulkQuestionErrorAlert } from './BulkQuestionErrorAlert.js';
import {
  type QuestionCourseInstanceMembership,
  SelectedQuestionList,
} from './SelectedQuestionList.js';
import { useInvalidateQuestionsList } from './useInvalidateQuestionsList.js';

interface PreviewZone {
  assessmentId: string;
  assessmentLabel: string;
  assessmentColor: string;
  assessmentSetAbbreviation: string;
  assessmentSetName: string;
  assessmentNumber: string;
  courseInstanceId: string;
  courseInstanceShortName: string;
  affectedQids: string[];
  wouldBeEmpty: boolean;
}

interface PerCourseInstance {
  courseInstanceId: string;
  courseInstanceShortName: string;
  assessments: Map<
    string,
    {
      assessmentId: string;
      assessmentLabel: string;
      assessmentColor: string;
      assessmentSetAbbreviation: string;
      assessmentSetName: string;
      assessmentNumber: string;
      wouldEmptyAnyZone: boolean;
    }
  >;
}

function buildMembershipsByQid(
  zones: PreviewZone[],
): Map<string, QuestionCourseInstanceMembership[]> {
  const byQid = new Map<string, Map<string, PerCourseInstance>>();
  for (const zone of zones) {
    for (const qid of zone.affectedQids) {
      let perCi = byQid.get(qid);
      if (!perCi) {
        perCi = new Map();
        byQid.set(qid, perCi);
      }
      let ci = perCi.get(zone.courseInstanceId);
      if (!ci) {
        ci = {
          courseInstanceId: zone.courseInstanceId,
          courseInstanceShortName: zone.courseInstanceShortName,
          assessments: new Map(),
        };
        perCi.set(zone.courseInstanceId, ci);
      }
      const existing = ci.assessments.get(zone.assessmentId);
      if (existing) {
        existing.wouldEmptyAnyZone = existing.wouldEmptyAnyZone || zone.wouldBeEmpty;
      } else {
        ci.assessments.set(zone.assessmentId, {
          assessmentId: zone.assessmentId,
          assessmentLabel: zone.assessmentLabel,
          assessmentColor: zone.assessmentColor,
          assessmentSetAbbreviation: zone.assessmentSetAbbreviation,
          assessmentSetName: zone.assessmentSetName,
          assessmentNumber: zone.assessmentNumber,
          wouldEmptyAnyZone: zone.wouldBeEmpty,
        });
      }
    }
  }
  const result = new Map<string, QuestionCourseInstanceMembership[]>();
  for (const [qid, perCi] of byQid) {
    const ciList: QuestionCourseInstanceMembership[] = [...perCi.values()]
      .sort((a, b) =>
        a.courseInstanceShortName.localeCompare(b.courseInstanceShortName, undefined, {
          numeric: true,
        }),
      )
      .map((ci) => ({
        courseInstanceId: ci.courseInstanceId,
        courseInstanceShortName: ci.courseInstanceShortName,
        assessments: [...ci.assessments.values()]
          .sort((a, b) =>
            a.assessmentLabel.localeCompare(b.assessmentLabel, undefined, { numeric: true }),
          )
          .map((a) => ({
            assessment_id: a.assessmentId,
            label: a.assessmentLabel,
            color: a.assessmentColor,
            assessment_set_abbreviation: a.assessmentSetAbbreviation,
            assessment_set_name: a.assessmentSetName,
            assessment_set_color: a.assessmentColor,
            assessment_number: a.assessmentNumber,
          })),
        emptiedAssessmentIds: new Set(
          [...ci.assessments.values()]
            .filter((a) => a.wouldEmptyAnyZone)
            .map((a) => a.assessmentId),
        ),
      }));
    result.set(qid, ciList);
  }
  return result;
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
  const zones = previewQuery.data?.zones ?? [];
  const membershipsByQid = useMemo(() => buildMembershipsByQid(zones), [zones]);
  const affectedAssessmentCount = useMemo(
    () => new Set(zones.map((z) => z.assessmentId)).size,
    [zones],
  );
  const emptiedZoneCount = zones.filter((zone) => zone.wouldBeEmpty).length;

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
        {affectedAssessmentCount > 0 && (
          <Alert variant="info" className="mb-3">
            <strong>{affectedAssessmentCount}</strong>{' '}
            {affectedAssessmentCount === 1 ? 'assessment' : 'assessments'} will be affected
            {emptiedZoneCount > 0 && (
              <>
                , and <strong>{emptiedZoneCount}</strong>{' '}
                {emptiedZoneCount === 1 ? 'assessment zone' : 'assessment zones'} will be removed as
                they contain no questions
              </>
            )}
            .
          </Alert>
        )}
        <SelectedQuestionList questions={selectedQuestions} membershipsByQid={membershipsByQid} />
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
