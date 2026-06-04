# Assessments

Assessments are a collection of questions that are administered to students. They can be used to create homeworks and exams.

Each assessment is a single directory in the `assessments` folder or any subfolder. Assessments may be nested in subdirectories of the `assessments` folder. The assessment directory must contain a single file called `infoAssessment.json` that describes the assessment and looks like:

```json title="infoAssessment.json"
{
  "uuid": "cef0cbf3-6458-4f13-a418-ee4d7e7505dd",
  "type": "Exam",
  "title": "Coordinates and Vectors",
  "set": "Quiz",
  "module": "Linear algebra review",
  "number": "2",
  "allowAccess": [],
  "zones": [],
  "comment": "You can add comments to JSON files using this property."
}
```

The assessment ID is the full path relative to `assessments`.

Creating an assessment is done in two separate parts:

1. [Configuring the questions, scoring, and other assessment-specific settings](configuration.md)
2. [Configuring access control for the assessment (due dates, credit, etc.)](accessControl.md)
