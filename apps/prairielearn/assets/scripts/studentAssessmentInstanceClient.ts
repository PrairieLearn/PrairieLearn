$(function () {
  $('[data-toggle="popover"]').popover({ sanitize: false, container: 'body' });
});

// make the file inputs display the file name
$(document).on('change', '.custom-file-input', function () {
  const filename = $(this).val().replace(/\\/g, '/').replace(/.*\//, '');
  $(this).parent('.custom-file').find('.custom-file-label').text(filename);
});
