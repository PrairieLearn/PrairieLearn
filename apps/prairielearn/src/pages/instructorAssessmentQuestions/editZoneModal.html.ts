import { html } from '@prairielearn/html';

import { Modal } from '../../components/Modal.html.js';

export function EditZoneModal({
  zone,
  newZone,
  zoneIndex,
}: {
  zone: Record<string, any>;
  newZone: boolean;
  zoneIndex: number;
}) {
  return Modal({
    id: 'editZoneModal',
    title: newZone ? 'Add Zone' : 'Edit Zone',
    body: html`<input type="hidden" name="zoneIndex" id="zoneIndexInput" value="${zoneIndex}" />
      <input type="hidden" name="newZone" id="newZoneInput" value="${newZone}" />
      <div class="form-group">
        <label for="title">Title</label>
        <div class="input-group">
          <input
            type="text"
            class="form-control"
            id="zoneTitleInput"
            name="zoneTitle"
            aria-describedby="zoneTitleHelp"
            value="${zone?.title}"
          />
        </div>
        <small id="zoneNameHelp" class="form-text text-muted"> The name of the zone. </small>
      </div>
      <div class="form-group">
        <label for="bestQuestions">Best Questions</label>
        <div class="input-group">
          <input
            type="number"
            class="form-control"
            id="bestQuestionsInput"
            name="bestQuestions"
            aria-describedby="bestQuestionsHelp"
            value="${zone?.bestQuestions}"
          />
        </div>
        <small id="bestQuestionsHelp" class="form-text text-muted">
          Number of questions with the highest number of awarded points will count towards the
          total. Leave blank to allow points from all questions.
        </small>
      </div>
      <div class="form-group">
        <label for="numberChoose">Number Choose</label>
        <div class="input-group">
          <input
            type="number"
            class="form-control"
            id="numberChooseInput"
            name="numberChoose"
            aria-describedby="numberChooseHelp"
            value="${zone?.numberChoose}"
          />
        </div>
        <small id="bestQuestionsHelp" class="form-text text-muted">
          Number of questions the student can choose from. Leave blank for all questions.
        </small>
      </div>
      <div class="form-group">
        <label for="maxPoints">Max Points</label>
        <div class="input-group">
          <input
            type="number"
            class="form-control"
            id="maxPointsInput"
            name="maxPoints"
            aria-describedby="maxPointsHelp"
            value="${zone?.maxPoints}"
          />
        </div>
        <small id="bestQuestionsHelp" class="form-text text-muted">
          Number of questions the student can choose from. Leave blank for all questions.
        </small>
      </div> `,
    footer: html`
      <button type="button" class="btn btn-primary" id="confirmEditZoneButton" data-dismiss="modal">
        ${newZone ? 'Add Zone' : 'Update Zone'}
      </button>
      <button type="button" class="btn btn-secondary" data-dismiss="modal">Cancel</button>
    `,
  });
}
