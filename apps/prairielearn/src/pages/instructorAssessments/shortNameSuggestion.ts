import { suggestShortName } from '../../lib/short-name.js';

export function setupShortNameSuggestion(
  titleInput: HTMLInputElement,
  shortNameInput: HTMLInputElement,
) {
  let shortNameEdited = false;

  shortNameInput.addEventListener('input', () => {
    shortNameEdited = true;
  });
  titleInput.addEventListener('input', () => {
    if (!shortNameEdited) {
      shortNameInput.value = suggestShortName(titleInput.value);
    }
  });
}
