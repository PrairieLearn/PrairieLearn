module.exports = {
  $schema: "http://json-schema.org/draft-04/schema#",
  title: "MultipleChoice question options",
  description: "Options for a MultipleChoice question.",
  type: "object",
  additionalProperties: false,
  required: ["text", "correctAnswers", "incorrectAnswers"],
  properties: {
    text: {
      description: "The question HTML text that comes before the options.",
      type: "string"
    },
    correctAnswers: {
      description: "A list of correct answers to the question. Each is an HTML string.",
      type: "array",
      items: {
        type: "string"
      }
    },
    incorrectAnswers: {
      description: "A list of incorrect answers to the question. Each is an HTML string.",
      type: "array",
      items: {
        type: "string"
      }
    },
    numberAnswers: {
      description: "The total number of answers in the list of possible answers.",
      type: "integer"
    }
  }
};
