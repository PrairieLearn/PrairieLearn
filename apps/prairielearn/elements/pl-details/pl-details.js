/* global bootstrap */

// Modified from https://codepen.io/wdzajicek/pen/VYZawjX

const enableAccordionFind = () => {
  // Check browser support for the "beforematch" event
  // (only supported in Chrome and Firefox as of May 2025)
  if (!('onbeforematch' in document.body)) {
    return;
  }
  const accordions = [...document.querySelectorAll('.accordion-collapse.collapse')];
  accordions.forEach((item) => {
    const shouldStartExpanded = item.classList.contains('show');

    if (!shouldStartExpanded) {
      item.hidden = 'until-found';
    }

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
