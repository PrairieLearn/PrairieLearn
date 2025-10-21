/* global TomSelect, MathJax */

window.PLMultipleChoice = function (uuid) {
  const selectElement = document.getElementById('pl-multiple-choice-select-' + uuid);
  const container = selectElement.closest('.pl-multiple-choice-dropdown');

  const select = new TomSelect(selectElement, {
    plugins: ['no_backspace_delete', 'dropdown_input'],
    allowEmptyOption: true,

    // Append dropdown to body to prevent overflow clipping by parent containers
    dropdownParent: 'body',

    // Search based on the `content` field, which comes from the `data-content`
    // attribute on each option.
    searchField: ['content'],

    // Ensure searches happen immediately.
    refreshThrottle: 0,

    // Mirror default `<select>` behavior, only open on Down/Enter/Space.
    openOnFocus: false,

    // Render items based on the `data-content` attribute.
    render: {
      option: (data) => {
        return `<div>${data.content}</div>`;
      },
      item: (data) => {
        return `<div class="${data.disabled ? 'text-muted' : ''}">${data.content}</div>`;
      },
    },

    onDropdownOpen: (dropdown) => {
      // Ensure the height of the dropdown is constrained to the viewport.
      const content = dropdown.querySelector('.ts-dropdown-content');
      content.style.maxHeight = `${window.innerHeight - content.getBoundingClientRect().top}px`;

      // The first time the dropdown is opened, this event is fired before the
      // options are actually present in the DOM. We'll wait for the next tick
      // to ensure that the options are present.
      setTimeout(() => MathJax.typesetPromise([dropdown]), 0);
    },

    onDropdownClose: () => {
      // In case the dropdown items contain math, render it when the
      // dropdown is opened or closed.
      MathJax.typesetPromise([container]);
    },
  });

  // Reposition the dropdown when the main container is scrolled.
  selectElement
    .closest('.app-main-container')
    .addEventListener('scroll', () => select.positionDropdown());

  // By default, `tom-select` will set the placeholder as the "active" option,
  // but this means that the active option can't be changed with the up/down keys
  // immediately after opening the dropdown. We'll override this function to
  // ensure that a non-disabled option is always set as the active one.
  const originalSetActiveOption = select.setActiveOption.bind(select);
  select.setActiveOption = (option, scroll = true) => {
    if (option?.getAttribute('aria-disabled') === 'true') {
      option = select.wrapper.querySelector('[data-selectable]');
    }

    originalSetActiveOption(option, scroll);
  };

  // Mirror native `<select>` behavior, open the dropdown on Space or Enter.
  select.control.addEventListener('keydown', (event) => {
    if (event.key === ' ' || event.key === 'Enter') {
      select.open();
      event.preventDefault();
    }
  });

  // Because we set `openOnFocus: false`, we need to manually open the dropdown
  // when the control is clicked.
  select.control.addEventListener('click', () => select.open());
};
