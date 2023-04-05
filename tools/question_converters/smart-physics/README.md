## smartPhysics Conversion Tool

This converts multiple choice questions from smart.physics XML format to
the PrairieLearn directory question structure. Each question will automatically
be given assigned a UUID.

Command line usage:

```bash
smartphysics-to-pl.py [xml file] [PrairieLearn question name]
```

**Notes:** The question may require some cleanup.
Known problems include '{' characters in LaTeX formulas (which
get replaced indiscriminantly), and images, which are just ignored.

If you want to convert free-answer questions (ex. homeworks),
the main difference would be to change
write_question().
