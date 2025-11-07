const CLASS = 'js-collapsible-card-body';

function maybeToggleCard(target: HTMLElement, show: boolean) {
  if (!target.classList.contains(CLASS)) return;

  target
    .closest('.card')
    ?.querySelector<HTMLDivElement>('.collapsible-card-header')
    ?.classList.toggle('border-bottom-0', !show);
}

document.addEventListener('show.bs.collapse', (e) => {
  maybeToggleCard(e.target as HTMLElement, true);
});

document.addEventListener('hidden.bs.collapse', (e) => {
  maybeToggleCard(e.target as HTMLElement, false);
});
