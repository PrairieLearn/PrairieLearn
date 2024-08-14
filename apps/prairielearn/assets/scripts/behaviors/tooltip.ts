import { observe } from 'selector-observer';

observe('[data-toggle="tooltip"]', {
  add(el) {
    // We continue to use the jQuery interface to ensure compatibility with Bootstrap 4.
    $(el).tooltip();
  },
  remove(el) {
    // We continue to use the jQuery interface to ensure compatibility with Bootstrap 4.
    $(el).tooltip('dispose');
  },
});
