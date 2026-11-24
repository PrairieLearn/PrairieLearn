export function printFormLabelBase(label: string): string {
  return label.replace(/[0-9]+$/, '');
}

function nextLetter(previous: string): string {
  const letters = previous.split('');
  for (let index = letters.length - 1; index >= 0; index--) {
    if (letters[index] !== 'Z') {
      letters[index] = String.fromCharCode(letters[index].charCodeAt(0) + 1);
      return letters.join('');
    }
    letters[index] = 'A';
  }
  return `A${letters.join('')}`;
}

export function nextPrintFormLabel(
  forms: { label: string; archived_at: Date | null }[],
  replacesLabel?: string,
): string {
  let base: string;
  if (replacesLabel) {
    base = printFormLabelBase(replacesLabel);
  } else {
    const activeBases = new Set(
      forms
        .filter((form) => form.archived_at === null)
        .map((form) => printFormLabelBase(form.label)),
    );
    base = 'A';
    while (activeBases.has(base)) base = nextLetter(base);
  }

  let latestVersion = 0;
  for (const form of forms) {
    if (printFormLabelBase(form.label) === base) {
      latestVersion = Math.max(latestVersion, Number(form.label.slice(base.length)) || 1);
    }
  }
  return `${base}${latestVersion + 1}`;
}
