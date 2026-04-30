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
  return (
    <Alert variant="warning" className={className}>
      Some students have already started this assessment. Remove their progress from the{' '}
      <Alert.Link href={assessmentStudentsUrl}>Students tab</Alert.Link> before {action} group work.
    </Alert>
  );
}
