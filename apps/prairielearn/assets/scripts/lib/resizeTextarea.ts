import { observe } from 'selector-observer';

function resizeTextarea(textarea: HTMLTextAreaElement) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      resizeTextarea(entry.target as HTMLTextAreaElement);
    }
  });
});

export function resizeTextArea() {
  observe('.js-textarea-autosize', {
    constructor: HTMLTextAreaElement,
    add(el) {
      resizeTextarea(el);
      el.addEventListener('input', () => resizeTextarea(el));

      // A textarea might not be immediately visible when the page loads. So when
      // that changes, we should recompute the height since it would have had
      // an initial height of 0.
      observer.observe(el);
    },
    remove(el) {
      observer.unobserve(el);
    },
  });
}
