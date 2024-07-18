import { on } from 'delegated-events';
import morphdom from 'morphdom';

import { onDocumentReady, templateFromAttributes, decodeData } from '@prairielearn/browser-utils';

import { DeleteQuestionModal } from '../../src/pages/instructorAssessmentQuestions/deleteQuestionModal.html.js';
import { EditQuestionModal } from '../../src/pages/instructorAssessmentQuestions/editQuestionModal.html.js';
import { EditZoneModal } from '../../src/pages/instructorAssessmentQuestions/editZoneModal.html.js';
import {
  AssessmentQuestionRow,
  AssessmentQuestionZone,
} from '../../src/pages/instructorAssessmentQuestions/instructorAssessmentQuestions.types.js';

import { EditAssessmentQuestionsTable } from './lib/editAssessmentQuestionsTable.js';
-onDocumentReady(() => {
  const enableEditButton = document.getElementById('enableEditButton');
  const editModeButtons = document.getElementById('editModeButtons');
  const assessmentQuestionsTable = document.querySelector('.js-assessment-questions-table');
  const assessmentType = (assessmentQuestionsTable as HTMLElement)?.dataset.assessmentType ?? '';
  const urlPrefix = (assessmentQuestionsTable as HTMLElement)?.dataset.urlPrefix ?? '';
  const assessmentInstanceId =
    (assessmentQuestionsTable as HTMLElement)?.dataset.assessmentInstanceId ?? '';
  const questions = decodeData('assessment-questions-data');

  const zones: any = [];
  let showAdvanceScorePercCol = false;
  questions.forEach((question: AssessmentQuestionRow) => {
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
          init_points: question.init_points,
          points_list: question.points_list,
          max_points: question.max_points,
          max_auto_points: question.max_auto_points,
          max_manual_points: question.max_manual_points,
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
  console.log(zones);
  enableEditButton?.addEventListener('click', () => {
    enableEditButton.style.display = 'none';
    editModeButtons?.style.removeProperty('display');
    refreshTable();
  });

  function renumberQuestions() {
    let questionNumber = 1;
    zones.forEach((zone: AssessmentQuestionZone) => {
      zone.questions.forEach((question) => {
        question.number = questionNumber.toString();
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
    if (typeof alternativeNumber === 'number') {
      if (alternativeNumber === 0) {
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
    if (questionNumber === 0) {
      zones[zoneNumber - 1].questions.push(zones[zoneNumber].questions.shift());
      refreshTable();
      return;
    }

    if (
      zones[zoneNumber].questions[questionNumber - 1].is_alternative_group &&
      alternativeNumber !== 'group'
    ) {
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
      return;
    }
    if (typeof alternativeNumber === 'number') {
      if (
        alternativeNumber ===
        zones[zoneNumber].questions[questionNumber].alternatives.length - 1
      ) {
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
    if (questionNumber === zones[zoneNumber].questions.length - 1) {
      zones[zoneNumber + 1].questions.unshift(zones[zoneNumber].questions.pop());
      refreshTable();
      return;
    }

    if (
      zones[zoneNumber].questions[questionNumber + 1].is_alternative_group &&
      alternativeNumber !== 'group'
    ) {
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
    if (alternativeNumber === null) {
      zones[zoneNumber].questions.splice(questionNumber, 1);
    } else {
      zones[zoneNumber].questions[questionNumber].alternatives.splice(alternativeNumber, 1);
    }
    renumberQuestions();
    refreshTable();
  });

  on('click', '.editButton', (e) => {
    const editButton = (e.target as HTMLElement).closest('button');
    const zoneNumber = parseInt(editButton?.dataset.zoneNumber ?? '0');
    const questionNumber = parseInt(editButton?.dataset.questionNumber ?? '0');
    const alternativeNumber = parseInt(editButton?.dataset.alternativeNumber ?? '0');
    if (assessmentType === 'Exam') {
      zones[zoneNumber].questions[questionNumber].points_list = zones[zoneNumber].questions[
        questionNumber
      ].points_list.map(
        (points: number) => points - zones[zoneNumber].questions[questionNumber].max_manual_points,
      );
    }
    $('#editQuestionModal').replaceWith(
      (document.createElement('div').innerHTML = EditQuestionModal({
        newQuestion: false,
        question: zones[zoneNumber].questions[questionNumber].is_alternative_group
          ? zones[zoneNumber].questions[questionNumber].alternatives[alternativeNumber]
          : zones[zoneNumber].questions[questionNumber],
        urlPrefix,
        assessmentInstanceId,
        zoneIndex: zoneNumber,
        questionIndex: questionNumber,
        alternativeIndex: alternativeNumber,
        assessmentType,
      }).toString()),
    );
    $('#editQuestionModal').modal('show');
    enableGradingOptions(
      (document.getElementById('gradingMethod') as HTMLSelectElement)?.value ?? 'auto',
    );
    $('#editQuestionModal').modal('show');
  });

  on('input', '#qidInput', (e) => {
    const qidInput = e.target as HTMLInputElement;
    const updateQuestionButton = document.getElementById('updateQuestionButton');
    if (qidInput.value) {
      updateQuestionButton?.removeAttribute('disabled');
    } else {
      updateQuestionButton?.setAttribute('disabled', 'true');
    }
  });

  on('click', '.add-question', (e) => {
    const addButton = (e.target as HTMLElement).closest('button');
    const zoneIndex = addButton?.dataset.zoneIndex ?? '0';
    const questionIndex = addButton?.dataset.questionIndex ?? '0';
    const alternativeIndex = (e.target as HTMLElement).dataset.alternativeIndex ?? '0';
    $('#editQuestionModal').replaceWith(
      (document.createElement('div').innerHTML = EditQuestionModal({
        newQuestion: true,
        urlPrefix,
        assessmentInstanceId,
        zoneIndex: parseInt(zoneIndex),
        questionIndex: parseInt(questionIndex),
        alternativeIndex: parseInt(alternativeIndex),
        assessmentType,
      }).toString()),
    );
    $('#editQuestionModal').modal('show');
    enableGradingOptions('auto');
  });

  on('click', '#findQid', async () => {
    $('#editQuestionModal').modal('hide');
    const response = await fetch(
      `${urlPrefix}/assessment/${assessmentInstanceId}/questions/findqid`,
    );
    const findQidHtml = await response.text();
    $('#findQIDModal').replaceWith(
      (document.createElement('div').innerHTML = findQidHtml.toString()),
    );
    $('#findQIDModal').modal('show');
  });

  function enableGradingOptions(method: string) {
    if (method === 'auto') {
      document.querySelectorAll('.hw-auto-points').forEach((el) => {
        el.removeAttribute('hidden');
      });
      document.querySelectorAll('.hw-manual-points').forEach((el) => {
        el.setAttribute('hidden', 'true');
      });
    } else if (method === 'manual') {
      document.querySelectorAll('.hw-auto-points').forEach((el) => {
        el.setAttribute('hidden', 'true');
      });
      document.querySelectorAll('.hw-manual-points').forEach((el) => {
        el.removeAttribute('hidden');
      });
    }
  }

  on('change', '#gradingMethod', (e) => {
    const method = (e.target as HTMLSelectElement).value;
    enableGradingOptions(method);
  });

  on('click', '#updateQuestionButton', async (e) => {
    const form = (e.target as HTMLElement).closest('form');
    const formData = new FormData(form as HTMLFormElement);
    const questionData = Object.fromEntries(formData.entries());
    const zoneIndex = parseInt(questionData.zoneIndex.toString());
    const questionIndex = parseInt(questionData.questionIndex.toString());
    const alternativeIndex = parseInt(questionData.alternativeIndex.toString());
    const isAlternativeGroup = !!zones[zoneIndex]?.questions[questionIndex]?.is_alternative_group;
    if (isAlternativeGroup) {
      if (zones[zoneIndex].questions[questionIndex].alternatives[alternativeIndex]) {
        zones[zoneIndex].questions[questionIndex].alternatives[alternativeIndex].qid =
          questionData.qid;
        zones[zoneIndex].questions[questionIndex].alternatives[alternativeIndex].title =
          questionData.title;
        zones[zoneIndex].questions[questionIndex].alternatives[alternativeIndex].tags = JSON.parse(
          questionData.tags.toString(),
        );
        zones[zoneIndex].questions[questionIndex].alternatives[alternativeIndex].topic = JSON.parse(
          questionData.topic.toString(),
        );
        zones[zoneIndex].questions[questionIndex].alternatives[alternativeIndex].other_assessments =
          JSON.parse(questionData.otherAssessments.toString());
      } else {
        zones[zoneIndex].questions[questionIndex].alternatives[alternativeIndex] = {
          qid: questionData.qid,
          title: questionData.title,
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
    } else {
      if (zones[zoneIndex].questions[questionIndex]) {
        zones[zoneIndex].questions[questionIndex].qid = questionData.qid;
        (zones[zoneIndex].questions[questionIndex].title = questionData.title),
          (zones[zoneIndex].questions[questionIndex].tags = JSON.parse(
            questionData.tags.toString(),
          )),
          (zones[zoneIndex].questions[questionIndex].topic = JSON.parse(
            questionData.topic.toString(),
          )),
          (zones[zoneIndex].questions[questionIndex].other_assessments = JSON.parse(
            questionData.otherAssessments.toString(),
          )),
          (zones[zoneIndex].questions[questionIndex].is_alternative_group = isAlternativeGroup),
          (zones[zoneIndex].questions[questionIndex].alternative_group_number = questionIndex + 1);
        if (assessmentType === 'Exam') {
          zones[zoneIndex].questions[questionIndex].points_list = questionData.autoPoints
            .toString()
            .split(',')
            .map(
              (points: string) =>
                parseFloat(points) +
                parseInt(questionData.manualPoints !== '' ? questionData.manualPoints : 0),
            );
          zones[zoneIndex].questions[questionIndex].max_manual_points = parseInt(
            questionData.manualPoints !== '' ? questionData.manualPoints.toString() : 0,
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
      } else {
        zones[zoneIndex].questions[questionIndex] = {
          qid: questionData.qid,
          title: questionData.title,
          tags: JSON.parse(questionData.tags.toString()),
          topic: JSON.parse(questionData.topic.toString()),
          other_assessments: JSON.parse(questionData.otherAssessments.toString()),
          is_alternative_group: isAlternativeGroup,
          alternative_group_number: questionIndex + 1,
          init_points:
            assessmentType === 'Exam'
              ? 0
              : parseInt(questionData.autoPoints !== '' ? questionData.autoPoints.toString() : 0),
          points_list:
            assessmentType === 'Exam'
              ? questionData.autoPoints
                  .toString()
                  .split(',')
                  .map((points: string) => parseInt(points) + questionData.manualPoints)
              : [0],
          max_auto_points:
            assessmentType === 'Exam'
              ? 0
              : parseInt(
                  questionData.maxAutoPoints !== '' ? questionData.maxAutoPoints.toString() : 0,
                ),
          max_manual_points: parseInt(
            questionData.manualPoints !== '' ? questionData.manualPoints.toString() : 0,
          ),
          tries_per_variant: parseInt(
            questionData.triesPerVariant ? questionData.triesPerVariant.toString() : 0,
          ),
        };
      }
    }
    renumberQuestions();
    refreshTable();
  });

  on('click', '#confirmFindQIDButton', () => {
    const foundQuestion = $('#questionsTable').bootstrapTable('getSelections')[0];
    const qidInput = document.getElementById('qidInput') as HTMLInputElement;
    const titleInput = document.getElementById('titleInput') as HTMLInputElement;
    const tagsInput = document.getElementById('tagsInput') as HTMLInputElement;
    const topicInput = document.getElementById('topicInput') as HTMLInputElement;
    const otherAssessmentsInput = document.getElementById(
      'otherAssessmentsInput',
    ) as HTMLInputElement;
    qidInput.value = foundQuestion.qid;
    titleInput.value = foundQuestion.title;
    tagsInput.value = JSON.stringify(foundQuestion.tags);
    topicInput.value = JSON.stringify(foundQuestion.topic);
    otherAssessmentsInput.value = JSON.stringify(foundQuestion.assessments);
    document.getElementById('updateQuestionButton')?.removeAttribute('disabled');
    $('#editQuestionModal').modal('show');
  });

  on('click', '.edit-zone-button', (e) => {
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

  on('click', '.add-zone', () => {
    $('#editZoneModal').replaceWith(
      (document.createElement('div').innerHTML = EditZoneModal({
        zone: {},
        newZone: true,
        zoneIndex: zones.length,
      }).toString()),
    );
    $('#editZoneModal').modal('show');
  });

  on('click', '#confirmEditZoneButton', (e) => {
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
    zones[zoneIndex].title = zoneData.zoneTitle === '' ? null : zoneData.zoneTitle;
    zones[zoneIndex].bestQuestions =
      zoneData.bestQuestions === '' ? null : parseInt(zoneData.bestQuestions.toString());
    zones[zoneIndex].maxPoints =
      zoneData.maxPoints === '' ? null : parseInt(zoneData.maxPoints.toString());
    zones[zoneIndex].numberChoose =
      zoneData.numberChoose === '' ? null : parseInt(zoneData.numberChoose.toString());
    refreshTable();
  });

  on('click', '#saveAndSyncButton', () => {
    const form = document.getElementById('zonesForm') as HTMLFormElement;
    const zonesInput = form.querySelector('input[name="zones"]') as HTMLInputElement;
    const zoneMap = zones
      .filter((zone: AssessmentQuestionZone) => zone.questions.length > 0)
      .map((zone: AssessmentQuestionZone) => {
        if (zone.questions.length === 0) return;
        zone.questions = zone.questions.map((question) => {
          const questionData = {
            id: question.qid,
            alternatives: !question.is_alternative_group
              ? null
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
            manualPoints: question.max_manual_points,
            maxAutoPoints: assessmentType === 'Exam' ? 0 : question.max_auto_points,
            triesPerVariant: question.tries_per_variant === 1 ? null : question.tries_per_variant,
          };
          return Object.fromEntries(
            Object.entries(questionData).filter(([_, value]) => value && value !== 0),
          );
        });
        return Object.fromEntries(Object.entries(zone).filter(([_, value]) => value !== null));
      });
    zonesInput.value = JSON.stringify(zoneMap);
    form.submit();
  });
});
