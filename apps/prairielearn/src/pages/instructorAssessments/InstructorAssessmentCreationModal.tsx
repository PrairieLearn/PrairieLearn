import ModalOriginal from 'react-bootstrap/cjs/Modal.js';
import ModalBodyOriginal from 'react-bootstrap/cjs/ModalBody.js';
import ModalFooterOriginal from 'react-bootstrap/cjs/ModalFooter.js';
import ModalHeaderOriginal from 'react-bootstrap/cjs/ModalHeader.js';
import ModalTitleOriginal from 'react-bootstrap/cjs/ModalTitle.js';

import type { AssessmentModule, AssessmentSet } from '../../lib/db-types.js';

const ModalHeader = ModalHeaderOriginal as unknown as typeof ModalHeaderOriginal.default;
const ModalTitle = ModalTitleOriginal as unknown as typeof ModalTitleOriginal.default;
const ModalBody = ModalBodyOriginal as unknown as typeof ModalBodyOriginal.default;
const ModalFooter = ModalFooterOriginal as unknown as typeof ModalFooterOriginal.default;
const Modal = ModalOriginal as unknown as typeof ModalOriginal.default;

// TODO tomorrow: figure out why the CJS and ESM hooks implementations aren't sharing state.
// This should be easy to reproduce in isolation with a Node project: run ESM, have it import
// the CJS version of `react-bootstrap`, try to `preact-render-to-string` it, it should error.
// Report a bug with the reproduction, details, and a potential fix.
export function InstructorAssessmentCreationModal({
  open,
  csrfToken,
  urlPrefix,
  assessmentSets,
  assessmentModules,
  assessmentsGroupBy,
}: {
  open: boolean;
  csrfToken: string;
  urlPrefix: string;
  assessmentSets: AssessmentSet[];
  assessmentModules: AssessmentModule[];
  assessmentsGroupBy: 'Set' | 'Module';
}) {
  return (
    <Modal open={open}>
      <ModalHeader closeButton>
        <ModalTitle as="h2" className="h4">
          Add assessment
        </ModalTitle>
      </ModalHeader>
      <form method="POST" autocomplete="off">
        <ModalBody>
          <div class="form-group">
            <label for="title">Title</label>
            <input
              type="text"
              class="form-control"
              id="title"
              name="title"
              required
              aria-describedby="title_help"
            />
            <small id="title_help" class="form-text text-muted">
              The full name of the assessment, visible to users.
            </small>
          </div>
          <div class="form-group">
            <label for="aid">Assessment identifier (AID)</label>
            <input
              type="text"
              class="form-control"
              id="aid"
              name="aid"
              required
              pattern="[\\-A-Za-z0-9_\\/]+"
              aria-describedby="aid_help"
            />
            <small id="aid_help" class="form-text text-muted">
              A short unique identifier for this assessment, such as "exam1-functions" or
              "hw2-derivatives". Use only letters, numbers, dashes, and underscores, with no spaces.
            </small>
          </div>
          <div class="form-group">
            <label for="type">Type</label>
            <select class="form-select" id="type" name="type" aria-describedby="type_help" required>
              <option value="Homework">Homework</option>
              <option value="Exam">Exam</option>
            </select>
            <small id="type_help" class="form-text text-muted">
              The type of the assessment. This can be either Homework or Exam.
            </small>
          </div>
          <div class="form-group">
            <label for="set">Set</label>
            <select class="form-select" id="set" name="set" aria-describedby="set_help" required>
              {assessmentSets.map((set) => (
                <option key={set.id} value={set.name}>
                  {set.name}
                </option>
              ))}
            </select>
            <small id="set_help" class="form-text text-muted">
              The <a href={`${urlPrefix}/course_admin/sets`}>assessment set</a> this assessment
              belongs to.
            </small>
          </div>
          {assessmentsGroupBy === 'Module' ? (
            <div class="form-group">
              <label for="module">Module</label>
              <select
                class="form-select"
                id="module"
                name="module"
                aria-describedby="module_help"
                required
              >
                {assessmentModules.map((module) => (
                  <option key={module.id} value={module.name}>
                    {module.name}
                  </option>
                ))}
              </select>
              <small id="module_help" class="form-text text-muted">
                The <a href={`${urlPrefix}/course_admin/modules`}>module</a> this assessment belongs
                to.
              </small>
            </div>
          ) : null}
        </ModalBody>
        <ModalFooter>
          <input type="hidden" name="__action" value="add_assessment" />
          <input type="hidden" name="__csrf_token" value={csrfToken} />
          <button type="button" class="btn btn-secondary" data-dismiss="modal">
            Cancel
          </button>
          <button type="submit" class="btn btn-primary">
            Create
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
