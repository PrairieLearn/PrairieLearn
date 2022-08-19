const { html } = require('@prairielearn/html');

function AuthNotAllowed({ resLocals }) {
  return html`Hello!`.toString();
}

module.exports.AuthNotAllowed = AuthNotAllowed;
