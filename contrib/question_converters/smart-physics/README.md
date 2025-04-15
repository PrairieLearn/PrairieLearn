# smartPhysics conversion tool

This converts multiple choice questions from `smart.physics` XML format to
the PrairieLearn directory question structure. Each question will automatically
be given a UUID.

Command line usage:

```bash
smartphysics-to-pl.py [xml file] [PrairieLearn question name]
```

**Note:** The question may require some cleanup.

Known problems include '`{`' characters in LaTeX formulas (which
get replaced indiscriminately), and images, which are just ignored.

If you want to convert free-answer questions (e.g. homework questions),
the main difference would be to change `write_question()`.
