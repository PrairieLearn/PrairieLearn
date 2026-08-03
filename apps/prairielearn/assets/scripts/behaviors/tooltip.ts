import { type Tooltip } from 'bootstrap';
import { on } from 'delegated-events';
import { observe } from 'selector-observer';

import { onDocumentReady } from '@prairielearn/browser-utils';

const TOOLTIP_CLOSE_DELAY_MS = 500;

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
    const showDelay = typeof delay === 'number' ? delay : getShowDelayFromObject(delay);
    return Number.isFinite(showDelay) && showDelay >= 0 ? showDelay : 0;
  } catch {
    return 0;
  }
}

function getShowDelayFromObject(delay: unknown): number {
  if (typeof delay !== 'object' || delay == null || !('show' in delay)) return 0;
  return typeof delay.show === 'number' ? delay.show : 0;
}

/**
 * Adds accessible hover/focus behavior around a manually triggered Bootstrap tooltip.
 *
 * Bootstrap hides a tooltip as soon as the pointer leaves its trigger, which prevents
 * users from moving the pointer over the tooltip itself. This controller keeps the
 * tooltip open while either the trigger or tooltip is hovered, or while the trigger
 * contains focus. It also leaves a short bridge delay for moving between the two.
 */
class HoverableTooltipController {
  private triggerHovered = false;
  private triggerFocused = false;
  private tooltipHovered = false;
  private dismissed = false;
  private open = false;
  private showTimer: ReturnType<typeof setTimeout> | null = null;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  private tooltipElement: HTMLElement | null = null;

  constructor(
    private trigger: HTMLElement,
    private tooltip: Tooltip,
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
    this.dismissed = true;
    this.tooltipHovered = false;
    this.clearTimers();
    this.hideTooltip();
  }

  dispose() {
    this.clearTimers();
    this.trigger.removeEventListener('mouseenter', this.handleTriggerMouseEnter);
    this.trigger.removeEventListener('mouseleave', this.handleTriggerMouseLeave);
    this.trigger.removeEventListener('focusin', this.handleTriggerFocusIn);
    this.trigger.removeEventListener('focusout', this.handleTriggerFocusOut);
    this.trigger.removeEventListener('click', this.handleTriggerClick);
    this.trigger.removeEventListener('inserted.bs.tooltip', this.handleTooltipInserted);
    this.trigger.removeEventListener('hidden.bs.tooltip', this.handleTooltipHidden);
    this.detachTooltipElement();
    this.tooltip.dispose();
  }

  private handleTriggerMouseEnter = () => {
    this.triggerHovered = true;
    this.dismissed = false;
    this.clearHideTimer();
    this.scheduleShow();
  };

  private handleTriggerMouseLeave = () => {
    this.triggerHovered = false;
    this.scheduleHide();
  };

  private handleTriggerFocusIn = () => {
    this.triggerFocused = true;
    this.dismissed = false;
    this.clearTimers();
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
    tooltipElement.style.pointerEvents = 'auto';
    tooltipElement.addEventListener('mouseenter', this.handleTooltipMouseEnter);
    tooltipElement.addEventListener('mouseleave', this.handleTooltipMouseLeave);
  };

  private handleTooltipHidden = () => {
    this.open = false;
    this.detachTooltipElement();
  };

  private handleTooltipMouseEnter = () => {
    this.tooltipHovered = true;
    this.clearHideTimer();
  };

  private handleTooltipMouseLeave = () => {
    this.tooltipHovered = false;
    this.scheduleHide();
  };

  private scheduleShow() {
    this.clearShowTimer();
    if (this.dismissed) return;

    if (this.showDelay === 0) {
      this.showTooltip();
      return;
    }

    this.showTimer = setTimeout(() => {
      this.showTimer = null;
      if (this.triggerHovered && !this.dismissed) this.showTooltip();
    }, this.showDelay);
  }

  private scheduleHide() {
    this.clearShowTimer();
    if (this.triggerHovered || this.triggerFocused || this.tooltipHovered) return;

    this.clearHideTimer();
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      this.dismissed = false;
      this.hideTooltip();
    }, TOOLTIP_CLOSE_DELAY_MS);
  }

  private showTooltip() {
    if (this.open || !getTooltipTitle(this.trigger)) return;
    this.open = true;
    this.tooltip.show();
  }

  private hideTooltip() {
    if (!this.open) return;
    this.open = false;
    this.tooltip.hide();
  }

  private detachTooltipElement() {
    if (!this.tooltipElement) return;
    this.tooltipElement.removeEventListener('mouseenter', this.handleTooltipMouseEnter);
    this.tooltipElement.removeEventListener('mouseleave', this.handleTooltipMouseLeave);
    this.tooltipElement = null;
  }

  private clearTimers() {
    this.clearShowTimer();
    this.clearHideTimer();
  }

  private clearShowTimer() {
    if (this.showTimer == null) return;
    clearTimeout(this.showTimer);
    this.showTimer = null;
  }

  private clearHideTimer() {
    if (this.hideTimer == null) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }
}

const openTooltips = new Set<Tooltip>();
const tooltipControllers = new WeakMap<HTMLElement, HoverableTooltipController>();
const tooltipControllersByInstance = new WeakMap<Tooltip, HoverableTooltipController>();

function closeOpenTooltips() {
  openTooltips.forEach((tooltip) => {
    const controller = tooltipControllersByInstance.get(tooltip);
    if (controller) controller.dismiss();
    else tooltip.hide();
  });
  openTooltips.clear();
}

onDocumentReady(() => {
  observe('[data-bs-toggle~="tooltip"], [data-bs-toggle-tooltip="true"]', {
    constructor: HTMLElement,
    add(el) {
      const title = getTooltipTitle(el);
      const accessibleName = el.getAttribute('aria-label');
      let tooltipDuplicatesAccessibleName = accessibleName === title;

      if (!accessibleName && title && !el.textContent.trim()) {
        el.setAttribute('aria-label', title);
        tooltipDuplicatesAccessibleName = true;
      }

      const tooltip = new window.bootstrap.Tooltip(el, {
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
      tooltipControllersByInstance.set(tooltip, controller);

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
          .filter((x) => x !== 'tooltip')
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
      if (tooltipDuplicatesAccessibleName) {
        el.addEventListener('inserted.bs.tooltip', () => {
          el.removeAttribute('aria-describedby');
        });
      }
    },
    remove(el) {
      const tooltip = window.bootstrap.Tooltip.getInstance(el);
      tooltipControllers.get(el)?.dispose();
      tooltipControllers.delete(el);
      if (tooltip) openTooltips.delete(tooltip);
    },
  });

  // Hide other open tooltips when a new one is shown.
  on('show.bs.tooltip', 'body', () => {
    closeOpenTooltips();
  });

  on('shown.bs.tooltip', 'body', (event) => {
    const tooltip = window.bootstrap.Tooltip.getInstance(event.target as HTMLElement);
    if (tooltip) openTooltips.add(tooltip);
  });

  on('hide.bs.tooltip', 'body', (event) => {
    const tooltip = window.bootstrap.Tooltip.getInstance(event.target as HTMLElement);
    if (tooltip) openTooltips.delete(tooltip);
  });

  // WCAG 1.4.13: content shown on hover/focus must be dismissible without
  // moving the pointer or focus. Bootstrap tooltips don't do this on their own,
  // so we hide any open tooltips when Escape is pressed (mirroring popovers).
  // This can be removed after upgrading to Bootstrap 6:
  // https://github.com/twbs/bootstrap/pull/42472
  on('keydown', 'body', (event) => {
    if (event.key === 'Escape') {
      closeOpenTooltips();
    }
  });
});
