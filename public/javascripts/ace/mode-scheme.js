ace.define("ace/mode/scheme_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/text_highlight_rules"],function(e,t,n){"use strict";var r=e("../lib/oop"),i=e("./text_highlight_rules").TextHighlightRules,s=function(){var e="case|do|let|loop|if|else|when",t="eq?|eqv?|equal?|and|or|not|null?",n="#t|#f",r="cons|car|cdr|cond|lambda|lambda*|syntax-rules|format|set!|quote|eval|append|list|list?|member?|load",i=this.createKeywordMapper({"keyword.control":e,"keyword.operator":t,"constant.language":n,"support.function":r},"identifier",!0);this.$rules={start:[{token:"comment",regex:";.*$"},{token:["storage.type.function-type.scheme","text","entity.name.function.scheme"],regex:"(?:\\b(?:(define|define-syntax|define-macro))\\b)(\\s+)((?:\\w|\\-|\\!|\\?)*)"},{token:"punctuation.definition.constant.character.scheme",regex:"#:\\S+"},{token:["punctuation.definition.variable.scheme","variable.other.global.scheme","punctuation.definition.variable.scheme"],regex:"(\\*)(\\S*)(\\*)"},{token:"constant.numeric",regex:"#[xXoObB][0-9a-fA-F]+"},{token:"constant.numeric",regex:"[+-]?\\d+(?:(?:\\.\\d*)?(?:[eE][+-]?\\d+)?)?"},{token:i,regex:"[a-zA-Z_#][a-zA-Z0-9_\\-\\?\\!\\*]*"},{token:"string",regex:'"(?=.)',next:"qqstring"}],qqstring:[{token:"constant.character.escape.scheme",regex:"\\\\."},{token:"string",regex:'[^"\\\\]+',merge:!0},{token:"string",regex:"\\\\$",next:"qqstring",merge:!0},{token:"string",regex:'"|$',next:"start",merge:!0}]}};r.inherits(s,i),t.SchemeHighlightRules=s}),ace.define("ace/mode/matching_parens_outdent",["require","exports","module","ace/range"],function(e,t,n){"use strict";var r=e("../range").Range,i=function(){};(function(){this.checkOutdent=function(e,t){return/^\s+$/.test(e)?/^\s*\)/.test(t):!1},this.autoOutdent=function(e,t){var n=e.getLine(t),i=n.match(/^(\s*\))/);if(!i)return 0;var s=i[1].length,o=e.findMatchingBracket({row:t,column:s});if(!o||o.row==t)return 0;var u=this.$getIndent(e.getLine(o.row));e.replace(new r(t,0,t,s-1),u)},this.$getIndent=function(e){var t=e.match(/^(\s+)/);return t?t[1]:""}}).call(i.prototype),t.MatchingParensOutdent=i}),ace.define("ace/mode/scheme",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/scheme_highlight_rules","ace/mode/matching_parens_outdent"],function(e,t,n){"use strict";var r=e("../lib/oop"),i=e("./text").Mode,s=e("./scheme_highlight_rules").SchemeHighlightRules,o=e("./matching_parens_outdent").MatchingParensOutdent,u=function(){this.HighlightRules=s,this.$outdent=new o,this.$behaviour=this.$defaultBehaviour};r.inherits(u,i),function(){this.lineCommentStart=";",this.minorIndentFunctions=["define","lambda","define-macro","define-syntax","syntax-rules","define-record-type","define-structure"],this.$toIndent=function(e){return e.split("").map(function(e){return/\s/.exec(e)?e:" "}).join("")},this.$calculateIndent=function(e,t){var n=this.$getIndent(e),r=0,i,s;for(var o=e.length-1;o>=0;o--){s=e[o],s==="("?(r--,i=!0):s==="("||s==="["||s==="{"?(r--,i=!1):(s===")"||s==="]"||s==="}")&&r++;if(r<0)break}if(!(r<0&&i))return r<0&&!i?this.$toIndent(e.substring(0,o+1)):r>0?(n=n.substring(0,n.length-t.length),n):n;o+=1;var u=o,a="";for(;;){s=e[o];if(s===" "||s==="	")return this.minorIndentFunctions.indexOf(a)!==-1?this.$toIndent(e.substring(0,u-1)+t):this.$toIndent(e.substring(0,o+1));if(s===undefined)return this.$toIndent(e.substring(0,u-1)+t);a+=e[o],o++}},this.getNextLineIndent=function(e,t,n){return this.$calculateIndent(t,n)},this.checkOutdent=function(e,t,n){return this.$outdent.checkOutdent(t,n)},this.autoOutdent=function(e,t,n){this.$outdent.autoOutdent(t,n)},this.$id="ace/mode/scheme"}.call(u.prototype),t.Mode=u})