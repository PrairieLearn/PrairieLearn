# Plan for Adding CSV Upload Functionality to instructorAssessmentUploads

## Objective

Add functionality to the `instructorAssessmentUploads` page to allow instructors to upload a CSV file containing submission data. The system will parse the CSV and recreate the following entities in the database:

- Users
- Assessment instances
- Instance questions
- Variants
- Submissions

For context, the CSV file will contain the following columns:

```
UID,UIN,Username,Name,Role,Assessment,Assessment instance,Zone number,Zone title,Question,Question instance,Variant,Seed,Params,True answer,Options,submission_id,Submission date,Submitted answer,Partial Scores,Override score,Credit,Mode,Grading requested date,Grading date,Assigned manual grader,Last manual grader,Score,Correct,Feedback,Rubric Grading,Question points,Max points,Question % score,Auto points,Max auto points,Manual points,Max manual points
```

## Steps to Implement

### 1. Frontend Changes

- Add a new form to the `instructorAssessmentUploads` page for uploading the CSV file.
- Include a file input field and a submit button.
- Position the form below the existing form. Add a note that it's only available in dev mode. It should NEVER be available in production.

### 2. Backend Changes

#### Route Addition

- Update the `instructorAssessmentUploads.ts` POST handler to support the new form submission.
- Ensure the route is only accessible in development mode.

#### CSV Parsing

- Use `csvtojson` to parse the uploaded CSV file.
- Validate the headers and data format.

#### Database Operations

- For each row in the CSV:
  - Create or update user records based on `UID`, `UIN`, and `Username`.
  - Create or update assessment instances, questions, and variants.
  - Insert submission data, including scores, feedback, and grading details.

## File Changes

### Frontend

- Update `instructorAssessmentUploads.html.ts` to include the new form.

### Backend

- Update `instructorAssessmentUploads.ts` to add the form handler.
- Create a new utility module for parsing and validating the CSV file.
