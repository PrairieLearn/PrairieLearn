import { Alert, Form } from 'react-bootstrap';
import type { UseFormRegisterReturn } from 'react-hook-form';

import { PublicLinkSharing } from './LinkSharing.js';

interface BlockingChild {
  id: string;
  href: string;
  label: string;
}

/**
 * Sharing card used on the assessment-settings and course-instance-settings
 * pages. Both surfaces have the same structure: a `share_source_publicly`
 * checkbox that locks once enabled, a description, a blocking warning that
 * lists non-publicly-shared children with links to their settings pages, and a
 * `PublicLinkSharing` block once shared.
 *
 * Copy varies only by two nouns:
 *   - `entityNoun`: this card's entity ("assessment", "course instance").
 *   - `childNoun`: what must also be shared ("questions", "assessments").
 *
 * The question-settings sharing card intentionally does not use this component
 * — it has additional fields (a separate `share_publicly` toggle and a
 * sharing-set selector) that don't fit this shape.
 */
export function ShareSourcePubliclyCard({
  alreadyShared,
  canEdit,
  registerProps,
  defaultChecked,
  blockingChildren,
  publicLink,
  entityNoun,
  childNoun,
}: {
  /** Current persisted value of `share_source_publicly`. */
  alreadyShared: boolean;
  canEdit: boolean;
  /** Result of `register('share_source_publicly')` from react-hook-form. */
  registerProps: UseFormRegisterReturn;
  defaultChecked: boolean | undefined;
  /** Non-publicly-shared children that block the transition; empty when clear. */
  blockingChildren: BlockingChild[];
  publicLink: string;
  /** Singular noun for this card's entity, e.g. "assessment". */
  entityNoun: string;
  /** Plural noun for the blocking children, e.g. "questions". */
  childNoun: string;
}) {
  const blockedCount = blockingChildren.length;

  return (
    <div className="card">
      <div className="card-body">
        <h2 className="h5 card-title mb-3">Sharing</h2>
        <Form.Check
          type="checkbox"
          id="share_source_publicly"
          label="Share source publicly"
          className="mb-1"
          disabled={!canEdit || alreadyShared || blockedCount > 0}
          defaultChecked={defaultChecked}
          {...registerProps}
        />
        <small className="form-text text-muted d-block mb-2">
          The {entityNoun}'s source becomes available for others to view and copy.
          {alreadyShared &&
            ` This ${entityNoun} already has publicly shared source and cannot be un-shared.`}
        </small>
        {blockedCount > 0 && !alreadyShared && (
          <Alert variant="warning" className="small mb-2">
            Cannot share this {entityNoun} publicly until the following {childNoun} are also shared
            publicly:{' '}
            {blockingChildren.map((child, i) => (
              <span key={child.id}>
                {i > 0 && ', '}
                <a href={child.href}>{child.label}</a>
              </span>
            ))}
            .
          </Alert>
        )}
        {alreadyShared && (
          <PublicLinkSharing
            publicLink={publicLink}
            sharingMessage={`This ${entityNoun}'s source is publicly shared.`}
            publicLinkMessage={`The link that other instructors can use to view this ${entityNoun}.`}
          />
        )}
      </div>
    </div>
  );
}
