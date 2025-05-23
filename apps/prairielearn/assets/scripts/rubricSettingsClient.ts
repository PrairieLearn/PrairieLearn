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

    exportRubricButton.addEventListener('click', () => {
        const rubricSettingsData = new FormData(rubricSettingsForm);
        const rubricSettings = Object.fromEntries(rubricSettingsData.entries()) as Record<string, any>;

        const exportFileName = `${rubricSettings.course_short_name.replaceAll(' ', '')}__${rubricSettings.course_instance_short_name.replaceAll(' ', '')}__${rubricSettings.assessment_tid.replaceAll(' ', '')}__${rubricSettings.question_qid.replaceAll(' ', '')}__rubric_settings.json`;

        const rubricData: RubricData = RubricDataSchema.parse({
            max_extra_points: parseInt(rubricSettings['max_extra_points'] as string),
            min_points: parseInt(rubricSettings['min_points'] as string),
            replace_auto_points: rubricSettings['replace_auto_points'] === 'true',
            starting_points: parseInt(rubricSettings['starting_points'] as string),
            rubric_items: []
        });

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