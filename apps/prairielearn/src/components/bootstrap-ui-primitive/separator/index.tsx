import * as React from 'react';
import '#components/tiptap-ui-primitive/separator/separator.scss';

type Orientation = 'horizontal' | 'vertical';

export interface SeparatorProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: Orientation;
  decorative?: boolean;
}

export const Separator = React.forwardRef<HTMLDivElement, SeparatorProps>(
  ({ decorative, orientation = 'vertical', className = '', ...props }, ref) => {
    const ariaOrientation = orientation === 'vertical' ? orientation : undefined;
    const semanticProps = decorative
      ? { role: 'none' as const }
      : { 'aria-orientation': ariaOrientation, role: 'separator' as const };

    const verticalStyle = {
      height: '100%',
      width: '1.5rem',
    } as React.CSSProperties;
    const horizontalStyle = {
      height: '1px',
      width: '100%',
    } as React.CSSProperties;

    const style = {
      ...(orientation === 'vertical' ? verticalStyle : horizontalStyle),
      flexShrink: 0,
      backgroundColor: 'var(--bs-gray-200)',
    } as React.CSSProperties;

    return <div className={className} {...semanticProps} {...props} ref={ref} style={style} />;
  },
);

Separator.displayName = 'Separator';
