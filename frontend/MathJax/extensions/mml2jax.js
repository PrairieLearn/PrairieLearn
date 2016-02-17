/*
 *  /MathJax/extensions/mml2jax.js
 *
 *  Copyright (c) 2009-2015 The MathJax Consortium
 *
 *  Licensed under the Apache License, Version 2.0 (the "License");
 *  you may not use this file except in compliance with the License.
 *  You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 *  Unless required by applicable law or agreed to in writing, software
 *  distributed under the License is distributed on an "AS IS" BASIS,
 *  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *  See the License for the specific language governing permissions and
 *  limitations under the License.
 */

MathJax.Extension.mml2jax={version:"2.6.0",config:{preview:"mathml"},MMLnamespace:"http://www.w3.org/1998/Math/MathML",PreProcess:function(e){if(!this.configured){this.config=MathJax.Hub.CombineConfig("mml2jax",this.config);if(this.config.Augment){MathJax.Hub.Insert(this,this.config.Augment)}this.InitBrowser();this.configured=true}if(typeof(e)==="string"){e=document.getElementById(e)}if(!e){e=document.body}var h=[];this.PushMathElements(h,e,"math");this.PushMathElements(h,e,"math",this.MMLnamespace);var d,b;if(typeof(document.namespaces)!=="undefined"){try{for(d=0,b=document.namespaces.length;d<b;d++){var f=document.namespaces[d];if(f.urn===this.MMLnamespace){this.PushMathElements(h,e,f.name+":math")}}}catch(g){}}else{var c=document.getElementsByTagName("html")[0];if(c){for(d=0,b=c.attributes.length;d<b;d++){var a=c.attributes[d];if(a.nodeName.substr(0,6)==="xmlns:"&&a.nodeValue===this.MMLnamespace){this.PushMathElements(h,e,a.nodeName.substr(6)+":math")}}}}this.ProcessMathArray(h)},PushMathElements:function(f,d,a,c){var h,g=MathJax.Hub.config.preRemoveClass;if(c){if(!d.getElementsByTagNameNS){return}h=d.getElementsByTagNameNS(c,a)}else{h=d.getElementsByTagName(a)}for(var e=0,b=h.length;e<b;e++){var j=h[e].parentNode;if(j&&j.className!==g&&!j.isMathJax&&!h[e].prefix===!c){f.push(h[e])}}},ProcessMathArray:function(c){var b,a=c.length;if(a){if(this.MathTagBug){for(b=0;b<a;b++){if(c[b].nodeName==="MATH"){this.ProcessMathFlattened(c[b])}else{this.ProcessMath(c[b])}}}else{for(b=0;b<a;b++){this.ProcessMath(c[b])}}}},ProcessMath:function(e){var d=e.parentNode;if(!d||d.className===MathJax.Hub.config.preRemoveClass){return}var a=document.createElement("script");a.type="math/mml";d.insertBefore(a,e);if(this.AttributeBug){var b=this.OuterHTML(e);if(this.CleanupHTML){b=b.replace(/<\?import .*?>/i,"").replace(/<\?xml:namespace .*?\/>/i,"");b=b.replace(/&nbsp;/g,"&#xA0;")}MathJax.HTML.setScript(a,b);d.removeChild(e)}else{var c=MathJax.HTML.Element("span");c.appendChild(e);MathJax.HTML.setScript(a,c.innerHTML)}if(this.config.preview!=="none"){this.createPreview(e,a)}},ProcessMathFlattened:function(f){var d=f.parentNode;if(!d||d.className===MathJax.Hub.config.preRemoveClass){return}var b=document.createElement("script");b.type="math/mml";d.insertBefore(b,f);var c="",e,a=f;while(f&&f.nodeName!=="/MATH"){e=f;f=f.nextSibling;c+=this.NodeHTML(e);e.parentNode.removeChild(e)}if(f&&f.nodeName==="/MATH"){f.parentNode.removeChild(f)}b.text=c+"</math>";if(this.config.preview!=="none"){this.createPreview(a,b)}},NodeHTML:function(e){var c,b,a;if(e.nodeName==="#text"){c=this.quoteHTML(e.nodeValue)}else{if(e.nodeName==="#comment"){c="<!--"+e.nodeValue+"-->"}else{c="<"+e.nodeName.toLowerCase();for(b=0,a=e.attributes.length;b<a;b++){var d=e.attributes[b];if(d.specified&&d.nodeName.substr(0,10)!=="_moz-math-"){c+=" "+d.nodeName.toLowerCase().replace(/xmlns:xmlns/,"xmlns")+"=";var f=d.nodeValue;if(f==null&&d.nodeName==="style"&&e.style){f=e.style.cssText}c+='"'+this.quoteHTML(f)+'"'}}c+=">";if(e.outerHTML!=null&&e.outerHTML.match(/(.<\/[A-Z]+>|\/>)$/)){for(b=0,a=e.childNodes.length;b<a;b++){c+=this.OuterHTML(e.childNodes[b])}c+="</"+e.nodeName.toLowerCase()+">"}}}return c},OuterHTML:function(d){if(d.nodeName.charAt(0)==="#"){return this.NodeHTML(d)}if(!this.AttributeBug){return d.outerHTML}var c=this.NodeHTML(d);for(var b=0,a=d.childNodes.length;b<a;b++){c+=this.OuterHTML(d.childNodes[b])}c+="</"+d.nodeName.toLowerCase()+">";return c},quoteHTML:function(a){if(a==null){a=""}return a.replace(/&/g,"&#x26;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;")},createPreview:function(f,b){var g=this.config.preview;if(g==="none"){return}var a=false;if(g==="mathml"){a=true;if(this.MathTagBug){g="alttext"}else{g=f.cloneNode(true)}}if(g==="alttext"||g==="altimg"){a=true;var c=this.filterPreview(f.getAttribute("alttext"));if(g==="alttext"){if(c!=null){g=MathJax.HTML.TextNode(c)}else{g=null}}else{var h=f.getAttribute("altimg");if(h!=null){var e={width:f.getAttribute("altimg-width"),height:f.getAttribute("altimg-height")};g=MathJax.HTML.Element("img",{src:h,alt:c,style:e})}else{g=null}}}if(g){var d;if(a){d=MathJax.HTML.Element("span",{className:MathJax.Hub.config.preRemoveClass});d.appendChild(g)}else{d=MathJax.HTML.Element("span",{className:MathJax.Hub.config.preRemoveClass},g)}b.parentNode.insertBefore(d,b)}},filterPreview:function(a){return a},InitBrowser:function(){var b=MathJax.HTML.Element("span",{id:"<",className:"mathjax",innerHTML:"<math><mi>x</mi><mspace /></math>"});var a=b.outerHTML||"";this.AttributeBug=a!==""&&!(a.match(/id="&lt;"/)&&a.match(/class="mathjax"/)&&a.match(/<\/math>/));this.MathTagBug=b.childNodes.length>1;this.CleanupHTML=MathJax.Hub.Browser.isMSIE}};MathJax.Hub.Register.PreProcessor(["PreProcess",MathJax.Extension.mml2jax],5);MathJax.Ajax.loadComplete("[MathJax]/extensions/mml2jax.js");
