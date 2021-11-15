class FunctionMissingError extends Error {
  constructor(message) {
    super(message);
    this.name = 'FunctionMissingError';
  }
}

module.exports.FunctionMissingError = FunctionMissingError;
