/*
 *  /MathJax/extensions/TeX/begingroup.js
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

MathJax.Extension["TeX/begingroup"]={version:"2.6.0"};MathJax.Hub.Register.StartupHook("TeX Jax Ready",function(){var d=MathJax.InputJax.TeX,b=d.Definitions;var a=MathJax.Object.Subclass({macros:null,environments:null,Init:function(e,f){this.macros=(e||{});this.environments=(f||{})},Find:function(e,f){if(this[f][e]){return this[f][e]}},Def:function(e,g,f){this[f][e]=g},Undef:function(e,f){delete this[f][e]},Merge:function(e){MathJax.Hub.Insert(this.macros,e.macros);MathJax.Hub.Insert(this.environments,e.environments)},MergeGlobals:function(e){var f=this.macros;for(var g in f){if(f.hasOwnProperty(g)&&f[g].global){e.Def(g,f[g],"macros",true);delete f[g].global;delete f[g]}}},Clear:function(g){this.environments={};if(g){this.macros={}}else{var e=this.macros;for(var f in e){if(e.hasOwnProperty(f)&&!e[f].global){delete e[f]}}}return this}});var c=d.nsStack=MathJax.Object.Subclass({stack:null,top:0,isEqn:false,Init:function(e){this.isEqn=e;this.stack=[];if(!e){this.Push(a(b.macros,b.environment))}else{this.Push(a())}},Def:function(e,h,f,g){var i=this.top-1;if(g){while(i>0){this.stack[i].Undef(e,f);i--}if(!(h instanceof Array)){h=[h]}if(this.isEqn){h.global=true}}this.stack[i].Def(e,h,f)},Push:function(e){this.stack.push(e);this.top=this.stack.length},Pop:function(){var e;if(this.top>1){e=this.stack[--this.top];if(this.isEqn){this.stack.pop()}}else{if(this.isEqn){this.Clear()}}return e},Find:function(e,g){for(var f=this.top-1;f>=0;f--){var h=this.stack[f].Find(e,g);if(h){return h}}return null},Merge:function(e){e.stack[0].MergeGlobals(this);this.stack[this.top-1].Merge(e.stack[0]);var f=[this.top,this.stack.length-this.top].concat(e.stack.slice(1));this.stack.splice.apply(this.stack,f);this.top=this.stack.length},Reset:function(){this.top=this.stack.length},Clear:function(e){this.stack=[this.stack[0].Clear()];this.top=this.stack.length}},{nsFrame:a});b.Add({macros:{begingroup:"BeginGroup",endgroup:"EndGroup",global:["Extension","newcommand"],gdef:["Extension","newcommand"]}},null,true);d.Parse.Augment({BeginGroup:function(e){d.eqnStack.Push(a())},EndGroup:function(e){if(d.eqnStack.top>1){d.eqnStack.Pop()}else{if(d.rootStack.top===1){d.Error(["ExtraEndMissingBegin","Extra %1 or missing \\begingroup",e])}else{d.eqnStack.Clear();d.rootStack.Pop()}}},csFindMacro:function(e){return(d.eqnStack.Find(e,"macros")||d.rootStack.Find(e,"macros"))},envFindName:function(e){return(d.eqnStack.Find(e,"environments")||d.rootStack.Find(e,"environments"))}});d.rootStack=c();d.eqnStack=c(true);d.prefilterHooks.Add(function(){d.rootStack.Reset();d.eqnStack.Clear(true)});d.postfilterHooks.Add(function(){d.rootStack.Merge(d.eqnStack)});MathJax.Hub.Register.StartupHook("TeX newcommand Ready",function(){b.Add({macros:{global:"Global",gdef:["Macro","\\global\\def"]}},null,true);d.Parse.Augment({setDef:function(e,f){f.isUser=true;d.eqnStack.Def(e,f,"macros",this.stack.env.isGlobal);delete this.stack.env.isGlobal},setEnv:function(e,f){f.isUser=true;d.eqnStack.Def(e,f,"environments")},Global:function(e){var f=this.i;var g=this.GetCSname(e);this.i=f;if(g!=="let"&&g!=="def"&&g!=="newcommand"){d.Error(["GlobalNotFollowedBy","%1 not followed by \\let, \\def, or \\newcommand",e])}this.stack.env.isGlobal=true}})});MathJax.Hub.Startup.signal.Post("TeX begingroup Ready")});MathJax.Ajax.loadComplete("[MathJax]/extensions/TeX/begingroup.js");
