{ // Local Scope
const DOM_ELEM_SELECT_TAG_NAME = "select";
const DOM_EVENT_CLICK_NAME = "click";
const DOM_EVENT_CHANGE_NAME = "change";

/**
 * 
 * @param {HTMLElement} container_elem_ref `pl-matching` Element Container   
 * @returns {void}
 */
function updateMaxOptionsWarning(container_elem_ref) {
  const max = Number.parseInt(container_elem_ref.dataset.maxResponsePerOption, 10);
  const warning = document.getElementById(`${container_elem_ref.dataset.answersName}-max-options-warning`);
  if (!warning || Number.isNaN(max)) {
    return;
  };

  const counts = new Map();
  container_elem_ref.querySelectorAll(DOM_ELEM_SELECT_TAG_NAME).forEach((select) => {
    const value = select.value;
    if (value === "-1") return;
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  warning.hidden = Array.from(counts.values()).every((count) => count <= max);
}

/**
 * 
 * @param {HTMLElement} container_elem_ref `pl-matching` Element Container   
 * @returns {void}
 */
function initPlMatchingElem(container_elem_ref) {

  const name = container_elem_ref.attributes["data-answers-name"].value;

  container_elem_ref.querySelectorAll(DOM_ELEM_SELECT_TAG_NAME).forEach(
    (selet_elem_ref) => {
      selet_elem_ref.addEventListener(
        DOM_EVENT_CHANGE_NAME,
        () => {
          updateMaxOptionsWarning(container_elem_ref); 
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
        container_elem_ref.querySelectorAll(DOM_ELEM_SELECT_TAG_NAME).forEach(
          (selet_elem_ref) => {
            selet_elem_ref.selectedIndex = 0;
          }
        );
        updateMaxOptionsWarning(container_elem_ref);
      }
    );
  }
}

function initPlMatchingElems() {
  document.querySelectorAll(".pl-matching-container")
    .forEach(initPlMatchingElem);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPlMatchingElems);
} else {
  initPlMatchingElems();
}
}