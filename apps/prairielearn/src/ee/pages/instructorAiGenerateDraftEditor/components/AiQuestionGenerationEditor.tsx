import { QueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { NuqsAdapter } from '@prairielearn/ui';

import { QueryClientProviderDebug } from '../../../../lib/client/tanstackQuery.js';
import {
  DraftQuestionEditorContent,
  type DraftQuestionEditorProps,
} from '../../../../pages/instructorQuestionDraftEditor/components/DraftQuestionEditor.js';
import { createCourseTrpcClient } from '../../../../trpc/course/client.js';
import { TRPCProvider } from '../../../../trpc/course/context.js';
import type { QuestionGenerationUIMessage } from '../../../lib/ai-question-generation/agent.js';

import { AiQuestionGenerationChat } from './AiQuestionGenerationChat.js';

interface AiQuestionGenerationEditorProps extends DraftQuestionEditorProps {
  chatCsrfToken: string;
  initialMessages: QuestionGenerationUIMessage[];
  showJobLogsLink: boolean;
}

export function AiQuestionGenerationEditor({
  chatCsrfToken,
  initialMessages,
  showJobLogsLink,
  trpcCsrfToken,
  courseId,
  ...props
}: AiQuestionGenerationEditorProps) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createCourseTrpcClient({ csrfToken: trpcCsrfToken, courseId }),
  );

  return (
    <QueryClientProviderDebug client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <NuqsAdapter search={props.search}>
          <DraftQuestionEditorContent
            {...props}
            renderSidebar={(sidebarProps) => (
              <AiQuestionGenerationChat
                chatCsrfToken={chatCsrfToken}
                initialMessages={initialMessages}
                showJobLogsLink={showJobLogsLink}
                {...sidebarProps}
              />
            )}
          />
        </NuqsAdapter>
      </TRPCProvider>
    </QueryClientProviderDebug>
  );
}

AiQuestionGenerationEditor.displayName = 'AiQuestionGenerationEditor';
