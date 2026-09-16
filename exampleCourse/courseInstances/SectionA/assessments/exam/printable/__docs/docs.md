# Campus water and energy: a printable exam

This 90-minute, 100-point exam demonstrates paper-oriented assessment content in
the Example Course. It contains 18 independent questions about a fictional
campus water-and-energy study. All data and figures are supplied; students need
only a pen or pencil and a non-programmable calculator.

The questions deliberately use ordinary academic prompts rather than descriptions
of PrairieLearn elements. Fixed values, fixed choice order where appropriate, and
`singleVariant` questions make successive exports easy to compare. Ordering
questions still present their actions out of solution order.

## Coverage

| Questions | Student task                                                     | Content exercised                                                                                          |
| --------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 1–5       | Evaluate evidence and classify measurements                      | Multiple choice, multiple checkbox, matching, inline dropdowns, short text                                 |
| 6–8       | Calculate rates, reductions, and required capacity               | Units, numerical answers, integer answers                                                                  |
| 9–12      | Complete and interpret quantitative models                       | Inputs within a table, symbolic expression, matrix entries, static SVG figure, multipart numerical answers |
| 13–14     | Sequence a procedure and a calculation                           | Ordering boxes, grouped alternatives, mathematical expressions within blocks                               |
| 15        | Sketch a piecewise-linear storage model                          | Drawing canvas, axes, grid, and a sample solution                                                          |
| 16–18     | Explain a claim, show a calculation, and recommend an investment | Short written response, separate working areas, extended response, data table, and manual grading rubrics  |

Questions 1–14 use automatic grading when taken online. Questions 15–18 are
manually graded and include model answers and point-based rubrics in their answer
panels. For paper grading, use the worked key and accept equivalent methods and
well-supported alternative recommendations.

## Generating samples

1. Load the Example Course from disk and open Exam 6 in SectionA.
2. Create an assessment instance using the instructor's student view. Reuse that
   instance when comparing exports so that question variants and form identifiers
   stay consistent.
3. From the instructor assessment-instance URL, append `/paper` to retrieve the
   export descriptor. Append `/paper/preview`, `/paper/pdf`, or `/paper/docx` to
   view or download the student paper. Use `?paper_size=Letter` or `?paper_size=A4`.
4. Add `&document=answer_key` to the preview, PDF, or DOCX URL to obtain the key.
   Optional repeated `identity_field` parameters add fields such as Section and
   Student ID to the cover.

Review both the exam and key. Check that choice markers and order boxes are empty
on the student paper, alternative groups are clearly labeled, the table has space
for handwritten values, axes and grayscale figures are legible, and written
responses have enough space. Verify that all 18 questions and the 100-point total
survive each export. DOCX text, tables, and equations should remain editable;
figures and drawing canvases are images. Word pagination can differ from PDF
pagination.

The comprehensive component fixture in `testCourse` (`exam23-printing`) remains
separate. It covers computer-oriented elements and deliberately broken variants
that are useful for regression testing but would be distracting on this exam.
