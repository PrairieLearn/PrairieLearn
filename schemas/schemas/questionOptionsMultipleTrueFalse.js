module.exports = {
  $schema: 'http://json-schema.org/draft-04/schema#',
  title: 'MultipleTrueFalse question options',
  description: 'Options for a MultipleTrueFalse question.',
  type: 'object',
  additionalProperties: false,
  required: ['trueStatements', 'falseStatements'],
  properties: {
    text: {
      description: 'Text to precede the set of statements being given.',
      type: 'string',
    },
    trueStatements: {
      description: 'A list of true statements for the question. Each is an HTML string.',
      type: 'array',
      items: {
        type: 'string',
      },
    },
    falseStatements: {
      description: 'A list of false statements for the question. Each is an HTML string.',
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
};
