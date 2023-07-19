const BOOTSTRAP_LEGACY_ATTRIBUTES = ['toggle', 'target', 'html', 'placement', 'content', 'trigger'];

$(() => {
  console.log('application javascript');
  BOOTSTRAP_LEGACY_ATTRIBUTES.forEach((attr) => {
    $(`[data-${attr}]`).each((i, el) => {
      el.setAttribute(`data-bs-${attr}`, el.dataset[attr]);
    });
  });
});
