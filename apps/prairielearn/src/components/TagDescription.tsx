import { type Tag } from '../lib/db-types.js';

export function TagDescription({ tag }: { tag: Tag }) {
  if (!tag.implicit) {
    return tag.description;
  }

  return (
    <span className="text-muted">
      Auto-generated from use in a question; edit this tag to customize
    </span>
  );
}
