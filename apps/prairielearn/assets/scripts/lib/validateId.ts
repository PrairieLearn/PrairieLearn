export function validateId({ input, otherIds }: { input: HTMLInputElement; otherIds: string[] }) {
  const newValue = input.value;

  if (otherIds.includes(newValue) && newValue !== input.defaultValue) {
    input.setCustomValidity('This ID is already in use');
  } else {
    input.setCustomValidity('');
  }

  input.reportValidity();
}
