import { useQuery } from '@tanstack/react-query';
import clsx from 'clsx';
import { Button, Modal, Spinner } from 'react-bootstrap';

import { useTRPC } from '../../../trpc/course/context.js';

const MAX_COURSE_INSTANCE_TAGS = 12;

interface AccessItem {
  label: string;
  icon: string;
  description: string;
  /** Course instances the item is limited to; omitted when it applies everywhere. */
  courseInstances?: string[];
}

/**
 * Student data access is granted per course instance, separately from the course role. An item
 * the user holds in every course instance needs no qualifier, one they hold in some lists them,
 * and one they hold in none is something the agent cannot do.
 */
function studentDataItem(
  item: Omit<AccessItem, 'courseInstances'> & { requirement: string },
  courseInstances: { name: string; allowed: boolean }[],
): { allowed: boolean; item: AccessItem } {
  const allowed = courseInstances.filter((courseInstance) => courseInstance.allowed);
  const { requirement, ...access } = item;
  if (courseInstances.length > 0 && allowed.length === 0) {
    return { allowed: false, item: { ...access, description: requirement } };
  }
  if (allowed.length === courseInstances.length) return { allowed: true, item: access };
  return {
    allowed: true,
    item: { ...access, courseInstances: allowed.map((courseInstance) => courseInstance.name) },
  };
}

function AccessRow({ label, icon, description, courseInstances }: AccessItem) {
  const shown = courseInstances?.slice(0, MAX_COURSE_INSTANCE_TAGS);
  return (
    <li className="d-flex align-items-start gap-2 py-2">
      <i className={clsx('bi text-body-secondary', icon)} aria-hidden="true" />
      <div>
        <div className="fw-semibold">{label}</div>
        <div className="small text-body-secondary">{description}</div>
        {courseInstances && shown && (
          <ul
            className="list-unstyled d-flex flex-wrap gap-1 mt-1 mb-0"
            aria-label={`Course instances where the course agent can ${label.toLowerCase()}`}
          >
            {shown.map((name) => (
              <li key={name} className="badge border text-body fw-normal">
                {name}
              </li>
            ))}
            {courseInstances.length > shown.length && (
              <li className="badge border text-body fw-normal">
                +{courseInstances.length - shown.length} more
              </li>
            )}
          </ul>
        )}
      </div>
    </li>
  );
}

/** Shown before "Auto-approve" turns on, so the instructor sees what they are agreeing to. */
export function AutoApproveModal({
  show,
  onHide,
  onConfirm,
}: {
  show: boolean;
  onHide: () => void;
  onConfirm: () => void;
}) {
  const trpc = useTRPC();
  const access = useQuery({
    ...trpc.courseAgent.studentDataAccess.queryOptions(),
    enabled: show,
  });
  const studentData = access.data
    ? [
        studentDataItem(
          {
            label: 'Read student data',
            icon: 'bi-table',
            description: 'Scores and submitted answers. Names and emails are left out.',
            requirement: 'You must be a student data viewer in a course instance.',
          },
          access.data.map(({ name, canView }) => ({ name, allowed: canView })),
        ),
        studentDataItem(
          {
            label: 'Change student data',
            icon: 'bi-lightning',
            description: 'Add a student or change a score.',
            requirement: 'You must be a student data editor in a course instance.',
          },
          access.data.map(({ name, canEdit }) => ({ name, allowed: canEdit })),
        ),
      ]
    : [];
  const can: AccessItem[] = [
    {
      label: 'Edit course content',
      icon: 'bi-pencil-square',
      description: 'Write a question, change a due date, or close an issue.',
    },
    ...studentData.filter(({ allowed }) => allowed).map(({ item }) => item),
  ];
  const cannot = studentData.filter(({ allowed }) => !allowed).map(({ item }) => item);
  return (
    <Modal show={show} aria-labelledby="course-agent-auto-approve-title" onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title id="course-agent-auto-approve-title">Turn on auto-approve?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="mb-2">
          The agent will be able to read and edit anything you can, without asking for approval. For
          example:
        </p>
        <ul className="list-unstyled mb-0">
          {can.map((item) => (
            <AccessRow key={item.label} {...item} />
          ))}
        </ul>
        {access.isPending && (
          <Spinner animation="border" size="sm" role="status" className="mt-2">
            <span className="visually-hidden">Loading your student data access</span>
          </Spinner>
        )}
        {access.isError && (
          <p className="small text-body-secondary mt-2 mb-0">
            Could not load your student data access. The agent can only reach student data that you
            can.
          </p>
        )}
        {cannot.length > 0 && (
          <>
            <h3 className="small text-body-secondary border-top pt-3 mt-2 mb-0">The agent can't</h3>
            <ul className="list-unstyled mb-0">
              {cannot.map((item) => (
                <AccessRow key={item.label} {...item} />
              ))}
            </ul>
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Not now
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          Turn on
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
