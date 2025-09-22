import { useState } from 'preact/compat';
import { Card, Collapse } from 'react-bootstrap';

interface CollapsibleCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  collapsible?: boolean;
  className?: string;
  headerActions?: React.ReactNode;
  skeletonContent?: React.ReactNode;
  showSkeleton?: boolean;
  isOverridden?: boolean;
}

export function CollapsibleCard({
  title,
  description,
  children,
  defaultExpanded = false,
  collapsible = true,
  className = '',
  headerActions,
  skeletonContent,
  showSkeleton = false,
  isOverridden = true,
}: CollapsibleCardProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const toggleExpanded = () => {
    if (collapsible) {
      setIsExpanded(!isExpanded);
    }
  };

  const cardStyle = isOverridden ? {} : { border: '2px dashed #dee2e6', borderColor: '#dee2e6' };

  return (
    <Card class={`mb-3 ${className}`} style={cardStyle}>
      <Card.Header
        class="d-flex justify-content-between align-items-center"
        style={{ cursor: collapsible ? 'pointer' : 'default' }}
        onClick={toggleExpanded}
      >
        <div class="d-flex align-items-center">
          <span class="me-2">{title}</span>
          {description && <small class="text-muted d-block">{description}</small>}
        </div>
        <div class="d-flex align-items-center">
          {headerActions}
          {collapsible && (
            <i class={`bi bi-chevron-${isExpanded ? 'up' : 'down'} ms-2`} aria-hidden="true" />
          )}
        </div>
      </Card.Header>
      <Collapse in={isExpanded}>
        <Card.Body>{showSkeleton ? skeletonContent : children}</Card.Body>
      </Collapse>
    </Card>
  );
}
