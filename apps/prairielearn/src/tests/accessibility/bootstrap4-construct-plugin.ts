import { type DOMReadyEvent, Rule, type RuleDocumentation, definePlugin } from 'html-validate';

const BOOTSTRAP_LEGACY_ATTRIBUTES = [
  'data-animation',
  'data-autohide',
  'data-backdrop',
  'data-boundary',
  'data-container',
  'data-content',
  'data-custom-class',
  'data-delay',
  'data-dismiss',
  'data-display',
  'data-fallback-placement',
  'data-flip',
  'data-focus',
  'data-interval',
  'data-keyboard',
  'data-html',
  'data-offset',
  'data-pause',
  'data-placement',
  'data-popper-config',
  'data-reference',
  'data-ride',
  'data-selector',
  'data-show',
  'data-spy',
  'data-target',
  'data-template',
  'data-title',
  'data-toggle',
  'data-touch',
  'data-trigger',
  'data-wrap',
];

const BOOTSTRAP_BREAKPOINTS = ['sm-', 'md-', 'lg-', 'xl-', 'xxl-'];
const BOOTSTRAP_LEGACY_CLASSES = [
  'thead-light',
  'thead-dark',
  'custom-control.custom-checkbox',
  'custom-control.custom-radio',
  'custom-control.custom-switch',
  'custom-control-input',
  'custom-control-label',
  'custom-select',
  'custom-file',
  'custom-range',
  'input-group-prepend',
  'input-group-append',
  'form-group',
  'form-row',
  'form-inline',
  ...['ml', 'mr', 'pl', 'pr'].flatMap((prefix) =>
    ['', ...BOOTSTRAP_BREAKPOINTS].flatMap((breakpoint) =>
      ['0', '1', '2', '3', '4', '5', 'auto'].map((suffix) => `${prefix}-${breakpoint}${suffix}`),
    ),
  ),
  'badge-primary',
  'badge-secondary',
  'badge-success',
  'badge-danger',
  'badge-warning',
  'badge-info',
  'badge-light',
  'badge-dark',
  'badge-pill',
  'btn-block',
  'dropdown-menu-right',
  'dropdown-menu-left',
  'float-left',
  'float-right',
  'border-left',
  'border-right',
  'border-left-0',
  'border-right-0',
  'rounded-left',
  'rounded-right',
  'text-left',
  'text-right',
  ...BOOTSTRAP_BREAKPOINTS.flatMap((breakpoint) =>
    ['left', 'right'].map((suffix) => `text-${breakpoint}${suffix}`),
  ),
  'text-monospace',
  'font-weight-light',
  'font-weight-normal',
  'font-weight-bold',
  'font-weight-bolder',
  'font-weight-lighter',
  'font-italic',
  'embed-responsive',
  'embed-responsive-21by9',
  'embed-responsive-16by9',
  'embed-responsive-4by3',
  'embed-responsive-1by1',
  'embed-responsive-item',
  'sr-only',
  'sr-only-focusable',
];

class Bootstrap4ConstructRule extends Rule {
  public documentation(): RuleDocumentation {
    return {
      description: 'Bootstrap 4 constructs should not be used',
    };
  }
  public setup() {
    this.on('dom:ready', (event: DOMReadyEvent) => {
      const { document } = event;

      BOOTSTRAP_LEGACY_ATTRIBUTES.forEach((attr) => {
        document.querySelectorAll(`[${attr}]`).forEach((node) => {
          // `tom-select` uses a `data-content` attribute on `option` elements.
          // This is unrelated to Bootstrap, so we don't want to do anything with this.
          if (attr === 'data-content' && node.tagName === 'OPTION') return;

          this.report({
            node,
            message: `Bootstrap 4 attribute "${attr}" should not be used. Use "${attr.replace('data-', 'data-bs-')}" instead.`,
          });
        });
      });

      BOOTSTRAP_LEGACY_CLASSES.forEach((className) => {
        document.querySelectorAll(`.${className}`).forEach((node) => {
          // The version of `bootstrap-table` we're locked to uses the old classname for dropdown-menu-* classes.
          // It was fixed in this PR:
          // https://github.com/wenzhixin/bootstrap-table/pull/6796
          // However, we can't upgrade to that version because of this breaking change:
          // https://github.com/wenzhixin/bootstrap-table/issues/6745
          // For now, we'll just ignore this, since we don't control this markup.
          // For float-* classes, bootstrap-table uses its own implementation.
          if (
            ['dropdown-menu-left', 'dropdown-menu-right', 'float-left', 'float-right'].includes(
              className,
            ) &&
            node.closest('.bootstrap-table')
          ) {
            return;
          }

          this.report({
            node,
            message: `Bootstrap 4 ${className.includes('.') ? 'combination of classes' : 'class'} ".${className}" should not be used.`,
          });
        });
      });

      // We used `white text/buttons in "info"-colored card headers, but that doesn't
      // provide sufficient contrast in Bootstrap 5. We'll do our best to patch this
      // by switching to dark text/buttons in this situation.
      document.querySelectorAll('.card-header.bg-info.text-white').forEach((node) => {
        this.report({
          node,
          message:
            'Bootstrap 5 no longer provides sufficient contrast for white text on "info"-colored card headers.',
        });
      });

      document.querySelectorAll('button.close').forEach((node) => {
        this.report({
          node,
          message: 'Bootstrap 5 replaced the ".close" class in buttons with ".btn-close".',
        });
      });
    });
  }
}

export default definePlugin({
  name: 'bootstrap4-construct',
  rules: { 'bootstrap4-construct': Bootstrap4ConstructRule },
});
