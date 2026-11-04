import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { QueryClientProviderDebug } from '@prairielearn/trpc/react';

import { createCourseTrpcClient } from '../../../trpc/course/client.js';
import { TRPCProvider } from '../../../trpc/course/context.js';

import { Conversations } from './Conversations.js';

export function CourseAgentChat({
  courseId,
  authnUserId,
  trpcCsrfToken,
  chatCsrfToken,
  active,
  showConversationStats,
}: {
  courseId: string;
  authnUserId: string;
  trpcCsrfToken: string;
  chatCsrfToken: string;
  active: boolean;
  showConversationStats: boolean;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ courseId, csrfToken: trpcCsrfToken }),
  );
  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <Conversations
          courseId={courseId}
          authnUserId={authnUserId}
          chatCsrfToken={chatCsrfToken}
          active={active}
          showConversationStats={showConversationStats}
        />
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}
