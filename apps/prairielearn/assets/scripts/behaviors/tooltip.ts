import { observe } from 'selector-observer';

observe('[data-toggle="tooltip"]', {
  add(el) {
    new window.bootstrap.Tooltip(el);
  },
  remove(el) {
    window.bootstrap.Tooltip.getInstance(el)?.dispose();
  },
});
