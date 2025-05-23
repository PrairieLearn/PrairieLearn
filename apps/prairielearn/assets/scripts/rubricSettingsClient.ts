import qs from 'qs';
import { z } from 'zod';

import { onDocumentReady } from '@prairielearn/browser-utils';

import { RubricItemSchema, RubricSchema } from '../../src/lib/db-types.js';


const RubricDataSchema = RubricSchema.extend({
  rubric_items: z.array(
    RubricItemSchema.extend({
        order: z.number(),
    }).omit({
        deleted_at: true,
        id: true,
        key_binding: true,
        number: true,
        rubric_id: true
    })
  ),
}).omit({
    created_at: true,
    deleted_at: true,
    modified_at: true,
    id: true
})
type RubricData = z.infer<typeof RubricDataSchema>;

onDocumentReady(() => {
    const exportRubricButton = document.querySelector<HTMLButtonElement>('#export-rubric-button');
    const rubricSettingsForm = document.querySelector<HTMLFormElement>('#rubric-settings-form');

    if (!exportRubricButton || !rubricSettingsForm) {
        return;
    }

    // function addRubricItemRows(
    //     {data}: {data: RubricData}
    // ) {
    //     const modal = document.querySelector<HTMLDivElement>('#rubric-settings-form');
    //     if (!modal) {
    //         return;
    //     }

    //     const table = modal.querySelector<HTMLTableElement>('.js-rubric-items-table');
    //     if (!table) {
    //         return;
    //     }
    //     const rubricItems = data.rubric_items;
    //     if (!rubricItems) {
    //         return;
    //     }

    //     console.log()

    //     for (const rubricItem of rubricItems) {
    //         const next_id = Number(table.dataset.nextNewId ?? 0) + 1;

    //         // Create a new row based on the template element in the modal
    //         const templateRow = modal.querySelector<HTMLTemplateElement>('.js-new-row-rubric-item');
    //         const row = templateRow?.content.firstElementChild?.cloneNode(true);

    //         if (!row || !(row instanceof HTMLTableRowElement)) return;

    //         table?.querySelector<HTMLElement>('tbody')?.appendChild(row);

    //         const rubricItemRowOrder = row.querySelector<HTMLInputElement>('.js-rubric-item-row-order');
    //         if (rubricItemRowOrder) {
    //             rubricItemRowOrder.name = `rubric_item[new${next_id}][order]`;
    //             rubricItemRowOrder.value = `${rubricItem.order}`;
    //         }
    //         const rubricItemPoints = row.querySelector<HTMLInputElement>('.js-rubric-item-points');
    //         if (rubricItemPoints) {
    //             rubricItemPoints.name = `rubric_item[new${next_id}][points]`;
    //             rubricItemPoints.value = `${rubricItem.points}`;
    //         }
    //         const rubricItemDescription = row.querySelector<HTMLInputElement>('.js-rubric-item-description');
    //         if (rubricItemDescription) {
    //             rubricItemDescription.name = `rubric_item[new${next_id}][description]`;
    //             rubricItemDescription.value = rubricItem.description;
    //         }
    //         const rubricItemExplanation = row.querySelector<HTMLInputElement>('.js-rubric-item-explanation');
    //         if (rubricItemExplanation) {
    //             rubricItemExplanation.dataset.inputName = `rubric_item[new${next_id}][explanation]`;
    //             rubricItemExplanation.dataset.currentValue = rubricItem.explanation ?? '';
    //             rubricItemExplanation.appendChild(
    //                 document.createTextNode(rubricItem.explanation ?? '')
    //             );
    //         }
    //         const rubricItemGraderNote = row.querySelector<HTMLInputElement>('.js-rubric-item-grader-note');
    //         if (rubricItemGraderNote) {
    //             rubricItemGraderNote.dataset.inputName = `rubric_item[new${next_id}][grader_note]`;
    //             rubricItemGraderNote.dataset.currentValue = rubricItem.grader_note ?? '';
    //             rubricItemGraderNote.appendChild(
    //                 document.createTextNode(rubricItem.grader_note ?? '')
    //             );
    //         }
    //     }

    //     console.log('Rubric items', rubricItems);
    // }

    // importRubricButton.addEventListener('inserted.bs.popover', () => {
    //     const importRubricSettingsPopoverForm = document.querySelector<HTMLFormElement>('#import-rubric-settings-popover-form');

    //     if (!importRubricSettingsPopoverForm) {
    //         return;
    //     }

    //     importRubricSettingsPopoverForm.addEventListener('submit', (event) => {
    //         event.preventDefault();

    //         const data = event.target as HTMLFormElement;
    //         const formData = new FormData(data);

    //         const fileData = formData.get('file') as File;

    //         // Read the file content
    //         const reader = new FileReader();
    //         reader.readAsText(fileData);

    //         reader.onload = () => {
    //             const fileContent = reader.result;
    //             if (typeof fileContent !== 'string') {
    //                 alert('Error reading file content.');
    //                 return;
    //             }

    //             // Remove the existing table rows
    //             const table = rubricSettingsForm.querySelector<HTMLTableElement>('.table-responsive');
    //             const tableRows = table?.querySelectorAll<HTMLTableRowElement>('tbody tr:not(.js-no-rubric-item-note)');


    //             try {
    //                 const parsedData = RubricDataSchema.parse(JSON.parse(fileContent));

    //                 if (tableRows) {
    //                     tableRows.forEach((row) => {
    //                         row.remove();
    //                     })
    //                 }

    //                 addRubricItemRows({
    //                     data: RubricDataSchema.parse(parsedData),
    //                 })

    //                 // for (const [key, value] of Object.entries(parsedData)) {
    //                 //     const inputElement = rubricSettingsForm.querySelector<HTMLInputElement>(`[name="${key}"]`);
    //                 //     if (!inputElement) {
    //                 //         console.warn(`No input element found for key: ${key}`);
    //                 //         continue;
    //                 //     }
    //                 //     if (inputElement.type === 'checkbox') {
    //                 //         inputElement.checked = value === 'true';
    //                 //     }

    //                 //     if (inputElement.type === 'radio') {
    //                 //         inputElement.checked = inputElement.value === value;
    //                 //     }

    //                 //     inputElement.value = value as string;
    //                 // }
    //             } catch (error) {
    //                 alert('Error parsing JSON file: ' + error);
    //             }
    //         };
    //     });

    //     importRubricButton.addEventListener('hidden.bs.popover', () => {   
    //         console.log('Popover hidden');
    //         importRubricSettingsPopoverForm?.reset();
    //     }, {once: true});
    // })

    // uploadRubricFileButton.addEventListener('click', () => {
    //     // Retrieve the file from the input element
    //     const fileData = rubricFileInput?.files;
    //     if (!fileData || fileData.length === 0) {
    //         alert('Please select a file to upload.');
    //         return;
    //     }

    //     const file = fileData[0];
    //     const reader = new FileReader();
    //     reader.readAsText(file);

    //     reader.onload = () => {
    //         const fileContent = reader.result;
    //         if (typeof fileContent !== 'string') {
    //             alert('Error reading file content.');
    //             return;
    //         }

    //         try {
    //             const parsedData = JSON.parse(fileContent);
    //             console.log('Parsed JSON data:', parsedData);
    //         } catch (error) {
    //             alert('Error parsing JSON file: ' + error);
    //         }
    //     };
    // });

    exportRubricButton.addEventListener('click', () => {
        const rubricSettingsData = new FormData(rubricSettingsForm);
        const rubricSettings = Object.fromEntries(rubricSettingsData.entries()) as Record<string, any>;

        const exportFileName = `${rubricSettings.course_short_name.replaceAll(' ', '')}__${rubricSettings.course_instance_short_name.replaceAll(' ', '')}__${rubricSettings.assessment_tid.replaceAll(' ', '')}__${rubricSettings.question_qid.replaceAll(' ', '')}__rubric_settings.json`;

        const rubricData: RubricData = {
            max_extra_points: parseInt(rubricSettings['max_extra_points'] as string),
            min_points: parseInt(rubricSettings['min_points'] as string),
            replace_auto_points: rubricSettings['replace_auto_points'] === 'true',
            starting_points: parseInt(rubricSettings['starting_points'] as string),
            rubric_items: []
        };

        // Parse using qs, which allows deep objects to be created based on parameter names
        // e.g., the key `rubric_item[cur1][points]` converts to `rubric_item: { cur1: { points: ... } ... }`
        // Array parsing is disabled, as it has special cases for 22+ items that
        // we don't want to double-handle, so we always receive an object and
        // convert it to an array if necessary
        // (https://github.com/ljharb/qs#parsing-arrays).
        // The order of the items in arrays is never important, so using Object.values is fine.

        const rubricSettingsParsed = qs.parse(qs.stringify(rubricSettings), {parseArrays: false});
        const rubricItems = rubricSettingsParsed.rubric_item as Record<string, any>;

        for (const [key, value] of Object.entries(rubricItems)) {
            rubricData.rubric_items.push({
                always_show_to_students: value.always_show_to_students === 'true',
                description: value.description,
                explanation: value.explanation ?? (
                    document.querySelector<HTMLTextAreaElement>(`[data-input-name="rubric_item[${key}][explanation]"]`)?.getAttribute('data-current-value') ?? ''
                ),
                grader_note: value.grader_note ?? (
                    document.querySelector<HTMLTextAreaElement>(`[data-input-name="rubric_item[${key}][grader_note]"]`)?.getAttribute('data-current-value') ?? ''
                ),
                order: parseInt(value.order),
                points: parseInt(value.points),
            });
        }

        rubricData.rubric_items = rubricData.rubric_items.sort((a, b) => a.order - b.order);

        // Export the rubric settings as a JSON file
        const blob = new Blob([JSON.stringify(rubricData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');

        a.href = url;

        a.download = exportFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });
})