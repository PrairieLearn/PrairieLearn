import { useEffect, useReducer, useState } from 'react';
import { z } from 'zod';

import { EventSchema, type Summary, SummarySchema } from '@prairielearn/course-agent-protocol';

import { INITIAL_VIEW, conversationView } from './view.js';

export function useConversationObservation(
  courseId: string,
  conversationId: string,
  active: boolean,
) {
  const [view, dispatch] = useReducer(conversationView, INITIAL_VIEW);
  const [observedId, setObservedId] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  // Every attachment receives a fresh snapshot. Cleanup detaches observation;
  // neither a conversation switch nor an EventSource reconnect resends a prompt.
  useEffect(() => {
    dispatch({ type: 'reset' });
    if (!active) return;
    const source = new EventSource(
      `/pl/course/${courseId}/course-agent/conversations/${conversationId}/events`,
    );
    let disposed = false;
    const receive = (event: MessageEvent) => {
      if (disposed) return;
      let json: unknown;
      try {
        json = JSON.parse(event.data);
      } catch {
        source.close();
        dispatch({ type: 'disconnected' });
        return;
      }
      const result = EventSchema.safeParse(json);
      if (result.success) {
        if (result.data.event === 'conversation.snapshot') setObservedId(conversationId);
        dispatch(result.data);
      }
    };
    for (const schema of EventSchema.options) {
      source.addEventListener(schema.shape.event.value, receive);
    }
    source.onerror = () => {
      if (!disposed) dispatch({ type: 'disconnected' });
    };
    return () => {
      disposed = true;
      for (const schema of EventSchema.options) {
        source.removeEventListener(schema.shape.event.value, receive);
      }
      source.close();
    };
  }, [courseId, conversationId, active, generation]);
  return {
    view: active && observedId === conversationId ? view : INITIAL_VIEW,
    dispatch,
    reconnect: () => setGeneration((value) => value + 1),
  };
}

const ActivitySchema = z.object({ conversationId: z.string(), summary: SummarySchema });

export function useConversationActivity(courseId: string, ids: string[], active: boolean) {
  const [summaries, setSummaries] = useState<Partial<Record<string, Summary>>>({});
  const key = ids.join(',');
  // Observe only the displayed catalog page while the panel is open. This feed
  // remains attached when a different conversation's full transcript is selected.
  useEffect(() => {
    if (!active || !key) return;
    const source = new EventSource(
      `/pl/course/${courseId}/course-agent/activity?ids=${encodeURIComponent(key)}`,
    );
    let disposed = false;
    const receive = (event: MessageEvent) => {
      if (disposed) return;
      let json: unknown;
      try {
        json = JSON.parse(event.data);
      } catch {
        return;
      }
      const result = ActivitySchema.safeParse(json);
      if (!result.success) return;
      const { conversationId, summary } = result.data;
      setSummaries((previous) => {
        const current = previous[conversationId];
        if (current && current.revision > summary.revision) return previous;
        return { ...previous, [conversationId]: summary };
      });
    };
    source.addEventListener('activity', receive);
    return () => {
      disposed = true;
      source.removeEventListener('activity', receive);
      source.close();
    };
  }, [courseId, key, active]);
  return summaries;
}
