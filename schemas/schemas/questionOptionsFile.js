module.exports = {
  $schema: "http://json-schema.org/draft-04/schema#",
  title: "File question options",
  description: "Options for a File question.",
  type: "object",
  additionalProperties: false,
  properties: {
    fileName: {
      description: "Filename of the file to download",
      type: "string"
    }
  }
};
