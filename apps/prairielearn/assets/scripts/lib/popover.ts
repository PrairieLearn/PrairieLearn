/**
 * Given a popover trigger element, returns the container. Only works if the popover is open.
 */
export function getPopoverContainerForTrigger(trigger: HTMLElement): HTMLElement | null {
  const popoverId = trigger.getAttribute('aria-describedby');
  if (!popoverId) return null;

  const popoverContainer = document.querySelector<HTMLElement>(`#${popoverId}`);
  return popoverContainer;
}

/**
 * Given a popover container element, returns the trigger element.
 */
export function getPopoverTriggerForContainer(container: HTMLElement): HTMLElement | null {
  const popoverId = container.getAttribute('id');
  if (!popoverId) return null;

  const popoverTrigger = document.querySelector<HTMLElement>(`[aria-describedby="${popoverId}"]`);
  return popoverTrigger;
}
