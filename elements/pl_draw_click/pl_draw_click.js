/* eslint-env browser,jquery */
/* global ace */
//TODO: Get answer draw cross set answer in hidden input
//TODO: make sure they can only do one cross or add functionality for several crosses (would mean they have to be able to delete them aswell etc..)
$(function() {
    var cords = [];
    var can = document.getElementById('clickable');
    var ctx = can.getContext('2d');
    var src = $('#clickable').attr('src');

    var img = new Image();
    img.src = src;
    img.onload = function() {
        ctx.drawImage(img, 0, 0, img.width,img.height,     // source rectangle
            0, 0, can.width, can.height);
    };
    $("#clickable").click(function(e) {
        var offset = $(this).offset();
        var relativeX = (e.pageX - offset.left);
        var relativeY = (e.pageY - offset.top);
        if(cords.length < 4) {
            cords.push({
                x: relativeX,
                y: relativeY
            });
        }else{
            cords[0] = {
                x: relativeX,
                y: relativeY
            };

        }

        drawX(relativeX,relativeY);

        $('#cordinates').val(JSON.stringify(cords));

    });

    function drawX(x, y) {

        ctx.drawImage(img, 0, 0, img.width,img.height,     // source rectangle
            0, 0, can.width, can.height);
        console.log(cords);
        ctx.clearRect(0,0,can.width,can.height);
        cords.map(function(val) {
            console.log(val);
            //ctx.restore();
            ctx.moveTo(val.x - 10, val.y - 10);
            ctx.lineTo(val.x + 10, val.y + 10);
            ctx.stroke();
            ctx.moveTo(val.x + 10, val.y - 10);
            ctx.lineTo(val.x - 10, val.y + 10);
            ctx.stroke();
        });


    }
});
