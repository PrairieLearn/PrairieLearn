/*
 *  /MathJax/extensions/MathML/mml3.js
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

MathJax.Extension["MathML/mml3"]={version:"2.6.0"};MathJax.Hub.Register.StartupHook("MathML Jax Ready",function(){var d=MathJax.InputJax.MathML,g=d.Parse.prototype;d.prefilterHooks.Add(function(j){if(!d.mml3XSLT){return}if(!d.ParseXML){d.ParseXML=d.createParser()}var k=d.ParseXML(g.preProcessMath(j.math));var i=d.mml3XSLT.transformToDocument(k);if((typeof i)==="string"){j.math=i}else{if(window.XMLSerializer){var h=new XMLSerializer();j.math=h.serializeToString(i.documentElement,k)}}});var f=MathJax.Hub.Browser;var c="";if(f.isEdge||f.isMSIE){c="urn:schemas-microsoft-com:xslt"}else{c="http://exslt.org/common"}var e='<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" 		xmlns:m="http://www.w3.org/1998/Math/MathML"		xmlns:c="'+c+'"		exclude-result-prefixes="m c"><xsl:output indent="yes" omit-xml-declaration="yes"/><xsl:output indent="yes" omit-xml-declaration="yes"/><xsl:template match="*"> <xsl:copy>  <xsl:copy-of select="@*"/>  <xsl:apply-templates/> </xsl:copy></xsl:template><xsl:template match="m:*[@dir=\'rtl\']"  priority="10"> <xsl:apply-templates mode="rtl" select="."/></xsl:template><xsl:template match="@*" mode="rtl"> <xsl:copy-of select="."/> <xsl:attribute name="dir">ltr</xsl:attribute></xsl:template><xsl:template match="*" mode="rtl"> <xsl:copy>  <xsl:apply-templates select="@*" mode="rtl"/>  <xsl:for-each select="node()">   <xsl:sort data-type="number" order="descending" select="position()"/>   <xsl:text> </xsl:text>   <xsl:apply-templates mode="rtl" select="."/>  </xsl:for-each> </xsl:copy></xsl:template><xsl:template match="@open" mode="rtl"> <xsl:attribute name="close"><xsl:value-of select="."/></xsl:attribute></xsl:template><xsl:template match="@open[.=\'(\']" mode="rtl"> <xsl:attribute name="close">)</xsl:attribute></xsl:template><xsl:template match="@open[.=\')\']" mode="rtl"> <xsl:attribute name="close">(</xsl:attribute></xsl:template><xsl:template match="@open[.=\'[\']" mode="rtl"> <xsl:attribute name="close">]</xsl:attribute></xsl:template><xsl:template match="@open[.=\']\']" mode="rtl"> <xsl:attribute name="close">[</xsl:attribute></xsl:template><xsl:template match="@open[.=\'{\']" mode="rtl"> <xsl:attribute name="close">}</xsl:attribute></xsl:template><xsl:template match="@open[.=\'}\']" mode="rtl"> <xsl:attribute name="close">{</xsl:attribute></xsl:template><xsl:template match="@close" mode="rtl"> <xsl:attribute name="open"><xsl:value-of select="."/></xsl:attribute></xsl:template><xsl:template match="@close[.=\'(\']" mode="rtl"> <xsl:attribute name="open">)</xsl:attribute></xsl:template><xsl:template match="@close[.=\')\']" mode="rtl"> <xsl:attribute name="open">(</xsl:attribute></xsl:template><xsl:template match="@close[.=\'[\']" mode="rtl"> <xsl:attribute name="open">]</xsl:attribute></xsl:template><xsl:template match="@close[.=\']\']" mode="rtl"> <xsl:attribute name="open">[</xsl:attribute></xsl:template><xsl:template match="@close[.=\'{\']" mode="rtl"> <xsl:attribute name="open">}</xsl:attribute></xsl:template><xsl:template match="@close[.=\'}\']" mode="rtl"> <xsl:attribute name="open">{</xsl:attribute></xsl:template><xsl:template match="m:mfrac[@bevelled=\'true\']" mode="rtl"> <m:mrow>  <m:msub><m:mi></m:mi><xsl:apply-templates select="*[2]" mode="rtl"/></m:msub>  <m:mo>&#x5c;</m:mo>  <m:msup><m:mi></m:mi><xsl:apply-templates select="*[1]" mode="rtl"/></m:msup> </m:mrow></xsl:template><xsl:template match="m:mfrac" mode="rtl"> <xsl:copy>  <xsl:apply-templates mode="rtl" select="@*|*"/> </xsl:copy></xsl:template><xsl:template match="m:mroot" mode="rtl"> <m:msup>  <m:menclose notation="top right">   <xsl:apply-templates mode="rtl" select="@*|*[1]"/>  </m:menclose>  <xsl:apply-templates mode="rtl" select="*[2]"/> </m:msup></xsl:template><xsl:template match="m:msqrt" mode="rtl"> <m:menclose notation="top right">  <xsl:apply-templates mode="rtl" select="@*|*[1]"/> </m:menclose></xsl:template><xsl:template match="m:mtable|m:munder|m:mover|m:munderover" mode="rtl" priority="2"> <xsl:copy>  <xsl:apply-templates select="@*" mode="rtl"/>  <xsl:apply-templates mode="rtl">  </xsl:apply-templates> </xsl:copy></xsl:template><xsl:template match="m:msup" mode="rtl" priority="2"> <m:mmultiscripts>  <xsl:apply-templates select="*[1]" mode="rtl"/>  <m:mprescripts/>  <m:none/>  <xsl:apply-templates select="*[2]" mode="rtl"/> </m:mmultiscripts></xsl:template><xsl:template match="m:msub" mode="rtl" priority="2"> <m:mmultiscripts>  <xsl:apply-templates select="*[1]" mode="rtl"/>  <m:mprescripts/>  <xsl:apply-templates select="*[2]" mode="rtl"/>  <m:none/> </m:mmultiscripts></xsl:template><xsl:template match="m:msubsup" mode="rtl" priority="2"> <m:mmultiscripts>  <xsl:apply-templates select="*[1]" mode="rtl"/>  <m:mprescripts/>  <xsl:apply-templates select="*[2]" mode="rtl"/>  <xsl:apply-templates select="*[3]" mode="rtl"/> </m:mmultiscripts></xsl:template><xsl:template match="m:mmultiscripts" mode="rtl" priority="2"> <m:mmultiscripts>  <xsl:apply-templates select="*[1]" mode="rtl"/>  <xsl:for-each  select="m:mprescripts/following-sibling::*[position() mod 2 = 1]">   <xsl:sort data-type="number" order="descending" select="position()"/>   <xsl:apply-templates select="."  mode="rtl"/>   <xsl:apply-templates select="following-sibling::*[1]"  mode="rtl"/>  </xsl:for-each>  <m:mprescripts/>  <xsl:for-each  select="m:mprescripts/preceding-sibling::*[position()!=last()][position() mod 2 = 0]">   <xsl:sort data-type="number" order="descending" select="position()"/>   <xsl:apply-templates select="."  mode="rtl"/>   <xsl:apply-templates select="following-sibling::*[1]"  mode="rtl"/>  </xsl:for-each> </m:mmultiscripts></xsl:template><xsl:template match="m:mmultiscripts[not(m:mprescripts)]" mode="rtl" priority="3"> <m:mmultiscripts>  <xsl:apply-templates select="*[1]" mode="rtl"/>  <m:mprescripts/>  <xsl:for-each  select="*[position() mod 2 = 0]">   <xsl:sort data-type="number" order="descending" select="position()"/>   <xsl:apply-templates select="."  mode="rtl"/>   <xsl:apply-templates select="following-sibling::*[1]"  mode="rtl"/>  </xsl:for-each> </m:mmultiscripts></xsl:template><xsl:template match="text()[.=\'(\']" mode="rtl">)</xsl:template><xsl:template match="text()[.=\')\']" mode="rtl">(</xsl:template><xsl:template match="text()[.=\'{\']" mode="rtl">}</xsl:template><xsl:template match="text()[.=\'}\']" mode="rtl">{</xsl:template><xsl:template match="text()[.=\'&lt;\']" mode="rtl">&gt;</xsl:template><xsl:template match="text()[.=\'&gt;\']" mode="rtl">&lt;</xsl:template><xsl:template match="text()[.=\'&#x2208;\']" mode="rtl">&#x220b;</xsl:template><xsl:template match="text()[.=\'&#x220b;\']" mode="rtl">&#x2208;</xsl:template><xsl:template match="@notation[.=\'radical\']" mode="rtl"> <xsl:attribute name="notation">top right</xsl:attribute></xsl:template><xsl:template match="m:mlongdiv|m:mstack" mode="rtl"> <m:mrow dir="ltr"> <xsl:apply-templates select="."/> </m:mrow></xsl:template><xsl:template match="m:mstack" priority="11"> <xsl:variable name="m">  <m:mtable columnspacing="0em">   <xsl:copy-of select="@align"/>  <xsl:variable name="t">   <xsl:apply-templates select="*" mode="mstack1">    <xsl:with-param name="p" select="0"/>   </xsl:apply-templates>  </xsl:variable>  <xsl:variable name="maxl">   <xsl:for-each select="c:node-set($t)/*/@l">    <xsl:sort data-type="number" order="descending"/>    <xsl:if test="position()=1">     <xsl:value-of select="."/>    </xsl:if>   </xsl:for-each>  </xsl:variable>  <xsl:for-each select="c:node-set($t)/*[not(@class=\'mscarries\') or following-sibling::*[1]/@class=\'mscarries\']"><xsl:variable name="c" select="preceding-sibling::*[1][@class=\'mscarries\']"/>   <xsl:text>&#10;</xsl:text>   <m:mtr>    <xsl:copy-of select="@class[.=\'msline\']"/>    <xsl:variable name="offset" select="$maxl - @l"/>    <xsl:choose>     <xsl:when test="@class=\'msline\' and @l=\'*\'">      <xsl:variable name="msl" select="*[1]"/>      <xsl:for-each select="(//node())[position()&lt;=$maxl]">       <xsl:copy-of select="$msl"/>      </xsl:for-each>     </xsl:when>     <xsl:when test="$c">      <xsl:variable name="ldiff" select="$c/@l - @l"/>      <xsl:variable name="loffset" select="$maxl - $c/@l"/>      <xsl:for-each select="(//*)[position()&lt;= $offset]">       <xsl:variable name="pn" select="position()"/>       <xsl:variable name="cy" select="$c/*[position()=$pn - $loffset]"/>	 <m:mtd>	  <xsl:if test="$cy/*">	  <m:mover><m:mphantom><m:mn>0</m:mn></m:mphantom><m:mpadded width="0em" lspace="-0.5width">	  <xsl:copy-of select="$cy/*"/></m:mpadded></m:mover>	  </xsl:if>	 </m:mtd>      </xsl:for-each>      <xsl:for-each select="*">       <xsl:variable name="pn" select="position()"/>       <xsl:variable name="cy" select="$c/*[position()=$pn + $ldiff]"/>       <xsl:copy>	<xsl:copy-of select="@*"/>	<xsl:variable name="b">	 <xsl:choose>	  <xsl:when test="not(string($cy/@crossout) or $cy/@crossout=\'none\')"><xsl:copy-of select="*"/></xsl:when>	  <xsl:otherwise>	   <m:menclose notation="{$cy/@crossout}"><xsl:copy-of select="*"/></m:menclose>	  </xsl:otherwise>	 </xsl:choose>	</xsl:variable>	<xsl:choose>	 <xsl:when test="$cy/m:none or not($cy/*)"><xsl:copy-of select="$b"/></xsl:when>	 <xsl:when test="not(string($cy/@location)) or $cy/@location=\'n\'">	  <m:mover>	   <xsl:copy-of select="$b"/><m:mpadded width="0em" lspace="-0.5width">	   <xsl:copy-of select="$cy/*"/>	  </m:mpadded>	  </m:mover>	 </xsl:when>	 <xsl:when test="$cy/@location=\'nw\'">	  <m:mmultiscripts><xsl:copy-of select="$b"/><m:mprescripts/><m:none/><m:mpadded lspace="-1width" width="0em"><xsl:copy-of select="$cy/*"/></m:mpadded></m:mmultiscripts>	 </xsl:when>	 <xsl:when test="$cy/@location=\'s\'">	  <m:munder><xsl:copy-of select="$b"/><m:mpadded width="0em" lspace="-0.5width"><xsl:copy-of select="$cy/*"/></m:mpadded></m:munder>	 </xsl:when>	 <xsl:when test="$cy/@location=\'sw\'">	  <m:mmultiscripts><xsl:copy-of select="$b"/><m:mprescripts/><m:mpadded lspace="-1width" width="0em"><xsl:copy-of select="$cy/*"/></m:mpadded><m:none/></m:mmultiscripts>	 </xsl:when>	 <xsl:when test="$cy/@location=\'ne\'">	  <m:msup><xsl:copy-of select="$b"/><m:mpadded width="0em"><xsl:copy-of select="$cy/*"/></m:mpadded></m:msup>	 </xsl:when>	 <xsl:when test="$cy/@location=\'se\'">	  <m:msub><xsl:copy-of select="$b"/><m:mpadded width="0em"><xsl:copy-of select="$cy/*"/></m:mpadded></m:msub>	 </xsl:when>	 <xsl:when test="$cy/@location=\'w\'">	  <m:msup><m:mrow/><m:mpadded lspace="-1width" width="0em"><xsl:copy-of select="$cy/*"/></m:mpadded></m:msup>	  <xsl:copy-of select="$b"/>	 </xsl:when>	 <xsl:when test="$cy/@location=\'e\'">	  <xsl:copy-of select="$b"/>	  <m:msup><m:mrow/><m:mpadded width="0em"><xsl:copy-of select="$cy/*"/></m:mpadded></m:msup>	 </xsl:when>	 <xsl:otherwise>	  <xsl:copy-of select="$b"/>	 </xsl:otherwise>	</xsl:choose>       </xsl:copy>      </xsl:for-each>     </xsl:when>     <xsl:otherwise>      <xsl:for-each select="(//*)[position()&lt;= $offset]"><m:mtd/></xsl:for-each>      <xsl:copy-of select="*"/>     </xsl:otherwise>    </xsl:choose>   </m:mtr>  </xsl:for-each> </m:mtable></xsl:variable><xsl:apply-templates mode="ml" select="c:node-set($m)"/></xsl:template><xsl:template match="*" mode="ml"> <xsl:copy>  <xsl:copy-of select="@*"/>  <xsl:apply-templates mode="ml"/> </xsl:copy></xsl:template><xsl:template mode="ml" match="m:mtr[following-sibling::*[1][@class=\'msline\']]"> <m:mtr>  <xsl:copy-of select="@*"/>  <xsl:variable name="m" select="following-sibling::*[1]/m:mtd"/>  <xsl:for-each select="m:mtd">   <xsl:variable name="p" select="position()"/>   <m:mtd>    <xsl:copy-of select="@*"/>    <xsl:choose>     <xsl:when test="$m[$p]/m:mpadded">      <m:menclose notation="bottom">       <m:mpadded depth=".1em" height="1em" width=".4em">	<xsl:copy-of select="*"/>       </m:mpadded>      </m:menclose>     </xsl:when>     <xsl:otherwise>      <xsl:copy-of select="*"/>     </xsl:otherwise>    </xsl:choose>   </m:mtd>  </xsl:for-each> </m:mtr></xsl:template><xsl:template mode="ml" match="m:mtr[not(preceding-sibling::*)][@class=\'msline\']" priority="3"> <m:mtr>  <xsl:copy-of select="@*"/>  <xsl:for-each select="m:mtd">   <m:mtd>    <xsl:copy-of select="@*"/>    <xsl:if test="m:mpadded">     <m:menclose notation="bottom">      <m:mpadded depth=".1em" height="1em" width=".4em">       <m:mspace width=".2em"/>      </m:mpadded>     </m:menclose>    </xsl:if>   </m:mtd>  </xsl:for-each> </m:mtr></xsl:template><xsl:template mode="ml" match="m:mtr[@class=\'msline\']" priority="2"/><xsl:template mode="mstack1" match="*"> <xsl:param name="p"/> <xsl:param name="maxl" select="0"/> <m:mtr l="{1 + $p}">  <xsl:if test="ancestor::mstack[1]/@stackalign=\'left\'">   <xsl:attribute name="l"><xsl:value-of  select="$p"/></xsl:attribute>  </xsl:if>  <m:mtd><xsl:apply-templates select="."/></m:mtd> </m:mtr></xsl:template><xsl:template mode="mstack1" match="m:msrow"> <xsl:param name="p"/> <xsl:param name="maxl" select="0"/> <xsl:variable  name="align1" select="ancestor::m:mstack[1]/@stackalign"/> <xsl:variable name="align">  <xsl:choose>   <xsl:when test="string($align1)=\'\'">decimalpoint</xsl:when>   <xsl:otherwise><xsl:value-of select="$align1"/></xsl:otherwise>  </xsl:choose> </xsl:variable> <xsl:variable name="row">  <xsl:apply-templates mode="mstack1" select="*">   <xsl:with-param name="p" select="0"/>  </xsl:apply-templates> </xsl:variable> <xsl:text>&#10;</xsl:text> <xsl:variable name="l1">  <xsl:choose>   <xsl:when test="$align=\'decimalpoint\' and m:mn">    <xsl:for-each select="c:node-set($row)/m:mtr[m:mtd/m:mn][1]">     <xsl:value-of select="number(sum(@l))+count(preceding-sibling::*/@l)"/>    </xsl:for-each>   </xsl:when>   <xsl:when test="$align=\'right\' or $align=\'decimalpoint\'">    <xsl:value-of select="count(c:node-set($row)/m:mtr/m:mtd)"/>   </xsl:when>   <xsl:otherwise>    <xsl:value-of select="0"/>   </xsl:otherwise>  </xsl:choose> </xsl:variable> <m:mtr class="msrow" l="{number($l1) + number(sum(@position)) +$p}">  <xsl:copy-of select="c:node-set($row)/m:mtr/*"/> </m:mtr></xsl:template><xsl:template mode="mstack1" match="m:mn"> <xsl:param name="p"/> <xsl:variable name="align1" select="ancestor::m:mstack[1]/@stackalign"/> <xsl:variable name="dp1" select="ancestor::*[@decimalpoint][1]/@decimalpoint"/> <xsl:variable name="align">  <xsl:choose>   <xsl:when test="string($align1)=\'\'">decimalpoint</xsl:when>   <xsl:otherwise><xsl:value-of select="$align1"/></xsl:otherwise>  </xsl:choose> </xsl:variable> <xsl:variable name="dp">  <xsl:choose>   <xsl:when test="string($dp1)=\'\'">.</xsl:when>   <xsl:otherwise><xsl:value-of select="$dp1"/></xsl:otherwise>  </xsl:choose> </xsl:variable> <m:mtr l="$p">  <xsl:variable name="mn" select="normalize-space(.)"/>  <xsl:variable name="len" select="string-length($mn)"/>  <xsl:choose>   <xsl:when test="$align=\'right\' or ($align=\'decimalpoint\' and not(contains($mn,$dp)))">    <xsl:attribute name="l"><xsl:value-of select="$p + $len"/></xsl:attribute>   </xsl:when>   <xsl:when test="$align=\'center\'">    <xsl:attribute name="l"><xsl:value-of select="round(($p + $len) div 2)"/></xsl:attribute>   </xsl:when>   <xsl:when test="$align=\'decimalpoint\'">    <xsl:attribute name="l"><xsl:value-of select="$p + string-length(substring-before($mn,$dp))"/></xsl:attribute>   </xsl:when>  </xsl:choose>  <xsl:for-each select="(//node())[position() &lt;=$len]">   <xsl:variable name="pos" select="position()"/>   <m:mtd><m:mn><xsl:value-of select="substring($mn,$pos,1)"/></m:mn></m:mtd>  </xsl:for-each> </m:mtr></xsl:template><xsl:template match="m:msgroup" mode="mstack1"> <xsl:param name="p"/> <xsl:variable name="s" select="number(sum(@shift))"/> <xsl:variable name="thisp" select="number(sum(@position))"/> <xsl:for-each select="*">  <xsl:apply-templates mode="mstack1" select=".">   <xsl:with-param name="p" select="number($p)+$thisp+(position()-1)*$s"/>  </xsl:apply-templates> </xsl:for-each></xsl:template><xsl:template match="m:msline" mode="mstack1"> <xsl:param name="p"/> <xsl:variable  name="align1" select="ancestor::m:mstack[1]/@stackalign"/> <xsl:variable name="align">  <xsl:choose>   <xsl:when test="string($align1)=\'\'">decimalpoint</xsl:when>   <xsl:otherwise><xsl:value-of select="$align1"/></xsl:otherwise>  </xsl:choose> </xsl:variable> <m:mtr class="msline">  <xsl:attribute name="l">   <xsl:choose>    <xsl:when test="not(string(@length)) or @length=0">*</xsl:when>    <xsl:when test="string($align)=\'right\' or string($align)=\'decimalpoint\' "><xsl:value-of select="$p+ @length"/></xsl:when>    <xsl:otherwise><xsl:value-of select="$p"/></xsl:otherwise>   </xsl:choose>  </xsl:attribute>  <xsl:variable name="w">   <xsl:choose>    <xsl:when test="@mslinethickness=\'thin\'">0.1em</xsl:when>    <xsl:when test="@mslinethickness=\'medium\'">0.15em</xsl:when>    <xsl:when test="@mslinethickness=\'thick\'">0.2em</xsl:when>    <xsl:when test="@mslinethickness"><xsl:value-of select="@mslinethickness"/></xsl:when>    <xsl:otherwise>0.15em</xsl:otherwise>   </xsl:choose>  </xsl:variable>  <xsl:choose>   <xsl:when test="not(string(@length)) or @length=0">    <m:mtd class="mslinemax">     <m:mpadded lspace="-0.2em" width="0em" height="0em">      <m:mfrac linethickness="{$w}">       <m:mspace width=".4em"/>       <m:mrow/>      </m:mfrac>     </m:mpadded>    </m:mtd>   </xsl:when>   <xsl:otherwise>    <xsl:variable name="l" select="@length"/>    <xsl:for-each select="(//node())[position()&lt;=$l]">     <m:mtd class="msline">      <m:mpadded lspace="-0.2em" width="0em" height="0em">       <m:mfrac linethickness="{$w}">	<m:mspace width=".4em"/>	<m:mrow/>       </m:mfrac>      </m:mpadded>     </m:mtd>    </xsl:for-each>   </xsl:otherwise>  </xsl:choose> </m:mtr></xsl:template><xsl:template match="m:mscarries" mode="mstack1"> <xsl:param name="p"/> <xsl:variable  name="align1" select="ancestor::m:mstack[1]/@stackalign"/> <xsl:variable name="l1">  <xsl:choose>   <xsl:when test="string($align1)=\'left\'">0</xsl:when>   <xsl:otherwise><xsl:value-of select="count(*)"/></xsl:otherwise>  </xsl:choose> </xsl:variable> <m:mtr class="mscarries" l="{$p + $l1 + sum(@position)}">  <xsl:apply-templates select="*" mode="msc"/> </m:mtr></xsl:template><xsl:template match="*" mode="msc"> <m:mtd>  <xsl:copy-of select="../@location|../@crossout"/>  <xsl:choose>   <xsl:when test="../@scriptsizemultiplier">    <m:mstyle mathsize="{round(../@scriptsizemultiplier div .007)}%">     <xsl:apply-templates select="."/>    </m:mstyle>   </xsl:when>   <xsl:otherwise>    <xsl:apply-templates select="."/>   </xsl:otherwise>  </xsl:choose> </m:mtd></xsl:template><xsl:template match="m:mscarry" mode="msc"> <m:mtd> <xsl:copy-of select="@location|@crossout"/>  <xsl:choose>   <xsl:when test="../@scriptsizemultiplier">    <m:mstyle mathsize="{round(../@scriptsizemultiplier div .007)}%">     <xsl:apply-templates/>    </m:mstyle>   </xsl:when>   <xsl:otherwise>    <xsl:apply-templates/>   </xsl:otherwise>  </xsl:choose> </m:mtd></xsl:template><xsl:template match="m:mlongdiv" priority="11"> <xsl:variable name="ms">  <m:mstack>   <xsl:copy-of select="(ancestor-or-self::*/@decimalpoint)[last()]"/>   <xsl:choose>    <xsl:when test="@longdivstyle=\'left)(right\'">     <m:msrow>      <m:mrow><xsl:copy-of select="*[1]"/></m:mrow>      <m:mo>)</m:mo>      <xsl:copy-of select="*[3]"/>      <m:mo>(</m:mo>      <xsl:copy-of select="*[2]"/>     </m:msrow>    </xsl:when>    <xsl:when test="@longdivstyle=\'left/\right\'">     <m:msrow>      <m:mrow><xsl:copy-of select="*[1]"/></m:mrow>      <m:mo>/</m:mo>      <xsl:copy-of select="*[3]"/>      <m:mo></m:mo>      <xsl:copy-of select="*[2]"/>     </m:msrow>    </xsl:when>    <xsl:when test="@longdivstyle=\':right=right\'">     <m:msrow>      <xsl:copy-of select="*[3]"/>      <m:mo>:</m:mo>      <xsl:copy-of select="*[1]"/>      <m:mo>=</m:mo>      <xsl:copy-of select="*[2]"/>     </m:msrow>    </xsl:when>    <xsl:when test="@longdivstyle=\'stackedrightright\'		    or @longdivstyle=\'mediumstackedrightright\'		    or @longdivstyle=\'shortstackedrightright\'		    or @longdivstyle=\'stackedleftleft\'		    ">     <xsl:attribute name="align">top</xsl:attribute>     <xsl:copy-of select="*[3]"/>    </xsl:when>    <xsl:when test="@longdivstyle=\'stackedleftlinetop\'">     <xsl:copy-of select="*[2]"/>     <m:msline length="{string-length(*[3])-1}"/>     <m:msrow>      <m:mrow>     <m:menclose notation="bottom right">      <xsl:copy-of select="*[1]"/>     </m:menclose>      </m:mrow>      <xsl:copy-of select="*[3]"/>     </m:msrow>    </xsl:when>    <xsl:when test="@longdivstyle=\'righttop\'">     <xsl:copy-of select="*[2]"/>     <m:msline length="{string-length(*[3])}"/>     <m:msrow>      <xsl:copy-of select="*[3]"/>      <m:menclose notation="top left bottom">       <xsl:copy-of select="*[1]"/></m:menclose>     </m:msrow>    </xsl:when>    <xsl:otherwise>     <xsl:copy-of select="*[2]"/>     <m:msline length="{string-length(*[3])}"/>     <m:msrow>      <m:mrow><xsl:copy-of select="*[1]"/></m:mrow>      <m:mo>)</m:mo>      <xsl:copy-of select="*[3]"/>     </m:msrow>    </xsl:otherwise>   </xsl:choose>   <xsl:copy-of select="*[position()&gt;3]"/>  </m:mstack> </xsl:variable> <xsl:choose>  <xsl:when test="@longdivstyle=\'stackedrightright\'">   <m:menclose notation="right">    <xsl:apply-templates select="c:node-set($ms)"/>   </m:menclose>   <m:mtable align="top">    <m:mtr>     <m:menclose notation="bottom">      <xsl:copy-of select="*[1]"/>     </m:menclose>    </m:mtr>    <m:mtr>     <mtd><xsl:copy-of select="*[2]"/></mtd>    </m:mtr>   </m:mtable>  </xsl:when>    <xsl:when test="@longdivstyle=\'mediumstackedrightright\'">    <xsl:apply-templates select="c:node-set($ms)"/>   <m:menclose notation="left">   <m:mtable align="top">    <m:mtr>     <m:menclose notation="bottom">      <xsl:copy-of select="*[1]"/>     </m:menclose>    </m:mtr>    <m:mtr>     <mtd><xsl:copy-of select="*[2]"/></mtd>    </m:mtr>   </m:mtable>   </m:menclose>  </xsl:when>  <xsl:when test="@longdivstyle=\'shortstackedrightright\'">    <xsl:apply-templates select="c:node-set($ms)"/>   <m:mtable align="top">    <m:mtr>     <m:menclose notation="left bottom">      <xsl:copy-of select="*[1]"/>     </m:menclose>    </m:mtr>    <m:mtr>     <mtd><xsl:copy-of select="*[2]"/></mtd>    </m:mtr>   </m:mtable>  </xsl:when>  <xsl:when test="@longdivstyle=\'stackedleftleft\'">   <m:mtable align="top">    <m:mtr>     <m:menclose notation="bottom">      <xsl:copy-of select="*[1]"/>     </m:menclose>    </m:mtr>    <m:mtr>     <mtd><xsl:copy-of select="*[2]"/></mtd>    </m:mtr>   </m:mtable>   <m:menclose notation="left">    <xsl:apply-templates select="c:node-set($ms)"/>   </m:menclose>  </xsl:when>  <xsl:otherwise>   <xsl:apply-templates select="c:node-set($ms)"/>  </xsl:otherwise> </xsl:choose></xsl:template><xsl:template match="m:menclose[@notation=\'madruwb\']" mode="rtl"> <m:menclose notation="bottom right">  <xsl:apply-templates mode="rtl"/> </m:menclose></xsl:template></xsl:stylesheet>';var b;if(window.XSLTProcessor){if(!d.ParseXML){d.ParseXML=d.createParser()}d.mml3XSLT=new XSLTProcessor();d.mml3XSLT.importStylesheet(d.ParseXML(e))}else{if(MathJax.Hub.Browser.isMSIE){if(MathJax.Hub.Browser.versionAtLeast("9.0")||(document.documentMode||0)>=9){b=new ActiveXObject("Msxml2.FreeThreadedDOMDocument");b.loadXML(e);var a=new ActiveXObject("Msxml2.XSLTemplate");a.stylesheet=b;d.mml3XSLT={mml3:a.createProcessor(),transformToDocument:function(h){this.mml3.input=h;this.mml3.transform();return this.mml3.output}}}else{b=d.createMSParser();b.async=false;b.loadXML(e);d.mml3XSLT={mml3:b,transformToDocument:function(h){return h.documentElement.transformNode(this.mml3)}}}}else{d.mml3XSLT=null}}MathJax.Ajax.Styles({".MathJax .mi, .MathJax .mo, .MathJax .mn, .MathJax .mtext":{direction:"ltr",display:"inline-block"},".MathJax .ms, .MathJax .mspace, .MathJax .mglyph":{direction:"ltr",display:"inline-block"}});MathJax.Hub.Startup.signal.Post("MathML mml3.js Ready")});MathJax.Ajax.loadComplete("[MathJax]/extensions/MathML/mml3.js");
