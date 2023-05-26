

class BatteryDraw extends PLDrawingBaseElement {
    static generate(canvas, options) {

      var gap = 5
      var theta = Math.atan2(options.y2-options.y1, options.x2 - options.x1);
      var d = Math.sqrt( Math.pow(options.y2-options.y1,2) + Math.pow(options.x2 - options.x1,2) );
      
      // Battery "legs"
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

      // Battery lines
      var cline1 = 10
      var cline2 = 20

      var c1x1 = xm1 - cline1*Math.sin(theta);
      var c1y1 = ym1 + cline1*Math.cos(theta); 
      var c1x2 = xm1 + cline1*Math.sin(theta);
      var c1y2 = ym1 - cline1*Math.cos(theta);      
      var c2x1 = xm2 - cline2*Math.sin(theta);
      var c2y1 = ym2 + cline2*Math.cos(theta); 
      var c2x2 = xm2 + cline2*Math.sin(theta);
      var c2y2 = ym2 - cline2*Math.cos(theta);  

      let obj3 = new fabric.Line([c1x1, c1y1, c1x2, c1y2], {
        stroke: options.stroke,
        strokeWidth: options.strokeWidth,
        selectable: false,
        evented: false,
        originX: 'center',
        originY: 'center',
      });
      if (!('id' in obj3)) {
        obj3.id = window.PLDrawingApi.generateID();
      }
      let obj4 = new fabric.Line([c2x1, c2y1, c2x2, c2y2], {
        stroke: options.stroke,
        strokeWidth: options.strokeWidth,
        selectable: false,
        evented: false,
        originX: 'center',
        originY: 'center',
      });
      if (!('id' in obj4)) {
        obj4.id = window.PLDrawingApi.generateID();
      }

      canvas.add(obj1, obj2, obj3, obj4);

      if (options.label) {
        var c1x1 = xm1 - 3*cline1*Math.sin(theta);
        var c1y1 = ym1 + 3*cline1*Math.cos(theta); 
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

  PLDrawingApi.registerElements('battery', {
    'pl-battery': BatteryDraw,
  });