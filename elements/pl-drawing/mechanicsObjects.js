/* eslint-disable */

var sylvester = window.Sylvester;
var $V = Sylvester.Vector.create;

var mechanicsObjects = {};

// ======================================================================================
// ======================================================================================
// ======================================================================================
// ======================================================================================
// New object types.
// These are all classes that create and return the object, but don't add it to the canvas.
// ======================================================================================
mechanicsObjects.Spring = fabric.util.createClass(fabric.Object, {
    type: 'spring',
    initialize: function(options) {
	options = options || {};
	this.callSuper("initialize", options);
        this.left = this.x1;
        this.top = this.y1;
        this.originY = 'center';
        this.angle = Math.atan2(this.y2 - this.y1, this.x2 - this.x1) * (180.0 / Math.PI);
        this.objectCaching = false;
    },
    _render: function(ctx) {
        let len = Math.sqrt(Math.pow(this.y2 - this.y1, 2) + Math.pow(this.x2 - this.x1, 2));

        let dx = this.dx;
        let ndx = Math.floor(len/dx);
        var nzig = ndx - 4;
        if (nzig < 3) {
            nzig = 3;
            dx = len/(nzig+4)
        }
        if ( nzig % 2 == 0) {
            nzig += 1;
            dx = len/(nzig+4)
        }

        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo((len - nzig*dx)/4 , 0);
        var xpos = (len - nzig*dx)/2;
        ctx.lineTo(xpos , -this.height/2);
        for (var i = 0; i < nzig/2-1; i++) {
            xpos += dx;
            ctx.lineTo(xpos, this.height/2);
            xpos += dx;
            ctx.lineTo(xpos, -this.height/2);
        }
        xpos += dx;
        ctx.lineTo(xpos, this.height/2);
        xpos += (len - nzig*dx)/4;
        ctx.lineTo(xpos, 0);
        ctx.lineTo(len, 0);
        ctx.strokeStyle = this.stroke;
        this._renderStroke(ctx);

        if (this.drawPin) {
            ctx.fillStyle = this.stroke;
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fill();

            ctx.beginPath();
            ctx.arc(len, 0, 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fill();
        }
    },
});

// ======================================================================================
mechanicsObjects.Rod = fabric.util.createClass(fabric.Object, {
    type: 'rod',
    initialize: function(options) {
	options = options || {};
	this.callSuper("initialize", options);
        this.left = this.x1;
        this.top = this.y1;
        this.originY = 'center';
        this.originX = 'center';
        this.angle = Math.atan2(this.y2 - this.y1, this.x2 - this.x1) * (180.0 / Math.PI);
        this.length = Math.sqrt(Math.pow(this.y2 - this.y1, 2) + Math.pow(this.x2 - this.x1, 2))
        this.width = this.length * 2;
        this.objectCaching = false;
    },
    _render: function(ctx) {
        var rPx = this.height / 2;
        let len = this.length;

        ctx.beginPath();
        ctx.moveTo(0, rPx);
        ctx.arcTo(len + rPx, 0 + rPx, len + rPx, 0      , rPx);
        ctx.arcTo(len + rPx, 0 - rPx, len      , 0 - rPx, rPx);
        ctx.arcTo(-rPx     , -rPx   , -rPx     , 0      , rPx);
        ctx.arcTo(-rPx     , rPx    , 0        , rPx    , rPx);
        ctx.closePath();
        ctx.strokeStyle = this.strokeColor;
        ctx.fillStyle = this.color;
        this._renderFill(ctx);
        this._renderStroke(ctx);

        if (this.drawPin) {
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);

            ctx.beginPath();
            ctx.arc(len, 0, 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);
        }
    },
});

// ======================================================================================
mechanicsObjects.CollarRod = fabric.util.createClass(fabric.Object, {
    type: 'rod',
    initialize: function(options) {
	options = options || {};
	this.callSuper("initialize", options);
        this.left = this.x1;
        this.top = this.y1;
        this.originY = 'center';
        this.angle = Math.atan2(this.y2 - this.y1, this.x2 - this.x1) * (180.0 / Math.PI);
        this.objectCaching = false;
    },
    _render: function(ctx) {
        var d = this.height/2;
        var w1 = this.w1;
        var w2 = this.w2;
        var h1 = this.h1;
        var h2 = this.h2;
        let len = Math.sqrt(Math.pow(this.y2 - this.y1, 2) + Math.pow(this.x2 - this.x1, 2))

        var rA = $V([0,0]); // this is the position given by (left,top)
        var rB = rA.add( $V([len,0]) );
        var p1 = rA.add( $V([0,d]) );
        var p2 = p1.add( $V([w1/2,0]) );
        var p4 = rB.add( $V([0,d]) );
        var p3 = p4.add( $V([-w2/2,0]) );
        var p5 = p4.add( $V([d,0]) );
        var p6 = p5.add( $V([0,-2*d]) );
        var p7 = rB.add( $V([0,-d]) );
        var p8 = p7.add( $V([-w2/2,0]) );
        var p10 = rA.add( $V([0,-d]) );
        var p9 = p10.add( $V([w1/2,0]) );
        var p11 = p10.add( $V([-d,0]) );
        var p12 = p1.add( $V([-d,0]) );
        var p14 = p2.add( $V([0,h1/2-d]) );
        var p13 = p14.add( $V([-w1,0]) );
        var p15 = p3.add( $V([0,h2/2-d]) );
        var p16 = p15.add( $V([w2,0]) );
        var p17 = p16.add( $V([0,-h2]) );
        var p18 = p17.add( $V([-w2,0]) );
        var p19 = p9.add( $V([0,-(h1/2-d)]) );
        var p20 = p19.add( $V([-w1,0]) );

        ctx.beginPath();
        ctx.moveTo(p2.e(1),p2.e(2));
        ctx.lineTo(p3.e(1),p3.e(2));
        if (this.collar2) {
            ctx.lineTo(p15.e(1),p15.e(2));
            ctx.lineTo(p16.e(1),p16.e(2));
            ctx.lineTo(p17.e(1),p17.e(2));
            ctx.lineTo(p18.e(1),p18.e(2));
            ctx.lineTo(p8.e(1),p8.e(2));
        }
        else {
            ctx.arcTo(p5.e(1), p5.e(2), p6.e(1) , p6.e(2) , d);
            ctx.arcTo(p6.e(1), p6.e(2), p7.e(1) , p7.e(2) , d);
            ctx.lineTo(p8.e(1),p8.e(2));
        }
        ctx.lineTo(p9.e(1),p9.e(2));
        if (this.collar1) {
            ctx.lineTo(p19.e(1),p19.e(2));
            ctx.lineTo(p20.e(1),p20.e(2));
            ctx.lineTo(p13.e(1),p13.e(2));
            ctx.lineTo(p14.e(1),p14.e(2));
            ctx.lineTo(p2.e(1),p2.e(2));
        }
        else {
            ctx.arcTo(p11.e(1), p11.e(2), p12.e(1) , p12.e(2) , d);
            ctx.arcTo(p12.e(1), p12.e(2), p1.e(1) , p1.e(2) , d);
            ctx.lineTo(p2.e(1),p2.e(2));
        }
        ctx.closePath();
        ctx.strokeStyle = this.strokeColor;
        ctx.fillStyle = this.color;
        this._renderFill(ctx);
        this._renderStroke(ctx);

        if (this.drawPin) {
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);

            ctx.beginPath();
            ctx.arc(len, 0, 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);
        }
    },
});


// ======================================================================================
mechanicsObjects.LShapeRod = fabric.util.createClass(fabric.Object, {
    type: 'Lshaperod',
    initialize: function(options) {
        options = options || {};
        this.originY = 'center';
        this.callSuper("initialize", options);
        this.left = this.x1;
        this.top = this.y1;
        this.objectCaching = false;
    },

    _render: function(ctx) {

        var L1 = this.length1;
        var L2 = this.length2;
        var d = this.height/2;
        var beta = this.angle2;

        var e1 = $V([ Math.cos(beta), Math.sin(beta) ]);
        var e2 = $V([ Math.sin(beta), -Math.cos(beta) ]);

        rC = $V([0,0]); // this is the position given by (left,top)
        rA = rC.add( $V([L1,0]) );
        rB = rA.add( e1.multiply(L2) );
        p1 = rC.add( $V([0,d]) );
        a = (d/Math.sin(beta) - d/Math.tan(beta))
        p2 = rA.add( e2.multiply(-d) );
        p2t = p2.add(e1.multiply(a) );
        p3 = p2.add( e1.multiply(L2) );
        p4 = p3.add( e1.multiply(d)  );
        p5 = p4.add( e2.multiply(d) );
        p6 = p5.add( e2.multiply(d) );
        p7 = p6.add( e1.multiply(-d) );
        p8 = rA.add( e2.multiply(d) );
        p8t = p8.add(e1.multiply(-a) );
        p9 = rC.add( $V([0,-d]) );
        p10 = p9.add( $V([-d,0]) );
        p11 = p10.add( $V([0,2*d]) );

        // Make the 3-point rod
        ctx.beginPath();
        ctx.moveTo(p1.e(1),p1.e(2));
        ctx.arcTo(p2t.e(1),p2t.e(2),p3.e(1),p3.e(2),d);
        ctx.arcTo(p4.e(1),p4.e(2),p5.e(1),p5.e(2),d);
        ctx.arcTo(p6.e(1),p6.e(2),p7.e(1),p7.e(2),d);
        ctx.arcTo(p8t.e(1),p8t.e(2),p9.e(1),p9.e(2),d);
        ctx.arcTo(p10.e(1),p10.e(2),p11.e(1),p11.e(2),d);
        ctx.arcTo(p11.e(1),p11.e(2),p1.e(1),p1.e(2),d);
        ctx.strokeStyle = this.strokeColor;
        ctx.fillStyle = this.color;
        this._renderFill(ctx);
        this._renderStroke(ctx);
        ctx.closePath();

        if (this.drawPin) {
            ctx.beginPath();
            ctx.arc(rC.e(1), rC.e(2), 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);

            ctx.beginPath();
            ctx.arc(rA.e(1), rA.e(2), 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);

            ctx.beginPath();
            ctx.arc(rB.e(1), rB.e(2), 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);
        }

    },
});

// ======================================================================================
mechanicsObjects.TShapeRod = fabric.util.createClass(fabric.Object, {
    type: 'Lshaperod',
    initialize: function(options) {
        options = options || {};
        this.originY = 'center';
        this.callSuper("initialize", options);
        this.left = this.x1;
        this.top = this.y1;
        this.objectCaching = false;
    },
    get_distance: function(angle,d) {
        if (Math.abs(angle) < 1e-4 ) {
            var a = 0;
        }
        else if ( Math.abs(angle)-Math.pi/2  < 1e-4 || Math.abs(angle)-3*Math.pi/2  < 1e-4) {
            var a = d;
        }
        else {
            var a = d/Math.sin(angle) - d/Math.tan(angle);
        }
        return (a)
    },
    _render: function(ctx) {

        var L1 = this.length1;
        var L2 = this.length2;
        var L3 = this.length3;
        var d = this.height/2;
        var beta = this.angle2;
        var gamma = this.angle3;

        a1 = this.get_distance(beta,d);
        a2 = this.get_distance(gamma,d);

        rP = $V([0,0]); // this is the position given by (left,top)
        rQ = rP.add( $V([L1,0]) );
        p1 = rP.add( $V([0,d]) );
        p2 = rQ.add( $V([0,d]) );
        p3 = rQ.add( $V([0,-d]) );
        p4 = rP.add( $V([0,-d]) );
        p5 = p4.add( $V([-d,0]) );
        p6 = p1.add( $V([-d,0]) );

        var e1 = $V([ Math.cos(beta), Math.sin(beta) ]);
        var e2 = $V([ -Math.sin(beta), Math.cos(beta) ]);

        rR = rQ.add( e1.multiply(L2)  );
        p7 = rR.add( e2.multiply(-d) );
        p8 = rQ.add( e2.multiply(-d)  );
        p8t = p8.add(e1.multiply(a1) );
        p9 = rQ.add( e2.multiply(d)  );
        p9t = p9.add(e1.multiply(a1) ); // this seems to be correct
        p10 = rR.add( e2.multiply(d) );
        p11 = p10.add( e1.multiply(d) );
        p12 = p7.add( e1.multiply(d) );

        var e1 = $V([ Math.cos(gamma), Math.sin(gamma) ]);
        var e2 = $V([ -Math.sin(gamma), Math.cos(gamma) ]);

        rS = rQ.add( e1.multiply(L3)  );
        p13 = rS.add( e2.multiply(-d) );
        p14 = rQ.add( e2.multiply(-d)  );
        p14t = p14.add(e1.multiply(-a2) ); // afraid this is not correct for all cases
        p15 = rQ.add( e2.multiply(d)  );
        p15t = p15.add(e1.multiply(-a2) );
        p16 = rS.add( e2.multiply(d) );
        p17 = p16.add( e1.multiply(d) );
        p18 = p13.add( e1.multiply(d) );

        if ( p7.distanceFrom(p8t) < p7.distanceFrom(p15t) ) {
            pcorner = p8t;
        }
        else {
            pcorner = p15t;
        }

        ctx.beginPath();
        ctx.moveTo(p1.e(1),p1.e(2));
        ctx.arcTo(p9t.e(1),p9t.e(2),p10.e(1),p10.e(2),d);
        ctx.arcTo(p11.e(1),p11.e(2),p12.e(1),p12.e(2),d);
        ctx.arcTo(p12.e(1),p12.e(2),p7.e(1),p7.e(2),d);
        ctx.arcTo(pcorner.e(1),pcorner.e(2),p16.e(1),p16.e(2),d);
        ctx.arcTo(p17.e(1),p17.e(2),p18.e(1),p18.e(2),d);
        ctx.arcTo(p18.e(1),p18.e(2),p13.e(1),p13.e(2),d);
        ctx.arcTo(p14t.e(1),p14t.e(2),p4.e(1),p4.e(2),d);
        ctx.arcTo(p5.e(1),p5.e(2),p6.e(1),p6.e(2),d);
        ctx.arcTo(p6.e(1),p6.e(2),p1.e(1),p1.e(2),d);
        ctx.strokeStyle = this.strokeColor;
        ctx.fillStyle = this.color;
        this._renderFill(ctx);
        this._renderStroke(ctx);
        ctx.closePath();

        if (this.drawPin) {
            ctx.beginPath();
            ctx.arc(rP.e(1), rP.e(2), 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);

            ctx.beginPath();
            ctx.arc(rQ.e(1), rQ.e(2), 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);

            ctx.beginPath();
            ctx.arc(rS.e(1), rS.e(2), 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);

            ctx.beginPath();
            ctx.arc(rR.e(1), rR.e(2), 4, 0, 2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "black";
            this._renderFill(ctx);
        }

     },
});

// ======================================================================================
mechanicsObjects.ClampedEnd = fabric.util.createClass(fabric.Object, {
    type: 'clamped',
    initialize: function(options) {
        options = options || {};
        this.callSuper("initialize", options);
        this.originX = 'center';
        this.originY = 'center';
        this.left = this.x1;
        this.top = this.y1;
        this.objectCaching = false;
    },
    _render: function(ctx) {

        var x0 = this.x1; //anchor point for the clamped end
        var y0 = this.y1; //anchor point for the clamped end
        var h = this.height;
        var w = this.width;
        var gradient = ctx.createLinearGradient(-w, -h/2, 0, h/2);
        gradient.addColorStop(0, 'white');
        gradient.addColorStop(1, this.color);

        // ======== Add Clamped End =========
        ctx.beginPath();
        ctx.moveTo(0,0);
        ctx.lineTo(0, h/2);
        ctx.lineTo(-w, h/2);
        ctx.lineTo(-w, -h/2);
        ctx.lineTo(0, -h/2);
        ctx.lineTo(0, 0);
        ctx.closePath();
        ctx.strokeStyle = this.stroke;
        ctx.fillStyle = gradient;
        this._renderFill(ctx);
        this._renderStroke(ctx);

      }
  });
// ======================================================================================
mechanicsObjects.FixedPin = fabric.util.createClass(fabric.Object, {
    type: 'fixed-pin',
    initialize: function(options) {
        options = options || {};
        this.callSuper("initialize", options);
        this.originX = 'center';
        this.originY = 'center';
        this.left = this.x1;
        this.top = this.y1;
        this.objectCaching = false;
    },
    _render: function(ctx) {

        var x0 = this.x1; //center of the pin
        var y0 = this.y1; //center of the pin
        var h = this.height;
        var w = this.width;

        // ======== Add Pivot =========
        ctx.beginPath();
        ctx.moveTo(-w/2,h);
        ctx.lineTo(w/2, h);
        ctx.arcTo(w/2, -w/2, 0, -w/2, w/2);
        ctx.arcTo(-w/2, -w/2,  -w/2, 0, w/2);
        ctx.closePath();
        ctx.strokeStyle = this.stroke;
        ctx.fillStyle = this.color;
        this._renderFill(ctx);
        this._renderStroke(ctx);
        // ======== Add pin placement =========
        if (this.drawPin) {
            ctx.beginPath();
            ctx.arc(0,0,4,0*Math.PI,2 * Math.PI);
            ctx.closePath();
            ctx.fillStyle = "rgb(0, 0, 0)";
            this._renderFill(ctx);
        }
        // ======== Add ground =========
        if (this.drawGround) {
            var h_ground = h/3;
            var w_ground = 1.6*w;
            var gradient = ctx.createLinearGradient(-w_ground/2,0,w_ground/2,0);
            gradient.addColorStop(0, '#CACFD2');
            gradient.addColorStop(1, '#626567');
            ctx.beginPath();
            ctx.fillStyle = gradient;
            ctx.strokeStyle = "black";
            ctx.rect(-w_ground/2,h,w_ground,h_ground);
            this._renderFill(ctx);
            this._renderStroke(ctx);
            ctx.closePath();
        }

    }
});
// ======================================================================================
mechanicsObjects.Roller = fabric.util.createClass(fabric.Object, {
    type: 'fixed-pin',
    initialize: function(options) {
        options = options || {};
        this.callSuper("initialize", options);
        this.originX = 'center';
        this.originY = 'center';
        this.left = this.x1;
        this.top = this.y1;
        this.objectCaching = false;
    },
    _render: function(ctx) {

        var x0 = this.x1; //center of the pin
        var y0 = this.y1; //center of the pin
        var h = this.height;
        var w = this.width;

        // ======== Add Pivot =========
        ctx.beginPath();
        ctx.moveTo(-w/2,h-2*w/5);
        ctx.lineTo(w/2, h-2*w/5);
        ctx.arcTo(w/2, -w/2, 0, -w/2, w/2);
        ctx.arcTo(-w/2, -w/2,  -w/2, 0, w/2);
        ctx.closePath();
        ctx.strokeStyle = this.stroke;
        ctx.fillStyle = this.color;
        this._renderFill(ctx);
        this._renderStroke(ctx);
        // ======== Add pin placement =========
        if (this.drawPin) {
          ctx.beginPath();
          ctx.arc(0,0,4,0*Math.PI,2 * Math.PI);
          ctx.closePath();
          ctx.fillStyle = "black";
          this._renderFill(ctx);
        }
        // ======== Add rollers =========
        ctx.beginPath();
        ctx.strokeStyle = "black";
        ctx.fillStyle = "gray";
        ctx.lineWidth = 1.5;
        ctx.arc(-w/4,h-w/5,w/5,0*Math.PI,2 * Math.PI);
        ctx.closePath();
        this._renderFill(ctx);
        this._renderStroke(ctx);
        ctx.beginPath();
        ctx.arc(w/4,h-w/5,w/5,0*Math.PI,2 * Math.PI);
        ctx.closePath();
        this._renderFill(ctx);
        this._renderStroke(ctx);
        // ======== Add ground =========
        if (this.drawGround) {
          var h_ground = h/3;
          var w_ground = 1.6*w;
          var gradient = ctx.createLinearGradient(-w_ground/2,0,w_ground/2,0);
          gradient.addColorStop(0, '#CACFD2');
          gradient.addColorStop(1, '#626567');
          ctx.beginPath();
          ctx.rect(-w_ground/2,h,w_ground,h_ground);
          ctx.lineWidth = 2;
          ctx.fillStyle = gradient;
          ctx.strokeStyle = "black";
          this._renderFill(ctx);
          this._renderStroke(ctx);
          ctx.closePath();
        }

    }
});

// ======================================================================================
mechanicsObjects.Arrow = fabric.util.createClass(fabric.Object, {
    type: 'arrow',
    initialize: function(options) {
        options.width = options.width;
        options = options || {};
        this.callSuper("initialize", options)
        this.set('arrowheadOffsetRatio', options.arrowheadOffsetRatio || 1);
        this.set('arrowheadWidthRatio', options.arrowheadWidthRatio || 1);
        this.set('strokeWidth', options.strokeWidth || 3);
        this.set('stroke', options.stroke || 'black');
        this.set('fill', options.stroke || 'black');
        this.set('height', options.height || 3*this.strokeWidth);
        this.setControlVisible('bl',false);
        this.setControlVisible('tl',false);
        this.setControlVisible('br',false);
        this.setControlVisible('tr',false);
        this.setControlVisible('mt',false);
        this.setControlVisible('mb',false);
        this.setControlVisible('ml',false);
        this.setControlVisible('mr',false);
        this.setControlVisible('mtr',false);
        if(options.hasOwnProperty('trueHandles')) {
            for (var i = 0; i < options.trueHandles.length; i++) {
                  this.setControlVisible(options.trueHandles[i],true);
            }
        }
    },
    toObject: function() {
        return fabric.util.object.extend(this.callSuper('toObject'), {
            /* should write here the properties that were added in initialize
               and that should appear on the server */
            name: this.get('name')
        });
    },
    _render: function(ctx) {

        var lengthPx = this.width;
        var w = this.strokeWidth;
        var l = 7*w*this.arrowheadOffsetRatio;
        var h = 0.5*l*this.arrowheadWidthRatio;
        var c = 0.6*l;
        var e = 0.9*l;

        if (this.drawEndArrow) {
            ctx.beginPath();
            var end_line = lengthPx/2 - c;
            ctx.lineWidth = 0.1*this.strokeWidth;
            ctx.moveTo(end_line, 0);
            ctx.lineTo(lengthPx/2 - l, h/2);
            ctx.lineTo(lengthPx/2 , 0);
            ctx.lineTo(lengthPx/2 - l, -h/2);
            ctx.lineTo(end_line, 0);
            this._renderFill(ctx);
            this._renderStroke(ctx);
            ctx.closePath();
        }
        else {
            var end_line = lengthPx/2;
        }

        if (this.drawStartArrow) {
            ctx.beginPath();
            var begin_line = -(lengthPx/2 - c);
            ctx.lineWidth = 0.1*this.strokeWidth;
            ctx.moveTo(begin_line, 0);
            ctx.lineTo(-(lengthPx/2 - l), h/2);
            ctx.lineTo(-lengthPx/2 , 0);
            ctx.lineTo(-(lengthPx/2 - l), -h/2);
            ctx.lineTo(begin_line, 0);
            this._renderFill(ctx);
            this._renderStroke(ctx);
            ctx.closePath();
        }
        else {
            var begin_line = -lengthPx/2;
        }

        ctx.beginPath();
        ctx.lineWidth = this.strokeWidth;
        ctx.moveTo(begin_line, 0);
        ctx.lineTo(end_line, 0);
        this._renderStroke(ctx);

    }
});

// ======================================================================================
mechanicsObjects.DoubleArrow = fabric.util.createClass(fabric.Object, {
    type: 'arrow',
    initialize: function(options) {
        options.width = options.width;
        options = options || {};
        this.callSuper("initialize", options)
        this.set('arrowheadOffsetRatio', options.arrowheadOffsetRatio || 1);
        this.set('arrowheadWidthRatio', options.arrowheadWidthRatio || 1);
        this.set('strokeWidth', options.strokeWidth || 3);
        this.set('stroke', options.stroke || 'black');
        this.set('fill', options.stroke || 'black');
        this.set('height', options.height || 3*this.strokeWidth);
        this.setControlVisible('bl',false);
        this.setControlVisible('tl',false);
        this.setControlVisible('br',false);
        this.setControlVisible('tr',false);
        this.setControlVisible('mt',false);
        this.setControlVisible('mb',false);
        this.setControlVisible('ml',false);
        this.setControlVisible('mr',false);
        this.setControlVisible('mtr',false);
        if(options.hasOwnProperty('trueHandles')) {
            for (var i = 0; i < options.trueHandles.length; i++) {
                  this.setControlVisible(options.trueHandles[i],true);
            }
        }
    },
    toObject: function() {
        return fabric.util.object.extend(this.callSuper('toObject'), {
            /* should write here the properties that were added in initialize
               and that should appear on the server */
            name: this.get('name')
        });
    },
    _render: function(ctx) {

        var lengthPx = this.width;
        var w = this.strokeWidth;
        var l = 6*w*this.arrowheadOffsetRatio;
        var h = l*this.arrowheadWidthRatio;
        var c = 0.4*l;
        var e = 0.8*l;

        ctx.beginPath();
        var end_line = lengthPx/2 - c;
        ctx.lineWidth = 0.1*this.strokeWidth;
        ctx.moveTo(end_line, 0);
        ctx.lineTo(lengthPx/2 - l, h/2);
        ctx.lineTo(lengthPx/2 , 0);
        ctx.lineTo(lengthPx/2 - l, -h/2);
        ctx.lineTo(end_line, 0);
        this._renderFill(ctx);
        this._renderStroke(ctx);
        ctx.closePath();

        ctx.beginPath();
        ctx.lineWidth = 0.1*this.strokeWidth;
        ctx.moveTo(lengthPx/2 - e, 0);
        ctx.lineTo(lengthPx/2 - e - l, h/2);
        ctx.lineTo(lengthPx/2 - e - c, 0);
        ctx.lineTo(lengthPx/2 - e - l, -h/2);
        ctx.lineTo(lengthPx/2 - e, 0);
        this._renderFill(ctx);
        this._renderStroke(ctx);
        ctx.closePath();

        ctx.beginPath();
        ctx.lineWidth = this.strokeWidth;
        ctx.moveTo(-lengthPx/2, 0);
        ctx.lineTo(end_line, 0);
        this._renderStroke(ctx);

    }
});

// ======================================================================================
mechanicsObjects.LatexText = fabric.util.createClass(fabric.Object, {
    type: 'latex-text',
    parse: function(str) {
        /* Because the MathJax renderer expects text to be already formatted in LaTeX,
           manually parse inputs for $$ and escape non-latex with \text{} */

        let built_str = "";
        let spl = str.split("$");

        for (let i = 0; i < spl.length; i++) {
            if (i % 2 == 0) {
                /* Text */
                if (spl[i].length > 0) {
                    /* Ignore empty strings */
                    built_str += "\\text{" + spl[i] + "} ";
                }
            } else {
                /* LaTeX */
                built_str += spl[i] + " ";
            }
        }
        return built_str;
    },
    gen_text: function(str, options) {
        let ref = this;
        var callback = function() {
            let svg = MathJax.tex2svg(str, {'display': false}).children[0];
            
            /* SVG's generated by MathJax reference a list of sharedbase elements,
               so replace each reference with the actual element value. */
            $(svg).find("use").each((_, use) => {
                /* Find and create a new copy to link to */
                let refLink = use.getAttribute("xlink:href");
                let refElement = $(refLink)[0];
                let replacement = $(refElement.outerHTML)[0];
                /* Replace the reference with the actual value */
                use.parentNode.replaceChild(replacement, use);
            });

            let svgSource = svg.outerHTML;
            const exScale = 1.0 - MathJax.config.svg.font.params.x_height;
            let width = parseFloat(svg.getAttribute("width")) * parseFloat(options.fontSize) * exScale;
            let height = parseFloat(svg.getAttribute("height")) * parseFloat(options.fontSize) * exScale;

            /* Fix for Safari, https://stackoverflow.com/questions/30273775/namespace-prefix-ns1-for-href-on-tagelement-is-not-defined-setattributens */
            svgSource = svgSource.replace(/NS\d+:href/gi, 'xlink:href');

            let base64svg = "data:image/svg+xml;base64," +
                btoa(unescape(encodeURIComponent(svgSource)));
            
            fabric.Image.fromURL(base64svg, function(img) {
                img.height = height;
                img.width = width;

                if (ref.originX != "center") {
                    ref.left += img.width * exScale;
                }
                if (ref.originY != "center") {
                    ref.top += img.height * exScale;
                }
                ref.image = img;
                ref.dirty = true;

                /* Force re-rendering the canvas otherwise the text
                   will not show up */
                if ('canvas' in ref) {
                    ref['canvas'].renderAll();
                }
            }, options);
        };

        MathJax.config.onReady(callback);
    },
    initialize: function(text, options) {
        options = options || {};
        if (!options.selectable) {
            options.evented = false;
        }

        this.callSuper("initialize", options)
        this.image = null;
        this.text = text;

        if (text != "") {
            this.gen_text(this.text, options);
        }
    },
    _render: function(ctx) {
        if (this.image != null) {
            this.image._render(ctx);
        }
    }
});

// ======================================================================================
mechanicsObjects.DistTrianLoad = fabric.util.createClass(fabric.Object, {
    type: 'dist-force',
    initialize: function(options) {
        this.callSuper("initialize", options)
        this.spacing = options.spacing;
        this.anchor_is_tail = (options.anchor_is_tail == "true")
        this.w1 = options.w1;
        this.w2 = options.w2;
        this.width = options.range;
        this.range = options.range;
        this.height = Math.max(this.w1, this.w2);
        this.height_ave = (this.w1, this.w2)/2;
        this.strokeWidth = options.strokeWidth || 3;
        this.stroke = options.stroke;
        this.left = options.left;
        this.top = options.top;
        this.originX = 'center';
        this.objectCaching = true;
        this.flipped = options.flipped || false;
        this.flipX = this.flipped;

        this.label1 = options.label1;
        this.offsetx1 = options.offsetx1;
        this.offsety1 = options.offsety1;
        this.label2 = options.label2;
        this.offsetx2 = options.offsetx2;
        this.offsety2 = options.offsety2;

        this.label1obj = new mechanicsObjects.LatexText(this.label1, {});
        this.label2obj = new mechanicsObjects.LatexText(this.label2, {});

        this.arrowheadOffsetRatio = options.arrowheadOffsetRatio || 3;
        this.arrowheadWidthRatio = options.arrowheadWidthRatio || 2;

        this.setControlVisible('bl',false);
      	this.setControlVisible('tl',false);
      	this.setControlVisible('br',false);
      	this.setControlVisible('tr',false);
      	this.setControlVisible('mt',false);
      	this.setControlVisible('mb',false);
      	this.setControlVisible('ml',true);
      	this.setControlVisible('mr',true);
      	this.setControlVisible('mtr', true);

        this.on('modified', function() {
            this.flipped = this.flipX;
            this.range = this.width * this.scaleX;
        });
    },
    drawArrow: function(ctx, x1, y1, x2, y2) {
        /* Copied from the Arrow class, so much for DRY */
        let arrowheadOffsetRatio = this.arrowheadOffsetRatio;
        let arrowheadWidthRatio = this.arrowheadWidthRatio;
        let strokeWidth = this.strokeWidth;

        /* Forward vector */
        let fwdx = (x2-x1);
        let fwdy = (y2-y1);
        let fwdlen = Math.sqrt(Math.pow(fwdx, 2) + Math.pow(fwdy, 2));
        fwdx /= fwdlen; /* normalize */
        fwdy /= fwdlen;

        /* Forward vector rotated 90 deg */
        let rightx = -fwdy;
        let righty = fwdx;

        var lengthPx = fwdlen; /* Length of the arrow line. */
        var lenPx = arrowheadOffsetRatio * strokeWidth;
        var dyPx = arrowheadWidthRatio * 0.5 * strokeWidth;

        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.moveTo(x2 - (fwdx * lenPx/2), y2 - (fwdy * lenPx/2));
        ctx.lineTo(x2 - (fwdx * lenPx) + (rightx * dyPx),
                   y2 - (fwdy * lenPx) + (righty * dyPx));
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - (fwdx * lenPx) - (rightx * dyPx),
                   y2 - (fwdy * lenPx) - (righty * dyPx));
        ctx.closePath();

        ctx.lineWidth = this.strokeWidth;
        ctx.strokeStyle = this.stroke;
        ctx.fillStyle = this.stroke;
        ctx.stroke()
        ctx.fill();
    },
    drawLine: function(ctx, x1, y1, x2, y2) {
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.closePath();

        ctx.lineWidth = this.strokeWidth;
        ctx.stroke()
        ctx.fill();
    },
    _render: function(ctx) {
        var nSpaces = Math.ceil(this.getScaledWidth() / this.spacing);
        var dx = this.getScaledWidth() / nSpaces;

        /* Undo Fabric's scale transformation. */
        ctx.scale(1.0 / this.scaleX, 1.0 / this.scaleY);

        /* Centered coordinates */
        let cx = this.getScaledWidth() / 2;
        let cy = this.getScaledHeight() / 2;

        /* Draw all the force arrows */
        for (i=0;i<=nSpaces;i++) {
            let height = this.w1 + (i/nSpaces) * (this.w2 - this.w1);
            if (this.anchor_is_tail) {
                if (Math.abs(height) >= 2) {
                    this.drawArrow(ctx, i * dx - cx, - cy,
                                   i * dx - cx, height - cy);
                }
            }
            else {
                if (Math.abs(height) >= 2) {
                    this.drawArrow(ctx, i * dx - cx,  cy - height,
                                   i * dx - cx, cy);
                }
            }
        }
        /* Draw the head/base line */
        if (this.anchor_is_tail) {
            this.drawLine(ctx, -cx, -cy, cx, -cy);
        }
        else {
            let xoff = this.strokeWidth/2;
            this.drawLine(ctx, -cx - xoff, cy-this.w1 , cx + xoff,  cy-this.w2);
        }

        this.label1obj.left = this.offsetx1 - cx;
        this.label1obj.top = this.w1 + this.offsety1 - cy;
        this.label1obj.render(ctx);

        this.label2obj.left = this.offsetx2 + cx;
        this.label2obj.top = this.w2 + this.offsety2 - cy;
        this.label2obj.render(ctx);
    }
});



// ======================================================================================
mechanicsObjects.arcVector = fabric.util.createClass(fabric.Object, {
    type: 'arc',
    initialize: function(options) {
        options = options || {};
        this.callSuper("initialize", options);
        this.set('arrowheadOffsetRatio', options.arrowheadOffsetRatio || 1);
        this.set('arrowheadWidthRatio', options.arrowheadWidthRatio || 1);
        this.set('strokeWidth', options.strokeWidth || 3);
        this.set('stroke', options.stroke || 'black');
        this.set('fill', options.stroke || 'black');
        this.set('height', this.radius * 2);
        this.set('width', this.radius * 2);
        this.set('originX', 'center');
        this.set('originY', 'center');

        this.setControlVisible('bl',false);
        this.setControlVisible('tl',false);
        this.setControlVisible('br',false);
        this.setControlVisible('tr',false);
        this.setControlVisible('mt',false);
        this.setControlVisible('mb',false);
        this.setControlVisible('ml',false);
        this.setControlVisible('mr',false);
        this.setControlVisible('mtr',false);
        if(options.hasOwnProperty('trueHandles')) {
            for (var i = 0; i < options.trueHandles.length; i++) {
                this.setControlVisible(options.trueHandles[i],true);
            }
        }
    },
    toObject: function() {
	return fabric.util.object.extend(this.callSuper('toObject'), {
            name: this.get('name')
            /* should write here the properties that were added in initialize
               and that should appear on the server */
	});
    },
    get_point_arc: function(alpha,er,et,r) {
        var uvec = er.multiply(-r*(1-Math.cos(alpha)));
        uvec = uvec.add(et.multiply(r*Math.sin(alpha)));
        return (uvec)
    },
    make_arrow_head: function(ctx,theta,alpha,beta,r,l,c,h) {
        var er = $V( [ Math.cos(theta), Math.sin(theta)]);
        var et = $V( [ -Math.sin(theta), Math.cos(theta)]);
        var uE = er.multiply(r);
        uEA = this.get_point_arc(alpha,er,et,r);
        var n1 = uEA.toUnitVector();
        var n2 = $V( [n1.e(2) , -n1.e(1) ]);
        var uA = uE.add(uEA);
        uED = this.get_point_arc(beta,er,et,r);
        var uD = uE.add(uED);
        var uB = uE.add( n1.multiply(l) );
        var uC = uE.add( n1.multiply(c) );
        var uG = uB.add( n2.multiply(h/2) );
        var uF = uB.add( n2.multiply(-h/2) );
        ctx.beginPath();
        ctx.moveTo(uE.e(1), uE.e(2));
        ctx.lineTo(uG.e(1), uG.e(2));
        ctx.lineTo(uC.e(1), uC.e(2));
        ctx.lineTo(uF.e(1), uF.e(2));
        ctx.lineTo(uE.e(1), uE.e(2));
        ctx.lineWidth = 1;
        this._renderFill(ctx);
        this._renderStroke(ctx);
        ctx.closePath();
        return (uD);
    },
    _render: function(ctx) {
        var w = this.strokeWidth;
        var l = 7*w*this.arrowheadOffsetRatio;
        var h = 0.5*l*this.arrowheadWidthRatio;
        var c = 0.6*l;
        var e = 0.9*l;
        var r = this.radius;
        var thetai = (this.startAngle)*Math.PI/180;
        var thetaf = (this.endAngle)*Math.PI/180;

        if (this.drawStartArrow) {
            var alpha = Math.acos( 1 - e*e/(2*r*r) );
            var beta  = Math.acos( 1 - (c*c)/(2*r*r) );
            start_line = this.make_arrow_head(ctx,thetai,alpha,beta,r,l,c,h);
            start_line_angle = Math.atan2(start_line.e(2),start_line.e(1));
        }
        else {
            start_line_angle = thetai;
        }

        if (this.drawEndArrow) {
            var alpha = -Math.acos( 1 - e*e/(2*r*r) );
            var beta  = -Math.acos( 1 - (c*c)/(2*r*r) );
            end_line = this.make_arrow_head(ctx,thetaf,alpha,beta,r,l,c,h);
            end_line_angle = Math.atan2(end_line.e(2),end_line.e(1));
        }
        else {
            end_line_angle = thetaf;
        }

        if (this.drawCenterPoint) {
            ctx.beginPath();
            ctx.arc(0, 0, 4, 0, 2 * Math.PI);
            ctx.lineWidth = this.strokeWidth;
            this._renderStroke(ctx);
            ctx.closePath();
        }

        ctx.beginPath();
        ctx.lineWidth = this.strokeWidth;
        ctx.arc(0, 0, this.radius, start_line_angle , end_line_angle);
        this._renderStroke(ctx);
        ctx.closePath();

     },
});

// ======================================================================================
mechanicsObjects.makeDistTrianLoad = function(options) {
    return new mechanicsObjects.DistTrianLoad(options);

};

// ======================================================================================
mechanicsObjects.makeCoordinates = function(options) {

    var group = new fabric.Group([ ], { left: 0, top: 0 , name: 'coordinates'});

    let obj1 = new mechanicsObjects.Arrow(options);
    group.addWithUpdate(obj1);

    var options2 = _.defaults({
        angle:options.angle - 90,
    }, options);

    let obj2 = new mechanicsObjects.Arrow(options2);
    group.addWithUpdate(obj2);

    var options3 = _.defaults({
        radius: 4,
        originX: 'center',
        originY: 'center',
        fill: options.stroke,
    }, options);

    let obj3 = new fabric.Circle(options3);
    group.addWithUpdate(obj3);

    return group;
};


// ======================================================================================
mechanicsObjects.makePulley = function(options) {

    var group = new fabric.Group([ ], { left: 0, top: 0 , name: 'pulley'});
    var circle_pulley = new fabric.Circle({
        radius: options.radius,
        fill: options.fill,
        stroke: options.stroke,
        strokeWidth: options.strokeWidth,
    });

    group.addWithUpdate(circle_pulley);

    group.set({
        originX: 'center',
        originY: 'center',
        left: options.x1,
        top: options.y1,
    });

    var textObj = new fabric.Text(options.label, {
        fontSize: 20,
        textAlign: "left",
        left: options.offsetx ,
        top: options.offsety,
    });
    group.add(textObj);

    var center_pulley = new fabric.Circle({
        originX: 'center',
        originY: 'center',
        left: options.x1,
        top: options.y1,
        radius: 4,
    });
    group.addWithUpdate(center_pulley);

    var line2 = new fabric.Line([ options.x2, options.y2, options.x4, options.y4], {
        stroke: options.stroke,
        strokeWidth: options.strokeWidth,
        originX: 'center',
        originY: 'center',
    });
    group.addWithUpdate(line2);

    var line3 = new fabric.Line([ options.x3, options.y3, options.x5, options.y5], {
        stroke: options.stroke,
        strokeWidth: options.strokeWidth,
        originX: 'center',
        originY: 'center',
    });
    group.addWithUpdate(line3);

    return group;
};

/********************************************************************************/
/********************************************************************************/
/********************************************************************************/
// Helper functions for maintaining submittedAnswer

mechanicsObjects.idCounter = 0;
mechanicsObjects.newID = function() {
    this.idCounter++;
    return this.idCounter;
};

mechanicsObjects.addOrReplaceSubmittedAnswerObject = function(submittedAnswer, answerName, subObj) {
    if (!submittedAnswer.has(answerName)) submittedAnswer.set(answerName, []);
    var objects = submittedAnswer.get(answerName);
    var origSubObj = _(objects).findWhere({id: subObj.id});
    if (origSubObj) {
        _.extend(origSubObj, subObj);
    } else {
        objects.push(subObj);
    }
    submittedAnswer.set(answerName, objects);
};

mechanicsObjects.removeSubmittedAnswerObject = function(submittedAnswer, answerName, subObj) {
    var objects = submittedAnswer.get(answerName);
    objects = _(objects).reject(function(obj) {return obj.id == subObj.id;});
    submittedAnswer.set(answerName, objects);
};

mechanicsObjects.byType = {};
mechanicsObjects.restoreSubmittedAnswer = function(canvas, submittedAnswer, answerName) {
    if (!submittedAnswer.has(answerName)) return;
    var objects = submittedAnswer.get(answerName);
    var that = this;
    _(objects).each(function(obj) {
        that.idCounter = Math.max(that.idCounter, obj.id);
        var newObj = JSON.parse(JSON.stringify(obj));
        delete newObj.type;
        var fcn = that.byType[obj.type];
        if (!fcn) return;
        fcn.call(that, canvas, newObj, submittedAnswer, answerName);
    });
};

// ======================================================================================
// ======================================================================================
// ======================================================================================
// Background drawing function

mechanicsObjects.addCanvasBackground = function(canvas, w, h, gridsize) {
    canvas.backgroundColor = '#FFFFF0';
    var options = {
        stroke: "#D3D3D3",
        strokeWidth: 1,
        selectable: false,
        evented: false
    };

    for (var i = 1; i < (w/gridsize); i++){
        canvas.add(new fabric.Line([gridsize*i, 0, gridsize*i, h], options));
    }
    for (var i = 1; i < (h/gridsize); i++){
        canvas.add(new fabric.Line([0, gridsize*i, w, gridsize*i], options));
    }
}

// ======================================================================================
// ======================================================================================
// ======================================================================================
// Functions to add objects to the canvas, including maintaining submittedAnswer.
// These functions do not create actual new object types, but just use existing obejcts.
//
// These can all be called in two forms:
// 1. addArrow(canvas, options) will simply draw the object directly on the canvas.
// 2. addArrow(canvas, options, submittedAnswer, answerName) will draw the object
//    on the canvas and also add callbacks to update the object in submittedAnswer.

// ======================================================================================
// ======================================================================================
// The first list of objects are used to diplay figures, but they currently
// don't have support for grading (not used as a submitted answer)
// ======================================================================================
// ======================================================================================

mechanicsObjects.addText = function(canvas, options, submittedAnswer, answerName) {
    if (options.latex) {
        let textObj = new mechanicsObjects.LatexText(options.label, {
            left: options.left+options.offsetx,
            top: options.top+options.offsety,
            fontSize: options.fontSize,
            selectable: false,
            evented: false,
            textAlign: "left",
        });
        canvas.add(textObj);
    }
    else {
      let textObj = new fabric.Text(options.label, {
          left: options.left+options.offsetx,
          top: options.top+options.offsety,
          fontSize: options.fontSize,
          selectable: false,
          evented: false,
          textAlign: "left",
      });
      canvas.add(textObj);
    }
};

mechanicsObjects.byType['text'] = mechanicsObjects.addText;

// ======================================================================================
mechanicsObjects.addRod = function(canvas, options, submittedAnswer, answerName) {
    let obj = new mechanicsObjects.Rod(options);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    /* Add both labels */
    for (let i = 0; i < 2; i++) {
        let ind = (i + 1).toString();
        let textObj = new mechanicsObjects.LatexText(obj['label' + ind], {
            left: obj['x' + ind] + obj['offsetx' + ind],
            top: obj['y' + ind] + obj['offsety' + ind],
            fontSize: 20,
            textAlign: "left",
            selectable: false
        });
        canvas.add(textObj);
    }

    return obj;
}
mechanicsObjects.byType['rod'] = mechanicsObjects.addRod;

// ======================================================================================
mechanicsObjects.addCollarRod = function(canvas, options, submittedAnswer, answerName) {
    let obj = new mechanicsObjects.CollarRod(options);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    /* Add both labels */
    for (let i = 0; i < 2; i++) {
        let ind = (i + 1).toString();
        let textObj = new mechanicsObjects.LatexText(obj['label' + ind], {
            left: obj['x' + ind] + obj['offsetx' + ind],
            top: obj['y' + ind] + obj['offsety' + ind],
            fontSize: 20,
            textAlign: "left",
            selectable: false
        });
        canvas.add(textObj);
    }

    return obj;
}
mechanicsObjects.byType['collarrod'] = mechanicsObjects.addCollarRod;

// ======================================================================================
mechanicsObjects.addLShapeRod = function(canvas, options, submittedAnswer, answerName) {
    let obj = new mechanicsObjects.LShapeRod(options);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    /* Add all 3 labels */
    for (let i = 0; i < 3; i++) {
        let ind = (i + 1).toString();
        let textObj = new mechanicsObjects.LatexText(obj['label' + ind], {
            left: obj['x' + ind] + obj['offsetx' + ind],
            top: obj['y' + ind] + obj['offsety' + ind],
            fontSize: 20,
            textAlign: "left",
            selectable: false
        });
        canvas.add(textObj);
    }

    return obj;
}
mechanicsObjects.byType['Lshaperod'] = mechanicsObjects.addLShapeRod;

// ======================================================================================
mechanicsObjects.addTShapeRod = function(canvas, options, submittedAnswer, answerName) {
    let obj = new mechanicsObjects.TShapeRod(options);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    /* Add all 4 labels */
    for (let i = 0; i < 4; i++) {
        let ind = (i + 1).toString();
        let textObj = new mechanicsObjects.LatexText(obj['label' + ind], {
            left: obj['x' + ind] + obj['offsetx' + ind],
            top: obj['y' + ind] + obj['offsety' + ind],
            fontSize: 20,
            textAlign: "left",
            selectable: false
        });
        canvas.add(textObj);
    }

    return obj;
}
mechanicsObjects.byType['Tshaperod'] = mechanicsObjects.addTShapeRod;

// ======================================================================================
mechanicsObjects.addClampedEnd = function(canvas, options, submittedAnswer, answerName) {
    let obj = new mechanicsObjects.ClampedEnd(options);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    var textObj = new mechanicsObjects.LatexText(obj.label, {
        left: obj.x1+obj.offsetx,
        top: obj.y1+obj.offsety,
        fontSize: 20,
        textAlign: "left",
        selectable: false
    });
    canvas.add(textObj);

    return obj;
}
mechanicsObjects.byType['clamped'] = mechanicsObjects.addClampedEnd;

// ======================================================================================
mechanicsObjects.addFixedPin = function(canvas, options, submittedAnswer, answerName) {
    let obj = new mechanicsObjects.FixedPin(options);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    var textObj = new mechanicsObjects.LatexText(obj.label, {
        left: obj.x1+obj.offsetx,
        top: obj.y1+obj.offsety,
        fontSize: 20,
        textAlign: "left",
        selectable: false
    });
    canvas.add(textObj);

    return obj;
}
mechanicsObjects.byType['fixed-pin'] = mechanicsObjects.addFixedPin;

// ======================================================================================
mechanicsObjects.addDimension = function(canvas, options, submittedAnswer, answerName) {

      var p1 = $V([ options.x1ref, options.y1ref ]);
      var p2 = $V([ options.x2ref, options.y2ref ]);
      var p1d = $V([ options.x1d, options.y1d ]);
      var p2d = $V([ options.x2d, options.y2d ]);

      options.left = p1d.e(1)
      options.top = p1d.e(2)
      options.angle = Math.atan2(p2d.e(2) - p1d.e(2), p2d.e(1) - p1d.e(1)) * (180.0 / Math.PI);
      options.width = Math.sqrt(Math.pow(p2d.e(2) - p1d.e(2), 2) + Math.pow(p2d.e(1) - p1d.e(1), 2));

      let obj = new mechanicsObjects.Arrow(options);
      obj.selectable = false;
      obj.evented = false;
      if (!obj.id) {
          obj.id = this.newID();
      }
      canvas.add(obj);

      // Adding support lines
      var options1 = {
          strokeDashArray: [3,3],
          stroke: '#0057a0',
          strokeWidth: 1.2,
          originX: 'left',
          originY: 'top',
      };
      if (options.startSupportLine) {
          let line1 = new fabric.Line([p1.e(1),p1.e(2), p1d.e(1), p1d.e(2)],options1);
          line1.selectable = false;
          line1.evented = false;
          canvas.add(line1);
        }
      if (options.endSupportLine) {
          let line2 = new fabric.Line([p2.e(1),p2.e(2), p2d.e(1), p2d.e(2)],options1);
          line2.selectable = false;
          line2.evented = false;
          canvas.add(line2);
        }

      if (obj.label) {
          var textObj = new mechanicsObjects.LatexText(obj.label, {
              left: obj.xlabel + obj.offsetx,
              top: obj.ylabel + obj.offsety,
              fontSize: 16,
              originX:'center',
              originY:'center',
              textAlign: "left",
              selectable: false
          });
          canvas.add(textObj);
      } else {
          var textObj = null;
      }

    return obj;
}
mechanicsObjects.byType['dimension'] = mechanicsObjects.addDimension;

// ======================================================================================
mechanicsObjects.addArcDimension = function(canvas, options, submittedAnswer, answerName) {

      var obj = new this.arcVector(options);
      canvas.add(obj);

      // Adding support lines
      var options1 = {
          strokeDashArray: [3,3],
          stroke: '#0057a0',
          strokeWidth: 1.2,
          originX: 'left',
          originY: 'top',
      };
      if (options.startSupportLine) {
          xend = obj.left + 1.5*obj.radius*Math.cos( obj.startAngle*Math.PI/180 )
          yend = obj.top  + 1.5*obj.radius*Math.sin( obj.startAngle*Math.PI/180 )
          let line1 = new fabric.Line([obj.left,obj.top, xend, yend],options1);
          line1.selectable = false;
          line1.evented = false;
          canvas.add(line1);
        }
      if (options.endSupportLine) {
          xend = obj.left + 1.5*obj.radius*Math.cos( obj.endAngle*Math.PI/180 )
          yend = obj.top  + 1.5*obj.radius*Math.sin( obj.endAngle*Math.PI/180 )
          let line1 = new fabric.Line([obj.left,obj.top, xend, yend],options1);
          line1.selectable = false;
          line1.evented = false;
          canvas.add(line1);
        }

      if (obj.label) {
          var dt =  obj.endAngle-obj.startAngle
          if (dt >= 0) {
              var t = obj.startAngle + dt/2
          }
          else {
              var t = obj.startAngle + (360+dt)/2
          }
          var dx = obj.radius*Math.cos(t*Math.PI/180)
          var dy = obj.radius*Math.sin(t*Math.PI/180)

          var textObj = new mechanicsObjects.LatexText(obj.label, {
              left: obj.left+dx+obj.offsetx,
              top: obj.top+dy+obj.offsety,
              originX:'center',
              originY:'center',
              fontSize: 20,
              textAlign: "left",
          });
          canvas.add(textObj);
      } else {
          var textObj = null;
      }

    return obj;
}
mechanicsObjects.byType['arc-dimension'] = mechanicsObjects.addArcDimension;

// ======================================================================================
mechanicsObjects.addSpring = function(canvas, options, submittedAnswer, answerName) {
    let obj = new mechanicsObjects.Spring(options);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    return obj;
}
mechanicsObjects.byType['spring'] = mechanicsObjects.addSpring;

// ======================================================================================
// triangle
mechanicsObjects.addTriangle = function(canvas, options, submittedAnswer, answerName) {
    var options2 = _.defaults({
        selectable: false
    }, options);
    let obj = new fabric.Polygon([options.p1,options.p2,options.p3],options2);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);
    return obj;
};
mechanicsObjects.byType['triangle'] = mechanicsObjects.addTriangle;

// ======================================================================================
// rectangle
mechanicsObjects.addRectangle = function(canvas, options, submittedAnswer, answerName) {

    var options2 = _.defaults({
        selectable: false
    }, options);
    let obj = new fabric.Rect(options2);

    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);
    return obj;
};
mechanicsObjects.byType['rectangle'] = mechanicsObjects.addRectangle;

// ======================================================================================
// polygon
mechanicsObjects.addPolygon = function(canvas, options, submittedAnswer, answerName) {
    let obj = new fabric.Polygon(options.pointlist,options);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);
    return obj;
};
mechanicsObjects.byType['polygon'] = mechanicsObjects.addPolygon;

// ======================================================================================
mechanicsObjects.addLine = function(canvas, options, submittedAnswer, answerName) {

    let obj = new fabric.Line([options.x1,options.y1, options.x2, options.y2],options);

    obj.setControlVisible('bl',false);
    obj.setControlVisible('tl',false);
    obj.setControlVisible('br',false);
    obj.setControlVisible('tr',false);
    obj.setControlVisible('mt',false);
    obj.setControlVisible('mb',false);
    obj.setControlVisible('ml',false);
    obj.setControlVisible('mr',false);
    obj.setControlVisible('mtr',false);
    if(obj.hasOwnProperty('trueHandles')) {
        for (var i = 0; i < obj.trueHandles.length; i++) {
              obj.setControlVisible(obj.trueHandles[i],true);
        }
    }

    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    if (!submittedAnswer) return obj;

    var modify = function(subObj) {
        subObj.left = obj.left,
        subObj.top = obj.top,
        subObj.angle = obj.angle,
        subObj.scaleX = obj.scaleX;
    };
    this.createObjectHandlers('line', options, obj, submittedAnswer, answerName, modify);

    return obj;
};
mechanicsObjects.byType['line'] = mechanicsObjects.addLine;


// ======================================================================================
mechanicsObjects.addCoordinates = function(canvas, options, submittedAnswer, answerName) {
    let obj = mechanicsObjects.makeCoordinates(options);
    obj.evented = false;
    obj.selectable = false;
    if (!obj.id) {
         obj.id = this.newID();
    }
    canvas.add(obj);

    var textObj = new mechanicsObjects.LatexText(options.label, {
        left: options.left+options.offsetx,
        top: options.top+options.offsety,
        fontSize: 20,
        textAlign: "left",
    });
    canvas.add(textObj);

    var angle_rad = Math.PI*options.angle/180
    var dx = options.width*Math.cos(angle_rad)
    var dy = options.width*Math.sin(angle_rad)
    var textObj2 = new mechanicsObjects.LatexText(options.labelx, {
        left: options.left+dx+options.offsetx_label_x,
        top: options.top+dy+options.offsety_label_x,
        fontSize: 20,
        textAlign: "left"
    });
    textObj2.evented = false;
    textObj2.selectable = false;
    canvas.add(textObj2);

    var angle_rad = Math.PI*(options.angle-90)/180
    var dx = options.width*Math.cos(angle_rad)
    var dy = options.width*Math.sin(angle_rad)
    var textObj3 = new mechanicsObjects.LatexText(options.labely, {
        left: options.left+dx+options.offsetx_label_y,
        top: options.top+dy+options.offsety_label_y,
        fontSize: 20,
        textAlign: "left"
    });
    textObj3.evented = false;
    textObj3.selectable = false;
    canvas.add(textObj3);

    return obj;
};

mechanicsObjects.byType['coordinates'] = mechanicsObjects.addCoordinates;

// ======================================================================================
mechanicsObjects.addAxes = function(canvas, options, submittedAnswer, answerName) {

    var obj = new fabric.Group([ ], { left: 0, top: 0 });
    obj.evented = false;
    obj.selectable = false;

    // Adding x-axis
    var options_axis_1 = _.defaults({
        left: options.left - options.xneg,
        top: options.top,
        width: options.xneg + options.xpos,
        drawEndArrow: true,
        arrowheadWidthRatio:  1.5,
        arrowheadOffsetRatio: 1.5,
    }, options);
    let obj1 = new mechanicsObjects.Arrow(options_axis_1);
    obj.addWithUpdate(obj1);

    // Adding y-axis
    var options_axis_2 = _.defaults({
        left: options.left,
        top: options.top + options.yneg,
        width: options.yneg + options.ypos,
        angle: -90,
        drawEndArrow: true,
        arrowheadWidthRatio:  1.5,
        arrowheadOffsetRatio: 1.5,
    }, options);
    let obj2 = new mechanicsObjects.Arrow(options_axis_2);
    obj.addWithUpdate(obj2);

    if (!obj.id) {
         obj.id = this.newID();
    }
    canvas.add(obj);

    var textObj2 = new mechanicsObjects.LatexText(options.labelx, {
        left: options.left+options.xpos+options.offsetx_label_x,
        top: options.top+options.offsety_label_x,
        fontSize: 20,
        textAlign: "left"
    });
    canvas.add(textObj2);

    var textObj3 = new mechanicsObjects.LatexText(options.labely, {
        left: options.left+options.offsetx_label_y,
        top: options.top-options.ypos+options.offsety_label_y,
        fontSize: 20,
        textAlign: "left"
    });
    canvas.add(textObj3);

    // Adding labels to plot axes
    for (var i = 0; i < options.label_list.length; i++) {
        var xL = options.left
        var yL = options.top
        if (options.label_list[i]["axis"] == "x") {
            xL += options.label_list[i]["pos"]
            yL += 10
            if ("offsetx" in options.label_list[i]){
                xL += options.label_list[i]["offsetx"]
            }
            if ( "offsety" in options.label_list[i] ){
                yL -= options.label_list[i]["offsety"]
            }
        }
        else if (options.label_list[i]["axis"] == "y") {
            yL -= options.label_list[i]["pos"]
            xL -= 20
            if ("offsetx" in options.label_list[i]) {
                xL += options.label_list[i]["offsetx"]
            }
            if ("offsety" in options.label_list[i]) {
                yL -= options.label_list[i]["offsety"]
            }
        }
        var textObj4 = new mechanicsObjects.LatexText(options.label_list[i]["lab"], {
            left: xL,
            top: yL,
            fontSize: 14,
            originX:'center',
            originY:'center',
        });
        canvas.add(textObj4);
    }

    // Adding support lines
    var opt_line = {
        strokeDashArray: [3,3],
        stroke: '#0057a0',
        strokeWidth: 1.2,
        originX: 'left',
        originY: 'top',
        selectable: false,
    };
    for (var i = 0; i < options.supporting_lines.length; i++) {
        if ('x' in options.supporting_lines[i]) {
           var x1 = options.left + options.supporting_lines[i]['x']
           var y1 = options.top + options.yneg
           var y2 = options.top - options.ypos
           var line1 = new fabric.Line([x1,y1,x1,y2],opt_line);
           canvas.add(line1);
        }
        if ('y' in options.supporting_lines[i]) {
           var x1 = options.left - options.xneg
           var x2 = options.left + options.xpos
           var y1 = options.top - options.supporting_lines[i]['y']
           var line1 = new fabric.Line([x1,y1,x2,y1],opt_line);
           canvas.add(line1);
        }
    }


    return obj;
};

mechanicsObjects.byType['axes'] = mechanicsObjects.addAxes;

// ======================================================================================
// arc
mechanicsObjects.addArc = function(canvas, options, submittedAnswer, answerName) {
    let obj = new fabric.Circle(options);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);
    return obj;
};
mechanicsObjects.byType['simple-arc'] = mechanicsObjects.addArc;


// ======================================================================================
// pulley
mechanicsObjects.addPulley = function(canvas, options, submittedAnswer, answerName) {

    let obj = this.makePulley(options);
    obj.selectable = false

    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    return obj;
};
mechanicsObjects.byType['pulley'] = mechanicsObjects.addPulley;

// ======================================================================================
// arc
//
// options:
//     left: left coordinate
//     right: right coordinate
//     ...: other drawing options

mechanicsObjects.addArcVector = function(canvas, options, submittedAnswer, answerName) {
    var obj = new this.arcVector(options);
    canvas.add(obj)

    if (options.drawErrorBox) {
        var error_box = new fabric.Rect(
          {left:options.XcenterErrorBox,
           top:options.YcenterErrorBox,
           originX:'center',
           originY:'center',
           width: options.widthErrorBox,
           height: options.heightErrorBox,
           angle: options.angle,
           fill:'',
           strokeWidth: 3,
           stroke:'green'}
        );
        canvas.add(error_box);
    }

    if (obj.label) {
        var dt =  obj.endAngle-obj.startAngle
        if (dt >= 0) {
            var t = obj.startAngle + dt/2
        }
        else {
            var t = obj.startAngle + (360+dt)/2
        }
        var dx = options.radius*Math.cos(t*Math.PI/180)
        var dy = options.radius*Math.sin(t*Math.PI/180)

        var textObj = new mechanicsObjects.LatexText(obj.label, {
            left: obj.left+dx+obj.offsetx,
            top: obj.top+dy+obj.offsety,
            originX:'center',
            originY:'center',
            fontSize: 20,
            textAlign: "left",
        });
        canvas.add(textObj);
    } else {
        var textObj = null;
    }

    if (!submittedAnswer) return obj;

    var modify = function(subObj) {
        subObj.left = obj.left;
        subObj.top = obj.top;
        subObj.angle = obj.angle;
        if (textObj) {
            textObj.left = obj.left + dx + obj.offsetx;
            textObj.top = obj.top + dy + obj.offsety;
        }
    };
    this.createObjectHandlers('arc_vector', options, obj, submittedAnswer, answerName, modify);

    return obj;
};

mechanicsObjects.byType['arc_vector'] = mechanicsObjects.addArcVector;


// ======================================================================================
// The second list of objects are used to diplay figures and also as submitted answers
// These objects have corresponding grading functions
// ======================================================================================
// ======================================================================================
// arrow
//
// options:
//     left: left coordinate
//     right: right coordinate
//     ...: other drawing options

mechanicsObjects.addArrow = function(canvas, options, submittedAnswer, answerName) {
    var obj = new this.Arrow(options);
    canvas.add(obj);

    if (options.drawErrorBox) {
        var error_box = new fabric.Rect(
          {left:options.XcenterErrorBox,
           top:options.YcenterErrorBox,
           originX:'center',
           originY:'center',
           width: options.widthErrorBox,
           height: options.heightErrorBox,
           angle: options.angle,
           fill:'',
           stroke:'blue'}
        );
        canvas.add(error_box);
    }

    var angle_rad = Math.PI*obj.angle/180
    var dx = obj.width*Math.cos(angle_rad)
    var dy = obj.width*Math.sin(angle_rad)
    if (obj.label) {
        var textObj = new mechanicsObjects.LatexText(obj.label, {
            left: obj.left+dx+obj.offsetx,
            top: obj.top+dy+obj.offsety,
            fontSize: 20,
            textAlign: "left",
            selectable: false
        });
        canvas.add(textObj);
    } else {
        var textObj = null;
    }

    if (!submittedAnswer) return obj;

    var modify = function(subObj) {
        subObj.left = obj.left;
        subObj.top = obj.top;
        subObj.angle = obj.angle;
        if (textObj) {
            textObj.left = obj.left + dx + obj.offsetx;
            textObj.top = obj.top + dy + obj.offsety;
        }
    };
    this.createObjectHandlers('arrow', options, obj, submittedAnswer, answerName, modify);

    return obj;
};

mechanicsObjects.byType['arrow'] = mechanicsObjects.addArrow;

// ======================================================================================
mechanicsObjects.addDoubleArrow = function(canvas, options, submittedAnswer, answerName) {
    var obj = new this.DoubleArrow(options);
    canvas.add(obj);

    if (options.drawErrorBox) {
        var error_box = new fabric.Rect(
          {left:options.XcenterErrorBox,
           top:options.YcenterErrorBox,
           originX:'center',
           originY:'center',
           width: options.widthErrorBox,
           height: options.heightErrorBox,
           angle: options.angle,
           fill:'',
           stroke:'blue'}
        );
        canvas.add(error_box);
    }

    var angle_rad = Math.PI*obj.angle/180
    var dx = obj.width*Math.cos(angle_rad)
    var dy = obj.width*Math.sin(angle_rad)
    if (obj.label) {
        var textObj = new mechanicsObjects.LatexText(obj.label, {
            left: obj.left+dx+obj.offsetx,
            top: obj.top+dy+obj.offsety,
            fontSize: 20,
            textAlign: "left",
            selectable: false
        });
        canvas.add(textObj);
    } else {
        var textObj = null;
    }

    if (!submittedAnswer) return obj;

    var modify = function(subObj) {
        subObj.left = obj.left;
        subObj.top = obj.top;
        subObj.angle = obj.angle;
        if (textObj) {
            textObj.left = obj.left + dx + obj.offsetx;
            textObj.top = obj.top + dy + obj.offsety;
        }
    };
    this.createObjectHandlers('doubleArrow', options, obj, submittedAnswer, answerName, modify);

    return obj;
};
mechanicsObjects.byType['doubleArrow'] = mechanicsObjects.addDoubleArrow;

// ======================================================================================
// distTrianLoad
//
// options:
//     left: left coordinate of the object
//     top: top coordinate of the object
//     angle: rotation angle (90 or -90)
//     range: horizontal width of the load
//     spacing: horizontal spacing of the arrows
//     minThickness: minimum vertical thickness of the load
//     maxThickness: maximum vertical thickness of the load

mechanicsObjects.addDistTrianLoad = function(canvas, options, submittedAnswer, answerName) {
    var obj = this.makeDistTrianLoad(options);
    canvas.add(obj);

    if (options.drawErrorBox) {
        var error_box = new fabric.Rect(
          {left:options.XcenterErrorBox,
           top:options.YcenterErrorBox,
           originX:'center',
           originY:'center',
           width: options.widthErrorBox,
           height: options.heightErrorBox,
           angle: options.angle,
           fill:'',
           stroke:'blue'}
        );
        canvas.add(error_box);
    }

    if (!submittedAnswer) return obj;

    // save location for updates
    var initSubObjLeft = options.left;
    var initSubObjTop = options.top;
    var initObjLeft = obj.left;
    var initObjTop = obj.top;

    var modify = function(subObj) {
        subObj.left = initSubObjLeft + obj.left - initObjLeft,
        subObj.top = initSubObjTop + obj.top - initObjTop,
        subObj.range = obj.range;
        subObj.angle = obj.angle;
        subObj.flipped = obj.flipped;
    };
    this.createObjectHandlers('distTrianLoad', options, obj, submittedAnswer, answerName, modify);

    return obj;
};

mechanicsObjects.byType['distTrianLoad'] = mechanicsObjects.addDistTrianLoad;

// ======================================================================================
// circle
mechanicsObjects.addCircle = function(canvas, options, submittedAnswer, answerName) {

    let obj = new fabric.Circle(options);

    obj.setControlVisible('bl',false);
    obj.setControlVisible('tl',false);
    obj.setControlVisible('br',false);
    obj.setControlVisible('tr',false);
    obj.setControlVisible('mt',false);
    obj.setControlVisible('mb',false);
    obj.setControlVisible('ml',false);
    obj.setControlVisible('mr',false);
    obj.setControlVisible('mtr',false);

    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    if (options.drawErrorBox) {
        var error_box = new fabric.Rect(
          {left:options.XcenterErrorBox,
           top:options.YcenterErrorBox,
           originX:'center',
           originY:'center',
           width: options.widthErrorBox,
           height: options.heightErrorBox,
           angle: options.angle,
           fill:'',
           strokeWidth: 3,
           stroke:'purple'}
        );
        canvas.add(error_box);
    }

    if (obj.label) {
        var textObj = new mechanicsObjects.LatexText(obj.label, {
          left: obj.left+obj.offsetx,
          top: obj.top+obj.offsety,
          fontSize: 16,
          textAlign: "left",
          selectable: false
        });
        canvas.add(textObj);
    } else {
        var textObj = null;
    }

    if (!submittedAnswer) return obj;

    var modify = function(subObj) {
        subObj.left = obj.left;
        subObj.top = obj.top;
        if (textObj) {
            textObj.left = obj.left+obj.offsetx;
            textObj.top = obj.top+obj.offsety;
        }
    };
    this.createObjectHandlers('circle', options, obj, submittedAnswer, answerName, modify);

    return obj;

};

mechanicsObjects.byType['circle'] = mechanicsObjects.addCircle;

// ======================================================================================
mechanicsObjects.addRoller = function(canvas, options, submittedAnswer, answerName) {
    let obj = new mechanicsObjects.Roller(options);
    if (!obj.id) {
        obj.id = this.newID();
    }
    canvas.add(obj);

    var textObj = new mechanicsObjects.LatexText(obj.label, {
        left: obj.x1+obj.offsetx,
        top: obj.y1+obj.offsety,
        fontSize: 20,
        textAlign: "left",
        selectable: false
    });
    canvas.add(textObj);

    return obj;
}
mechanicsObjects.byType['roller'] = mechanicsObjects.addRoller;

// controlledLine
//
// options:
//     x1: left coordinate of first end
//     y1: top coordinate of first end
//     x2: left coordinate of second end
//     y2: top coordinate of second end
//     handleRadius: radius of the control circles on each end
//     strokeWidth: stroke width of the line

mechanicsObjects.addControlledLine = function(canvas, options, submittedAnswer, answerName) {
    var line = mechanicsObjects.makeControlStraightLine(options.x1, options.y1, options.x2, options.y2, options);
    var c1 = mechanicsObjects.makeControlHandle(options.x1, options.y1, options.handleRadius, options.strokeWidth/2);
    var c2 = mechanicsObjects.makeControlHandle(options.x2, options.y2, options.handleRadius, options.strokeWidth/2);
    canvas.add(line, c1, c2);

    var options_error_box = {
        originX:'center',
        originY:'center',
        fill:'',
        stroke:'green',
        width: options.widthErrorBox,
        height: options.heightErrorBox,
    };
    if (options.drawErrorBox) {
        var end_points_options_1 = {
            left:options.x1,
            top:options.y1,
        }
        opt = Object.assign(options_error_box,end_points_options_1)
        canvas.add(new fabric.Rect(opt));

        var end_points_options_2 = {
            left:options.x2,
            top:options.y2,
        }
        opt = Object.assign(options_error_box,end_points_options_2)
        canvas.add(new fabric.Rect(opt));
    }

    if (!submittedAnswer) return [line, c1, c2];

    var subObj = this.cloneMechanicsObject('controlledLine', options);

    /* C1 */
    this.attachHandlersNoClone(subObj, c1, submittedAnswer, answerName,
    function() { /* Modified */
        subObj.x1 = c1.left;
        subObj.y1 = c1.top;
    },
    function() { /* Removed */
        canvas.remove(c2);
        canvas.remove(line);
    });
    c1.on('moving',function() {
        line.set({ 'x1': c1.left, 'y1': c1.top });
    });

    /* C2 */
    this.attachHandlersNoClone(subObj, c2, submittedAnswer, answerName,
    function() { /* Modified */
        subObj.x2 = c2.left;
        subObj.y2 = c2.top;
    },
    function() { /* Removed */
        canvas.remove(c1);
        canvas.remove(line);
    });
    c2.on('moving',function() {
        line.set({ 'x2': c2.left, 'y2': c2.top });
    });

    return [line, c1, c2];
};
mechanicsObjects.makeControlHandle = function(left, top, handleRadius, strokeWidth) {
    var c = new fabric.Circle({
        left: left,
        top: top,
        strokeWidth: strokeWidth,
        radius: handleRadius,
        fill: 'white',
        stroke: '#666',
        originX: 'center',
        originY: 'center',
        excludeFromExport: true,
        name: "controlHandle",
    });
    c.hasControls = false;
    return c;
};
mechanicsObjects.makeControlStraightLine = function(x1, y1, x2, y2, options) {
    var line = new fabric.Line([x1, y1, x2, y2], {
        stroke: options.stroke,
        strokeWidth: options.strokeWidth,
        selectable: false,
        evented: false,
        name: "controlledLine",
        originX: 'center',
        originY: 'center',
    });
    return line;
};
mechanicsObjects.byType['controlledLine'] = mechanicsObjects.addControlledLine;

// ======================================================================================
// controlledCurvedLine
//
// options:
//     x1: left coordinate of first point
//     y1: top coordinate of first point
//     x2: left coordinate of second point
//     y2: top coordinate of second point
//     x3: left coordinate of third point  - control point for quadratic curve
//     y3: top coordinate of third point - control point for quadratic curve
//     handleRadius: radius of the control circles on each end
//     strokeWidth: stroke width of the line

mechanicsObjects.addControlledCurvedLine = function(canvas, options, submittedAnswer, answerName) {
    var line = mechanicsObjects.makeControlCurvedLine(options.x1, options.y1, options.x2, options.y2, options.x3, options.y3, options);
    line.objectCaching = false;
    var c1 = mechanicsObjects.makeControlHandle(options.x1, options.y1, options.handleRadius, options.strokeWidth/2);
    var c2 = mechanicsObjects.makeControlHandle(options.x2, options.y2, options.handleRadius, options.strokeWidth/2);
    var c3 = mechanicsObjects.makeControlHandle(options.x3, options.y3, options.handleRadius, options.strokeWidth/2);

    // c1 and c3 are the end points of the quadratic curve
    // c2 is the control point
    canvas.add(line, c1, c2, c3);

    var options_error_box = {
        originX:'center',
        originY:'center',
        fill:'',
        stroke:'green',
        width: options.widthErrorBox,
        height: options.heightErrorBox,
    };
    if (options.drawErrorBox) {
        var end_points_options_1 = {
            left:options.x1,
            top:options.y1,
        }
        opt = Object.assign(options_error_box,end_points_options_1)
        canvas.add(new fabric.Rect(opt));

        var end_points_options_2 = {
            left:options.x3,
            top:options.y3,
        }
        opt = Object.assign(options_error_box,end_points_options_2)
        canvas.add(new fabric.Rect(opt));

        var control_point_options = {
            left:options.x2,
            top:options.y2,
            stroke:'purple',
            width: options.widthErrorBoxControl,
            height: options.heightErrorBoxControl,
        }
        opt = Object.assign(options_error_box,control_point_options)
        canvas.add(new fabric.Rect(opt));
    }

    if (!submittedAnswer) return [line, c1, c2, c3];

    var subObj = this.cloneMechanicsObject('controlledCurvedLine', options);

    /* C1 */
    this.attachHandlersNoClone(subObj, c1, submittedAnswer, answerName,
    function() { /* Modified */
        subObj.x1 = c1.left;
        subObj.y1 = c1.top;
    },
    function() { /* Removed */
        canvas.remove(c2);
        canvas.remove(c3);
        canvas.remove(line);
    });
    c1.on('moving', function() {
        line.path[0][1] = c1.left;
        line.path[0][2] = c1.top;
    });

    /* C2 */
    this.attachHandlersNoClone(subObj, c2, submittedAnswer, answerName,
    function() { /* Modified */
        subObj.x2 = c2.left;
        subObj.y2 = c2.top;
    },
    function() { /* Removed */
        canvas.remove(c1);
        canvas.remove(c3);
        canvas.remove(line);
    });
    c2.on('moving', function() {
        line.path[1][1] = c2.left;
        line.path[1][2] = c2.top;
    });

    /* C3 */
    this.attachHandlersNoClone(subObj, c3, submittedAnswer, answerName,
    function() { /* Modified */
        subObj.x3 = c3.left;
        subObj.y3 = c3.top;
    },
    function() { /* Removed */
        canvas.remove(c1);
        canvas.remove(c2);
        canvas.remove(line);
    });
    c3.on('moving', function() {
        line.path[1][3] = c3.left;
        line.path[1][4] = c3.top;
    });

    return [line, c1, c2, c3];
};
mechanicsObjects.makeControlCurvedLine = function(x1, y1, x2, y2, x3, y3, options) {

    var line = new fabric.Path('M 0 0 Q 1, 1, 3, 0', {
        fill: '',
        stroke: options.stroke,
        strokeWidth: options.strokeWidth,
        selectable: false,
	name: "controlCurvedLine",
        originX: 'center',
        originY: 'center',
    });
    line.path[0][1] = x1;
    line.path[0][2] = y1;
    line.path[1][1] = x2;
    line.path[1][2] = y2;
    line.path[1][3] = x3;
    line.path[1][4] = y3;
    return line;
};
mechanicsObjects.byType['controlledCurvedLine'] = mechanicsObjects.addControlledCurvedLine;

// common

mechanicsObjects.attachHandlersNoClone = function(subObj, reference, submittedAnswer, answerName,
                                                  modifyHandler, removeHandler) {
    this.addOrReplaceSubmittedAnswerObject(submittedAnswer, answerName, subObj);
    var that = this;
    reference.on('modified', function() {
        if (modifyHandler) {
            modifyHandler(subObj);
        }
        that.addOrReplaceSubmittedAnswerObject(submittedAnswer, answerName, subObj);
    });
    reference.on('removed', function() {
        if (removeHandler) {
            removeHandler(subObj);
        }
        that.removeSubmittedAnswerObject(submittedAnswer, answerName, subObj);
    });
}

mechanicsObjects.cloneMechanicsObject = function(type, options) {
    var subObj = _.clone(options);
    if (!subObj.id) {
        subObj.id = this.newID();
    }
    subObj.type = type;
    return subObj;
}

mechanicsObjects.createObjectHandlers = function(type, options, reference, submittedAnswer,
                                                 answerName, modifyHandler, removeHandler) {
    var subObj = this.cloneMechanicsObject(type, options);
    this.attachHandlersNoClone(subObj, reference, submittedAnswer, answerName, modifyHandler, removeHandler);
}
