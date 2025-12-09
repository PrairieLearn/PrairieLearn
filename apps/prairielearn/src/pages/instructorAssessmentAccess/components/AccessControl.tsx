import { useMutation } from '@tanstack/react-query';
import { Alert } from 'react-bootstrap';

import type { PageContext } from '../../../lib/client/page-context.js';
import { getCourseInstanceEditErrorUrl } from '../../../lib/client/url.js';
import type { AccessControlJson } from '../../../schemas/accessControl.js';

import { AccessControlForm } from './AccessControlForm.js';

const sampleAccessControl: AccessControlJson[] = [
  {
    enabled: true,
    blockAccess: false,
    listBeforeRelease: true,

    dateControl: {
      enabled: true,
      releaseDate: '2025-03-14T00:01',
      dueDate: '2025-03-21T23:59',

      earlyDeadlines: [
        { date: '2025-03-17T23:59', credit: 120 },
        { date: '2025-03-20T23:59', credit: 110 },
      ],

      lateDeadlines: [
        { date: '2025-03-23T23:59', credit: 80 },
        { date: '2025-03-30T23:59', credit: 50 },
      ],

      afterLastDeadline: {
        allowSubmissions: true,
        credit: 30,
      },

      durationMinutes: 60,
      password: 'superSecret',
    },
    prairieTestControl: {
      enabled: true,
      exams: [
        { examUuid: '11e89892-3eff-4d7f-90a2-221372f14e5c' },
        { examUuid: '896c088c-7468-4045-965b-e8ae134086c2', readOnly: true },
      ],
    },

    afterComplete: {
      hideQuestions: true,
      showQuestionsAgainDate: '2025-03-25T23:59:00Z',
      hideQuestionsAgainDate: '2025-03-28T23:59:00Z',
      hideScore: true,
      showScoreAgainDate: '2025-03-31T23:59:00Z',
    },
  },
  {
    targets: ['sectionB'],
    enabled: true,
    blockAccess: false,
    listBeforeRelease: true,
    dateControl: {
      enabled: false,
    },
    prairieTestControl: {
      enabled: false,
    },
  },
];

interface AccessControlProps {
  courseInstance: PageContext<'courseInstance', 'instructor'>['course_instance'];
  csrfToken: string;
  origHash: string;
}

export function AccessControl({ courseInstance, csrfToken, origHash }: AccessControlProps) {
  const saveMutation = useMutation({
    mutationKey: ['save-access-control'],
    mutationFn: async (accessControl: AccessControlJson[]) => {
      const body = new URLSearchParams({
        __action: 'update_access_control',
        __csrf_token: csrfToken,
        access_control: JSON.stringify(accessControl),
        orig_hash: origHash,
      });

      const res = await fetch(window.location.href, {
        method: 'POST',
        body,
      });

      const result = await res.json();
      if (!res.ok) {
        if (result.job_sequence_id) {
          window.location.href = getCourseInstanceEditErrorUrl(
            courseInstance.id,
            result.job_sequence_id,
          );
          return null;
        }

        throw new Error(result.error || 'Failed to save access control');
      }

      return result;
    },
    onSuccess: () => {
      // Reload the page to get the updated origHash and show success message
      window.location.reload();
    },
  });

  const handleFormSubmit = (data: AccessControlJson[]) => {
    saveMutation.mutate(data);
  };

  return (
    <div>
      {saveMutation.isError && (
        <Alert variant="danger" dismissible onClose={() => saveMutation.reset()}>
          {saveMutation.error.message}
        </Alert>
      )}
      <AccessControlForm
        courseInstance={courseInstance}
        initialData={sampleAccessControl}
        isSaving={saveMutation.isPending}
        onSubmit={handleFormSubmit}
      />
    </div>
  );
}

AccessControl.displayName = 'AccessControl';
