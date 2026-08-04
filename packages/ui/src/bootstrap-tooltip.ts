import { observe } from 'selector-observer';

const TOOLTIP_CLOSE_DELAY_MS = 500;

interface BootstrapTooltip {
  show: () => void;
  hide: () => void;
  dispose: () => void;
}

type BootstrapTooltipConstructor = new (
  element: HTMLElement,
  options: { trigger: 'manual'; title: () => string },
) => BootstrapTooltip;

function getTooltipTitle(trigger: HTMLElement): string {
  return (
    trigger.dataset.bsTitle ??
    trigger.dataset.bsOriginalTitle ??
    trigger.getAttribute('title') ??
    ''
  );
}

function getTooltipShowDelay(trigger: HTMLElement): number {
  const rawDelay = trigger.dataset.bsDelay;
  if (!rawDelay) return 0;

  try {
    const delay: unknown = JSON.parse(rawDelay);
    let showDelay = 0;
    if (typeof delay === 'number') showDelay = delay;
    if (typeof delay === 'object' && delay != null && 'show' in delay) {
      if (typeof delay.show === 'number') showDelay = delay.show;
    }
    return Number.isFinite(showDelay) && showDelay >= 0 ? showDelay : 0;
  } catch {
    return 0;
  }
}

/**
 * Adds accessible hover/focus behavior around a manually triggered Bootstrap tooltip.
 *
 * Bootstrap hides a tooltip as soon as the pointer leaves its trigger, which prevents
 * users from moving the pointer over the tooltip itself. This controller keeps the
 * tooltip open while either the trigger or tooltip is hovered, or while the trigger
 * contains focus. It also leaves a short bridge delay for moving between the two.
 *
 * This is the vanilla Bootstrap counterpart to the React Aria-based `Tooltip` in this
 * package. Keep their user-facing behavior aligned: immediate display by default,
 * hover retention, delayed closing, fade transitions, click dismissal, and Escape
 * dismissal.
 */
class HoverableTooltipController {
  private triggerHovered = false;
  private triggerFocused = false;
  private tooltipHovered = false;
  private open = false;
  private hiding = false;
  private reopenAfterHide = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tooltipElement: HTMLElement | null = null;

  constructor(
    private trigger: HTMLElement,
    private tooltip: BootstrapTooltip,
    private showDelay = getTooltipShowDelay(trigger),
  ) {
    trigger.addEventListener('mouseenter', this.handleTriggerMouseEnter);
    trigger.addEventListener('mouseleave', this.handleTriggerMouseLeave);
    trigger.addEventListener('focusin', this.handleTriggerFocusIn);
    trigger.addEventListener('focusout', this.handleTriggerFocusOut);
    trigger.addEventListener('click', this.handleTriggerClick);
    trigger.addEventListener('inserted.bs.tooltip', this.handleTooltipInserted);
    trigger.addEventListener('hidden.bs.tooltip', this.handleTooltipHidden);
  }

  dismiss() {
    this.tooltipHovered = false;
    this.reopenAfterHide = false;
    this.clearTimer();
    this.hideTooltip();
  }

  dispose() {
    this.clearTimer();
    this.trigger.removeEventListener('mouseenter', this.handleTriggerMouseEnter);
    this.trigger.removeEventListener('mouseleave', this.handleTriggerMouseLeave);
    this.trigger.removeEventListener('focusin', this.handleTriggerFocusIn);
    this.trigger.removeEventListener('focusout', this.handleTriggerFocusOut);
    this.trigger.removeEventListener('click', this.handleTriggerClick);
    this.trigger.removeEventListener('inserted.bs.tooltip', this.handleTooltipInserted);
    this.trigger.removeEventListener('hidden.bs.tooltip', this.handleTooltipHidden);
    this.detachTooltipElement();
    openTooltipControllers.delete(this);
    this.tooltip.dispose();
  }

  private handleTriggerMouseEnter = () => {
    this.triggerHovered = true;
    this.scheduleShow();
  };

  private handleTriggerMouseLeave = () => {
    this.triggerHovered = false;
    this.scheduleHide();
  };

  private handleTriggerFocusIn = () => {
    if (this.triggerFocused) return;
    this.triggerFocused = true;
    this.clearTimer();
    this.showTooltip();
  };

  private handleTriggerFocusOut = (event: FocusEvent) => {
    if (event.relatedTarget && this.trigger.contains(event.relatedTarget as Node)) return;
    this.triggerFocused = false;
    this.scheduleHide();
  };

  private handleTriggerClick = () => {
    this.dismiss();
  };

  private handleTooltipInserted = () => {
    const describedByIds = this.trigger.getAttribute('aria-describedby')?.split(/\s+/) ?? [];
    const tooltipElement = describedByIds
      .map((id) => this.trigger.ownerDocument.getElementById(id))
      .find((element): element is HTMLElement => element?.getAttribute('role') === 'tooltip');

    if (!tooltipElement || this.tooltipElement === tooltipElement) return;

    this.detachTooltipElement();
    this.tooltipElement = tooltipElement;
    tooltipElement.addEventListener('mouseenter', this.handleTooltipMouseEnter);
    tooltipElement.addEventListener('mouseleave', this.handleTooltipMouseLeave);
  };

  private handleTooltipHidden = () => {
    const shouldReopen =
      this.reopenAfterHide && (this.triggerHovered || this.triggerFocused || this.tooltipHovered);
    this.open = false;
    this.hiding = false;
    this.reopenAfterHide = false;
    this.tooltipHovered = false;
    openTooltipControllers.delete(this);
    this.detachTooltipElement();
    if (shouldReopen) this.showTooltip();
  };

  private handleTooltipMouseEnter = () => {
    this.tooltipHovered = true;
    this.clearTimer();
    if (this.hiding) this.showTooltip();
  };

  private handleTooltipMouseLeave = () => {
    this.tooltipHovered = false;
    this.scheduleHide();
  };

  private scheduleShow() {
    this.clearTimer();

    if (this.showDelay === 0) {
      this.showTooltip();
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.triggerHovered) this.showTooltip();
    }, this.showDelay);
  }

  private scheduleHide() {
    this.clearTimer();
    if (this.triggerHovered || this.triggerFocused || this.tooltipHovered) return;

    this.timer = setTimeout(() => {
      this.timer = null;
      this.hideTooltip();
    }, TOOLTIP_CLOSE_DELAY_MS);
  }

  private showTooltip() {
    if (!getTooltipTitle(this.trigger)) return;
    if (this.hiding) {
      // Bootstrap's pending hide callback would dispose a tooltip shown during the
      // fade transition, so wait for `hidden.bs.tooltip` before reopening it.
      this.reopenAfterHide = true;
      return;
    }
    if (this.open) return;
    closeOpenTooltips();
    this.open = true;
    openTooltipControllers.add(this);
    this.tooltip.show();
  }

  private hideTooltip() {
    openTooltipControllers.delete(this);
    if (!this.open || this.hiding) return;
    this.open = false;
    this.hiding = true;
    this.tooltip.hide();
  }

  private detachTooltipElement() {
    if (!this.tooltipElement) return;
    this.tooltipElement.removeEventListener('mouseenter', this.handleTooltipMouseEnter);
    this.tooltipElement.removeEventListener('mouseleave', this.handleTooltipMouseLeave);
    this.tooltipElement = null;
  }

  private clearTimer() {
    if (this.timer == null) return;
    clearTimeout(this.timer);
    this.timer = null;
  }
}

const openTooltipControllers = new Set<HoverableTooltipController>();
const tooltipControllers = new WeakMap<HTMLElement, HoverableTooltipController>();

function closeOpenTooltips() {
  openTooltipControllers.forEach((controller) => controller.dismiss());
}

let activeUninstall: (() => void) | null = null;

/**
 * Installs accessible behavior for vanilla Bootstrap tooltips in the current document.
 * This must be called after `document.body` is available.
 */
export function installBootstrapTooltipBehavior({
  Tooltip,
}: {
  Tooltip: BootstrapTooltipConstructor;
}): () => void {
  if (activeUninstall) return activeUninstall;

  const insertedListeners = new WeakMap<HTMLElement, () => void>();
  const tooltipObserver = observe('[data-bs-toggle~="tooltip"], [data-bs-toggle-tooltip="true"]', {
    constructor: HTMLElement,
    add(el: HTMLElement) {
      const tooltip = new Tooltip(el, {
        // Interaction is managed by HoverableTooltipController so that the tooltip
        // itself can be hovered and Escape can dismiss it without moving focus.
        // TODO: Remove this controller once Bootstrap supports hover retention upstream:
        // https://github.com/twbs/bootstrap/issues/42065
        // https://github.com/twbs/bootstrap/pull/35151
        trigger: 'manual',
        // Read the title each time the tooltip opens so callers can update
        // data-bs-title without disposing and recreating the instance.
        title: () => getTooltipTitle(el),
      });
      const controller = new HoverableTooltipController(el, tooltip);
      tooltipControllers.set(el, controller);

      // Bootstrap doesn't support a single element triggering multiple things.
      // There are cases where we want this behavior, e.g. to have a tooltip
      // label on a button that opens a modal. We achieve that by looking for
      // things like `data-bs-toggle="modal tooltip"` and stripping the `tooltip`
      // piece out after initializing the tooltip.
      const attributeName = el.dataset.toggle ? 'toggle' : 'bsToggle';
      const attribute = el.dataset[attributeName];
      if (attribute && attribute !== 'tooltip') {
        el.dataset[attributeName] = attribute
          .split(' ')
          .filter((x: string) => x !== 'tooltip')
          .join(' ');

        // If we naively removed the `tooltip` piece, the element would no
        // longer match the selector used by `selector-observer` here, which
        // would cause the tooltip to be disposed. To prevent that, we set
        // `data-bs-toggle-tooltip` to `true`, which is ignored by Bootstrap
        // but allows `selector-observer` to keep the element alive.
        el.dataset.bsToggleTooltip = 'true';
      }

      // By default, Bootstrap will copy the `title` attribute to the `aria-label`
      // attribute if the trigger doesn't have any visible text. It will _also_
      // add an `aria-describedby` attribute that points to the tooltip when it's
      // shown. This is problematic for screen readers, because it means that the
      // screen reader will announce the tooltip's text twice.
      //
      // We define our own convention: if `data-bs-title` is set and the tooltip
      // trigger doesn't have any text content or existing `aria-label`, we'll
      // use the `data-bs-title` as the `aria-label`. We'll also immediately
      // remove the `aria-describedby` attribute when the tooltip is shown.
      if (!el.hasAttribute('aria-label')) {
        const title = el.dataset.bsTitle;
        if (title && !el.textContent.trim()) {
          el.setAttribute('aria-label', title);
        }
        const handleTooltipInserted = () => {
          el.removeAttribute('aria-describedby');
        };
        insertedListeners.set(el, handleTooltipInserted);
        el.addEventListener('inserted.bs.tooltip', handleTooltipInserted);
      }
    },
    remove(el: HTMLElement) {
      tooltipControllers.get(el)?.dispose();
      tooltipControllers.delete(el);
      const handleTooltipInserted = insertedListeners.get(el);
      if (handleTooltipInserted) {
        el.removeEventListener('inserted.bs.tooltip', handleTooltipInserted);
        insertedListeners.delete(el);
      }
    },
  });

  // WCAG 1.4.13: content shown on hover/focus must be dismissible without
  // moving the pointer or focus. Bootstrap tooltips don't do this on their own,
  // so we hide any open tooltips when Escape is pressed (mirroring popovers).
  // This can be removed after upgrading to Bootstrap 6:
  // https://github.com/twbs/bootstrap/pull/42472
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      closeOpenTooltips();
    }
  };
  const body = document.body;
  body.addEventListener('keydown', handleKeyDown);

  const uninstall = () => {
    if (activeUninstall !== uninstall) return;
    tooltipObserver.abort();
    body.removeEventListener('keydown', handleKeyDown);
    activeUninstall = null;
  };
  activeUninstall = uninstall;
  return uninstall;
}
