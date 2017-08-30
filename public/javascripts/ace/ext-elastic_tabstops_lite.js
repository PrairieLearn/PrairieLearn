ace.define("ace/ext/elastic_tabstops_lite",["require","exports","module","ace/editor","ace/config"],function(e,t,n){"use strict";var r=function(e){this.$editor=e;var t=this,n=[],r=!1;this.onAfterExec=function(){r=!1,t.processRows(n),n=[]},this.onExec=function(){r=!0},this.onChange=function(e){r&&(n.indexOf(e.start.row)==-1&&n.push(e.start.row),e.end.row!=e.start.row&&n.push(e.end.row))}};(function(){this.processRows=function(e){this.$inChange=!0;var t=[];for(var n=0,r=e.length;n<r;n++){var i=e[n];if(t.indexOf(i)>-1)continue;var s=this.$findCellWidthsForBlock(i),o=this.$setBlockCellWidthsToMax(s.cellWidths),u=s.firstRow;for(var a=0,f=o.length;a<f;a++){var l=o[a];t.push(u),this.$adjustRow(u,l),u++}}this.$inChange=!1},this.$findCellWidthsForBlock=function(e){var t=[],n,r=e;while(r>=0){n=this.$cellWidthsForRow(r);if(n.length==0)break;t.unshift(n),r--}var i=r+1;r=e;var s=this.$editor.session.getLength();while(r<s-1){r++,n=this.$cellWidthsForRow(r);if(n.length==0)break;t.push(n)}return{cellWidths:t,firstRow:i}},this.$cellWidthsForRow=function(e){var t=this.$selectionColumnsForRow(e),n=[-1].concat(this.$tabsForRow(e)),r=n.map(function(e){return 0}).slice(1),i=this.$editor.session.getLine(e);for(var s=0,o=n.length-1;s<o;s++){var u=n[s]+1,a=n[s+1],f=this.$rightmostSelectionInCell(t,a),l=i.substring(u,a);r[s]=Math.max(l.replace(/\s+$/g,"").length,f-u)}return r},this.$selectionColumnsForRow=function(e){var t=[],n=this.$editor.getCursorPosition();return this.$editor.session.getSelection().isEmpty()&&e==n.row&&t.push(n.column),t},this.$setBlockCellWidthsToMax=function(e){var t=!0,n,r,i,s=this.$izip_longest(e);for(var o=0,u=s.length;o<u;o++){var a=s[o];if(!a.push){console.error(a);continue}a.push(NaN);for(var f=0,l=a.length;f<l;f++){var c=a[f];t&&(n=f,i=0,t=!1);if(isNaN(c)){r=f;for(var h=n;h<r;h++)e[h][o]=i;t=!0}i=Math.max(i,c)}}return e},this.$rightmostSelectionInCell=function(e,t){var n=0;if(e.length){var r=[];for(var i=0,s=e.length;i<s;i++)e[i]<=t?r.push(i):r.push(0);n=Math.max.apply(Math,r)}return n},this.$tabsForRow=function(e){var t=[],n=this.$editor.session.getLine(e),r=/\t/g,i;while((i=r.exec(n))!=null)t.push(i.index);return t},this.$adjustRow=function(e,t){var n=this.$tabsForRow(e);if(n.length==0)return;var r=0,i=-1,s=this.$izip(t,n);for(var o=0,u=s.length;o<u;o++){var a=s[o][0],f=s[o][1];i+=1+a,f+=r;var l=i-f;if(l==0)continue;var c=this.$editor.session.getLine(e).substr(0,f),h=c.replace(/\s*$/g,""),p=c.length-h.length;l>0&&(this.$editor.session.getDocument().insertInLine({row:e,column:f+1},Array(l+1).join(" ")+"	"),this.$editor.session.getDocument().removeInLine(e,f,f+1),r+=l),l<0&&p>=-l&&(this.$editor.session.getDocument().removeInLine(e,f+l,f),r+=l)}},this.$izip_longest=function(e){if(!e[0])return[];var t=e[0].length,n=e.length;for(var r=1;r<n;r++){var i=e[r].length;i>t&&(t=i)}var s=[];for(var o=0;o<t;o++){var u=[];for(var r=0;r<n;r++)e[r][o]===""?u.push(NaN):u.push(e[r][o]);s.push(u)}return s},this.$izip=function(e,t){var n=e.length>=t.length?t.length:e.length,r=[];for(var i=0;i<n;i++){var s=[e[i],t[i]];r.push(s)}return r}}).call(r.prototype),t.ElasticTabstopsLite=r;var i=e("../editor").Editor;e("../config").defineOptions(i.prototype,"editor",{useElasticTabstops:{set:function(e){e?(this.elasticTabstops||(this.elasticTabstops=new r(this)),this.commands.on("afterExec",this.elasticTabstops.onAfterExec),this.commands.on("exec",this.elasticTabstops.onExec),this.on("change",this.elasticTabstops.onChange)):this.elasticTabstops&&(this.commands.removeListener("afterExec",this.elasticTabstops.onAfterExec),this.commands.removeListener("exec",this.elasticTabstops.onExec),this.removeListener("change",this.elasticTabstops.onChange))}}})});
                (function() {
                    ace.require(["ace/ext/elastic_tabstops_lite"], function() {});
                })();
            