import { observe } from 'selector-observer';

function autosizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  const computed = getComputedStyle(textarea);
  const borderHeight =
    Number.parseFloat(computed.borderTopWidth) + Number.parseFloat(computed.borderBottomWidth);
  textarea.style.height = textarea.scrollHeight + borderHeight + 'px';
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      autosizeTextarea(entry.target as HTMLTextAreaElement);
    }
  });
});

observe('.js-textarea-autosize', {
  constructor: HTMLTextAreaElement,
  add(el) {
    autosizeTextarea(el);
    el.addEventListener('input', () => autosizeTextarea(el));

    // A textarea might not be immediately visible when the page loads. So when
    // that changes, we should recompute the height since it would have had
    // an initial height of 0.
    observer.observe(el);
  },
  remove(el) {
    observer.unobserve(el);
  },
});
