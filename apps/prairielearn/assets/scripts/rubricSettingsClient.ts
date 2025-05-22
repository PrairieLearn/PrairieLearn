import { Popover } from 'bootstrap';
import qs from 'qs';

import { onDocumentReady } from '@prairielearn/browser-utils';

const excludedKeys = [
    'modified_at',
    'course_short_name',
    'course_instance_short_name',
    'assessment_tid',
    'question_qid',
];

onDocumentReady(() => {
    const rubricFileInput = document.querySelector<HTMLInputElement>('#rubric-file-input');
    const uploadRubricFileButton = document.querySelector<HTMLButtonElement>('#upload-rubric-file-button');

    const exportRubricButton = document.querySelector<HTMLButtonElement>('#export-rubric-button');
    const rubricSettingsForm = document.querySelector<HTMLFormElement>('#rubric-settings-form');

    const importRubricButton = document.querySelector<HTMLButtonElement>('#import-rubric-button');
    const importRubricSettingsPopover = document.querySelector<HTMLDivElement>('#import-rubric-settings-popover');

    if (!uploadRubricFileButton || !rubricFileInput || !exportRubricButton || !rubricSettingsForm || !importRubricSettingsPopover || !importRubricButton) {
        return;
    }

    new Popover(importRubricButton, {
        html: true,
        content: () => importRubricSettingsPopover.innerHTML,
        placement: 'auto',
        trigger: 'focus'
    });

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
        const rubricSettings: Record<string, any> = {};

        const rubricSettingsData = new FormData(rubricSettingsForm);
        rubricSettingsData.forEach((value, key) => {
            if (!key.startsWith('__')) {
                rubricSettings[key] = value;
            }
        });

        const exportFileName = `${rubricSettings.course_short_name.replaceAll(' ', '')}__${rubricSettings.course_instance_short_name.replaceAll(' ', '')}__${rubricSettings.assessment_tid.replaceAll(' ', '')}__${rubricSettings.question_qid.replaceAll(' ', '')}__rubric_settings.json`;

        for (const key of excludedKeys) {
            delete rubricSettings[key];
        }

        // Parse using qs, which allows deep objects to be created based on parameter names
        // e.g., the key `rubric_item[cur1][points]` converts to `rubric_item: { cur1: { points: ... } ... }`
        // Array parsing is disabled, as it has special cases for 22+ items that
        // we don't want to double-handle, so we always receive an object and
        // convert it to an array if necessary
        // (https://github.com/ljharb/qs#parsing-arrays).
        // The order of the items in arrays is never important, so using Object.values is fine.
        const rubricSettingsParsed = qs.parse(qs.stringify(rubricSettings), {parseArrays: false});

        // Export the rubric settings as a JSON file
        const blob = new Blob([JSON.stringify(rubricSettingsParsed, null, 2)], { type: 'application/json' });
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