document.addEventListener('show.bs.collapse', (e) => {
  if ((e.target as HTMLElement).classList.contains('js-collapsible-card-body')) {
    (e.target as HTMLElement)
      .closest('.card')
      ?.querySelector<HTMLDivElement>('.collapsible-card-header')
      ?.classList.remove('border-bottom-0');
  }
});

document.addEventListener('hidden.bs.collapse', (e) => {
  if ((e.target as HTMLElement).classList.contains('js-collapsible-card-body')) {
    (e.target as HTMLElement)
      .closest('.card')
      ?.querySelector<HTMLDivElement>('.collapsible-card-header')
      ?.classList.add('border-bottom-0');
  }
});
