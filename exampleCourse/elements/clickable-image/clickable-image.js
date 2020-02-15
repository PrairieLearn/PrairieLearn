$(function() {
    $('#IMark').on("click", function() {
	var current = parseInt($('#my_hidden_field').val())
	var next = current + 1
	$('#my_display_field').text(next);
	$('#my_hidden_field').val(next);
    });
})
