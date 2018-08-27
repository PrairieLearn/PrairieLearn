(function() {
    function PrairieUtil() {};

    /**
     * Uses Clipboard.js to wire up a button to copy text to a clipboard. This
     * button will show feedback when the operation is successful or not.
     * @param  {[type]} selector The selector for the target button.
     * @param  {[type]} options  Options for this button.
     */
    PrairieUtil.initCopyButton = function(selector, options) {
        if (!window.Clipboard) {
            console.warn('Clipboard.js isn\'t present on this page. Make sure to include it!');
            return;
        }

        options = options || {};

        var successMessage = options.success || 'copied to clipboard!';

        var clipboard = new ClipboardJS(selector);
        var clicked = false;
        clipboard.on('success', function(e) {
            var contents = options.contents || $(e.trigger).text();

            e.trigger.blur();
            if (clicked) return;
            clicked = true;
            var button = $(e.trigger);

            button.fadeOut(200, function() {
                button.removeClass('btn-secondary').addClass('btn-success');
                button.text(successMessage);
            }).fadeIn(200);

            setTimeout(function() {
                button.fadeOut(200, function() {
                    button.removeClass('btn-success').addClass('btn-secondary');
                    button.text(contents);
                }).fadeIn(200, function() {
                    clicked = false;
                });
            }, 2000);
        });
    };

    window.PrairieUtil = PrairieUtil;
})();
