import { Alert } from 'react-bootstrap';

import { getAssessmentStudentsUrl } from '../../../lib/client/url.js';

export function GroupWorkInstancesWarning({
  action,
  courseInstanceId,
  assessmentId,
  className,
}: {
  action: 'enabling' | 'disabling';
  courseInstanceId: string;
  assessmentId: string;
  className?: string;
}) {
  const subject = action === 'enabling' ? 'Some students' : 'Some groups';
  const instanceKind = action === 'enabling' ? 'individual' : 'group';
  const assessmentStudentsUrl = getAssessmentStudentsUrl({ courseInstanceId, assessmentId });
  return (
    <Alert variant="warning" className={className}>
      {subject} have already started this assessment. Delete all {instanceKind} assessment instances
      on the <Alert.Link href={assessmentStudentsUrl}>Students tab</Alert.Link> before {action}{' '}
      group work.
    </Alert>
  );
}
