import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { load } from 'cheerio';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { createAssessmentTrpcClient } from '../../../trpc/assessment/client.js';
import { TRPCProvider } from '../../../trpc/assessment/context.js';

import { PrairieTestExamsTable } from './RuleSummary.js';

describe('PrairieTestExamsTable', () => {
  it.each([false, true])('describes access with date control enabled: %s', (dateControlEnabled) => {
    const queryClient = new QueryClient();
    const trpcClient = createAssessmentTrpcClient({
      csrfToken: 'test',
      courseInstanceId: '1',
      assessmentId: '1',
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <PrairieTestExamsTable
            exams={[
              {
                examUuid: '00000000-0000-4000-8000-000000000001',
                afterCompleteQuestionsHidden: true,
                afterCompleteScoreHidden: true,
              },
            ]}
            dateControlEnabled={dateControlEnabled}
            initialMetadata={[]}
            ptHost="https://www.prairietest.com"
            canFetchMetadata={false}
          />
        </TRPCProvider>
      </QueryClientProvider>,
    );

    const footer = load(html)('.access-summary-card-footer').text();
    expect(footer).toBe(
      'PrairieTest controls access and time limits during reservations.' +
        (dateControlEnabled ? ' Date control also allows access outside PrairieTest.' : ''),
    );
  });
});
