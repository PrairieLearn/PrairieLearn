

class ResistorDraw extends PLDrawingBaseElement {
    static generate(canvas, options) {

      var gap = 0.92*options.interval
      var theta = Math.atan2(options.y2-options.y1, options.x2 - options.x1);
      var d = Math.sqrt( Math.pow(options.y2-options.y1,2) + Math.pow(options.x2 - options.x1,2) );
      
      // Resistor "legs"
      var xm1 = options.x1 + ((d-gap)/2)*Math.cos(theta);
      var ym1 = options.y1 + ((d-gap)/2)*Math.sin(theta); 
      var xm2 = options.x1 + ((d+gap)/2)*Math.cos(theta); 
      var ym2 = options.y1 + ((d+gap)/2)*Math.sin(theta); 

      let obj1 = new fabric.Line([options.x1, options.y1, xm1, ym1], {
        stroke: options.stroke,
        strokeWidth: options.strokeWidth,
        selectable: false,
        evented: false,
        originX: 'center',
        originY: 'center',
      });
      if (!('id' in obj1)) {
        obj1.id = window.PLDrawingApi.generateID();
      }
      let obj2 = new fabric.Line([xm2, ym2, options.x2, options.y2], {
        stroke: options.stroke,
        strokeWidth: options.strokeWidth,
        selectable: false,
        evented: false,
        originX: 'center',
        originY: 'center',
      });
      if (!('id' in obj2)) {
        obj2.id = window.PLDrawingApi.generateID();
      }
      canvas.add(obj1,obj2);


      let obj = new Spring(options);
      if (!('id' in obj)) {
        obj.id = window.PLDrawingApi.generateID();
      }
      canvas.add(obj);

      if (options.label) {
        var c1x1 = xm1 - options.height*Math.sin(theta);
        var c1y1 = ym1 + options.height*Math.cos(theta); 
        let textObj = new fabric.Text(options.label, {
          left: c1x1 + options.offsetx,
          top:  c1y1 + options.offsety, 
          textAlign: 'left',
          fontSize: options.fontSize,
          angle: options.fontAngle,
          selectable: false,
          originX: 'center',
          originY: 'center',
        })
        canvas.add(textObj);
      }
    }

  }

  PLDrawingApi.registerElements('resistor', {
    'pl-resistor': ResistorDraw,
  });

Spring = fabric.util.createClass(fabric.Object, {
  type: 'spring',
  initialize: function (options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.left = this.x1;
    this.top = this.y1;
    this.originY = 'center';
    this.originX = 'left';
    this.length = Math.sqrt(Math.pow(this.y2 - this.y1, 2) + Math.pow(this.x2 - this.x1, 2));
    this.width = this.length;
    this.angleRad = Math.atan2(this.y2 - this.y1, this.x2 - this.x1);
    this.angle = (180 / Math.PI) * this.angleRad;
    this.objectCaching = false;
  },
  _render: function (ctx) {
    let len = this.interval; 
    let l2 = len / 2;
    let h = this.height;

    let dx = 5;
    let ndx = Math.floor(len / dx);
    var nzig = ndx - 4;
    console.log(dx,len,ndx)
    if (nzig < 3) {
      nzig = 3;
      dx = len / (nzig + 4);
    }
    if (nzig % 2 === 0) {
      nzig += 1;
      dx = len / (nzig + 4);
    }

    ctx.beginPath();
    ctx.moveTo(-l2, 0);
    ctx.lineTo(-l2 + (len - nzig * dx) / 4, 0);
    var xpos = (len - nzig * dx) / 2;
    ctx.lineTo(-l2 + xpos, -h / 2);
    for (var i = 0; i < nzig / 2 - 1; i++) {
      xpos += dx;
      ctx.lineTo(-l2 + xpos, h / 2);
      xpos += dx;
      ctx.lineTo(-l2 + xpos, -h / 2);
    }
    xpos += dx;
    ctx.lineTo(-l2 + xpos, h / 2);
    xpos += (len - nzig * dx) / 4;
    ctx.lineTo(-l2 + xpos, 0);
    ctx.lineTo(-l2 + len, 0);
    ctx.strokeStyle = this.stroke;
    this._renderStroke(ctx);

  },
});