# Manual Testing Instructions for README.md Skip Feature

This document describes how to manually test the feature that skips copying README.md files from example course template questions.

## What Changed

When creating a new question from a template, README.md files are now handled differently:
- **Example course templates** (`exampleCourse/questions/template/*`): README.md is **NOT** copied
- **Course-specific templates** (`yourCourse/questions/template/*`): README.md **IS** copied

## Test Cases

### Test Case 1: Create question from example course template

1. Start PrairieLearn and navigate to a course
2. Go to the Questions page
3. Click "Add question"
4. Select "PrairieLearn template" as the starting point
5. Choose any template question (e.g., "Random string input question")
6. Enter a QID and title for the new question
7. Click "Add question"
8. Navigate to the file editor for the newly created question
9. **Expected**: The README.md file should NOT be present in the question directory
10. **Expected**: Other files (info.json, question.html, server.py) should be present

### Test Case 2: Create question from course-specific template

1. First, create a course-specific template:
   - Create a question with QID like `template/my-template`
   - Add files including a README.md to this template
   - Save the template

2. Create a new question from the course-specific template:
   - Click "Add question"
   - Select "Course template" as the starting point
   - Choose your custom template
   - Enter a QID and title for the new question
   - Click "Add question"

3. Navigate to the file editor for the newly created question
4. **Expected**: The README.md file SHOULD be present in the question directory
5. **Expected**: The content of README.md should match your template

### Test Case 3: Copy question between courses (from example course)

1. Navigate to a question in the example course that has a README.md
2. Click "Copy" or use the question copy feature
3. Select a target course to copy to
4. Complete the copy operation
5. Navigate to the copied question in the target course
6. **Expected**: If the source question's QID starts with `template/`, the README.md should NOT be copied
7. **Expected**: Other files should be copied normally

## Verification

After running these tests, verify:
- [ ] README.md is not copied from example course templates
- [ ] README.md is copied from course-specific templates
- [ ] All other files (info.json, question.html, server.py, etc.) are copied in both cases
- [ ] The feature works both when adding new questions and copying questions between courses
