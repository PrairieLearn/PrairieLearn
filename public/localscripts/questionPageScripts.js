const form = $('form.question-form');
const getForm = () => form.find(':not([name="__variant_id"]):not([name="__csrf_token"])').serialize();
var initialForm;

function confirmOnUnload() {

    // Set form state on load and submit
    initialForm = getForm();
    form.submit(() => {
        initialForm = getForm();
    });

    // Check form state on unload
    $(window).bind('beforeunload', (e) => {
        const isSameForm = initialForm == getForm();

        // allowQuestionUnload: pages/partials/countdown.ejs
        if(!isSameForm && !window.allowQuestionUnload) {
            const event = e || window.event;

            // MDN recommendation (not fully supported)
            event.preventDefault();

            // Chrome legacy
            event.returnValue = '';

            // Fallback
            return '';
        }
    });
}

function disableOnSubmit() {
    $('form.question-form').on('submit', function() {
        if (!$(this).data('submitted')) {
            $(this).data('submitted', true);

            // Since `.disabled` buttons don't POST, clone and hide as workaround
            $(this).find('.disable-on-submit').each(function() {
                // Create disabled clone of submit button
                $(this).clone(false).removeAttr('id').prop('disabled', true).insertBefore($(this));

                // Hide actual submit button
                $(this).hide();
            });
        }
    });
}

function autoSave() {

    const currentForm = getForm();

    if (currentForm !== initialForm) {
        $('.autosave-status').text('Saving answer...');
        $.post(window.location.href, form.serialize() + '&__action=autosave', (data, textStatus, jqXHR) => {
            if (data.variant_id)
                form.find('[name=__variant_id]').text(data.variant_id);
            $('.autosave-status').text('Answer saved.');
            initialForm = currentForm;
        }, 'json');
    } else {
        $('.autosave-status').text('');
    }
}

$(document).ready(() => {
    confirmOnUnload();
    disableOnSubmit();
    // TODO Include option to enable/disable autosave.
    setInterval(autoSave, 2000);
});
