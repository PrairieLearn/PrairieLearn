ace.define('ace/mode/simplelang', [], function (require, exports, module) {
  'use strict';

  var oop = require('ace/lib/oop');
  var TextMode = require('ace/mode/text').Mode;
  var TextHighlightRules = require('ace/mode/text_highlight_rules').TextHighlightRules;

  // --- Highlight Rules ---
  var SimpleLangHighlightRules = function () {
    this.$rules = {
      start: [
        {
          token: 'comment',
          regex: '//.*$',
        },
        {
          token: 'comment.start',
          regex: '/\\*',
          next: 'comment',
        },
        {
          token: 'keyword',
          regex: '\\b(?:if|else|while|return|print)\\b',
        },
        {
          token: 'constant.numeric',
          regex: '\\b[0-9]+\\b',
        },
        {
          token: 'string',
          regex: '".*?"',
        },
        {
          token: 'identifier',
          regex: '[a-zA-Z_][a-zA-Z0-9_]*',
        },
      ],
      comment: [
        {
          token: 'comment.end',
          regex: '\\*/',
          next: 'start',
        },
        {
          defaultToken: 'comment',
        },
      ],
    };
  };
  oop.inherits(SimpleLangHighlightRules, TextHighlightRules);

  // --- Mode Definition ---
  var Mode = function () {
    this.HighlightRules = SimpleLangHighlightRules;
  };
  oop.inherits(Mode, TextMode);

  (function () {
    this.lineCommentStart = '//';
    this.blockComment = { start: '/*', end: '*/' };
    this.$id = 'ace/mode/simplelang';
  }).call(Mode.prototype);

  exports.Mode = Mode;
});
