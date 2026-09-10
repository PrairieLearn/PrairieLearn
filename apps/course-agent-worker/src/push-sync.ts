import { z } from 'zod';

const ParamsSchema = z.object({
  containerId: z.string(),
  sandboxId: z.string(),
});

export function pushSyncParams(
  namespace: { idFromName: (name: string) => { toString: () => string } },
  sandboxId: string,
) {
  return { containerId: namespace.idFromName(sandboxId).toString(), sandboxId };
}

export async function proxyPushSync(
  request: Request,
  coordinator: DurableObjectNamespace,
  context: { containerId: string; params?: unknown },
) {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const params = ParamsSchema.parse(context.params);
  if (context.containerId !== params.containerId) {
    return new Response('Push approval operation is not permitted.', { status: 403 });
  }
  if (request.headers.get('X-Course-Agent-Approval-Protocol') !== 'blocking-v1') {
    return Response.json(
      {
        error:
          'The sandbox is using an outdated publication tool. Restart it with the current course-agent image before requesting approval.',
      },
      { status: 409 },
    );
  }
  const id = coordinator.idFromName(params.sandboxId);
  return coordinator.get(id).fetch(
    new Request('https://coordinator/push-sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: await request.text(),
    }),
  );
}
