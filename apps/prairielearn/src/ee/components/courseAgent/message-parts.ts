import type { UIMessage } from 'ai';

export function isVisibleMessage(message: UIMessage) {
  const metadata = message.metadata;
  return (
    !(
      metadata &&
      typeof metadata === 'object' &&
      'source' in metadata &&
      metadata.source === 'tool-result'
    ) && !message.parts.some((p) => p.type === 'data-tool-display')
  );
}
