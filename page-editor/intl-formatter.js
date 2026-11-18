// https://formatjs.io/docs/tooling/cli#extraction
exports.format = function format(extractedMessages) {
  return (
    Object.keys(extractedMessages)
      // transform strings to lowercase to imitate phraseapp sorting
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
      .reduce((allMessages, messageId) => {
        // Return a simple key/value JSON object. Mutating the accumulator keeps
        // the fold O(n); spreading it copied every message on every step.
        allMessages[messageId] = extractedMessages[messageId].defaultMessage;
        return allMessages;
      }, {})
  );
};
