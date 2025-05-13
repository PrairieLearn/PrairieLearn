/* global bootstrap */

// Modified from https://codepen.io/wdzajicek/pen/VYZawjX

// Check browser support for the "beforematch" event
function isEventSupported(eventName, element = document.createElement('div')) {
  const onEventName = `on${eventName}`;
  let isSupported = onEventName in element;

  if (!isSupported) {
    element.setAttribute(onEventName, 'return;');
    isSupported = typeof element[onEventName] === 'function';
  }

  return isSupported;
}

const enableAccordionFind = () => {
  if (!isEventSupported('beforematch')) {
    return;
  }
  const accordions = [...document.querySelectorAll('.accordion-collapse.collapse')];
  accordions.map((item) => {
    item.hidden = 'until-found';
    const collapse = new bootstrap.Collapse(item, { toggle: false });
    // Manually toggle if a match is found
    item.onbeforematch = (_e) => collapse.toggle();

    item.addEventListener('show.bs.collapse', (_e) => {
      item.removeAttribute('hidden');
    });

    item.addEventListener('hidden.bs.collapse', (_e) => {
      item.hidden = 'until-found';
    });
  });
};

document.addEventListener('DOMContentLoaded', enableAccordionFind);
