/*
 *  /MathJax/jax/output/CommonHTML/autoload/maction.js
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

MathJax.Hub.Register.StartupHook("CommonHTML Jax Ready",function(){var g="2.6.0";var c=MathJax.ElementJax.mml,e=MathJax.OutputJax.CommonHTML;var d,f,b;var a=e.config.tooltip=MathJax.Hub.Insert({delayPost:600,delayClear:600,offsetX:10,offsetY:5},e.config.tooltip||{});c.maction.Augment({CHTMLtooltip:e.addElement(document.body,"div",{id:"MathJax_CHTML_Tooltip"}),toCommonHTML:function(j){var i=this.Get("selection");j=this.CHTMLcreateNode(j);this.CHTML=e.BBOX.empty();this.CHTMLhandleStyle(j);this.CHTMLhandleScale(j);this.CHTMLaddChild(j,i-1,{});this.CHTML.clean();this.CHTMLhandleSpace(j);this.CHTMLhandleBBox(j);this.CHTMLhandleColor(j);var h=this.Get("actiontype");if(this.CHTMLaction[h]&&this.CHTMLaction.hasOwnProperty(h)){this.CHTMLaction[h].call(this,j,i)}return j},CHTMLcoreNode:function(h){return this.CHTMLchildNode(h,0)},CHTMLaction:{toggle:function(i,h){this.selection=h;i.onclick=MathJax.Callback(["CHTMLclick",this,e.jax]);i.style.cursor="pointer"},statusline:function(i,h){i.onmouseover=MathJax.Callback(["CHTMLsetStatus",this]);i.onmouseout=MathJax.Callback(["CHTMLclearStatus",this]);i.onmouseover.autoReset=i.onmouseout.autoReset=true},tooltip:function(i,h){if(this.data[1]&&this.data[1].isToken){i.title=i.alt=this.data[1].data.join("")}else{i.onmouseover=MathJax.Callback(["CHTMLtooltipOver",this,e.jax]);i.onmouseout=MathJax.Callback(["CHTMLtooltipOut",this,e.jax]);i.onmouseover.autoReset=i.onmouseout.autoReset=true}}},CHTMLclick:function(h,k){this.selection++;if(this.selection>this.data.length){this.selection=1}var j=!!h.hover;h.Update();if(j){var i=document.getElementById(h.inputID+"-Span");MathJax.Extension.MathEvents.Hover.Hover(h,i)}return MathJax.Extension.MathEvents.Event.False(k)},CHTMLsetStatus:function(h){this.messageID=MathJax.Message.Set((this.data[1]&&this.data[1].isToken)?this.data[1].data.join(""):this.data[1].toString())},CHTMLclearStatus:function(h){if(this.messageID){MathJax.Message.Clear(this.messageID,0)}delete this.messageID},CHTMLtooltipOver:function(i,j){if(!j){j=window.event}if(b){clearTimeout(b);b=null}if(f){clearTimeout(f)}var h=j.pageX;var l=j.pageY;if(h==null){h=j.clientX+document.body.scrollLeft+document.documentElement.scrollLeft;l=j.clientY+document.body.scrollTop+document.documentElement.scrollTop}var k=MathJax.Callback(["CHTMLtooltipPost",this,i,h+a.offsetX,l+a.offsetY]);f=setTimeout(k,a.delayPost)},CHTMLtooltipOut:function(h,i){if(f){clearTimeout(f);f=null}if(b){clearTimeout(b)}var j=MathJax.Callback(["CHTMLtooltipClear",this,80]);b=setTimeout(j,a.delayClear)},CHTMLtooltipPost:function(i,h,l){f=null;if(b){clearTimeout(b);b=null}var k=this.CHTMLtooltip;k.style.display="block";k.style.opacity="";if(this===d){return}k.style.left=h+"px";k.style.top=l+"px";k.innerHTML='<span class="mjx-chtml"><span class="mjx-math"></span></span>';e.getMetrics(i);try{this.data[1].toCommonHTML(k.firstChild.firstChild)}catch(j){if(!j.restart){throw j}k.style.display="none";MathJax.Callback.After(["CHTMLtooltipPost",this,i,h,l],j.restart);return}d=this},CHTMLtooltipClear:function(i){var h=this.CHTMLtooltip;if(i<=0){h.style.display="none";h.style.opacity=h.style.filter="";b=null}else{h.style.opacity=i/100;h.style.filter="alpha(opacity="+i+")";b=setTimeout(MathJax.Callback(["CHTMLtooltipClear",this,i-20]),50)}}});MathJax.Hub.Startup.signal.Post("CommonHTML maction Ready");MathJax.Ajax.loadComplete(e.autoloadDir+"/maction.js")});
