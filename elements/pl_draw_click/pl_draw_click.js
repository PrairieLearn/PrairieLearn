/* eslint-env browser,jquery */
/* global ace */
//TODO: Get answer draw cross set answer in hidden input
//TODO: make sure they can only do one cross or add functionality for several crosses (would mean they have to be able to delete them aswell etc..)
$(function() {
    var cords = [];
    var can = document.getElementById('clickable');
    var ctx = can.getContext('2d');
    var src = $('#clickable').attr('src');
    var scale = $('#clickable').attr('width')
    scale = scale/100;




    var img = new Image();
    img.src = src;
    console.log(img.height);

    img.onload = function() {
        $('#clickable').attr('height', img.height*scale);
        $('#clickable').attr('width', img.width*scale);
        ctx.drawImage(img, 0, 0, can.width,can.height);
        if($("#clickable").attr("test_x")!='' && $("#clickable").attr("test_y")!='' && $("#clickable").attr("test_radius")!=''){
            try{
                drawRect(Number($("#clickable").attr("test_x")), Number($("#clickable").attr("test_y")), Number($("#clickable").attr("test_width")), Number($("#clickable").attr("test_height")));
            } catch(exception){
                console.log(exception)
            }
        }
    };

    $("#clickable").click(function(e) {
        var offset = $(this).offset();
        var relativeX = (e.pageX - offset.left);
        var relativeY = (e.pageY - offset.top);


        drawX(relativeX,relativeY);

        if($("#clickable").attr("show_coordinates")==='true'){
            alert('x:' + relativeX + ' y:' + relativeY);
        }

        $('#cordinate_x').val(relativeX);
        $('#cordinate_y').val(relativeY);

    });

    function drawRect(x,y,width,height) {
        console.log('hej');
        ctx.rect(x,y,width,height);
        ctx.strokeStyle="#FF0000";
        ctx.stroke();
        ctx.strokeStyle="#000000";

    }

    function drawX(x, y) {
        console.log(x,y);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0,0,can.width,can.height);
        ctx.restore();
        ctx.drawImage(img, 0, 0, img.width,img.height,     // source rectangle
            0, 0, can.width, can.height)
        //
        ctx.beginPath();
        ctx.moveTo(x - 10, y - 10);
        ctx.lineTo(x + 10, y + 10);
        ctx.stroke();
        ctx.moveTo(x + 10, y - 10);
        ctx.lineTo(x - 10, y + 10);
        ctx.stroke();



    }
});
