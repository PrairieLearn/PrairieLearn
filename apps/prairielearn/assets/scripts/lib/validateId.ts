export function validateId({
  idField,
  otherIds,
}: {
  idField: HTMLInputElement;
  otherIds: string[];
}) {
  const newValue = idField.value;

  if (otherIds.includes(newValue) && newValue !== idField.defaultValue) {
    idField.setCustomValidity('This ID is already in use');
  } else {
    idField.setCustomValidity('');
  }

  idField.reportValidity();
}
