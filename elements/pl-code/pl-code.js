/* eslint-env browser,jquery */
/* global hljs */
$(document).ready(function() {
    $('pre.pl-code code').each(function(i, block) {
        hljs.highlightBlock(block);
    });
});
