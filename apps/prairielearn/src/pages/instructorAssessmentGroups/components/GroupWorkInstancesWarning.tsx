import { Alert } from 'react-bootstrap';

export function GroupWorkInstancesWarning({
  action,
  assessmentStudentsUrl,
  className,
}: {
  action: 'enabling' | 'disabling';
  assessmentStudentsUrl: string;
  className?: string;
}) {
  const subject = action === 'enabling' ? 'Some students' : 'Some groups';
  const instanceKind = action === 'enabling' ? 'individual' : 'group';
  return (
    <Alert variant="warning" className={className}>
      {subject} have already started this assessment. Delete all {instanceKind} assessment instances
      on the <Alert.Link href={assessmentStudentsUrl}>Students tab</Alert.Link> before {action}{' '}
      group work.
    </Alert>
  );
}
