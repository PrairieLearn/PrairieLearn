import * as React from 'react';

type SpacerOrientation = 'horizontal' | 'vertical';

interface SpacerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: SpacerOrientation;
  size?: string | number;
}

const DEFAULT_STYLE = {};

export const Spacer = React.forwardRef<HTMLDivElement, SpacerProps>(
  ({ orientation = 'horizontal', size, className = '', style = DEFAULT_STYLE, ...props }, ref) => {
    const computedStyle = {
      ...style,
      ...(orientation === 'horizontal' && !size && { flex: 1 }),
      ...(size && {
        width: orientation === 'vertical' ? '1px' : size,
        height: orientation === 'horizontal' ? '1px' : size,
      }),
    };

    return <div ref={ref} {...props} className={className} style={computedStyle} />;
  },
);

Spacer.displayName = 'Spacer';
