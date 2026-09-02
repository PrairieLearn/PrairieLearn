export function moveCheckboxInstructions(questionBody: HTMLElement): void {
  const checkboxGroups = new Set<HTMLElement>();
  for (const checkbox of questionBody.querySelectorAll<HTMLInputElement>(
    'input[type="checkbox"]',
  )) {
    const group = checkbox.closest<HTMLElement>('fieldset, [role="group"]');
    if (group) checkboxGroups.add(group);
  }

  for (const group of checkboxGroups) {
    const children = [...group.children];
    const firstOption = children.find((child) => child.matches('.form-check'));
    const instructions = children.find(
      (child) =>
        !child.matches('.form-check') && child.querySelector('.form-text.text-muted') !== null,
    );
    if (!firstOption || !instructions) continue;

    instructions.classList.add('printing-checkbox-instructions');
    firstOption.before(instructions);
  }
}
