ace.define("ace/mode/julia_highlight_rules",["require","exports","module","ace/lib/oop","ace/mode/text_highlight_rules"],function(e,t,n){"use strict";var r=e("../lib/oop"),i=e("./text_highlight_rules").TextHighlightRules,s=function(){this.$rules={start:[{include:"#function_decl"},{include:"#function_call"},{include:"#type_decl"},{include:"#keyword"},{include:"#operator"},{include:"#number"},{include:"#string"},{include:"#comment"}],"#bracket":[{token:"keyword.bracket.julia",regex:"\\(|\\)|\\[|\\]|\\{|\\}|,"}],"#comment":[{token:["punctuation.definition.comment.julia","comment.line.number-sign.julia"],regex:"(#)(?!\\{)(.*$)"}],"#function_call":[{token:["support.function.julia","text"],regex:"([a-zA-Z0-9_]+!?)([\\w\\xff-\\u218e\\u2455-\\uffff]*\\()"}],"#function_decl":[{token:["keyword.other.julia","meta.function.julia","entity.name.function.julia","meta.function.julia","text"],regex:"(function|macro)(\\s*)([a-zA-Z0-9_\\{]+!?)([\\w\\xff-\\u218e\\u2455-\\uffff]*)([(\\\\{])"}],"#keyword":[{token:"keyword.other.julia",regex:"\\b(?:function|type|immutable|macro|quote|abstract|bitstype|typealias|module|baremodule|new)\\b"},{token:"keyword.control.julia",regex:"\\b(?:if|else|elseif|while|for|in|begin|let|end|do|try|catch|finally|return|break|continue)\\b"},{token:"storage.modifier.variable.julia",regex:"\\b(?:global|local|const|export|import|importall|using)\\b"},{token:"variable.macro.julia",regex:"@[\\w\\xff-\\u218e\\u2455-\\uffff]+\\b"}],"#number":[{token:"constant.numeric.julia",regex:"\\b0(?:x|X)[0-9a-fA-F]*|(?:\\b[0-9]+\\.?[0-9]*|\\.[0-9]+)(?:(?:e|E)(?:\\+|-)?[0-9]*)?(?:im)?|\\bInf(?:32)?\\b|\\bNaN(?:32)?\\b|\\btrue\\b|\\bfalse\\b"}],"#operator":[{token:"keyword.operator.update.julia",regex:"=|:=|\\+=|-=|\\*=|/=|//=|\\.//=|\\.\\*=|\\\\=|\\.\\\\=|^=|\\.^=|%=|\\|=|&=|\\$=|<<=|>>="},{token:"keyword.operator.ternary.julia",regex:"\\?|:"},{token:"keyword.operator.boolean.julia",regex:"\\|\\||&&|!"},{token:"keyword.operator.arrow.julia",regex:"->|<-|-->"},{token:"keyword.operator.relation.julia",regex:">|<|>=|<=|==|!=|\\.>|\\.<|\\.>=|\\.>=|\\.==|\\.!=|\\.=|\\.!|<:|:>"},{token:"keyword.operator.range.julia",regex:":"},{token:"keyword.operator.shift.julia",regex:"<<|>>"},{token:"keyword.operator.bitwise.julia",regex:"\\||\\&|~"},{token:"keyword.operator.arithmetic.julia",regex:"\\+|-|\\*|\\.\\*|/|\\./|//|\\.//|%|\\.%|\\\\|\\.\\\\|\\^|\\.\\^"},{token:"keyword.operator.isa.julia",regex:"::"},{token:"keyword.operator.dots.julia",regex:"\\.(?=[a-zA-Z])|\\.\\.+"},{token:"keyword.operator.interpolation.julia",regex:"\\$#?(?=.)"},{token:["variable","keyword.operator.transposed-variable.julia"],regex:"([\\w\\xff-\\u218e\\u2455-\\uffff]+)((?:'|\\.')*\\.?')"},{token:"text",regex:"\\[|\\("},{token:["text","keyword.operator.transposed-matrix.julia"],regex:"([\\]\\)])((?:'|\\.')*\\.?')"}],"#string":[{token:"punctuation.definition.string.begin.julia",regex:"'",push:[{token:"punctuation.definition.string.end.julia",regex:"'",next:"pop"},{include:"#string_escaped_char"},{defaultToken:"string.quoted.single.julia"}]},{token:"punctuation.definition.string.begin.julia",regex:'"',push:[{token:"punctuation.definition.string.end.julia",regex:'"',next:"pop"},{include:"#string_escaped_char"},{defaultToken:"string.quoted.double.julia"}]},{token:"punctuation.definition.string.begin.julia",regex:'\\b[\\w\\xff-\\u218e\\u2455-\\uffff]+"',push:[{token:"punctuation.definition.string.end.julia",regex:'"[\\w\\xff-\\u218e\\u2455-\\uffff]*',next:"pop"},{include:"#string_custom_escaped_char"},{defaultToken:"string.quoted.custom-double.julia"}]},{token:"punctuation.definition.string.begin.julia",regex:"`",push:[{token:"punctuation.definition.string.end.julia",regex:"`",next:"pop"},{include:"#string_escaped_char"},{defaultToken:"string.quoted.backtick.julia"}]}],"#string_custom_escaped_char":[{token:"constant.character.escape.julia",regex:'\\\\"'}],"#string_escaped_char":[{token:"constant.character.escape.julia",regex:"\\\\(?:\\\\|[0-3]\\d{,2}|[4-7]\\d?|x[a-fA-F0-9]{,2}|u[a-fA-F0-9]{,4}|U[a-fA-F0-9]{,8}|.)"}],"#type_decl":[{token:["keyword.control.type.julia","meta.type.julia","entity.name.type.julia","entity.other.inherited-class.julia","punctuation.separator.inheritance.julia","entity.other.inherited-class.julia"],regex:"(type|immutable)(\\s+)([a-zA-Z0-9_]+)(?:(\\s*)(<:)(\\s*[.a-zA-Z0-9_:]+))?"},{token:["other.typed-variable.julia","support.type.julia"],regex:"([a-zA-Z0-9_]+)(::[a-zA-Z0-9_{}]+)"}]},this.normalizeRules()};s.metaData={fileTypes:["jl"],firstLineMatch:"^#!.*\\bjulia\\s*$",foldingStartMarker:"^\\s*(?:if|while|for|begin|function|macro|module|baremodule|type|immutable|let)\\b(?!.*\\bend\\b).*$",foldingStopMarker:"^\\s*(?:end)\\b.*$",name:"Julia",scopeName:"source.julia"},r.inherits(s,i),t.JuliaHighlightRules=s}),ace.define("ace/mode/folding/cstyle",["require","exports","module","ace/lib/oop","ace/range","ace/mode/folding/fold_mode"],function(e,t,n){"use strict";var r=e("../../lib/oop"),i=e("../../range").Range,s=e("./fold_mode").FoldMode,o=t.FoldMode=function(e){e&&(this.foldingStartMarker=new RegExp(this.foldingStartMarker.source.replace(/\|[^|]*?$/,"|"+e.start)),this.foldingStopMarker=new RegExp(this.foldingStopMarker.source.replace(/\|[^|]*?$/,"|"+e.end)))};r.inherits(o,s),function(){this.foldingStartMarker=/(\{|\[)[^\}\]]*$|^\s*(\/\*)/,this.foldingStopMarker=/^[^\[\{]*(\}|\])|^[\s\*]*(\*\/)/,this.singleLineBlockCommentRe=/^\s*(\/\*).*\*\/\s*$/,this.tripleStarBlockCommentRe=/^\s*(\/\*\*\*).*\*\/\s*$/,this.startRegionRe=/^\s*(\/\*|\/\/)#?region\b/,this._getFoldWidgetBase=this.getFoldWidget,this.getFoldWidget=function(e,t,n){var r=e.getLine(n);if(this.singleLineBlockCommentRe.test(r)&&!this.startRegionRe.test(r)&&!this.tripleStarBlockCommentRe.test(r))return"";var i=this._getFoldWidgetBase(e,t,n);return!i&&this.startRegionRe.test(r)?"start":i},this.getFoldWidgetRange=function(e,t,n,r){var i=e.getLine(n);if(this.startRegionRe.test(i))return this.getCommentRegionBlock(e,i,n);var s=i.match(this.foldingStartMarker);if(s){var o=s.index;if(s[1])return this.openingBracketBlock(e,s[1],n,o);var u=e.getCommentFoldRange(n,o+s[0].length,1);return u&&!u.isMultiLine()&&(r?u=this.getSectionRange(e,n):t!="all"&&(u=null)),u}if(t==="markbegin")return;var s=i.match(this.foldingStopMarker);if(s){var o=s.index+s[0].length;return s[1]?this.closingBracketBlock(e,s[1],n,o):e.getCommentFoldRange(n,o,-1)}},this.getSectionRange=function(e,t){var n=e.getLine(t),r=n.search(/\S/),s=t,o=n.length;t+=1;var u=t,a=e.getLength();while(++t<a){n=e.getLine(t);var f=n.search(/\S/);if(f===-1)continue;if(r>f)break;var l=this.getFoldWidgetRange(e,"all",t);if(l){if(l.start.row<=s)break;if(l.isMultiLine())t=l.end.row;else if(r==f)break}u=t}return new i(s,o,u,e.getLine(u).length)},this.getCommentRegionBlock=function(e,t,n){var r=t.search(/\s*$/),s=e.getLength(),o=n,u=/^\s*(?:\/\*|\/\/|--)#?(end)?region\b/,a=1;while(++n<s){t=e.getLine(n);var f=u.exec(t);if(!f)continue;f[1]?a--:a++;if(!a)break}var l=n;if(l>o)return new i(o,r,l,t.length)}}.call(o.prototype)}),ace.define("ace/mode/julia",["require","exports","module","ace/lib/oop","ace/mode/text","ace/mode/julia_highlight_rules","ace/mode/folding/cstyle"],function(e,t,n){"use strict";var r=e("../lib/oop"),i=e("./text").Mode,s=e("./julia_highlight_rules").JuliaHighlightRules,o=e("./folding/cstyle").FoldMode,u=function(){this.HighlightRules=s,this.foldingRules=new o,this.$behaviour=this.$defaultBehaviour};r.inherits(u,i),function(){this.lineCommentStart="#",this.blockComment="",this.$id="ace/mode/julia"}.call(u.prototype),t.Mode=u})