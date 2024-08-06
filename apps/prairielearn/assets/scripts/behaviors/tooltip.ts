import { observe } from 'selector-observer';

observe('[data-toggle="tooltip"]', {
  add(el) {
    $(el).tooltip();
  },
  remove(el) {
    $(el).tooltip('dispose');
  },
});
