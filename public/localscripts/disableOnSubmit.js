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

    $('a.disable-on-click').on('click', function() {
        $(this).addClass('disabled');
    });
}

$(document).ready(() => { disableOnSubmit(); });
