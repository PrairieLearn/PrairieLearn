export function ResetQuestionVariantsModal({ csrfToken }: { csrfToken: string }) {
  return (
    <>
      <form>
        <div
          class="modal fade"
          tabindex={-1}
          role="dialog"
          id="resetQuestionVariantsModal"
          aria-labelledby="resetQuestionVariantsModal-title"
        >
          <div class="modal-dialog" role="document">
            <div class="modal-content">
              <div class="modal-header">
                <h2 class="modal-title h4" id="${titleId}">
                  Confirm reset question variants
                </h2>
              </div>
              <div class="modal-body">
                <p>
                  Are your sure you want to reset all current variants of this question?
                  <strong>All ungraded attempts will be lost.</strong>
                </p>
                <p>Students will receive a new variant the next time they view this question.</p>
              </div>
              <div class="modal-footer">
                <input type="hidden" name="__action" value="reset_question_variants" />
                <input type="hidden" name="__csrf_token" value="${resLocals.__csrf_token}" />
                <input
                  type="hidden"
                  name="unsafe_assessment_question_id"
                  class="js-assessment-question-id"
                  value=""
                />
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                  Cancel
                </button>
                <button type="submit" class="btn btn-danger">
                  Reset question variants
                </button>
              </div>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
