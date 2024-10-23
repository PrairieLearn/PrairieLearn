import { on } from 'delegated-events';
import morphdom from 'morphdom';
import { z } from 'zod';

import { onDocumentReady, templateFromAttributes, decodeData } from '@prairielearn/browser-utils';

import { DeleteQuestionModal } from '../../src/pages/instructorAssessmentQuestions/deleteQuestionModal.html.js';
import { EditQuestionModal } from '../../src/pages/instructorAssessmentQuestions/editQuestionModal.html.js';
import { EditZoneModal } from '../../src/pages/instructorAssessmentQuestions/editZoneModal.html.js';
import {
  type AssessmentQuestionRow,
  AssessmentQuestionRowSchema,
  type AssessmentQuestionZone,
} from '../../src/pages/instructorAssessmentQuestions/instructorAssessmentQuestions.types.js';

import { EditAssessmentQuestionsTable } from './lib/editAssessmentQuestionsTable.js';
import { histmini } from './lib/histmini.js';

onDocumentReady(() => {
  $('#resetQuestionVariantsModal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });

  document.querySelectorAll<HTMLElement>('.js-histmini').forEach((element) => histmini(element));

  const enableEditButton = document.querySelector('.js-enable-edit-button') as HTMLElement;
  const editModeButtons = document.querySelector('.js-edit-mode-buttons') as HTMLElement;
  const assessmentQuestionsTable = document.querySelector(
    '.js-assessment-questions-table',
  ) as HTMLElement;
  const assessmentType = assessmentQuestionsTable.dataset.assessmentType ?? '';
  const urlPrefix = assessmentQuestionsTable.dataset.urlPrefix ?? '';
  const assessmentInstanceId = assessmentQuestionsTable.dataset.assessmentInstanceId ?? '';
  const questions = z
    .array(AssessmentQuestionRowSchema)
    .parse(decodeData('assessment-questions-data'));

  const zones: AssessmentQuestionZone[] = [];
  let showAdvanceScorePercCol = false;

  // The data is sent to the client as an array of questions. However, this can be
  // difficult to work with as there are many attributes for each question that would
  // need to be updated for each change. Here we are manipulating the data into a
  // tree structure that is easier to work with when rearranging questions. This
  // is also more similar to the underlying JSON that we will want to be updating.
  questions.forEach((question: AssessmentQuestionRow) => {
    if (question.assessment_question_advance_score_perc !== 0) showAdvanceScorePercCol = true;
    if (question.start_new_zone) {
      zones.push({
        title: question.zone_title,
        bestQuestions: question.zone_best_questions,
        maxPoints: question.zone_max_points,
        numberChoose: question.zone_number_choose,
        questions: [],
      });
    }
    if (question.alternative_group_size > 1) {
      if (question.number_in_alternative_group === 1) {
        zones[zones.length - 1].questions.push({
          ...question,
          alternatives: [],
          is_alternative_group: true,
        });
      }
      question.is_alternative_group = true;
      zones[zones.length - 1].questions[
        zones[zones.length - 1].questions.length - 1
      ].alternatives?.push(question);
    } else {
      question.is_alternative_group = false;
      zones[zones.length - 1].questions.push(question);
    }
  });

  /**
   * Refresh the DOM to reflect the underlying data.
   */
  function refreshTable() {
    morphdom(
      assessmentQuestionsTable as Node,
      EditAssessmentQuestionsTable({
        zones,
        assessmentType,
        showAdvanceScorePercCol,
      }).toString(),
    );
  }

  enableEditButton?.addEventListener('click', () => {
    enableEditButton.style.display = 'none';
    editModeButtons?.style.removeProperty('display');
    refreshTable();
  });

  /**
   * Refresh question numbers and alternative groups to account for reordering.
   */
  function renumberQuestions() {
    let questionNumber = 1;
    zones.forEach((zone: AssessmentQuestionZone) => {
      zone.questions.forEach((question) => {
        question.number = questionNumber.toString();
        question.alternative_group_number = questionNumber;
        if (question.is_alternative_group) {
          let alternativeNumber = 1;
          question.alternatives?.forEach((alternative) => {
            alternative.alternative_group_number = questionNumber;
            alternative.number_in_alternative_group = alternativeNumber;
            alternativeNumber += 1;
          });
        }
        questionNumber += 1;
      });
    });
  }

  /**
   * Swap two questions in the same zone.
   */
  function swapQuestions({
    zoneIndex,
    questionIndex,
    targetQuestionIndex,
  }: {
    zoneIndex: number;
    questionIndex: number;
    targetQuestionIndex: number;
  }) {
    const question = zones[zoneIndex].questions[questionIndex];
    zones[zoneIndex].questions[questionIndex] = zones[zoneIndex].questions[targetQuestionIndex];
    zones[zoneIndex].questions[targetQuestionIndex] = question;
    renumberQuestions();
    refreshTable();
  }

  on('click', '.js-zone-up-arrow-button', (e) => {
    const zoneIndex = parseInt((e.currentTarget as HTMLElement).dataset.zoneIndex ?? '0');
    if (zoneIndex === 0) return;
    const zone = zones[zoneIndex];
    zones[zoneIndex] = zones[zoneIndex - 1];
    zones[zoneIndex - 1] = zone;
    renumberQuestions();
    refreshTable();
  });

  on('click', '.js-zone-down-arrow-button', (e) => {
    const zoneIndex = parseInt((e.currentTarget as HTMLElement).dataset.zoneIndex ?? '0');
    if (zoneIndex === zones.length - 1) return;
    const zone = zones[zoneIndex];
    zones[zoneIndex] = zones[zoneIndex + 1];
    zones[zoneIndex + 1] = zone;
    renumberQuestions();
    refreshTable();
  });

  // This is called when the up arrow is clicked. Here we need to determine the position
  // of the question and if we need to move it in or out of an alternative group or if we need
  // to move it between zones.
  on('click', '.js-question-up-arrow-button', (e) => {
    const zoneIndex = parseInt((e.currentTarget as HTMLElement)?.dataset.zoneIndex ?? '0');
    const questionIndex = parseInt((e.currentTarget as HTMLElement)?.dataset.questionIndex ?? '0');
    const question = zones[zoneIndex].questions[questionIndex];
    const alternativeIndex = question.is_alternative_group
      ? (e.currentTarget as HTMLElement)?.dataset.alternativeIndex === 'group'
        ? 'group'
        : parseInt((e.currentTarget as HTMLElement)?.dataset.alternativeIndex ?? '0')
      : null;
    // If the question is the first question in the first zone, we return early as there is nowhere
    // for it to go.
    if (zoneIndex === 0 && questionIndex === 0 && alternativeIndex === null) {
      return;
    }
    // Determine if the question is in an alternative group.
    if (typeof alternativeIndex === 'number') {
      const alternatives = question.alternatives;
      if (!alternatives) return;
      // If the question is in an alternative group and the alternative is the first alternative
      // in the group, we need to move the question out of the group.
      if (alternativeIndex === 0) {
        zones[zoneIndex].questions.splice(
          questionIndex,
          0,
          alternatives.shift() ?? zones[zoneIndex].questions[0],
        );
        question.is_alternative_group = false;
        renumberQuestions();
        refreshTable();
        return;
        // else we need to swap the question with the question above it in the alternative group.
      } else {
        const question = alternatives[alternativeIndex];
        alternatives[alternativeIndex] = alternatives[alternativeIndex - 1];
        alternatives[alternativeIndex - 1] = question;
        renumberQuestions();
        refreshTable();
        return;
      }
    }
    // If the question is the first question in the zone, we need to shift it out of the current
    // zone and push it to the end of the previous zone.
    if (questionIndex === 0) {
      zones[zoneIndex - 1].questions.push(
        zones[zoneIndex].questions.shift() ?? zones[zoneIndex].questions[0],
      );
      refreshTable();
      return;
    }

    // If the question above is in an alternative group, we need to move the question into the
    // group.
    if (
      zones[zoneIndex].questions[questionIndex - 1].is_alternative_group &&
      alternativeIndex !== 'group'
    ) {
      question.is_alternative_group = true;
      zones[zoneIndex].questions[questionIndex - 1].alternatives?.push(question);
      zones[zoneIndex].questions.splice(questionIndex, 1);
      renumberQuestions();
      refreshTable();
      return;
    }

    // If a question is not the first in its zone and the question above is not in an
    // alternative group, we can simply swap it with the one above it.
    swapQuestions({
      zoneIndex,
      questionIndex,
      targetQuestionIndex: questionIndex - 1,
    });
    return;
  });

  // This is similar to the event listener above for the up arrow, but it is for the down arrow.
  on('click', '.js-question-down-arrow-button', (e) => {
    const zoneIndex = parseInt((e.currentTarget as HTMLElement).dataset.zoneIndex ?? '0');
    const questionIndex = parseInt((e.currentTarget as HTMLElement)?.dataset.questionIndex ?? '0');
    const question = zones[zoneIndex].questions[questionIndex];
    const alternativeIndex = zones[zoneIndex].questions[questionIndex].is_alternative_group
      ? (e.currentTarget as HTMLElement).dataset.alternativeIndex === 'group'
        ? 'group'
        : parseInt((e.currentTarget as HTMLElement).dataset.alternativeIndex ?? '0')
      : null;

    // If the question is the last question in the last zone, we return early as there is
    // snowhere for it to go.
    if (
      zoneIndex === zones.length - 1 &&
      questionIndex === zones[zoneIndex].questions.length - 1 &&
      alternativeIndex === null
    ) {
      return;
    }

    // Determine if the question is in an alternative group.
    if (typeof alternativeIndex === 'number') {
      const alternatives = zones[zoneIndex].questions[questionIndex].alternatives;
      if (!alternatives) return;
      // If the question is in an alternative group and the alternative is the last
      // alternative in the group, we need to move the question out of the group.
      if (alternativeIndex === alternatives.length - 1) {
        alternatives[alternativeIndex].is_alternative_group = false;
        zones[zoneIndex].questions.splice(
          questionIndex + 1,
          0,
          question.alternatives?.pop() ?? question,
        );
        renumberQuestions();
        refreshTable();
        return;
        // else we need to swap the question with the question below it in the
        // alternative group.
      } else {
        const question = alternatives[alternativeIndex];
        alternatives[alternativeIndex] = alternatives[alternativeIndex + 1];
        alternatives[alternativeIndex + 1] = question;
        renumberQuestions();
        refreshTable();
        return;
      }
    }

    // If the question is the last question in the zone, we need to move it to the
    // beginning of the next zone.
    if (questionIndex === zones[zoneIndex].questions.length - 1) {
      zones[zoneIndex + 1].questions.unshift(zones[zoneIndex].questions.pop() ?? question);
      refreshTable();
      return;
    }

    // If the question below is in an alternative group, we need to move the question
    // into the group.
    if (
      zones[zoneIndex].questions[questionIndex + 1].is_alternative_group &&
      alternativeIndex !== 'group'
    ) {
      question.is_alternative_group = true;
      zones[zoneIndex].questions[questionIndex + 1].alternatives?.unshift(
        zones[zoneIndex].questions[questionIndex],
      );
      zones[zoneIndex].questions.splice(questionIndex, 1);
      renumberQuestions();
      refreshTable();
      return;
    }

    // If a question is not the last in its zone and the question below is not in an
    // alternative group, we can simply swap it with the one below it.
    swapQuestions({
      zoneIndex,
      questionIndex,
      targetQuestionIndex: questionIndex + 1,
    });
    return;
  });

  // When the delete button is clicked, we need to populate the delete question modal
  // with the data from the question that is being deleted and then display that modal.
  on('click', '.js-delete-question-button', (e) => {
    const deleteButton = e.currentTarget as HTMLElement;
    const zoneIndex = parseInt(deleteButton?.dataset.zoneIndex ?? '0');
    const questionIndex = parseInt(deleteButton?.dataset.questionIndex ?? '0');
    const alternativeIndex = parseInt(deleteButton?.dataset.alternativeIndex ?? '0');
    $('#deleteQuestionModal').replaceWith(
      (document.createElement('div').innerHTML = DeleteQuestionModal({
        zoneIndex,
        questionIndex,
        alternativeIndex,
      }).toString()),
    );
    $('#deleteQuestionModal').modal('show');
  });

  // Delete the question when the confirm delete button in the modal is clicked.
  on('click', '.js-confirm-delete-button', (e) => {
    const confirmDeleteButton = e.currentTarget as HTMLElement;
    const zoneIndex = parseInt(confirmDeleteButton.dataset.zoneIndex ?? '0');
    const questionIndex = parseInt(
      (confirmDeleteButton as HTMLElement).dataset.questionIndex ?? '0',
    );
    const alternativeIndex =
      (confirmDeleteButton as HTMLElement).dataset.alternativeIndex === 'NaN'
        ? null
        : parseInt((confirmDeleteButton as HTMLElement).dataset.alternativeIndex ?? '0');
    if (alternativeIndex === null) {
      zones[zoneIndex].questions.splice(questionIndex, 1);
    } else {
      zones[zoneIndex].questions[questionIndex].alternatives?.splice(alternativeIndex, 1);
    }
    renumberQuestions();
    refreshTable();
  });

  // When the edit button is clicked, we need to open the edit question modal and populate
  // it with the data from the question that is being edited.
  on('click', '.js-edit-question-button', (e) => {
    const editButton = (e.target as HTMLElement).closest('button');
    const zoneIndex = parseInt(editButton?.dataset.zoneIndex ?? '0');
    const questionIndex = parseInt(editButton?.dataset.questionIndex ?? '0');
    const alternativeIndex = parseInt(editButton?.dataset.alternativeIndex ?? '0');
    const question = zones[zoneIndex].questions[questionIndex];
    const alternative = zones[zoneIndex].questions[questionIndex].alternatives?.[alternativeIndex];
    if (assessmentType === 'Exam') {
      question.points_list = zones[zoneIndex].questions[questionIndex].points_list?.map(
        (points: number) =>
          points - (zones[zoneIndex].questions[questionIndex].max_manual_points ?? 0),
      ) ?? [0];
    }
    $('#editQuestionModal').replaceWith(
      (document.createElement('div').innerHTML = EditQuestionModal({
        newQuestion: false,
        question: question.is_alternative_group ? alternative : question,
        zoneIndex,
        questionIndex,
        alternativeIndex,
        assessmentType,
      }).toString()),
    );
    $('#editQuestionModal').modal('show');
    enableGradingOptions(
      (document.getElementById('gradingMethod') as HTMLSelectElement)?.value ?? 'auto',
    );
    $('#editQuestionModal').modal('show');
  });

  // For a new question the update button is disabled until a qid is entered. Here we
  // are listening for input in the qid input field and enabling the button when there
  // is a value. This helps ensure that we do not have a blank question in our question list.
  on('input', '.js-qid-input', (e) => {
    const qidInput = e.target as HTMLInputElement;
    const updateQuestionButton = document.getElementById('updateQuestionButton');
    if (qidInput.value) {
      updateQuestionButton?.removeAttribute('disabled');
    } else {
      updateQuestionButton?.setAttribute('disabled', 'true');
    }
  });

  // Open the edit question modal when the add question button is clicked.
  on('click', '.js-add-question', (e) => {
    const addButton = (e.target as HTMLElement).closest('button');
    const zoneIndex = addButton?.dataset.zoneIndex ?? '0';
    const questionIndex = addButton?.dataset.questionIndex ?? '0';
    const alternativeIndex = (e.target as HTMLElement).dataset.alternativeIndex ?? '0';
    $('#editQuestionModal').replaceWith(
      (document.createElement('div').innerHTML = EditQuestionModal({
        newQuestion: true,
        zoneIndex: parseInt(zoneIndex),
        questionIndex: parseInt(questionIndex),
        alternativeIndex: parseInt(alternativeIndex),
        assessmentType,
      }).toString()),
    );
    $('#editQuestionModal').modal('show');
    enableGradingOptions('auto');
  });

  // Open the find qid modal when the find qid button is clicked. This new modal allows
  // the user to search for a question in the questions table and then return the qid to
  // the edit question modal.
  on('click', '.js-find-qid', async () => {
    $('#editQuestionModal').modal('hide');
    const currentQid = (document.querySelector('#qidInput') as HTMLInputElement).value;
    const response = await fetch(
      `${urlPrefix}/assessment/${assessmentInstanceId}/questions/findqid/?currentqid=${currentQid}`,
    );
    const findQidHtml = await response.text();
    $('#findQIDModal').replaceWith(
      (document.createElement('div').innerHTML = findQidHtml.toString()),
    );
    $('#findQIDModal').modal('show');
  });

  // Homework can be either auto graded or manually graded but not both so we do not want to
  // display all options at once. This function enables the correct grading options in the modal
  // based on the grading method selected.
  function enableGradingOptions(method: string) {
    if (method === 'auto') {
      document.querySelectorAll('.js-hw-auto-points').forEach((el) => {
        el.removeAttribute('hidden');
      });
      document.querySelectorAll('.js-hw-manual-points').forEach((el) => {
        el.setAttribute('hidden', 'true');
      });
    } else if (method === 'manual') {
      document.querySelectorAll('.js-hw-auto-points').forEach((el) => {
        el.setAttribute('hidden', 'true');
      });
      document.querySelectorAll('.js-hw-manual-points').forEach((el) => {
        el.removeAttribute('hidden');
      });
    }
  }

  on('change', '#gradingMethod', (e) => {
    const method = (e.target as HTMLSelectElement).value;
    enableGradingOptions(method);
  });

  // This is called when the update question button in the edit modal is clicked. It updates the
  // question in the zones array with the new data from the modal. Where and how we update the data
  // depends on if the question is new or not and if the question is in an alternative group or not.
  on('click', '#updateQuestionButton', async (e) => {
    const form = (e.target as HTMLFormElement).form;
    const formData = new FormData(form as HTMLFormElement);
    const questionData = Object.fromEntries(formData.entries());
    const zoneIndex = parseInt(questionData.zoneIndex.toString());
    const questionIndex = parseInt(questionData.questionIndex.toString());
    const alternativeIndex = parseInt(questionData.alternativeIndex.toString());
    const isAlternativeGroup = !!zones[zoneIndex]?.questions[questionIndex]?.is_alternative_group;
    if (isAlternativeGroup) {
      const alternatives = zones[zoneIndex].questions[questionIndex].alternatives;
      if (!alternatives) return;
      // if the question already exists, we need to update it.
      if (alternatives[alternativeIndex]) {
        alternatives[alternativeIndex].qid = questionData.qid.toString();
        alternatives[alternativeIndex].title = questionData.title.toString();
        alternatives[alternativeIndex].tags = JSON.parse(questionData.tags.toString());
        alternatives[alternativeIndex].topic = JSON.parse(questionData.topic.toString());
        alternatives[alternativeIndex].other_assessments = JSON.parse(
          questionData.otherAssessments.toString(),
        );

        // If the question does not exist, we need to create it.
      } else {
        alternatives[alternativeIndex] = {
          ...newQuestion,
          qid: questionData.qid.toString(),
          title: questionData.title.toString(),
          tags: JSON.parse(questionData.tags.toString()),
          topic: JSON.parse(questionData.topic.toString()),
          other_assessments: JSON.parse(questionData.otherAssessments.toString()),
          is_alternative_group: isAlternativeGroup,
          alternative_group_number: questionIndex + 1,
          number_in_alternative_group: alternativeIndex + 1,
          init_points: zones[zoneIndex].questions[questionIndex].init_points,
          points_list: zones[zoneIndex].questions[questionIndex].points_list,
          max_points: zones[zoneIndex].questions[questionIndex].max_points,
          max_auto_points: zones[zoneIndex].questions[questionIndex].max_auto_points,
          max_manual_points: zones[zoneIndex].questions[questionIndex].max_manual_points,
        };
      }
      // The question is not in an alternative group.
    } else {
      // If the question already exists, we need to update it.
      if (zones[zoneIndex].questions[questionIndex]) {
        zones[zoneIndex].questions[questionIndex].qid = questionData.qid as string;
        zones[zoneIndex].questions[questionIndex].title = questionData.title as string;
        zones[zoneIndex].questions[questionIndex].tags = JSON.parse(questionData.tags.toString());
        zones[zoneIndex].questions[questionIndex].topic = JSON.parse(questionData.topic.toString());
        zones[zoneIndex].questions[questionIndex].other_assessments = JSON.parse(
          questionData.otherAssessments.toString(),
        );
        zones[zoneIndex].questions[questionIndex].is_alternative_group = isAlternativeGroup;
        zones[zoneIndex].questions[questionIndex].alternative_group_number = questionIndex + 1;
        if (assessmentType === 'Exam') {
          zones[zoneIndex].questions[questionIndex].points_list = questionData.autoPoints
            .toString()
            .split(',')
            .map(
              (points: string) =>
                parseFloat(points) +
                parseInt(
                  questionData.manualPoints !== '' ? questionData.manualPoints.toString() : '0',
                ),
            );
          zones[zoneIndex].questions[questionIndex].max_manual_points = parseInt(
            questionData.manualPoints !== '' ? questionData.manualPoints.toString() : '0',
          );
        } else {
          if (questionData.gradingMethod === 'auto') {
            zones[zoneIndex].questions[questionIndex].init_points = parseFloat(
              questionData.autoPoints.toString(),
            );
            zones[zoneIndex].questions[questionIndex].max_auto_points = parseFloat(
              questionData.maxAutoPoints.toString(),
            );
            zones[zoneIndex].questions[questionIndex].tries_per_variant = parseFloat(
              questionData.triesPerVariant.toString(),
            );
            zones[zoneIndex].questions[questionIndex].max_manual_points = 0;
          } else {
            zones[zoneIndex].questions[questionIndex].init_points = 0;
            zones[zoneIndex].questions[questionIndex].max_auto_points = 0;
            zones[zoneIndex].questions[questionIndex].tries_per_variant = 0;
            zones[zoneIndex].questions[questionIndex].max_manual_points = parseInt(
              questionData.manualPoints.toString(),
            );
          }
        }
        // If the question does not exist, we need to create it.
      } else {
        zones[zoneIndex].questions[questionIndex] = {
          ...newQuestion,
          qid: questionData.qid.toString(),
          title: questionData.title.toString(),
          tags: JSON.parse(questionData.tags.toString()),
          topic: JSON.parse(questionData.topic.toString()),
          other_assessments: JSON.parse(questionData.otherAssessments.toString()),
          is_alternative_group: isAlternativeGroup,
          alternative_group_number: questionIndex + 1,
          init_points:
            assessmentType === 'Exam'
              ? 0
              : parseInt(questionData.autoPoints !== '' ? questionData.autoPoints.toString() : '0'),
          points_list:
            assessmentType === 'Exam'
              ? questionData.autoPoints
                  .toString()
                  .split(',')
                  .map(
                    (points: string) =>
                      parseFloat(points) +
                      parseInt(
                        questionData.manualPoints !== ''
                          ? questionData.manualPoints.toString()
                          : '0',
                      ),
                  )
              : [0],
          max_auto_points:
            assessmentType === 'Exam'
              ? 0
              : parseInt(
                  questionData.maxAutoPoints !== '' ? questionData.maxAutoPoints.toString() : '0',
                ),
          max_manual_points: parseInt(
            questionData.manualPoints !== '' ? questionData.manualPoints.toString() : '0',
          ),
          tries_per_variant: parseInt(
            questionData.triesPerVariant ? questionData.triesPerVariant.toString() : '0',
          ),
        };
      }
    }
    renumberQuestions();
    refreshTable();
  });

  // This is called when the find qid modal is closed. It will return the user to the edit
  // question modal and pass the qid to the qid input field.
  on('click', '#confirmFindQIDButton', () => {
    const foundQuestion = $('#questionsTable').bootstrapTable('getSelections')[0];
    const qidInput = document.getElementById('qidInput') as HTMLInputElement;
    const titleInput = document.getElementById('titleInput') as HTMLInputElement;
    const tagsInput = document.getElementById('tagsInput') as HTMLInputElement;
    const topicInput = document.getElementById('topicInput') as HTMLInputElement;
    const otherAssessmentsInput = document.getElementById(
      'otherAssessmentsInput',
    ) as HTMLInputElement;
    if (foundQuestion) {
      qidInput.value = foundQuestion.qid ?? '';
      titleInput.value = foundQuestion.title;
      tagsInput.value = JSON.stringify(foundQuestion.tags);
      topicInput.value = JSON.stringify(foundQuestion.topic);
      otherAssessmentsInput.value = JSON.stringify(foundQuestion.assessments);
      document.getElementById('updateQuestionButton')?.removeAttribute('disabled');
    }
    $('#editQuestionModal').modal('show');
  });

  // Opens the edit zone modal when the edit button is clicked.
  on('click', '.js-edit-zone-button', (e) => {
    const zoneIndex = parseInt((e.target as HTMLElement).dataset.zoneIndex ?? '0');
    $('#editZoneModal').replaceWith(
      (document.createElement('div').innerHTML = EditZoneModal({
        zone: zones[zoneIndex],
        newZone: false,
        zoneIndex,
      }).toString()),
    );
    $('#editZoneModal').modal('show');
  });

  // Opens the edit zone modal when the add zone button is clicked. Default values
  // for the new modal are blank.
  on('click', '.js-add-zone', () => {
    $('#editZoneModal').replaceWith(
      (document.createElement('div').innerHTML = EditZoneModal({
        zone: {},
        newZone: true,
        zoneIndex: zones.length,
      }).toString()),
    );
    $('#editZoneModal').modal('show');
  });

  // This is called when the update zone button in the edit modal is clicked. It updates
  // the zone in the zones array with the new data from the modal.
  on('click', '.js-confirm-edit-zone-button', (e) => {
    const form = (e.target as HTMLElement).closest('form');
    const formData = new FormData(form as HTMLFormElement);
    const zoneData = Object.fromEntries(formData.entries());
    const zoneIndex = parseInt(zoneData.zoneIndex.toString());
    if (zoneData.newZone === 'true') {
      zones.push({
        title: null,
        bestQuestions: null,
        maxPoints: null,
        numberChoose: null,
        questions: [],
      });
    }
    zones[zoneIndex].title = zoneData.zoneTitle === '' ? null : zoneData.zoneTitle.toString();
    zones[zoneIndex].bestQuestions =
      zoneData.bestQuestions === '' ? null : parseInt(zoneData.bestQuestions.toString());
    zones[zoneIndex].maxPoints =
      zoneData.maxPoints === '' ? null : parseInt(zoneData.maxPoints.toString());
    zones[zoneIndex].numberChoose =
      zoneData.numberChoose === '' ? null : parseInt(zoneData.numberChoose.toString());
    refreshTable();
  });

  // When the save and sync button at the top of the table is clicked, we need to update
  // the form with the new zones data and submit the form. We want to map the zones array
  // to a new array that has the editable fields in it, the way the JSON would look if we
  // were editing it manually.
  on('click', '.js-save-and-sync-button', () => {
    const form = document.getElementById('zonesForm') as HTMLFormElement;
    const zonesInput = form.querySelector('input[name="zones"]') as HTMLInputElement;
    const zoneMap = zones
      // We want to filter out any zones that do not have any questions in them.
      .filter((zone) => zone.questions.length > 0)
      // Then map the zones to a new array that has only the editable fields in it.
      .map((zone) => {
        if (zone.questions.length === 0) return;
        const resolvedZone = {
          questions: zone.questions.map((question) => {
            const questionData = {
              id: question.qid,
              alternatives: !question.is_alternative_group
                ? undefined
                : question.alternatives?.map((alternative) => {
                    return { id: alternative.qid };
                  }),
              autoPoints:
                assessmentType === 'Exam'
                  ? question.points_list?.map((points) =>
                      question.max_manual_points === null
                        ? points
                        : points - question.max_manual_points,
                    )
                  : question.init_points,
              manualPoints: question.max_manual_points ?? null,
              maxAutoPoints: assessmentType === 'Exam' ? 0 : question.max_auto_points,
              triesPerVariant:
                question.tries_per_variant === 1 || question.tries_per_variant === undefined
                  ? null
                  : question.tries_per_variant,
            };
            // We want to filter out any question attributes that do not have any values
            // and then add them to the zone questions array.
            return Object.fromEntries(
              Object.entries(questionData).filter(([_, value]) => value && value !== 0),
            );
          }),
          maxPoints: zone.maxPoints,
          numberChoose: zone.numberChoose,
          bestQuestions: zone.bestQuestions,
          title: zone.title,
        };
        // We want to filter out any zone attributes that do not have any values and
        // then add the zone to the map.
        return Object.fromEntries(
          Object.entries(resolvedZone).filter(([_, value]) => value !== null),
        );
      });
    zonesInput.value = JSON.stringify(zoneMap);
    form.submit();
  });
});

// Blank question template, used for adding new questions.
const newQuestion: AssessmentQuestionRow = {
  advance_score_perc: null,
  alternative_group_id: null,
  alternative_group_number_choose: null,
  alternative_group_number: null,
  alternative_group_size: 0,
  assessment_id: '0',
  assessment_question_advance_score_perc: null,
  average_average_submission_score: null,
  average_first_submission_score: null,
  average_last_submission_score: null,
  average_max_submission_score: null,
  average_number_submissions: null,
  average_submission_score_hist: null,
  average_submission_score_variance: null,
  deleted_at: null,
  discrimination: null,
  display_name: null,
  effective_advance_score_perc: null,
  first_submission_score_hist: null,
  first_submission_score_variance: null,
  force_max_points: null,
  grade_rate_minutes: null,
  id: '0',
  incremental_submission_points_array_averages: null,
  incremental_submission_points_array_variances: null,
  incremental_submission_score_array_averages: null,
  incremental_submission_score_array_variances: null,
  init_points: null,
  last_submission_score_hist: null,
  last_submission_score_variance: null,
  manual_rubric_id: null,
  max_auto_points: null,
  max_manual_points: null,
  max_points: null,
  max_submission_score_hist: null,
  max_submission_score_variance: null,
  mean_question_score: null,
  median_question_score: null,
  number_in_alternative_group: null,
  number_submissions_hist: null,
  number_submissions_variance: null,
  number: null,
  open_issue_count: null,
  other_assessments: null,
  points_list: null,
  qid: null,
  question_id: '0',
  question_score_variance: null,
  quintile_question_scores: null,
  some_nonzero_submission_perc: null,
  some_perfect_submission_perc: null,
  some_submission_perc: null,
  start_new_alternative_group: null,
  start_new_zone: null,
  submission_score_array_averages: null,
  submission_score_array_variances: null,
  sync_errors: null,
  sync_warnings: null,
  tags: null,
  title: null,
  topic: null,
  zone_best_questions: null,
  zone_has_best_questions: null,
  zone_has_max_points: null,
  zone_max_points: null,
  zone_number_choose: null,
  zone_number: null,
  zone_title: null,
};
