/* eslint-env browser,jquery */
/* global ace */
function drawX(x, y, ctx,img,can,x_size) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0,0,can.width,can.height);
    ctx.restore();
    ctx.drawImage(img, 0, 0, img.width,img.height,     // source rectangle
        0, 0, can.width, can.height)
    //
    ctx.beginPath();
    ctx.moveTo(x - x_size, y - x_size);
    ctx.lineTo(x + x_size, y + x_size);
    ctx.stroke();
    ctx.moveTo(x + x_size, y - x_size);
    ctx.lineTo(x - x_size, y + x_size);
    ctx.stroke();



}
