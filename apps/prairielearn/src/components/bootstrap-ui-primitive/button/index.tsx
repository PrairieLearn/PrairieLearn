import { forwardRef } from 'preact/compat';
import {
  Button as BootstrapButton,
  OverlayTrigger,
  Tooltip,
  type ButtonProps as BootstrapButtonProps,
} from 'react-bootstrap';

export interface ButtonProps extends BootstrapButtonProps {
  className?: string;
  showTooltip?: boolean;
  tooltip?: React.ReactNode;
  shortcutKeys?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const { tooltip, showTooltip, shortcutKeys: _shortcutKeys, ...rest } = props;
  return (
    <>
      <OverlayTrigger placement="right" overlay={<Tooltip>{tooltip}</Tooltip>}>
        <BootstrapButton {...props} ref={ref} />
      </OverlayTrigger>
    </>
  );
});

Button.displayName = 'Button';
