import { on } from 'delegated-events';
import morphdom from 'morphdom';

import { onDocumentReady, templateFromAttributes, decodeData } from '@prairielearn/browser-utils';

import { DeleteQuestionModal } from '../../src/pages/instructorAssessmentQuestions/deleteQuestionModal.html';
import { EditQuestionModal } from '../../src/pages/instructorAssessmentQuestions/editQuestionModal.html';

import { EditAssessmentQuestionsTable } from './lib/editAssessmentQuestionsTable';

onDocumentReady(() => {
  const enableEditButton = document.getElementById('enableEditButton');
  const editModeButtons = document.getElementById('editModeButtons');
  const assessmentQuestionsTable = document.querySelector('.js-assessment-questions-table');
  const assessmentType = (assessmentQuestionsTable as HTMLElement)?.dataset.assessmentType ?? '';
  const questions = decodeData('assessment-questions-data');

  const zones: any = [];
  let showAdvanceScorePercCol = false;
  questions.forEach((question) => {
    if (question.assessment_question_advance_score_perc !== 0) showAdvanceScorePercCol = true;
    if (question.start_new_zone) {
      const newZone = {
        title: question.zone_title,
        bestQuestions: question.zone_best_questions,
        maxPoints: question.zone_max_points,
        numberChoose: question.zone_number_choose,
        questions: [],
      };
      zones.push(newZone);
    }
    if (question.alternative_group_size > 1) {
      if (question.number_in_alternative_group === 1) {
        const newAlternativeGroup = {
          alternative_group_number: question.alternative_group_number,
          alternative_group_number_choose: question.alternative_group_number_choose,
          is_alternative_group: true,
          points: question.points_list,
          alternatives: [],
        };
        zones[zones.length - 1].questions.push(newAlternativeGroup);
      }
      question.is_alternative_group = true;
      zones[zones.length - 1].questions[
        zones[zones.length - 1].questions.length - 1
      ].alternatives.push(question);
    } else {
      question.is_alternative_group = false;
      zones[zones.length - 1].questions.push(question);
    }
  });

  console.log('questions: ', questions);
  console.log('zones: ', zones);

  $('#resetQuestionVariantsModal').on('show.bs.modal', (e) => {
    const button = (e as any).relatedTarget as HTMLElement;
    const modal = e.target as HTMLElement;

    templateFromAttributes(button, modal, {
      'data-assessment-question-id': '.js-assessment-question-id',
    });
  });

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
    // editMode = true;
    enableEditButton.style.display = 'none';
    editModeButtons?.style.removeProperty('display');
    refreshTable();
  });

  function renumberQuestions() {
    let questionNumber = 1;
    zones.forEach((zone) => {
      zone.questions.forEach((question) => {
        question.number = questionNumber;
        question.alternative_group_number = questionNumber;
        if (question.is_alternative_group) {
          let alternativeNumber = 1;
          question.alternatives.forEach((alternative) => {
            alternative.alternative_group_number = questionNumber;
            alternative.number_in_alternative_group = alternativeNumber;
            alternativeNumber += 1;
          });
        }
        questionNumber += 1;
      });
    });
  }

  function swapQuestions(zoneNumber: number, questionNumber: number, targetQuestionNumber: number) {
    const question = zones[zoneNumber].questions[questionNumber];
    zones[zoneNumber].questions[questionNumber] = zones[zoneNumber].questions[targetQuestionNumber];
    zones[zoneNumber].questions[targetQuestionNumber] = question;
    renumberQuestions();
    refreshTable();
  }

  on('click', '.zone-up-arrow-button', (e) => {
    const zoneNumber = parseInt(
      (e.target as HTMLElement).closest('button')?.dataset.zoneNumber ?? '0',
    );
    if (zoneNumber === 0) return;
    const zone = zones[zoneNumber];
    zones[zoneNumber] = zones[zoneNumber - 1];
    zones[zoneNumber - 1] = zone;
    renumberQuestions();
    refreshTable();
  });

  on('click', '.zone-down-arrow-button', (e) => {
    const zoneNumber = parseInt(
      (e.target as HTMLElement).closest('button')?.dataset.zoneNumber ?? '0',
    );
    if (zoneNumber === zones.length - 1) return;
    const zone = zones[zoneNumber];
    zones[zoneNumber] = zones[zoneNumber + 1];
    zones[zoneNumber + 1] = zone;
    renumberQuestions();
    refreshTable();
  });

  on('click', '.question-up-arrow-button', (e) => {
    console.log(
      'altNumber',
      (e.target as HTMLElement).closest('button')?.dataset.alternativeNumber,
    );
    const zoneNumber = parseInt(
      (e.target as HTMLElement).closest('button')?.dataset.zoneNumber ?? '0',
    );
    const questionNumber = parseInt(
      (e.target as HTMLElement).closest('button')?.dataset.questionNumber ?? '0',
    );
    const alternativeNumber = zones[zoneNumber].questions[questionNumber].is_alternative_group
      ? (e.target as HTMLElement).closest('button')?.dataset.alternativeNumber === 'group'
        ? 'group'
        : parseInt((e.target as HTMLElement).closest('button')?.dataset.alternativeNumber ?? '0')
      : null;
    if (zoneNumber === 0 && questionNumber === 0 && alternativeNumber === null) {
      return;
    }
    // if question to be moved is in an alternative group
    if (typeof alternativeNumber === 'number') {
      // if the question is the first in an alternative group
      if (alternativeNumber === 0) {
        // move the question above the alternative group
        zones[zoneNumber].questions.splice(
          questionNumber,
          0,
          zones[zoneNumber].questions[questionNumber].alternatives.shift(),
        );
        zones[zoneNumber].questions[questionNumber].is_alternative_group = false;
        renumberQuestions();
        refreshTable();
        return;
      } else {
        // swap the question with the one above
        const question =
          zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber];
        zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber] =
          zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber - 1];
        zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber - 1] = question;
        renumberQuestions();
        refreshTable();
        return;
      }
    }
    // if the question is the first in a zone
    if (questionNumber === 0) {
      zones[zoneNumber - 1].questions.push(zones[zoneNumber].questions.shift());
      refreshTable();
      return;
    }

    // if an alternative group is above the question
    if (
      zones[zoneNumber].questions[questionNumber - 1].is_alternative_group &&
      alternativeNumber !== 'group'
    ) {
      // add the question to the alternative group and remove it from the zone
      zones[zoneNumber].questions[questionNumber].is_alternative_group = true;
      zones[zoneNumber].questions[questionNumber - 1].alternatives.push(
        zones[zoneNumber].questions[questionNumber],
      );
      zones[zoneNumber].questions.splice(questionNumber, 1);
      renumberQuestions();
      refreshTable();
      return;
    }

    swapQuestions(zoneNumber, questionNumber, questionNumber - 1);
    return;
  });

  on('click', '.question-down-arrow-button', (e) => {
    const zoneNumber = parseInt(
      (e.target as HTMLElement).closest('button')?.dataset.zoneNumber ?? '0',
    );
    const questionNumber = parseInt(
      (e.target as HTMLElement).closest('button')?.dataset.questionNumber ?? '0',
    );
    const alternativeNumber = zones[zoneNumber].questions[questionNumber].is_alternative_group
      ? (e.target as HTMLElement).closest('button')?.dataset.alternativeNumber === 'group'
        ? 'group'
        : parseInt((e.target as HTMLElement).closest('button')?.dataset.alternativeNumber ?? '0')
      : null;
    if (
      zoneNumber === zones.length - 1 &&
      questionNumber === zones[zoneNumber].questions.length - 1 &&
      alternativeNumber === null
    ) {
      console.log('canceled');
      return;
    }
    // if question to be moved is in an alternative group
    if (typeof alternativeNumber === 'number') {
      // if the question is the last in an alternative group
      if (
        alternativeNumber ===
        zones[zoneNumber].questions[questionNumber].alternatives.length - 1
      ) {
        // move the question below the alternative group
        zones[zoneNumber].questions[questionNumber].alternatives[
          alternativeNumber
        ].is_alternative_group = false;
        zones[zoneNumber].questions.splice(
          questionNumber + 1,
          0,
          zones[zoneNumber].questions[questionNumber].alternatives.pop(),
        );
        renumberQuestions();
        refreshTable();
        return;
      } else {
        // swap the question with the one below it
        const question =
          zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber];
        zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber] =
          zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber + 1];
        zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber + 1] = question;
        renumberQuestions();
        refreshTable();
        return;
      }
    }
    // if the question is the last in a zone
    if (questionNumber === zones[zoneNumber].questions.length - 1) {
      zones[zoneNumber + 1].questions.unshift(zones[zoneNumber].questions.pop());
      refreshTable();
      return;
    }

    // if an alternative group is below the question
    if (
      zones[zoneNumber].questions[questionNumber + 1].is_alternative_group &&
      alternativeNumber !== 'group'
    ) {
      // add the question to the alternative group and remove it from the zone
      zones[zoneNumber].questions[questionNumber].is_alternative_group = true;
      zones[zoneNumber].questions[questionNumber + 1].alternatives.unshift(
        zones[zoneNumber].questions[questionNumber],
      );
      zones[zoneNumber].questions.splice(questionNumber, 1);
      renumberQuestions();
      refreshTable();
      return;
    }

    swapQuestions(zoneNumber, questionNumber, questionNumber + 1);
    return;
  });

  on('click', '.deleteQuestionButton', (e) => {
    const deleteButton = (e.target as HTMLElement).closest('button');
    const zoneNumber = parseInt(deleteButton?.dataset.zoneNumber ?? '0');
    const questionNumber = parseInt(deleteButton?.dataset.questionNumber ?? '0');
    const alternativeNumber = parseInt(deleteButton?.dataset.alternativeNumber ?? '0');
    $('#deleteQuestionModal').replaceWith(
      (document.createElement('div').innerHTML = DeleteQuestionModal({
        zoneNumber,
        questionNumber,
        alternativeNumber,
      }).toString()),
    );
    $('#deleteQuestionModal').modal('show');
  });

  on('click', '#confirmDeleteButton', () => {
    const confirmDeleteButton = document.getElementById('confirmDeleteButton');
    const zoneNumber = parseInt((confirmDeleteButton as HTMLElement).dataset.zoneNumber ?? '0');
    const questionNumber = parseInt(
      (confirmDeleteButton as HTMLElement).dataset.questionNumber ?? '0',
    );
    const alternativeNumber =
      (confirmDeleteButton as HTMLElement).dataset.alternativeNumber === 'NaN'
        ? null
        : parseInt((confirmDeleteButton as HTMLElement).dataset.alternativeNumber ?? '0');
    console.log(
      'zoneNumber: ',
      zoneNumber,
      'questionNumber: ',
      questionNumber,
      'alternativeNumber: ',
      alternativeNumber,
    );
    if (alternativeNumber === null) {
      zones[zoneNumber].questions.splice(questionNumber, 1);
    } else {
      zones[zoneNumber].questions[questionNumber].alternatives.splice(alternativeNumber, 1);
    }
    renumberQuestions();
    refreshTable();
  });

  on('click', '.editButton', (e) => {
    console.log(e);
    const editButton = (e.target as HTMLElement).closest('button');
    const zoneNumber = parseInt(editButton?.dataset.zoneNumber ?? '0');
    const questionNumber = parseInt(editButton?.dataset.questionNumber ?? '0');
    const alternativeNumber = parseInt(editButton?.dataset.alternativeNumber ?? '0');
    console.log(
      zones[zoneNumber].questions[questionNumber].is_alternative_group
        ? zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber]
        : zones[zoneNumber].questions[questionNumber],
    );
    $('#editQuestionModal').replaceWith(
      (document.createElement('div').innerHTML = EditQuestionModal({
        newQuestion: false,
        question: zones[zoneNumber].questions[questionNumber].is_alternative_group
          ? zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber]
          : zones[zoneNumber].questions[questionNumber],
      }).toString()),
    );
    $('#editQuestionModal').modal('show');
  });

  on('click', '.addQuestion', (e) => {
    $('#editQuestionModal').replaceWith(
      (document.createElement('div').innerHTML = EditQuestionModal({
        newQuestion: true,
      }).toString()),
    );
    $('#editQuestionModal').modal('show');
  });

  on('click', '#findQid', (e) => {
    $('#editQuestionModal').modal('hide');
    $('#findQidModal').modal('show');
  });
});
