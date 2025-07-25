import { forwardRef } from 'preact/compat';
import {
  Button as BootstrapButton,
  type ButtonProps as BootstrapButtonProps,
  OverlayTrigger,
  Tooltip,
} from 'react-bootstrap';

export interface ButtonProps extends BootstrapButtonProps {
  className?: string;
  showTooltip?: boolean;
  tooltip?: React.ReactNode;
  shortcutKeys?: string;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>((props, ref) => {
  const { tooltip, showTooltip: _showTooltip, shortcutKeys: _shortcutKeys, ...rest } = props;
  if (!tooltip) {
    return <BootstrapButton {...rest} ref={ref} />;
  }
  return (
    <>
      <OverlayTrigger placement="right" overlay={<Tooltip>{tooltip}</Tooltip>}>
        <BootstrapButton {...rest} ref={ref} />
      </OverlayTrigger>
    </>
  );
});

Button.displayName = 'Button';
