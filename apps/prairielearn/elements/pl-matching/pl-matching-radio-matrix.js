{ // Local Scope
const DOM_EVENT_CLICK_NAME = "click";
const DOM_EVENT_CHANGE_NAME = "change";

/**
 * 
 * @param {HTMLElement} container_elem_ref `pl-matching` Element Container   
 * @returns {void}
 */
function updateRadioMatrixMaxOptionsWarning(container_elem_ref) {
  const max = Number.parseInt(container_elem_ref.dataset.maxResponsePerOption, 10);
  const warning = document.getElementById(`${container_elem_ref.dataset.answersName}-max-options-warning`);
  if (!warning || Number.isNaN(max)) return;
  const counts = new Map();
  container_elem_ref.querySelectorAll('input[type="radio"]:checked').forEach(
    (radio) => {
      counts.set(radio.value, (counts.get(radio.value) || 0) + 1);
    }
  );
  warning.hidden = Array.from(counts.values()).every((count) => count <= max);
}

/**
 * 
 * @param {HTMLElement} container_elem_ref `pl-matching` Element Container   
 * @returns {void}
 */
function initPlMatchingRadioMatrixElem(container_elem_ref) {
  const RADIO_INPUT_QUERY_STR = `input[type="radio"]`;

  const name = container_elem_ref.attributes["data-answers-name"].value;

  container_elem_ref.querySelectorAll(RADIO_INPUT_QUERY_STR).forEach(
    (radio_elem_ref) => {
      radio_elem_ref.addEventListener(
        DOM_EVENT_CHANGE_NAME,
        () => {
          updateRadioMatrixMaxOptionsWarning(container_elem_ref); 
        }
      )
    }
  );

  const reset_btn_id = `${name}-reset-btn`;

  const reset_btn_elem_ref = document.getElementById(reset_btn_id);

  if (reset_btn_elem_ref) {
    reset_btn_elem_ref.addEventListener(
      DOM_EVENT_CLICK_NAME,
      () => {
        container_elem_ref.querySelectorAll(RADIO_INPUT_QUERY_STR).forEach(
          (radio_elem_ref) => {
            radio_elem_ref.checked = false;
          }
        );
        updateRadioMatrixMaxOptionsWarning(container_elem_ref);
      }
    );
  }
}

function initPlMatchingRadioMatrixElems() {
  document.querySelectorAll(".pl-matching-radio-matrix-container")
    .forEach(initPlMatchingRadioMatrixElem);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlMatchingRadioMatrixElems);
} else {
  initPlMatchingRadioMatrixElems();
}
}