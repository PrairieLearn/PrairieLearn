import { onDocumentReady } from '@prairielearn/browser-utils';
import { html } from '@prairielearn/html';

onDocumentReady(() => {
  const enableEditButton = document.getElementById('enableEditButton');
  const saveEditButton = document.getElementById('saveEditButton');
  const tableHeaderRow = document.getElementById('tableHeaderRow');
  const tableDataRows = document.querySelectorAll('.tableDataRow');
  const updateAccessRuleButton = document.getElementById('updateAccessRuleButton');

  enableEditButton?.addEventListener('click', () => {
    enableEditButton.style.display = 'none';
    saveEditButton?.style.removeProperty('display');
    tableHeaderRow?.prepend(document.createElement('th'));
    tableHeaderRow?.prepend(document.createElement('th'));
    tableDataRows.forEach((row, i) => {
      let newTd = document.createElement('td');
      let newButton = newTd.appendChild(document.createElement('button'));
      newButton.classList.add('btn', 'btn-sm', 'btn-secondary');
      newButton.id = `editButton${i}`;
      newButton.innerHTML = html`<i class="fa fa-edit" aria-hidden="true"></i>`.toString();
      newButton.dataset.toggle = 'modal';
      newButton.dataset.target = '#editAccessRuleModal';
      row.prepend(newTd);

      newTd = document.createElement('td');
      const newTopDiv = newTd.appendChild(document.createElement('div'));
      newButton = document.createElement('button');
      newButton.classList.add('btn', 'btn-xs', 'btn-secondary');
      newButton.innerHTML = html`<i class="fa fa-arrow-up" aria-hidden="true"></i>`.toString();
      newTopDiv.appendChild(newButton);
      newTd.appendChild(newTopDiv);
      const newBottomDiv = newTd.appendChild(document.createElement('div'));
      newButton = document.createElement('button');
      newButton.classList.add('btn', 'btn-xs', 'btn-secondary');
      newButton.innerHTML = html`<i class="fa fa-arrow-down" aria-hidden="true"></i>`.toString();
      newBottomDiv.appendChild(newButton);
      row.prepend(newTd);
    });
  });

  updateAccessRuleButton?.addEventListener('click', (e) => {
    const rowNumber = (e.target as HTMLElement).dataset.rowNumber;
    console.log(rowNumber);
  });
});
