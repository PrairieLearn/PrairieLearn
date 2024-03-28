/* eslint-env browser, jquery */
/* global _, fabric, Sylvester, PLDrawingBaseElement, MathJax */

var $V = Sylvester.Vector.create;
Sylvester.Vector.prototype.multElementwise = function (other) {
  return $V([this.e(1) * other.e(1), this.e(2) * other.e(2)]);
};
// Rename the Sylvester vector functions to something much more sane...
Sylvester.Vector.prototype.norm = Sylvester.Vector.prototype.modulus;
Sylvester.Vector.prototype.normalize = Sylvester.Vector.prototype.toUnitVector;
Sylvester.Vector.prototype.divide = function (k) {
  return this.multiply(1 / k);
};

const pt2vec = function (pt) {
  return $V([pt.x, pt.y]);
};
const vec2pt = function (v) {
  return { x: v.e(1), y: v.e(2) };
};

var mechanicsObjects = {};

/**
 * New object types.
 * These are all classes that create and return the object, but don't add it to the canvas.
 * These are helper functions/classes for the actual canvas adding functions below.
 */
mechanicsObjects.Spring = fabric.util.createClass(fabric.Object, {
  type: 'spring',
  initialize(options) {
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

    this.on('scaling', function () {
      this.length = this.width * this.scaleX;
      this.h = this.height * this.scaleY;
      this.x1 = this.left;
      this.y1 = this.top;
      this.angleRad = (Math.PI / 180) * this.angle;
      this.x2 = this.x1 + Math.cos(this.angleRad) * this.length;
      this.y2 = this.y1 + Math.sin(this.angleRad) * this.length;
      this.dirty = true;
    });
  },
  _render(ctx) {
    let len = this.length;
    let l2 = len / 2;
    let h = this.scaleY * this.height;

    let dx = this.dx;
    let ndx = Math.floor(len / dx);
    var nzig = ndx - 4;
    if (nzig < 3) {
      nzig = 3;
      dx = len / (nzig + 4);
    }
    if (nzig % 2 === 0) {
      nzig += 1;
      dx = len / (nzig + 4);
    }

    // Undo fabric's scale tranformations
    ctx.scale(1.0 / this.scaleX, 1.0 / this.scaleY);

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

    if (this.drawPin) {
      this.fill = this.stroke;
      ctx.beginPath();
      ctx.arc(-l2, 0, 4, 0, 2 * Math.PI);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.arc(l2, 0, 4, 0, 2 * Math.PI);
      ctx.closePath();
      ctx.fill();
    }
  },
});

mechanicsObjects.Coil = fabric.util.createClass(fabric.Object, {
  type: 'coil',
  initialize(options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.left = this.x1;
    this.top = this.y1;
    this.originY = 'center';
    this.originX = 'left';
    this.length = Math.sqrt(Math.pow(this.y2 - this.y1, 2) + Math.pow(this.x2 - this.x1, 2));
    this.h = this.height / 2;
    this.width = this.length;
    this.angleRad = Math.atan2(this.y2 - this.y1, this.x2 - this.x1);
    this.angle = (180 / Math.PI) * this.angleRad;
    this.objectCaching = false;

    this.on('scaling', function () {
      this.length = this.width * this.scaleX;
      this.h = this.h * this.scaleY;
      this.x1 = this.left;
      this.y1 = this.top;
      this.angleRad = (Math.PI / 180) * this.angle;
      this.x2 = this.x1 + Math.cos(this.angleRad) * this.length;
      this.y2 = this.y1 + Math.sin(this.angleRad) * this.length;
      this.dirty = true;
    });
  },
  _render(ctx) {
    let len = this.length;
    let R2 = this.h;
    let R = 0.5 * R2;
    let offsetAngle = (50 * Math.PI) / 180;
    let n = Math.floor(
      (len - 3 * R - 2 * R * Math.cos(offsetAngle)) / (2 * R * Math.cos(offsetAngle)),
    );
    let l2 = len / 2;

    // Undo fabric's scale tranformations
    ctx.scale(1.0 / this.scaleX, 1.0 / this.scaleY);

    ctx.beginPath();
    ctx.moveTo(-l2, 0);
    var dx = (len - ((n + 1) * 2 * R * Math.cos(offsetAngle) + 2 * R)) / 2;
    var start = -l2 + dx;
    var xpos = start + R;
    // Add the first ellipse
    ctx.lineTo(start, 0);
    ctx.ellipse(xpos, 0, R, R2, 0, Math.PI, 2 * Math.PI + offsetAngle);
    // Add additional ellipses, depending on the size of the coil
    for (var i = 0; i < n; i++) {
      xpos += 2 * R * Math.cos(offsetAngle);
      ctx.ellipse(xpos, 0, R, R2, 0, Math.PI - offsetAngle, 2 * Math.PI + offsetAngle);
    }
    xpos += 2 * R * Math.cos(offsetAngle);
    // Add last ellipse
    ctx.ellipse(xpos, 0, R, R2, 0, Math.PI - offsetAngle, 2 * Math.PI);
    ctx.lineTo(l2, 0);
    ctx.strokeStyle = this.stroke;
    this._renderStroke(ctx);
    // Add "pins" at the end of the coil
    if (this.drawPin) {
      this.fill = this.stroke;
      ctx.beginPath();
      ctx.arc(-l2, 0, 4, 0, 2 * Math.PI);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.arc(l2, 0, 4, 0, 2 * Math.PI);
      ctx.closePath();
      ctx.fill();
    }
  },
});

mechanicsObjects.Rod = fabric.util.createClass(fabric.Object, {
  type: 'rod',
  initialize(options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.originY = 'center';
    this.originX = 'left';
    this.objectCaching = false;

    const update_visuals = () => {
      this.left = this.x1;
      this.top = this.y1;
      this.angleRad = Math.atan2(this.y2 - this.y1, this.x2 - this.x1);
      this.angle = (180 / Math.PI) * this.angleRad;
      this.length = Math.sqrt(Math.pow(this.y2 - this.y1, 2) + Math.pow(this.x2 - this.x1, 2));
      this.width = this.length;
      this.dirty = true;
    };
    this.on('update_visuals', update_visuals);
    update_visuals();

    this.on('modified', function () {
      this.length = this.width * this.scaleX;
      this.x1 = this.left;
      this.y1 = this.top;
      this.angleRad = (Math.PI / 180) * (360 - this.angle);
      this.x2 = this.x1 + Math.cos(this.angleRad) * this.length;
      this.y2 = this.y1 + Math.sin(this.angleRad) * this.length;
    });
  },
  _render(ctx) {
    var rPx = this.height / 2;
    let len = this.length;
    let l2 = len / 2;

    ctx.beginPath();
    ctx.moveTo(-l2, rPx);
    ctx.arcTo(-l2 + len + rPx, 0 + rPx, -l2 + len + rPx, 0, rPx);
    ctx.arcTo(-l2 + len + rPx, 0 - rPx, -l2 + len, 0 - rPx, rPx);
    ctx.arcTo(-l2 + -rPx, -rPx, -l2 + -rPx, 0, rPx);
    ctx.arcTo(-l2 + -rPx, rPx, -l2 + 0, rPx, rPx);
    ctx.closePath();
    ctx.strokeStyle = this.strokeColor;
    this.fill = this.color;
    this._renderFill(ctx);
    this._renderStroke(ctx);

    if (this.drawPin) {
      ctx.beginPath();
      ctx.arc(-l2, 0, 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);

      ctx.beginPath();
      ctx.arc(len - l2, 0, 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);
    }
  },
});

mechanicsObjects.CollarRod = fabric.util.createClass(fabric.Object, {
  type: 'rod',
  initialize(options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.originY = 'center';
    this.objectCaching = false;

    let update_visuals = () => {
      this.left = this.x1;
      this.top = this.y1;
      this.angle = Math.atan2(this.y2 - this.y1, this.x2 - this.x1) * (180.0 / Math.PI);
    };
    update_visuals();
    this.on('update_visuals', update_visuals);
  },
  _render(ctx) {
    var d = this.height / 2;
    var w1 = this.w1;
    var w2 = this.w2;
    var h1 = this.h1;
    var h2 = this.h2;
    let len = Math.sqrt(Math.pow(this.y2 - this.y1, 2) + Math.pow(this.x2 - this.x1, 2));

    var rA = $V([0, 0]); // this is the position given by (left,top)
    var rB = rA.add($V([len, 0]));
    var p1 = rA.add($V([0, d]));
    var p2 = p1.add($V([w1 / 2, 0]));
    var p4 = rB.add($V([0, d]));
    var p3 = p4.add($V([-w2 / 2, 0]));
    var p5 = p4.add($V([d, 0]));
    var p6 = p5.add($V([0, -2 * d]));
    var p7 = rB.add($V([0, -d]));
    var p8 = p7.add($V([-w2 / 2, 0]));
    var p10 = rA.add($V([0, -d]));
    var p9 = p10.add($V([w1 / 2, 0]));
    var p11 = p10.add($V([-d, 0]));
    var p12 = p1.add($V([-d, 0]));
    var p14 = p2.add($V([0, h1 / 2 - d]));
    var p13 = p14.add($V([-w1, 0]));
    var p15 = p3.add($V([0, h2 / 2 - d]));
    var p16 = p15.add($V([w2, 0]));
    var p17 = p16.add($V([0, -h2]));
    var p18 = p17.add($V([-w2, 0]));
    var p19 = p9.add($V([0, -(h1 / 2 - d)]));
    var p20 = p19.add($V([-w1, 0]));

    ctx.beginPath();
    ctx.moveTo(p2.e(1), p2.e(2));
    ctx.lineTo(p3.e(1), p3.e(2));
    if (this.collar2) {
      ctx.lineTo(p15.e(1), p15.e(2));
      ctx.lineTo(p16.e(1), p16.e(2));
      ctx.lineTo(p17.e(1), p17.e(2));
      ctx.lineTo(p18.e(1), p18.e(2));
      ctx.lineTo(p8.e(1), p8.e(2));
    } else {
      ctx.arcTo(p5.e(1), p5.e(2), p6.e(1), p6.e(2), d);
      ctx.arcTo(p6.e(1), p6.e(2), p7.e(1), p7.e(2), d);
      ctx.lineTo(p8.e(1), p8.e(2));
    }
    ctx.lineTo(p9.e(1), p9.e(2));
    if (this.collar1) {
      ctx.lineTo(p19.e(1), p19.e(2));
      ctx.lineTo(p20.e(1), p20.e(2));
      ctx.lineTo(p13.e(1), p13.e(2));
      ctx.lineTo(p14.e(1), p14.e(2));
      ctx.lineTo(p2.e(1), p2.e(2));
    } else {
      ctx.arcTo(p11.e(1), p11.e(2), p12.e(1), p12.e(2), d);
      ctx.arcTo(p12.e(1), p12.e(2), p1.e(1), p1.e(2), d);
      ctx.lineTo(p2.e(1), p2.e(2));
    }
    ctx.closePath();
    ctx.strokeStyle = this.strokeColor;
    this.fill = this.color;
    this._renderFill(ctx);
    this._renderStroke(ctx);

    if (this.drawPin) {
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);

      ctx.beginPath();
      ctx.arc(len, 0, 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);
    }
  },
});

mechanicsObjects.LShapeRod = fabric.util.createClass(fabric.Object, {
  type: 'Lshaperod',
  initialize(options) {
    options = options || {};
    this.originY = 'center';
    this.callSuper('initialize', options);
    this.objectCaching = false;

    let updateVisuals = () => {
      this.left = this.x1;
      this.top = this.y1;

      let rC = $V([this.x1, this.y1]);
      let rA = $V([this.x2, this.y2]);
      let rB = $V([this.x3, this.y3]);
      let uCA = rA.subtract(rC);
      let L1 = uCA.modulus();
      let e1 = uCA.toUnitVector();
      let e2 = $V([-e1.e(2), e1.e(1)]);
      let uCB = rB.subtract(rC);
      let uAB = uCB.subtract(uCA);
      let L2 = uAB.modulus();
      let alpha_rad = Math.atan2(e1.e(2), e1.e(1));
      let alpha = alpha_rad * (180 / Math.PI);
      let beta = Math.atan2(uAB.dot(e2), uAB.dot(e1));

      this.length1 = L1;
      this.length2 = L2;
      this.angle = alpha;
      this.angle2 = beta;
    };
    updateVisuals();
    this.on('update_visuals', updateVisuals);
  },

  _render(ctx) {
    var L1 = this.length1;
    var L2 = this.length2;
    var d = this.height / 2;
    var beta = this.angle2;

    var e1 = $V([Math.cos(beta), Math.sin(beta)]);
    var e2 = $V([Math.sin(beta), -Math.cos(beta)]);

    let rC = $V([0, 0]); // this is the position given by (left,top)
    let rA = rC.add($V([L1, 0]));
    let rB = rA.add(e1.multiply(L2));
    let p1 = rC.add($V([0, d]));
    let a = d / Math.sin(beta) - d / Math.tan(beta);
    let p2 = rA.add(e2.multiply(-d));
    let p2t = p2.add(e1.multiply(a));
    let p3 = p2.add(e1.multiply(L2));
    let p4 = p3.add(e1.multiply(d));
    let p5 = p4.add(e2.multiply(d));
    let p6 = p5.add(e2.multiply(d));
    let p7 = p6.add(e1.multiply(-d));
    let p8 = rA.add(e2.multiply(d));
    let p8t = p8.add(e1.multiply(-a));
    let p9 = rC.add($V([0, -d]));
    let p10 = p9.add($V([-d, 0]));
    let p11 = p10.add($V([0, 2 * d]));

    // Make the 3-point rod
    ctx.beginPath();
    ctx.moveTo(p1.e(1), p1.e(2));
    ctx.arcTo(p2t.e(1), p2t.e(2), p3.e(1), p3.e(2), d);
    ctx.arcTo(p4.e(1), p4.e(2), p5.e(1), p5.e(2), d);
    ctx.arcTo(p6.e(1), p6.e(2), p7.e(1), p7.e(2), d);
    ctx.arcTo(p8t.e(1), p8t.e(2), p9.e(1), p9.e(2), d);
    ctx.arcTo(p10.e(1), p10.e(2), p11.e(1), p11.e(2), d);
    ctx.arcTo(p11.e(1), p11.e(2), p1.e(1), p1.e(2), d);
    ctx.strokeStyle = this.strokeColor;
    this.fill = this.color;
    this._renderFill(ctx);
    this._renderStroke(ctx);
    ctx.closePath();

    if (this.drawPin) {
      ctx.beginPath();
      ctx.arc(rC.e(1), rC.e(2), 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);

      ctx.beginPath();
      ctx.arc(rA.e(1), rA.e(2), 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);

      ctx.beginPath();
      ctx.arc(rB.e(1), rB.e(2), 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);
    }
  },
});

mechanicsObjects.TShapeRod = fabric.util.createClass(fabric.Object, {
  type: 'Tshaperod',
  initialize(options) {
    options = options || {};
    this.originY = 'center';
    this.callSuper('initialize', options);
    this.objectCaching = false;

    let update_visuals = () => {
      this.left = this.x1;
      this.top = this.y1;

      let rP = $V([this.x1, this.y1]);
      let rQ = $V([this.x2, this.y2]);
      let uPQ = rQ.subtract(rP);
      let L1 = uPQ.modulus();
      let n1 = uPQ.toUnitVector();
      let n2 = $V([-n1.e(2), n1.e(1)]);
      let alpha_rad = Math.atan2(n1.e(2), n1.e(1));
      let alpha = alpha_rad * (180 / Math.PI);

      // Assume first given point is R and second point is S
      let rR = $V([this.x3, this.y3]);
      let rS = $V([this.x4, this.y4]);
      let uQR = rR.subtract(rQ);
      let uQS = rS.subtract(rQ);
      let L2 = uQR.modulus();
      let L3 = uQS.modulus();
      let beta = Math.atan2(uQR.dot(n2), uQR.dot(n1));
      let gamma = Math.atan2(uQS.dot(n2), uQS.dot(n1));

      if (beta * gamma >= 0 && beta < gamma) {
        let temp = gamma;
        gamma = beta;
        beta = temp;
        temp = L2;
        L2 = L3;
        L3 = temp;
      }

      this.length1 = L1;
      this.length2 = L2;
      this.length3 = L3;
      this.angle = alpha;
      this.angle2 = beta;
      this.angle3 = gamma;
    };
    update_visuals();
    this.on('update_visuals', update_visuals);
  },
  get_distance(angle, d) {
    if (Math.abs(angle) < 1e-4) {
      return 0;
    } else if (Math.abs(angle) - Math.pi / 2 < 1e-4 || Math.abs(angle) - (3 * Math.pi) / 2 < 1e-4) {
      return d;
    } else {
      return d / Math.sin(angle) - d / Math.tan(angle);
    }
  },
  _render(ctx) {
    let L1 = this.length1;
    let L2 = this.length2;
    let L3 = this.length3;
    let d = this.height / 2;
    let beta = this.angle2;
    let gamma = this.angle3;

    let a1 = this.get_distance(beta, d);
    let a2 = this.get_distance(gamma, d);

    let rP = $V([0, 0]); // this is the position given by (left,top)
    let rQ = rP.add($V([L1, 0]));
    let p1 = rP.add($V([0, d]));
    let p4 = rP.add($V([0, -d]));
    let p5 = p4.add($V([-d, 0]));
    let p6 = p1.add($V([-d, 0]));

    let e1 = $V([Math.cos(beta), Math.sin(beta)]);
    let e2 = $V([-Math.sin(beta), Math.cos(beta)]);

    let rR = rQ.add(e1.multiply(L2));
    let p7 = rR.add(e2.multiply(-d));
    let p8 = rQ.add(e2.multiply(-d));
    let p8t = p8.add(e1.multiply(a1));
    let p9 = rQ.add(e2.multiply(d));
    let p9t = p9.add(e1.multiply(a1)); // this seems to be correct
    let p10 = rR.add(e2.multiply(d));
    let p11 = p10.add(e1.multiply(d));
    let p12 = p7.add(e1.multiply(d));

    e1 = $V([Math.cos(gamma), Math.sin(gamma)]);
    e2 = $V([-Math.sin(gamma), Math.cos(gamma)]);

    let rS = rQ.add(e1.multiply(L3));
    let p13 = rS.add(e2.multiply(-d));
    let p14 = rQ.add(e2.multiply(-d));
    let p14t = p14.add(e1.multiply(-a2)); // afraid this is not correct for all cases
    let p15 = rQ.add(e2.multiply(d));
    let p15t = p15.add(e1.multiply(-a2));
    let p16 = rS.add(e2.multiply(d));
    let p17 = p16.add(e1.multiply(d));
    let p18 = p13.add(e1.multiply(d));

    let pcorner;
    if (p7.distanceFrom(p8t) < p7.distanceFrom(p15t)) {
      pcorner = p8t;
    } else {
      pcorner = p15t;
    }

    ctx.beginPath();
    ctx.moveTo(p1.e(1), p1.e(2));
    ctx.arcTo(p9t.e(1), p9t.e(2), p10.e(1), p10.e(2), d);
    ctx.arcTo(p11.e(1), p11.e(2), p12.e(1), p12.e(2), d);
    ctx.arcTo(p12.e(1), p12.e(2), p7.e(1), p7.e(2), d);
    ctx.arcTo(pcorner.e(1), pcorner.e(2), p16.e(1), p16.e(2), d);
    ctx.arcTo(p17.e(1), p17.e(2), p18.e(1), p18.e(2), d);
    ctx.arcTo(p18.e(1), p18.e(2), p13.e(1), p13.e(2), d);
    ctx.arcTo(p14t.e(1), p14t.e(2), p4.e(1), p4.e(2), d);
    ctx.arcTo(p5.e(1), p5.e(2), p6.e(1), p6.e(2), d);
    ctx.arcTo(p6.e(1), p6.e(2), p1.e(1), p1.e(2), d);
    ctx.strokeStyle = this.strokeColor;
    this.fill = this.color;
    this._renderFill(ctx);
    this._renderStroke(ctx);
    ctx.closePath();

    if (this.drawPin) {
      ctx.beginPath();
      ctx.arc(rP.e(1), rP.e(2), 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);

      ctx.beginPath();
      ctx.arc(rQ.e(1), rQ.e(2), 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);

      ctx.beginPath();
      ctx.arc(rS.e(1), rS.e(2), 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);

      ctx.beginPath();
      ctx.arc(rR.e(1), rR.e(2), 4, 0, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);
    }
  },
});

mechanicsObjects.ClampedEnd = fabric.util.createClass(fabric.Object, {
  type: 'clamped',
  initialize(options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.originX = 'right';
    this.originY = 'center';
    this.objectCaching = true;
    this.strokeUniform = true;
    this.left = this.x1;
    this.top = this.y1;

    this.on('modified', () => {
      this.x1 = this.left;
      this.y1 = this.top;
    });
  },
  _render(ctx) {
    var h = this.height;
    var w = this.width;
    var gradient = ctx.createLinearGradient(-w, -h / 2, 0, h / 2);
    gradient.addColorStop(0, 'white');
    gradient.addColorStop(1, this.color);

    // ======== Add Clamped End =========
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h / 2);
    ctx.lineTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2, -h / 2);
    ctx.lineTo(w / 2, -h / 2);
    ctx.lineTo(w / 2, 0);
    ctx.closePath();
    ctx.strokeStyle = this.stroke;
    this.fill = gradient;
    this._renderFill(ctx);
    this._renderStroke(ctx);
  },
});

mechanicsObjects.FixedPin = fabric.util.createClass(fabric.Object, {
  type: 'fixed-pin',
  initialize(options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.originX = 'center';
    this.originY = 'center';
    this.w = this.width;
    this.h = this.height;
    this.width *= 1.6;
    this.height *= 2;
    this.objectCaching = false;

    let ang_rad = (Math.PI / 180) * this.angle + Math.PI / 2;
    this.left = this.x1 + Math.cos(ang_rad) * (this.h / 2);
    this.top = this.y1 + Math.sin(ang_rad) * (this.h / 2);

    this.on('modified', () => {
      let ang_rad = (Math.PI / 180) * this.angle + Math.PI / 2;
      this.x1 = this.left - Math.cos(ang_rad) * (this.h / 2);
      this.y1 = this.top - Math.sin(ang_rad) * (this.h / 2);
    });
  },
  _render(ctx) {
    let h = this.h;
    let w = this.w;
    ctx.translate(0, -h / 2);

    // ======== Add Pivot =========
    ctx.beginPath();
    ctx.moveTo(-w / 2, h);
    ctx.lineTo(w / 2, h);
    ctx.arcTo(w / 2, -w / 2, 0, -w / 2, w / 2);
    ctx.arcTo(-w / 2, -w / 2, -w / 2, 0, w / 2);
    ctx.closePath();
    ctx.strokeStyle = this.stroke;
    this.fill = this.color;
    this._renderFill(ctx);
    this._renderStroke(ctx);
    // ======== Add pin placement =========
    if (this.drawPin) {
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0 * Math.PI, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'rgb(0, 0, 0)';
      this._renderFill(ctx);
    }
    // ======== Add ground =========
    if (this.drawGround) {
      var h_ground = h / 3;
      var w_ground = 1.6 * w;
      var gradient = ctx.createLinearGradient(-w_ground / 2, 0, w_ground / 2, 0);
      gradient.addColorStop(0, '#CACFD2');
      gradient.addColorStop(1, '#626567');
      ctx.beginPath();
      this.fill = gradient;
      ctx.strokeStyle = 'black';
      ctx.rect(-w_ground / 2, h, w_ground, h_ground);
      this._renderFill(ctx);
      this._renderStroke(ctx);
      ctx.closePath();
    }
  },
});

mechanicsObjects.Roller = fabric.util.createClass(fabric.Object, {
  type: 'roller',
  initialize(options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.originX = 'center';
    this.originY = 'center';
    this.w = this.width;
    this.h = this.height;
    this.width *= 1.6;
    this.height *= 2;
    this.objectCaching = false;

    let ang_rad = (Math.PI / 180) * this.angle + Math.PI / 2;
    this.left = this.x1 + Math.cos(ang_rad) * (this.h / 2);
    this.top = this.y1 + Math.sin(ang_rad) * (this.h / 2);

    this.on('modified', () => {
      let ang_rad = (Math.PI / 180) * this.angle + Math.PI / 2;
      this.x1 = this.left - Math.cos(ang_rad) * (this.h / 2);
      this.y1 = this.top - Math.sin(ang_rad) * (this.h / 2);
    });
  },
  _render(ctx) {
    let h = this.h;
    let w = this.w;
    ctx.translate(0, -h / 2);

    // ======== Add Pivot =========
    ctx.beginPath();
    ctx.moveTo(-w / 2, h - (2 * w) / 5);
    ctx.lineTo(w / 2, h - (2 * w) / 5);
    ctx.arcTo(w / 2, -w / 2, 0, -w / 2, w / 2);
    ctx.arcTo(-w / 2, -w / 2, -w / 2, 0, w / 2);
    ctx.closePath();
    ctx.strokeStyle = this.stroke;
    this.fill = this.color;
    this._renderFill(ctx);
    this._renderStroke(ctx);
    // ======== Add pin placement =========
    if (this.drawPin) {
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0 * Math.PI, 2 * Math.PI);
      ctx.closePath();
      this.fill = 'black';
      this._renderFill(ctx);
    }
    // ======== Add rollers =========
    ctx.beginPath();
    ctx.strokeStyle = 'black';
    this.fill = 'gray';
    ctx.lineWidth = 1.5;
    ctx.arc(-w / 4, h - w / 5, w / 5, 0 * Math.PI, 2 * Math.PI);
    ctx.closePath();
    this._renderFill(ctx);
    this._renderStroke(ctx);
    ctx.beginPath();
    ctx.arc(w / 4, h - w / 5, w / 5, 0 * Math.PI, 2 * Math.PI);
    ctx.closePath();
    this._renderFill(ctx);
    this._renderStroke(ctx);
    // ======== Add ground =========
    if (this.drawGround) {
      var h_ground = h / 3;
      var w_ground = 1.6 * w;
      var gradient = ctx.createLinearGradient(-w_ground / 2, 0, w_ground / 2, 0);
      gradient.addColorStop(0, '#CACFD2');
      gradient.addColorStop(1, '#626567');
      ctx.beginPath();
      ctx.rect(-w_ground / 2, h, w_ground, h_ground);
      ctx.lineWidth = 2;
      ctx.fillStyle = gradient;
      ctx.strokeStyle = 'black';
      this._renderFill(ctx);
      this._renderStroke(ctx);
      ctx.closePath();
    }
  },
});

mechanicsObjects.Arrow = fabric.util.createClass(fabric.Object, {
  type: 'arrow',
  initialize(options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.set('arrowheadOffsetRatio', options.arrowheadOffsetRatio || 1);
    this.set('arrowheadWidthRatio', options.arrowheadWidthRatio || 1);
    this.set('strokeWidth', options.strokeWidth || 3);
    this.set('stroke', options.stroke || 'black');
    this.set('fill', options.stroke || 'black');
    this.set('height', options.height || 3 * this.strokeWidth);
    this.setControlVisible('bl', false);
    this.setControlVisible('tl', false);
    this.setControlVisible('br', false);
    this.setControlVisible('tr', false);
    this.setControlVisible('mt', false);
    this.setControlVisible('mb', false);
    this.setControlVisible('ml', false);
    this.setControlVisible('mr', false);
    this.setControlVisible('mtr', false);
    if ('trueHandles' in options) {
      for (const handle of options.trueHandles) {
        this.setControlVisible(handle, true);
      }
    }
  },
  toObject() {
    return fabric.util.object.extend(this.callSuper('toObject'), {
      // Should write here the properties that were added in initialize
      // and that should appear on the server
      name: this.get('name'),
    });
  },
  _render(ctx) {
    var lengthPx = this.width;
    var w = this.strokeWidth;
    var l = 7 * w * this.arrowheadOffsetRatio;
    var h = 0.5 * l * this.arrowheadWidthRatio;
    var c = 0.6 * l;
    let begin_line, end_line;

    if (this.drawEndArrow) {
      ctx.beginPath();
      end_line = lengthPx / 2 - c;
      ctx.lineWidth = 0.1 * this.strokeWidth;
      ctx.moveTo(end_line, 0);
      ctx.lineTo(lengthPx / 2 - l, h / 2);
      ctx.lineTo(lengthPx / 2, 0);
      ctx.lineTo(lengthPx / 2 - l, -h / 2);
      ctx.lineTo(end_line, 0);
      this._renderFill(ctx);
      this._renderStroke(ctx);
      ctx.closePath();
    } else {
      end_line = lengthPx / 2;
    }

    if (this.drawStartArrow) {
      ctx.beginPath();
      begin_line = -(lengthPx / 2 - c);
      ctx.lineWidth = 0.1 * this.strokeWidth;
      ctx.moveTo(begin_line, 0);
      ctx.lineTo(-(lengthPx / 2 - l), h / 2);
      ctx.lineTo(-lengthPx / 2, 0);
      ctx.lineTo(-(lengthPx / 2 - l), -h / 2);
      ctx.lineTo(begin_line, 0);
      this._renderFill(ctx);
      this._renderStroke(ctx);
      ctx.closePath();
    } else {
      begin_line = -lengthPx / 2;
    }

    ctx.beginPath();
    ctx.lineWidth = this.strokeWidth;
    ctx.moveTo(begin_line, 0);
    ctx.lineTo(end_line, 0);
    this._renderStroke(ctx);
  },
});

mechanicsObjects.DoubleArrow = fabric.util.createClass(fabric.Object, {
  type: 'arrow',
  initialize(options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.set('arrowheadOffsetRatio', options.arrowheadOffsetRatio || 1);
    this.set('arrowheadWidthRatio', options.arrowheadWidthRatio || 1);
    this.set('strokeWidth', options.strokeWidth || 3);
    this.set('stroke', options.stroke || 'black');
    this.set('fill', options.stroke || 'black');
    this.set('height', options.height || 3 * this.strokeWidth);
    this.setControlVisible('bl', false);
    this.setControlVisible('tl', false);
    this.setControlVisible('br', false);
    this.setControlVisible('tr', false);
    this.setControlVisible('mt', false);
    this.setControlVisible('mb', false);
    this.setControlVisible('ml', false);
    this.setControlVisible('mr', false);
    this.setControlVisible('mtr', false);
    if ('trueHandles' in options) {
      for (const handle of options.trueHandles) {
        this.setControlVisible(handle, true);
      }
    }
  },
  toObject() {
    return fabric.util.object.extend(this.callSuper('toObject'), {
      // should write here the properties that were added in initialize
      // and that should appear on the server
      name: this.get('name'),
    });
  },
  _render(ctx) {
    var lengthPx = this.width;
    var w = this.strokeWidth;
    var l = 6 * w * this.arrowheadOffsetRatio;
    var h = l * this.arrowheadWidthRatio;
    var c = 0.4 * l;
    var e = 0.8 * l;

    ctx.beginPath();
    var end_line = lengthPx / 2 - c;
    ctx.lineWidth = 0.1 * this.strokeWidth;
    ctx.moveTo(end_line, 0);
    ctx.lineTo(lengthPx / 2 - l, h / 2);
    ctx.lineTo(lengthPx / 2, 0);
    ctx.lineTo(lengthPx / 2 - l, -h / 2);
    ctx.lineTo(end_line, 0);
    this._renderFill(ctx);
    this._renderStroke(ctx);
    ctx.closePath();

    ctx.beginPath();
    ctx.lineWidth = 0.1 * this.strokeWidth;
    ctx.moveTo(lengthPx / 2 - e, 0);
    ctx.lineTo(lengthPx / 2 - e - l, h / 2);
    ctx.lineTo(lengthPx / 2 - e - c, 0);
    ctx.lineTo(lengthPx / 2 - e - l, -h / 2);
    ctx.lineTo(lengthPx / 2 - e, 0);
    this._renderFill(ctx);
    this._renderStroke(ctx);
    ctx.closePath();

    ctx.beginPath();
    ctx.lineWidth = this.strokeWidth;
    ctx.moveTo(-lengthPx / 2, 0);
    ctx.lineTo(end_line, 0);
    this._renderStroke(ctx);
  },
});

mechanicsObjects.LatexText = fabric.util.createClass(fabric.Object, {
  type: 'latex-text',
  parse(str) {
    // Because the MathJax renderer expects text to be already formatted in LaTeX,
    // manually parse inputs for $$ and escape non-latex with `\text{}`

    let built_str = '';
    let spl = str.split('$');

    for (let i = 0; i < spl.length; i++) {
      if (i % 2 === 0) {
        // Text
        if (spl[i].length > 0) {
          // Ignore empty strings
          built_str += '\\text{' + spl[i] + '} ';
        }
      } else {
        // LaTeX
        built_str += spl[i] + ' ';
      }
    }
    return built_str;
  },
  async gen_text(str, options) {
    await MathJax.startup.promise;
    let svgResult = await MathJax.tex2svgPromise(str, { display: false });
    const svg = svgResult.children[0];

    // SVG's generated by MathJax reference a list of sharedbase elements,
    // so replace each reference with the actual element value.
    $(svg)
      .find('use')
      .each((_, use) => {
        // Find and create a new copy to link to
        let refLink = use.getAttribute('xlink:href');
        let refElement = $(svg).find(refLink)[0];
        let replacement = $(refElement.outerHTML)[0];

        // Copy over any attributes on the link
        for (let i = 0; i < use.attributes.length; i++) {
          let attrib = use.attributes.item(i);
          if (attrib.name.toLowerCase() !== 'xlink:href') {
            replacement.setAttribute(attrib.name, attrib.value);
          }
        }

        // Replace the reference with the actual value
        use.parentNode.replaceChild(replacement, use);
      });

    const exScale = 1.0 - MathJax.config.svg.font.params.x_height;

    // Convert width/height from `ex` units to `px` units. This ensures that
    // the image renders consistently regardless of the browser's configured
    // font size.
    const parsedWidth = parseFloat(svg.getAttribute('width'));
    const parsedHeight = parseFloat(svg.getAttribute('height'));
    const width = parsedWidth * exScale * options.fontSize;
    const height = parsedHeight * exScale * options.fontSize;
    svg.setAttribute('width', width + 'px');
    svg.setAttribute('height', height + 'px');

    let svgSource = svg.outerHTML;

    // Fix for Safari, https://stackoverflow.com/questions/30273775/namespace-prefix-ns1-for-href-on-tagelement-is-not-defined-setattributens
    svgSource = svgSource.replace(/NS\d+:href/gi, 'xlink:href');

    let base64svg = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgSource)));

    fabric.Image.fromURL(
      base64svg,
      (img) => {
        this.width = Math.ceil(width);
        this.height = Math.ceil(height);
        img.width = this.width;
        img.height = this.height;

        this.setCoords(false, false);
        this.image = img;
        this.dirty = true;

        // Force re-rendering the canvas otherwise the text will not show up
        if ('canvas' in this) {
          this['canvas'].renderAll();
        }
      },
      options,
    );
  },
  initialize(text, options) {
    options = options || {};
    if (!options.selectable) {
      options.evented = false;
    }

    this.callSuper('initialize', options);
    this.image = null;
    this.label = text;

    if (text) {
      this.gen_text(this.label, options);
    }

    if (options.selectable) {
      this.on('dblclick', function () {
        let new_text = prompt('Editing text contents, surround math with $ delimiters.', this.text);
        if (new_text !== null) {
          this.label = new_text;
          this.gen_text(this.parse(new_text), options);
        }
      });
    }
  },
  _render(ctx) {
    if (this.image != null) {
      this.image._render(ctx);
    }
  },
});

mechanicsObjects.DistTrianLoad = fabric.util.createClass(fabric.Object, {
  type: 'dist-force',
  initialize(options) {
    this.callSuper('initialize', options);
    this.spacing = options.spacing;
    this.anchor_is_tail = options.anchor_is_tail === 'true';
    this.w1 = options.w1;
    this.w2 = options.w2;
    this.width = options.range;
    this.range = options.range;
    this.height = Math.max(this.w1, this.w2);
    this.height_ave = (this.w1, this.w2) / 2;
    this.strokeWidth = options.strokeWidth || 3;
    this.stroke = options.stroke;
    this.left = options.left;
    this.top = options.top;
    this.originX = 'center';
    this.objectCaching = false;
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

    this.setControlVisible('bl', false);
    this.setControlVisible('tl', false);
    this.setControlVisible('br', false);
    this.setControlVisible('tr', false);
    this.setControlVisible('mt', false);
    this.setControlVisible('mb', false);
    this.setControlVisible('ml', true);
    this.setControlVisible('mr', true);
    this.setControlVisible('mtr', true);

    this.on('scaling', function () {
      this.flipped = this.flipX;
      this.range = this.width * this.scaleX;
    });
  },
  drawArrow(ctx, x1, y1, x2, y2) {
    // Copied from the Arrow class, so much for DRY
    let arrowheadOffsetRatio = this.arrowheadOffsetRatio;
    let arrowheadWidthRatio = this.arrowheadWidthRatio;
    let strokeWidth = this.strokeWidth;

    // Forward vector
    let fwdx = x2 - x1;
    let fwdy = y2 - y1;
    let fwdlen = Math.sqrt(Math.pow(fwdx, 2) + Math.pow(fwdy, 2));
    fwdx /= fwdlen; // normalize
    fwdy /= fwdlen;

    // Forward vector rotated 90 deg
    let rightx = -fwdy;
    let righty = fwdx;

    var lenPx = arrowheadOffsetRatio * strokeWidth;
    var dyPx = arrowheadWidthRatio * 0.5 * strokeWidth;

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.moveTo(x2 - (fwdx * lenPx) / 2, y2 - (fwdy * lenPx) / 2);
    ctx.lineTo(x2 - fwdx * lenPx + rightx * dyPx, y2 - fwdy * lenPx + righty * dyPx);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x2 - fwdx * lenPx - rightx * dyPx, y2 - fwdy * lenPx - righty * dyPx);
    ctx.closePath();

    ctx.lineWidth = this.strokeWidth;
    ctx.strokeStyle = this.stroke;
    this.fill = this.stroke;
    ctx.stroke();
    ctx.fill();
  },
  drawLine(ctx, x1, y1, x2, y2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.closePath();

    ctx.lineWidth = this.strokeWidth;
    ctx.stroke();
    ctx.fill();
  },
  _render(ctx) {
    var nSpaces = Math.ceil(this.getScaledWidth() / this.spacing);
    var dx = this.getScaledWidth() / nSpaces;

    // Undo Fabric's scale transformation.
    ctx.scale(1.0 / this.scaleX, 1.0 / this.scaleY);

    // Centered coordinates
    let cx = this.getScaledWidth() / 2;
    let cy = this.getScaledHeight() / 2;

    // Draw all the force arrows
    for (let i = 0; i <= nSpaces; i++) {
      let height = this.w1 + (i / nSpaces) * (this.w2 - this.w1);
      if (this.anchor_is_tail) {
        if (Math.abs(height) >= 2) {
          this.drawArrow(ctx, i * dx - cx, -cy, i * dx - cx, height - cy);
        }
      } else {
        if (Math.abs(height) >= 2) {
          this.drawArrow(ctx, i * dx - cx, cy - height, i * dx - cx, cy);
        }
      }
    }
    // Draw the head/base line
    if (this.anchor_is_tail) {
      this.drawLine(ctx, -cx, -cy, cx, -cy);
    } else {
      let xoff = this.strokeWidth / 2;
      this.drawLine(ctx, -cx - xoff, cy - this.w1, cx + xoff, cy - this.w2);
    }

    this.label1obj.left = this.offsetx1 - cx;
    this.label1obj.top = this.w1 + this.offsety1 - cy;
    this.label1obj.render(ctx);

    this.label2obj.left = this.offsetx2 + cx;
    this.label2obj.top = this.w2 + this.offsety2 - cy;
    this.label2obj.render(ctx);
  },
});

mechanicsObjects.pulley = fabric.util.createClass(fabric.Object, {
  type: 'pulley',
  initialize(options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.originX = 'center';
    this.originY = 'center';
    this.objectCaching = false;
    this.color = this.fill;

    const update_visuals = () => {
      this.left = this.x1;
      this.top = this.y1;

      const r = this.radius;
      let uO = $V([this.x1, this.y1]);
      let uA = $V([this.x2, this.y2]);
      let uB = $V([this.x3, this.y3]);
      let longer = this.longer;

      let uOA = uA.subtract(uO);
      let dOA = uA.norm();
      let n1 = uOA.normalize();
      let n2 = $V([n1.e(2), -n1.e(1)]);
      let theta = Math.asin(r / dOA);
      let p1 = n1.multiply(r * Math.sin(theta)).add(n2.multiply(r * Math.cos(theta)));
      let p2 = n1.multiply(r * Math.sin(theta)).subtract(n2.multiply(r * Math.cos(theta)));

      let uOB = uB.subtract(uO);
      let dOB = uOB.norm();
      let n3 = uOB.normalize();
      let n4 = $V([n3.e(2), -n3.e(1)]);
      let theta2 = Math.asin(r / dOB);
      let p3 = n3.multiply(r * Math.sin(theta2)).add(n4.multiply(r * Math.cos(theta2)));
      let p4 = n3.multiply(r * Math.sin(theta2)).subtract(n4.multiply(r * Math.cos(theta2)));

      let p;
      let u4;
      let u5;
      if (longer) {
        if (n2.dot(uOB) > 0) {
          p = p2;
        } else {
          p = p1;
        }

        u4 = uO.add(p);
        if (p3.subtract(uOA).norm() > p.subtract(uOA).norm()) {
          u5 = uO.add(p3);
        } else {
          u5 = uO.add(p4);
        }
      } else {
        if (n2.dot(uOB) < 0) {
          p = p2;
        } else {
          p = p1;
        }

        u4 = uO.add(p);
        if (p3.subtract(uOA).norm() < p.subtract(uOA).norm()) {
          u5 = uO.add(p3);
        } else {
          u5 = uO.add(p4);
        }
      }

      this.x4 = u4.e(1);
      this.y4 = u4.e(2);
      this.x5 = u5.e(1);
      this.y5 = u5.e(2);
    };
    this.on('update_visuals', update_visuals);
    update_visuals();
  },
  _render(ctx) {
    // Draw pulley circle
    ctx.beginPath();
    ctx.fillStyle = this.color;
    ctx.arc(0, 0, this.radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Draw middle nub
    ctx.beginPath();
    ctx.fillStyle = 'black';
    ctx.arc(0, 0, 4, 0, 2 * Math.PI);
    ctx.fill();

    // Undo canvas translations so we can draw in world coordinates.
    ctx.translate(-this.x1, -this.y1);

    // Draw first line
    ctx.beginPath();
    ctx.moveTo(this.x2, this.y2);
    ctx.lineTo(this.x4, this.y4);
    ctx.stroke();

    // Draw second line
    ctx.beginPath();
    ctx.moveTo(this.x3, this.y3);
    ctx.lineTo(this.x5, this.y5);
    ctx.stroke();
  },
});

mechanicsObjects.arcVector = fabric.util.createClass(fabric.Object, {
  type: 'arc',
  initialize(options) {
    options = options || {};
    this.callSuper('initialize', options);
    this.set('arrowheadOffsetRatio', options.arrowheadOffsetRatio || 1);
    this.set('arrowheadWidthRatio', options.arrowheadWidthRatio || 1);
    this.set('strokeWidth', options.strokeWidth || 3);
    this.set('stroke', options.stroke || 'black');
    this.set('fill', options.stroke || 'black');
    this.set('height', this.radius * 2);
    this.set('width', this.radius * 2);
    this.set('originX', 'center');
    this.set('originY', 'center');

    this.setControlVisible('bl', false);
    this.setControlVisible('tl', false);
    this.setControlVisible('br', false);
    this.setControlVisible('tr', false);
    this.setControlVisible('mt', false);
    this.setControlVisible('mb', false);
    this.setControlVisible('ml', false);
    this.setControlVisible('mr', false);
    this.setControlVisible('mtr', true);
    if ('trueHandles' in options) {
      for (const handle of options.trueHandles) {
        this.setControlVisible(handle, true);
      }
    }
  },
  toObject() {
    return fabric.util.object.extend(this.callSuper('toObject'), {
      name: this.get('name'),
      // Should write here the properties that were added in initialize
      // and that should appear on the server
    });
  },
  get_point_arc(alpha, er, et, r) {
    var uvec = er.multiply(-r * (1 - Math.cos(alpha)));
    uvec = uvec.add(et.multiply(r * Math.sin(alpha)));
    return uvec;
  },
  make_arrow_head(ctx, theta, alpha, beta, r, l, c, h) {
    let er = $V([Math.cos(theta), Math.sin(theta)]);
    let et = $V([-Math.sin(theta), Math.cos(theta)]);
    let uE = er.multiply(r);
    let uEA = this.get_point_arc(alpha, er, et, r);
    let n1 = uEA.toUnitVector();
    let n2 = $V([n1.e(2), -n1.e(1)]);
    let uED = this.get_point_arc(beta, er, et, r);
    let uD = uE.add(uED);
    let uB = uE.add(n1.multiply(l));
    let uC = uE.add(n1.multiply(c));
    let uG = uB.add(n2.multiply(h / 2));
    let uF = uB.add(n2.multiply(-h / 2));
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
    return uD;
  },
  _render(ctx) {
    var w = this.strokeWidth;
    var l = 7 * w * this.arrowheadOffsetRatio;
    var h = 0.5 * l * this.arrowheadWidthRatio;
    var c = 0.6 * l;
    var e = 0.9 * l;
    var r = this.radius;
    var thetai = (this.startAngle * Math.PI) / 180;
    var thetaf = (this.endAngle * Math.PI) / 180;
    let start_line_angle;
    let end_line_angle;

    if (this.drawStartArrow) {
      let alpha = Math.acos(1 - (e * e) / (2 * r * r));
      let beta = Math.acos(1 - (c * c) / (2 * r * r));
      let start_line = this.make_arrow_head(ctx, thetai, alpha, beta, r, l, c, h);
      start_line_angle = Math.atan2(start_line.e(2), start_line.e(1));
    } else {
      start_line_angle = thetai;
    }

    if (this.drawEndArrow) {
      let alpha = -Math.acos(1 - (e * e) / (2 * r * r));
      let beta = -Math.acos(1 - (c * c) / (2 * r * r));
      let end_line = this.make_arrow_head(ctx, thetaf, alpha, beta, r, l, c, h);
      end_line_angle = Math.atan2(end_line.e(2), end_line.e(1));
    } else {
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
    ctx.arc(0, 0, this.radius, start_line_angle, end_line_angle);
    this._renderStroke(ctx);
    ctx.closePath();
  },
});

mechanicsObjects.makeCoordinates = function (options) {
  const selectable = options.selectable ? true : false;

  let old_angle = options.angle;
  if (selectable) {
    options.angle = 0;
  }

  var group = new fabric.Group([], {
    left: 0,
    top: 0,
    name: 'coordinates',
    selectable,
    evented: selectable,
  });

  let obj1 = new mechanicsObjects.Arrow(options);
  group.addWithUpdate(obj1);

  var options2 = _.defaults(
    {
      angle: options.angle - 90,
    },
    options,
  );

  let obj2 = new mechanicsObjects.Arrow(options2);
  group.addWithUpdate(obj2);

  var options3 = _.defaults(
    {
      radius: 4,
      originX: 'center',
      originY: 'center',
      fill: options.stroke,
    },
    options,
  );

  let obj3 = new fabric.Circle(options3);
  group.addWithUpdate(obj3);

  if (selectable) {
    options.angle = old_angle;
    group.angle = old_angle;
  }

  return group;
};

mechanicsObjects.makeControlHandle = function (left, top, handleRadius, strokeWidth) {
  var c = new fabric.Circle({
    left,
    top,
    strokeWidth,
    radius: handleRadius,
    fill: 'white',
    stroke: '#666',
    originX: 'center',
    originY: 'center',
    excludeFromExport: true,
    name: 'controlHandle',
  });
  c.hasControls = false;
  return c;
};

mechanicsObjects.makeControlStraightLine = function (x1, y1, x2, y2, options) {
  var line = new fabric.Line([x1, y1, x2, y2], {
    stroke: options.stroke,
    strokeWidth: options.strokeWidth,
    selectable: false,
    evented: false,
    name: 'controlledLine',
    originX: 'center',
    originY: 'center',
  });
  return line;
};

mechanicsObjects.makeControlCurvedLine = function (x1, y1, x2, y2, x3, y3, options) {
  var line = new fabric.Path('M 0 0 Q 1, 1, 3, 0', {
    fill: '',
    stroke: options.stroke,
    strokeWidth: options.strokeWidth,
    selectable: false,
    name: 'controlCurvedLine',
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

// Handlers for adding elements to the canvas

mechanicsObjects.byType = {};
mechanicsObjects.addCanvasBackground = function (canvas, w, h, gridsize) {
  canvas.backgroundColor = '#FFFFF0';
  var options = {
    stroke: '#D3D3D3',
    strokeWidth: 1,
    selectable: false,
    evented: false,
  };

  for (let i = 1; i < w / gridsize; i++) {
    canvas.add(new fabric.Line([gridsize * i, 0, gridsize * i, h], options));
  }
  for (let i = 1; i < h / gridsize; i++) {
    canvas.add(new fabric.Line([0, gridsize * i, w, gridsize * i], options));
  }
};

mechanicsObjects.byType['pl-text'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    const selectable = options.selectable ? true : false;
    let textObj;

    if (options.latex) {
      textObj = new mechanicsObjects.LatexText(options.label, {
        left: options.left + options.offsetx,
        top: options.top + options.offsety,
        fontSize: options.fontSize,
        selectable,
        evented: selectable,
        textAlign: 'left',
        angle: options.angle || 0,
        scaleX: options.scaleX || 1,
        scaleY: options.scaleY || 1,
      });
    } else {
      textObj = new fabric.Text(options.label, {
        left: options.left + options.offsetx,
        top: options.top + options.offsety,
        fontSize: options.fontSize,
        selectable,
        evented: selectable,
        textAlign: 'left',
        angle: options.angle || 0,
        scaleX: options.scaleX || 1,
        scaleY: options.scaleY || 1,
      });
    }

    if (options.selectable) {
      submittedAnswer.registerAnswerObject(options, textObj);
    }

    canvas.add(textObj);
    return textObj;
  }

  static get_button_tooltip() {
    return 'Add written text';
  }
};

mechanicsObjects.byType['pl-rod'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new mechanicsObjects.Rod(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    // Add both labels
    for (let i = 0; i < 2; i++) {
      let ind = (i + 1).toString();
      let textObj = new mechanicsObjects.LatexText(obj['label' + ind], {
        left: obj['x' + ind] + obj['offsetx' + ind],
        top: obj['y' + ind] + obj['offsety' + ind],
        fontSize: 20,
        textAlign: 'left',
        selectable: false,
      });
      obj.on('update_visuals', () => {
        textObj.left = obj['x' + ind] + obj['offsetx' + ind];
        textObj.top = obj['y' + ind] + obj['offsety' + ind];
      });
      canvas.add(textObj);
    }

    if (options.selectable) {
      obj.selectable = false;
      obj.evented = false;

      var c1 = mechanicsObjects.makeControlHandle(options.x1, options.y1, 5, 2);
      var c2 = mechanicsObjects.makeControlHandle(options.x2, options.y2, 5, 2);
      canvas.add(c1, c2);

      var subObj = mechanicsObjects.cloneMechanicsObject('pl-rod', options);
      // C1
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c1,
        submittedAnswer,
        function () {
          // Modified
          subObj.x1 = c1.left;
          subObj.y1 = c1.top;
        },
        function () {
          // Removed
          canvas.remove(c2);
          canvas.remove(obj);
        },
      );
      c1.on('moving', function () {
        obj.x1 = c1.left;
        obj.y1 = c1.top;
        obj.fire('update_visuals');
      });

      // C2
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c2,
        submittedAnswer,
        function () {
          // Modified
          subObj.x2 = c2.left;
          subObj.y2 = c2.top;
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(obj);
        },
      );
      c2.on('moving', function () {
        obj.x2 = c2.left;
        obj.y2 = c2.top;
        obj.fire('update_visuals');
      });
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add rod';
  }
};

mechanicsObjects.byType['pl-collar-rod'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new mechanicsObjects.CollarRod(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    // Add both labels
    for (let i = 0; i < 2; i++) {
      let ind = (i + 1).toString();
      let textObj = new mechanicsObjects.LatexText(obj['label' + ind], {
        left: obj['x' + ind] + obj['offsetx' + ind],
        top: obj['y' + ind] + obj['offsety' + ind],
        fontSize: 20,
        textAlign: 'left',
        selectable: false,
      });
      obj.on('update_visuals', () => {
        textObj.left = obj['x' + ind] + obj['offsetx' + ind];
        textObj.top = obj['y' + ind] + obj['offsety' + ind];
      });
      canvas.add(textObj);
    }

    if (options.selectable) {
      obj.selectable = false;
      obj.evented = false;

      var c1 = mechanicsObjects.makeControlHandle(options.x1, options.y1, 5, 2);
      var c2 = mechanicsObjects.makeControlHandle(options.x2, options.y2, 5, 2);
      canvas.add(c1, c2);

      var subObj = mechanicsObjects.cloneMechanicsObject('pl-collar-rod', options);
      // C1
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c1,
        submittedAnswer,
        function () {
          // Modified
          subObj.x1 = c1.left;
          subObj.y1 = c1.top;
        },
        function () {
          // Removed
          canvas.remove(c2);
          canvas.remove(obj);
        },
      );
      c1.on('moving', function () {
        obj.x1 = c1.left;
        obj.y1 = c1.top;
        obj.fire('update_visuals');
      });

      // C2
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c2,
        submittedAnswer,
        function () {
          // Modified
          subObj.x2 = c2.left;
          subObj.y2 = c2.top;
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(obj);
        },
      );
      c2.on('moving', function () {
        obj.x2 = c2.left;
        obj.y2 = c2.top;
        obj.fire('update_visuals');
      });
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add collared rod';
  }
};

mechanicsObjects.byType['pl-3pointrod'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new mechanicsObjects.LShapeRod(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    // Add all 3 labels
    for (let i = 0; i < 3; i++) {
      let ind = (i + 1).toString();
      let textObj = new mechanicsObjects.LatexText(obj['label' + ind], {
        left: obj['x' + ind] + obj['offsetx' + ind],
        top: obj['y' + ind] + obj['offsety' + ind],
        fontSize: 20,
        textAlign: 'left',
        selectable: false,
      });
      obj.on('update_visuals', () => {
        textObj.left = obj['x' + ind] + obj['offsetx' + ind];
        textObj.top = obj['y' + ind] + obj['offsety' + ind];
      });
      canvas.add(textObj);
    }

    if (options.selectable) {
      obj.selectable = false;
      obj.evented = false;

      var c1 = mechanicsObjects.makeControlHandle(options.x1, options.y1, 5, 2);
      var c2 = mechanicsObjects.makeControlHandle(options.x2, options.y2, 5, 2);
      var c3 = mechanicsObjects.makeControlHandle(options.x3, options.y3, 5, 2);
      canvas.add(c1, c2, c3);

      var subObj = mechanicsObjects.cloneMechanicsObject('pl-3pointrod', options);
      // C1
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c1,
        submittedAnswer,
        function () {
          // Modified
          subObj.x1 = c1.left;
          subObj.y1 = c1.top;
        },
        function () {
          // Removed
          canvas.remove(c2);
          canvas.remove(c3);
          canvas.remove(obj);
        },
      );
      c1.on('moving', function () {
        obj.x1 = c1.left;
        obj.y1 = c1.top;
        obj.fire('update_visuals');
      });

      // C2
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c2,
        submittedAnswer,
        function () {
          // Modified
          subObj.x2 = c2.left;
          subObj.y2 = c2.top;
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(c3);
          canvas.remove(obj);
        },
      );
      c2.on('moving', function () {
        obj.x2 = c2.left;
        obj.y2 = c2.top;
        obj.fire('update_visuals');
      });

      // C3
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c3,
        submittedAnswer,
        function () {
          // Modified
          subObj.x3 = c3.left;
          subObj.y3 = c3.top;
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(c2);
          canvas.remove(obj);
        },
      );
      c3.on('moving', function () {
        obj.x3 = c3.left;
        obj.y3 = c3.top;
        obj.fire('update_visuals');
      });
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add three-point rod';
  }
};

mechanicsObjects.byType['pl-4pointrod'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new mechanicsObjects.TShapeRod(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    // Add all 4 labels
    for (let i = 0; i < 4; i++) {
      let ind = (i + 1).toString();
      let textObj = new mechanicsObjects.LatexText(obj['label' + ind], {
        left: obj['x' + ind] + obj['offsetx' + ind],
        top: obj['y' + ind] + obj['offsety' + ind],
        fontSize: 20,
        textAlign: 'left',
        selectable: false,
      });
      obj.on('update_visuals', () => {
        textObj.left = obj['x' + ind] + obj['offsetx' + ind];
        textObj.top = obj['y' + ind] + obj['offsety' + ind];
      });
      canvas.add(textObj);
    }

    if (options.selectable) {
      obj.selectable = false;
      obj.evented = false;

      var c1 = mechanicsObjects.makeControlHandle(options.x1, options.y1, 5, 2);
      var c2 = mechanicsObjects.makeControlHandle(options.x2, options.y2, 5, 2);
      var c3 = mechanicsObjects.makeControlHandle(options.x3, options.y3, 5, 2);
      var c4 = mechanicsObjects.makeControlHandle(options.x4, options.y4, 5, 2);
      canvas.add(c1, c2, c3, c4);

      var subObj = mechanicsObjects.cloneMechanicsObject('pl-4pointrod', options);
      // C1
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c1,
        submittedAnswer,
        function () {
          // Modified
          subObj.x1 = c1.left;
          subObj.y1 = c1.top;
        },
        function () {
          // Removed
          canvas.remove(c2);
          canvas.remove(c3);
          canvas.remove(c4);
          canvas.remove(obj);
        },
      );
      c1.on('moving', function () {
        obj.x1 = c1.left;
        obj.y1 = c1.top;
        obj.fire('update_visuals');
      });

      // C2
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c2,
        submittedAnswer,
        function () {
          // Modified
          subObj.x2 = c2.left;
          subObj.y2 = c2.top;
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(c3);
          canvas.remove(c4);
          canvas.remove(obj);
        },
      );
      c2.on('moving', function () {
        obj.x2 = c2.left;
        obj.y2 = c2.top;
        obj.fire('update_visuals');
      });

      // C3
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c3,
        submittedAnswer,
        function () {
          // Modified
          subObj.x3 = c3.left;
          subObj.y3 = c3.top;
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(c2);
          canvas.remove(c4);
          canvas.remove(obj);
        },
      );
      c3.on('moving', function () {
        obj.x3 = c3.left;
        obj.y3 = c3.top;
        obj.fire('update_visuals');
      });

      // C4
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c4,
        submittedAnswer,
        function () {
          // Modified
          subObj.x4 = c4.left;
          subObj.y4 = c4.top;
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(c2);
          canvas.remove(c3);
          canvas.remove(obj);
        },
      );
      c4.on('moving', function () {
        obj.x4 = c4.left;
        obj.y4 = c4.top;
        obj.fire('update_visuals');
      });
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add four-point rod';
  }
};

mechanicsObjects.byType['pl-clamped'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new mechanicsObjects.ClampedEnd(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    var textObj = new mechanicsObjects.LatexText(obj.label, {
      left: obj.left + obj.offsetx,
      top: obj.top + obj.offsety,
      fontSize: 20,
      textAlign: 'left',
      selectable: false,
    });
    canvas.add(textObj);

    if (options.selectable) {
      submittedAnswer.registerAnswerObject(options, obj);
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add clamped base';
  }
};

mechanicsObjects.byType['pl-fixed-pin'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new mechanicsObjects.FixedPin(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    var textObj = new mechanicsObjects.LatexText(obj.label, {
      left: obj.x1 + obj.offsetx,
      top: obj.y1 + obj.offsety,
      fontSize: 20,
      textAlign: 'left',
      selectable: false,
    });
    obj.on('moving', () => {
      textObj.left = obj['x1'] + obj['offsetx'];
      textObj.top = obj['y1'] + obj['offsety'];
    });
    obj.on('rotating', () => {
      textObj.left = obj['x1'] + obj['offsetx'];
      textObj.top = obj['y1'] + obj['offsety'];
    });
    canvas.add(textObj);

    if (options.selectable) {
      obj.setControlVisible('bl', false);
      obj.setControlVisible('tl', false);
      obj.setControlVisible('br', false);
      obj.setControlVisible('tr', false);
      obj.setControlVisible('mt', false);
      obj.setControlVisible('mb', false);
      obj.setControlVisible('ml', false);
      obj.setControlVisible('mr', false);
      obj.setControlVisible('mtr', true);

      var modify = function (subObj) {
        subObj.x1 = obj.x1;
        subObj.y1 = obj.y1;
        subObj.angle = obj.angle;
      };
      submittedAnswer.registerAnswerObject(options, obj, modify);
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add fixed pin';
  }
};

mechanicsObjects.byType['pl-dimensions'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, _submittedAnswer) {
    var p1 = $V([options.x1ref, options.y1ref]);
    var p2 = $V([options.x2ref, options.y2ref]);
    var p1d = $V([options.x1d, options.y1d]);
    var p2d = $V([options.x2d, options.y2d]);

    options.left = p1d.e(1);
    options.top = p1d.e(2);
    options.angle = Math.atan2(p2d.e(2) - p1d.e(2), p2d.e(1) - p1d.e(1)) * (180.0 / Math.PI);
    options.width = Math.sqrt(Math.pow(p2d.e(2) - p1d.e(2), 2) + Math.pow(p2d.e(1) - p1d.e(1), 2));

    let obj = new mechanicsObjects.Arrow(options);
    obj.selectable = false;
    obj.evented = false;
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    // Adding support lines
    var options1 = {
      strokeDashArray: [3, 3],
      stroke: '#0057a0',
      strokeWidth: 1.2,
      originX: 'left',
      originY: 'top',
    };
    if (options.startSupportLine) {
      let line1 = new fabric.Line([p1.e(1), p1.e(2), p1d.e(1), p1d.e(2)], options1);
      line1.selectable = false;
      line1.evented = false;
      canvas.add(line1);
    }
    if (options.endSupportLine) {
      let line2 = new fabric.Line([p2.e(1), p2.e(2), p2d.e(1), p2d.e(2)], options1);
      line2.selectable = false;
      line2.evented = false;
      canvas.add(line2);
    }

    let textObj = null;
    if (obj.label) {
      textObj = new mechanicsObjects.LatexText(obj.label, {
        left: obj.xlabel + obj.offsetx,
        top: obj.ylabel + obj.offsety,
        fontSize: 16,
        originX: 'center',
        originY: 'center',
        textAlign: 'left',
        selectable: false,
      });
      canvas.add(textObj);
    }

    return obj;
  }
};

mechanicsObjects.byType['pl-arc-dimensions'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, _submittedAnswer) {
    var obj = new mechanicsObjects.arcVector(options);
    canvas.add(obj);

    // Adding support lines
    var options1 = {
      strokeDashArray: [3, 3],
      stroke: '#0057a0',
      strokeWidth: 1.2,
      originX: 'left',
      originY: 'top',
    };
    if (options.startSupportLine) {
      let xend = obj.left + 1.5 * obj.radius * Math.cos((obj.startAngle * Math.PI) / 180);
      let yend = obj.top + 1.5 * obj.radius * Math.sin((obj.startAngle * Math.PI) / 180);
      let line1 = new fabric.Line([obj.left, obj.top, xend, yend], options1);
      line1.selectable = false;
      line1.evented = false;
      canvas.add(line1);
    }
    if (options.endSupportLine) {
      let xend = obj.left + 1.5 * obj.radius * Math.cos((obj.endAngle * Math.PI) / 180);
      let yend = obj.top + 1.5 * obj.radius * Math.sin((obj.endAngle * Math.PI) / 180);
      let line1 = new fabric.Line([obj.left, obj.top, xend, yend], options1);
      line1.selectable = false;
      line1.evented = false;
      canvas.add(line1);
    }

    if (obj.label) {
      let dt = obj.endAngle - obj.startAngle;
      let t = obj.startAngle + dt / 2;
      let dx = obj.radius * Math.cos((t * Math.PI) / 180);
      let dy = obj.radius * Math.sin((t * Math.PI) / 180);

      let textObj = new mechanicsObjects.LatexText(obj.label, {
        left: obj.left + dx + obj.offsetx,
        top: obj.top + dy + obj.offsety,
        originX: 'center',
        originY: 'center',
        fontSize: 20,
        textAlign: 'left',
      });
      canvas.add(textObj);
    }

    return obj;
  }
};

mechanicsObjects.byType['pl-spring'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new mechanicsObjects.Spring(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.selectable) {
      let modify = function (subObj) {
        subObj.x1 = obj.x1;
        subObj.y1 = obj.y1;
        subObj.x2 = obj.x2;
        subObj.y2 = obj.y2;
        subObj.height = obj.h;
      };
      submittedAnswer.registerAnswerObject(options, obj, modify);
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add spring';
  }
};

mechanicsObjects.byType['pl-coil'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new mechanicsObjects.Coil(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.selectable) {
      let modify = function (subObj) {
        subObj.x1 = obj.x1;
        subObj.y1 = obj.y1;
        subObj.x2 = obj.x2;
        subObj.y2 = obj.y2;
        subObj.height = obj.h;
      };
      submittedAnswer.registerAnswerObject(options, obj, modify);
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add coil';
  }
};

mechanicsObjects.byType['pl-triangle'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new fabric.Polygon([options.p1, options.p2, options.p3], options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.selectable) {
      var modify = function (subObj) {
        let p1 = pt2vec(obj.p1);
        let p2 = pt2vec(obj.p2);
        let p3 = pt2vec(obj.p3);

        let left = Math.min(p1.e(1), p2.e(1), p3.e(1));
        let right = Math.max(p1.e(1), p2.e(1), p3.e(1));
        let top = Math.min(p1.e(2), p2.e(2), p3.e(2));
        let bot = Math.max(p1.e(2), p2.e(2), p3.e(2));

        let avg = $V([(left + right) * 0.5, (top + bot) * 0.5]);
        p1 = p1.subtract(avg);
        p2 = p2.subtract(avg);
        p3 = p3.subtract(avg);

        let scale = $V([obj.scaleX, obj.scaleY]);
        p1 = p1.multElementwise(scale);
        p2 = p2.multElementwise(scale);
        p3 = p3.multElementwise(scale);

        let trans = $V([obj.left, obj.top]);
        p1 = p1.add(trans);
        p2 = p2.add(trans);
        p3 = p3.add(trans);

        subObj.p1 = vec2pt(p1);
        subObj.p2 = vec2pt(p2);
        subObj.p3 = vec2pt(p3);
        subObj.angle = obj.angle;
      };
      submittedAnswer.registerAnswerObject(options, obj, modify);
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add triangle';
  }
};

mechanicsObjects.byType['pl-rectangle'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new fabric.Rect(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }

    if (options.selectable) {
      var modify = function (subObj) {
        subObj.left = obj.left;
        subObj.top = obj.top;
        subObj.width = obj.width * obj.scaleX;
        subObj.height = obj.height * obj.scaleY;
        subObj.angle = obj.angle;
      };
      submittedAnswer.registerAnswerObject(options, obj, modify);
    }

    canvas.add(obj);
    return obj;
  }

  static get_button_tooltip() {
    return 'Add rectangle';
  }
};

mechanicsObjects.byType['pl-polygon'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new fabric.Polygon(options.pointlist, options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.selectable) {
      submittedAnswer.registerAnswerObject(options, obj);
    }
    return obj;
  }

  static get_button_tooltip() {
    return 'Add polygon';
  }
};

mechanicsObjects.byType['pl-line'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new fabric.Line(
      [options.x1, options.y1, options.x2, options.y2],
      _.omit(options, 'left', 'top'),
    );
    obj.setControlVisible('bl', false);
    obj.setControlVisible('tl', false);
    obj.setControlVisible('br', false);
    obj.setControlVisible('tr', false);
    obj.setControlVisible('mt', false);
    obj.setControlVisible('mb', false);
    obj.setControlVisible('ml', false);
    obj.setControlVisible('mr', false);
    obj.setControlVisible('mtr', false);
    if ('trueHandles' in obj) {
      for (const handle of obj.trueHandles) {
        obj.setControlVisible(handle, false);
      }
    }
    obj.selectable = false;
    obj.evented = false;

    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.selectable) {
      obj.objectCaching = false;

      var c1 = mechanicsObjects.makeControlHandle(options.x1, options.y1, 5, 2);
      var c2 = mechanicsObjects.makeControlHandle(options.x2, options.y2, 5, 2);
      canvas.add(c1, c2);

      var subObj = mechanicsObjects.cloneMechanicsObject('pl-line', options);
      // C1
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c1,
        submittedAnswer,
        function () {
          // Modified
          subObj.x1 = c1.left;
          subObj.y1 = c1.top;
        },
        function () {
          // Removed
          canvas.remove(c2);
          canvas.remove(obj);
        },
      );
      c1.on('moving', function () {
        obj.set({ x1: c1.left, y1: c1.top });
      });

      // C2
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c2,
        submittedAnswer,
        function () {
          // Modified
          subObj.x2 = c2.left;
          subObj.y2 = c2.top;
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(obj);
        },
      );
      c2.on('moving', function () {
        obj.set({ x2: c2.left, y2: c2.top });
      });
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add line';
  }
};

mechanicsObjects.byType['pl-coordinates'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    const selectable = options.selectable ? true : false;

    let obj = mechanicsObjects.makeCoordinates(options);
    obj.evented = selectable;
    obj.selectable = selectable;
    obj.setControlVisible('bl', false);
    obj.setControlVisible('tl', false);
    obj.setControlVisible('br', false);
    obj.setControlVisible('tr', false);
    obj.setControlVisible('mt', false);
    obj.setControlVisible('mb', false);
    obj.setControlVisible('ml', false);
    obj.setControlVisible('mr', false);
    obj.setControlVisible('mtr', true);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    const groupOffsetX = options.left - obj.left;
    const groupOffsetY = options.top - obj.top;

    var textObj = new mechanicsObjects.LatexText(options.label, {
      fontSize: 20,
      textAlign: 'left',
    });
    canvas.add(textObj);

    var textObj2 = new mechanicsObjects.LatexText(options.labelx, {
      fontSize: 20,
      textAlign: 'left',
    });
    textObj2.evented = false;
    textObj2.selectable = false;
    canvas.add(textObj2);

    var textObj3 = new mechanicsObjects.LatexText(options.labely, {
      fontSize: 20,
      textAlign: 'left',
    });
    textObj3.evented = false;
    textObj3.selectable = false;
    canvas.add(textObj3);

    let modify = function (subObj) {
      const x = obj.left + groupOffsetX;
      const y = obj.top + groupOffsetY;
      subObj.left = x;
      subObj.top = y;
      subObj.angle = obj.angle;
    };
    submittedAnswer.registerAnswerObject(options, obj, modify);

    let update_labels = function () {
      const angle_rad = (Math.PI / 180) * (360 - obj.angle);
      const x = obj.left + Math.cos(angle_rad) * groupOffsetX + Math.sin(angle_rad) * groupOffsetY;
      const y = obj.top + Math.cos(angle_rad) * groupOffsetY - Math.sin(angle_rad) * groupOffsetX;
      const cosw = Math.cos(angle_rad) * options.width;
      const sinw = Math.sin(angle_rad) * options.width;

      textObj.left = x + options.offsetx;
      textObj.top = y + options.offsety;
      textObj2.left = x + cosw + options.offsetx_label_x;
      textObj2.top = y - sinw + options.offsety_label_x;
      textObj3.left = x - sinw + options.offsetx_label_y;
      textObj3.top = y - cosw + options.offsety_label_y;
    };
    obj.on('moving', update_labels);
    obj.on('rotating', update_labels);
    update_labels();

    obj.on('removed', function () {
      canvas.remove(textObj);
      canvas.remove(textObj2);
      canvas.remove(textObj3);
    });

    return obj;
  }

  static get_button_tooltip() {
    return 'Add coordinates';
  }
};

mechanicsObjects.byType['pl-axes'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, _submittedAnswer) {
    var obj = new fabric.Group([], { left: 0, top: 0 });
    obj.evented = false;
    obj.selectable = false;

    // Adding x-axis
    var options_axis_1 = _.defaults(
      {
        left: options.left - options.xneg,
        top: options.top,
        width: options.xneg + options.xpos,
        drawEndArrow: true,
        arrowheadWidthRatio: 1.5,
        arrowheadOffsetRatio: 1.5,
      },
      options,
    );
    let obj1 = new mechanicsObjects.Arrow(options_axis_1);
    obj.addWithUpdate(obj1);

    // Adding y-axis
    var options_axis_2 = _.defaults(
      {
        left: options.left,
        top: options.top + options.yneg,
        width: options.yneg + options.ypos,
        angle: -90,
        drawEndArrow: true,
        arrowheadWidthRatio: 1.5,
        arrowheadOffsetRatio: 1.5,
      },
      options,
    );
    let obj2 = new mechanicsObjects.Arrow(options_axis_2);
    obj.addWithUpdate(obj2);

    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    var textObj2 = new mechanicsObjects.LatexText(options.labelx, {
      left: options.left + options.xpos + options.offsetx_label_x,
      top: options.top + options.offsety_label_x,
      fontSize: 20,
      textAlign: 'left',
    });
    canvas.add(textObj2);

    var textObj3 = new mechanicsObjects.LatexText(options.labely, {
      left: options.left + options.offsetx_label_y,
      top: options.top - options.ypos + options.offsety_label_y,
      fontSize: 20,
      textAlign: 'left',
    });
    canvas.add(textObj3);

    // Adding labels to plot axes
    for (const label of options.label_list) {
      var xL = options.left;
      var yL = options.top;
      if (label['axis'] === 'x') {
        xL += label['pos'];
        yL += 10;
        if ('offsetx' in label) {
          xL += label['offsetx'];
        }
        if ('offsety' in label) {
          yL -= label['offsety'];
        }
      } else if (label['axis'] === 'y') {
        yL -= label['pos'];
        xL -= 20;
        if ('offsetx' in label) {
          xL += label['offsetx'];
        }
        if ('offsety' in label) {
          yL -= label['offsety'];
        }
      }
      var textObj4 = new mechanicsObjects.LatexText(label['lab'], {
        left: xL,
        top: yL,
        fontSize: 14,
        originX: 'center',
        originY: 'center',
      });
      canvas.add(textObj4);
    }

    // Adding support lines
    var opt_line = {
      strokeDashArray: [3, 3],
      stroke: '#0057a0',
      strokeWidth: 1.2,
      originX: 'left',
      originY: 'top',
      selectable: false,
    };
    for (const supporting_line of options.supporting_lines) {
      if ('x' in supporting_line) {
        let x1 = options.left + supporting_line['x'];
        let y1 = options.top + options.yneg;
        let y2 = options.top - options.ypos;
        let line1 = new fabric.Line([x1, y1, x1, y2], opt_line);
        canvas.add(line1);
      }
      if ('y' in supporting_line) {
        let x1 = options.left - options.xneg;
        let x2 = options.left + options.xpos;
        let y1 = options.top - supporting_line['y'];
        let line1 = new fabric.Line([x1, y1, x2, y1], opt_line);
        canvas.add(line1);
      }
    }

    return obj;
  }
};

mechanicsObjects.byType['pl-arc'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new fabric.Circle(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.selectable) {
      const x = options.left;
      const y = options.top;
      const r = options.radius;
      const sa = options.startAngle;
      const ea = options.endAngle;
      let c1 = mechanicsObjects.makeControlHandle(x, y, 5, 2);
      let c2 = mechanicsObjects.makeControlHandle(x + Math.cos(sa) * r, y + Math.sin(sa) * r, 5, 2);
      let c3 = mechanicsObjects.makeControlHandle(x + Math.cos(ea) * r, y + Math.sin(ea) * r, 5, 2);

      obj.objectCaching = false;
      obj.selectable = false;
      obj.evented = false;

      canvas.add(c1, c2, c3);

      var subObj = mechanicsObjects.cloneMechanicsObject('pl-arc', options);

      // Center
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c1,
        submittedAnswer,
        () => {
          // Modified
          subObj.left = c1.left;
          subObj.top = c1.top;
          submittedAnswer.updateObject(subObj);
        },
        () => {
          // Removed
          canvas.remove(c2);
          canvas.remove(c3);
          canvas.remove(obj);
          this.removeSubmittedAnswerObj(submittedAnswer, subObj);
        },
      );
      c1.on('moving', function () {
        obj.left = c1.left;
        obj.top = c1.top;
        obj.setCoords();

        c2.left = c1.left + Math.cos(obj.startAngle) * obj.radius;
        c2.top = c1.top + Math.sin(obj.startAngle) * obj.radius;
        c2.setCoords();

        c3.left = c1.left + Math.cos(obj.endAngle) * obj.radius;
        c3.top = c1.top + Math.sin(obj.endAngle) * obj.radius;
        c3.setCoords();
      });

      // Starting Angle
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c2,
        submittedAnswer,
        function () {
          // Modified
          const dy = c2.top - obj.top;
          const dx = c2.left - obj.left;
          subObj.startAngle = Math.atan2(dy, dx);
          subObj.radius = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
          submittedAnswer.updateObject(subObj);
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(c3);
          canvas.remove(obj);
          submittedAnswer.deleteObject(subObj);
        },
      );
      c2.on('moving', function () {
        const dy = c2.top - obj.top;
        const dx = c2.left - obj.left;
        obj.startAngle = Math.atan2(dy, dx);
        obj.radius = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
        obj.dirty = true;

        c3.left = c1.left + Math.cos(obj.endAngle) * obj.radius;
        c3.top = c1.top + Math.sin(obj.endAngle) * obj.radius;
        c3.setCoords();
      });

      // Ending Angle
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c3,
        submittedAnswer,
        function () {
          // Modified
          const dy = c3.top - obj.top;
          const dx = c3.left - obj.left;
          subObj.endAngle = Math.atan2(dy, dx);
          subObj.radius = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
          submittedAnswer.updateObject(subObj);
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(c2);
          canvas.remove(obj);
          submittedAnswer.deleteObject(subObj);
        },
      );
      c3.on('moving', function () {
        const dy = c3.top - obj.top;
        const dx = c3.left - obj.left;
        obj.endAngle = Math.atan2(dy, dx);
        obj.radius = Math.sqrt(Math.pow(dx, 2) + Math.pow(dy, 2));
        obj.dirty = true;

        c2.left = c1.left + Math.cos(obj.startAngle) * obj.radius;
        c2.top = c1.top + Math.sin(obj.startAngle) * obj.radius;
        c2.setCoords();
      });

      return [obj, c1, c2, c3];
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add simple arc';
  }
};

mechanicsObjects.byType['pl-pulley'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new mechanicsObjects.pulley(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    obj.selectable = false;
    obj.evented = false;
    canvas.add(obj);

    if (options.selectable) {
      let cc = mechanicsObjects.makeControlHandle(options.x1, options.y1, 5, 2);
      let c1 = mechanicsObjects.makeControlHandle(options.x2, options.y2, 5, 2);
      let c2 = mechanicsObjects.makeControlHandle(options.x3, options.y3, 5, 2);
      canvas.add(cc, c1, c2);

      let subObj = mechanicsObjects.cloneMechanicsObject('pl-pulley', options);
      // cc
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        cc,
        submittedAnswer,
        function () {
          // Modified
          subObj.x1 = cc.left;
          subObj.y1 = cc.top;
        },
        function () {
          // Removed
          canvas.remove(c1);
          canvas.remove(c2);
        },
      );
      cc.on('moving', function () {
        obj.set({ x1: cc.left, y1: cc.top });
        obj.fire('update_visuals');
      });

      // c1
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c1,
        submittedAnswer,
        function () {
          // Modified
          subObj.x2 = c1.left;
          subObj.y2 = c1.top;
        },
        function () {
          // Removed
          canvas.remove(cc);
          canvas.remove(c2);
        },
      );
      c1.on('moving', function () {
        obj.set({ x2: c1.left, y2: c1.top });
        obj.fire('update_visuals');
      });

      // c2
      mechanicsObjects.attachHandlersNoClone(
        subObj,
        c2,
        submittedAnswer,
        function () {
          // Modified
          subObj.x3 = c2.left;
          subObj.y3 = c2.top;
        },
        function () {
          // Removed
          canvas.remove(cc);
          canvas.remove(c1);
        },
      );
      c2.on('moving', function () {
        obj.set({ x3: c2.left, y3: c2.top });
        obj.fire('update_visuals');
      });
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add pulley';
  }
};

mechanicsObjects.byType['pl-arc-vector'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    if (options['clockwiseDirection']) {
      options.drawStartArrow = false;
      options.drawEndArrow = true;
    } else {
      options.drawStartArrow = true;
      options.drawEndArrow = false;
    }

    var obj = new mechanicsObjects.arcVector(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.drawErrorBox) {
      var error_box = new fabric.Rect({
        left: options.XcenterErrorBox,
        top: options.YcenterErrorBox,
        originX: 'center',
        originY: 'center',
        width: options.widthErrorBox,
        height: options.heightErrorBox,
        angle: options.angle,
        fill: '',
        strokeWidth: 3,
        stroke: 'green',
      });
      canvas.add(error_box);
    }

    let textObj = null;
    if (obj.label) {
      let dt = obj.endAngle - obj.startAngle;
      let t;
      if (dt >= 0) {
        t = obj.startAngle + dt / 2;
      } else {
        t = obj.startAngle + (360 + dt) / 2;
      }
      var dx = options.radius * Math.cos((t * Math.PI) / 180);
      var dy = options.radius * Math.sin((t * Math.PI) / 180);

      textObj = new mechanicsObjects.LatexText(obj.label, {
        left: obj.left + dx + obj.offsetx,
        top: obj.top + dy + obj.offsety,
        originX: 'center',
        originY: 'center',
        fontSize: 20,
        textAlign: 'left',
      });
      canvas.add(textObj);
    }

    if (options.selectable) {
      submittedAnswer.registerAnswerObject(options, obj);
      obj.on('moving', () => {
        if (textObj) {
          textObj.left = obj.left + dx + obj.offsetx;
          textObj.top = obj.top + dy + obj.offsety;
        }
      });
    }

    return obj;
  }

  static get_button_icon(options) {
    if (options['clockwise-direction']) {
      return 'pl-arc-vector-CW';
    } else {
      return 'pl-arc-vector-CCW';
    }
  }

  static get_button_tooltip(options) {
    if (options['clockwise-direction']) {
      return 'Add clockwise arc vector';
    } else {
      return 'Add counterclockwise arc vector';
    }
  }
};

mechanicsObjects.byType['pl-vector'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    var obj = new mechanicsObjects.Arrow(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.drawErrorBox) {
      var error_box = new fabric.Rect({
        left: options.XcenterErrorBox,
        top: options.YcenterErrorBox,
        originX: 'center',
        originY: 'center',
        width: options.widthErrorBox,
        height: options.heightErrorBox,
        angle: options.angle,
        fill: '',
        stroke: 'blue',
      });
      canvas.add(error_box);
    }

    var angle_rad = (Math.PI * obj.angle) / 180;
    var dx = obj.width * Math.cos(angle_rad);
    var dy = obj.width * Math.sin(angle_rad);
    let textObj = null;
    if (obj.label) {
      textObj = new mechanicsObjects.LatexText(obj.label, {
        left: obj.left + dx + obj.offsetx,
        top: obj.top + dy + obj.offsety,
        fontSize: 20,
        textAlign: 'left',
        selectable: false,
      });
      canvas.add(textObj);
    }

    if (options.selectable) {
      submittedAnswer.registerAnswerObject(options, obj);
      obj.on('moving', () => {
        if (textObj) {
          textObj.left = obj.left + dx + obj.offsetx;
          textObj.top = obj.top + dy + obj.offsety;
        }
      });
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add vector';
  }
};

mechanicsObjects.byType['pl-paired-vector'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    // pick matching colors for both arrows; these rotate throughout the page
    if (typeof this.myIndex === 'undefined') {
      this.myIndex = 0;
    } else {
      this.myIndex += 1;
    }

    const myColors = ['lightblue', 'orange', 'lightgreen', 'pink', 'darksalmon'];

    options.stroke = myColors[this.myIndex % myColors.length];

    // attributes common to both canvas vectors
    const includedAttributes = [
      'width',
      'label',
      'offsetx',
      'offsety',
      'stroke',
      'strokeWidth',
      'arrowheadWidthRatio',
      'arrowheadOffsetRatio',
      'drawStartArrow',
      'drawEndArrow',
      'originY',
      'trueHandles',
      'disregard_sense',
      'optional_grading',
      'objectDrawErrorBox',
      'offset_forward',
      'offset_backward',
      'selectable',
      'evented',
    ];
    const options1 = {};
    const options2 = {};
    for (const includedAttribute of includedAttributes) {
      if (includedAttribute in options) {
        options1[includedAttribute] = options[includedAttribute];
        options2[includedAttribute] = options[includedAttribute];
      }
    }

    // options that need to be duplicated for each canvas vector
    options1.x1 = options.x1;
    options1.y1 = options.y1;
    options2.x1 = options.x2;
    options2.y1 = options.y2;
    const varyingAttributes = [
      'left',
      'top',
      'angle',
      'XcenterErrorBox',
      'YcenterErrorBox',
      'widthErrorBox',
      'heightErrorBox',
    ];
    for (const varyingAttribute of varyingAttributes) {
      if (varyingAttribute.concat('1') in options) {
        options1[varyingAttribute] = options[varyingAttribute.concat('1')];
      }
      if (varyingAttribute.concat('2') in options) {
        options2[varyingAttribute] = options[varyingAttribute.concat('2')];
      }
    }

    // add first arrow
    var obj1 = new mechanicsObjects.Arrow(options1);
    if (!('id' in obj1)) {
      obj1.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj1);

    // add second arrow
    var obj2 = new mechanicsObjects.Arrow(options2);
    if (!('id' in obj2)) {
      obj2.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj2);

    if (options.drawErrorBox) {
      var error_box1 = new fabric.Rect({
        left: options.XcenterErrorBox1,
        top: options.YcenterErrorBox1,
        originX: 'center',
        originY: 'center',
        width: options.widthErrorBox1,
        height: options.heightErrorBox1,
        angle: options.angle1,
        fill: '',
        stroke: myColors[this.myIndex % myColors.length],
      });
      var error_box2 = new fabric.Rect({
        left: options.XcenterErrorBox2,
        top: options.YcenterErrorBox2,
        originX: 'center',
        originY: 'center',
        width: options.widthErrorBox2,
        height: options.heightErrorBox2,
        angle: options.angle2,
        fill: '',
        stroke: myColors[this.myIndex % myColors.length],
      });
      canvas.add(error_box1);
      canvas.add(error_box2);
    }

    var angle_rad1 = (Math.PI * obj1.angle) / 180;
    var dx1 = obj1.width * Math.cos(angle_rad1);
    var dy1 = obj1.width * Math.sin(angle_rad1);
    let textObj1 = null;
    if (obj1.label) {
      textObj1 = new mechanicsObjects.LatexText(obj1.label, {
        left: obj1.left + dx1 + obj1.offsetx,
        top: obj1.top + dy1 + obj1.offsety,
        fontSize: 20,
        textAlign: 'left',
        selectable: false,
      });
      canvas.add(textObj1);
    }

    var angle_rad2 = (Math.PI * obj2.angle) / 180;
    var dx2 = obj2.width * Math.cos(angle_rad2);
    var dy2 = obj2.width * Math.sin(angle_rad2);
    let textObj2 = null;
    if (obj2.label) {
      textObj2 = new mechanicsObjects.LatexText(obj2.label, {
        left: obj2.left + dx2 + obj2.offsetx,
        top: obj2.top + dy2 + obj2.offsety,
        fontSize: 20,
        textAlign: 'left',
        selectable: false,
      });
      canvas.add(textObj2);
    }

    var subObj = mechanicsObjects.cloneMechanicsObject('pl-paired-vector', options);
    mechanicsObjects.attachHandlersNoClone(
      subObj,
      obj1,
      submittedAnswer,
      function () {
        for (const key of ['left', 'top', 'angle']) {
          subObj[key.concat('1')] = obj1[key];
        }
      },
      function () {
        canvas.remove(obj1);
        canvas.remove(obj2);
      },
    );

    mechanicsObjects.attachHandlersNoClone(
      subObj,
      obj2,
      submittedAnswer,
      function () {
        for (const key of ['left', 'top', 'angle']) {
          subObj[key.concat('2')] = obj2[key];
        }
      },
      function () {
        canvas.remove(obj1);
        canvas.remove(obj2);
      },
    );

    return [obj1, obj2];
  }

  static get_button_tooltip() {
    return 'Add paired vectors';
  }
};

mechanicsObjects.byType['pl-double-headed-vector'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    var obj = new mechanicsObjects.DoubleArrow(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.drawErrorBox) {
      var error_box = new fabric.Rect({
        left: options.XcenterErrorBox,
        top: options.YcenterErrorBox,
        originX: 'center',
        originY: 'center',
        width: options.widthErrorBox,
        height: options.heightErrorBox,
        angle: options.angle,
        fill: '',
        stroke: 'blue',
      });
      canvas.add(error_box);
    }

    var angle_rad = (Math.PI * obj.angle) / 180;
    var dx = obj.width * Math.cos(angle_rad);
    var dy = obj.width * Math.sin(angle_rad);
    let textObj = null;
    if (obj.label) {
      textObj = new mechanicsObjects.LatexText(obj.label, {
        left: obj.left + dx + obj.offsetx,
        top: obj.top + dy + obj.offsety,
        fontSize: 20,
        textAlign: 'left',
        selectable: false,
      });
      canvas.add(textObj);
    }

    if (options.selectable) {
      submittedAnswer.registerAnswerObject(options, obj);
      obj.on('moving', () => {
        if (textObj) {
          textObj.left = obj.left + dx + obj.offsetx;
          textObj.top = obj.top + dy + obj.offsety;
        }
      });
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add double-headed vector';
  }
};

mechanicsObjects.byType['pl-distributed-load'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    var obj = new mechanicsObjects.DistTrianLoad(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.drawErrorBox) {
      var error_box = new fabric.Rect({
        left: options.XcenterErrorBox,
        top: options.YcenterErrorBox,
        originX: 'center',
        originY: 'center',
        width: options.widthErrorBox,
        height: options.heightErrorBox,
        angle: options.angle,
        fill: '',
        stroke: 'blue',
      });
      canvas.add(error_box);
    }

    if (options.selectable) {
      // save location for updates
      var initSubObjLeft = options.left;
      var initSubObjTop = options.top;
      var initObjLeft = obj.left;
      var initObjTop = obj.top;

      var modify = function (subObj) {
        (subObj.left = initSubObjLeft + obj.left - initObjLeft),
          (subObj.top = initSubObjTop + obj.top - initObjTop),
          (subObj.range = obj.range);
        subObj.angle = obj.angle;
        subObj.flipped = obj.flipped;
      };
      submittedAnswer.registerAnswerObject(options, obj, modify);
    }

    return obj;
  }

  static get_button_icon(options) {
    let wdef = { w1: 60, w2: 60, anchor_is_tail: false };
    let opts = _.defaults(_.clone(options), wdef);
    let w1 = opts['w1'];
    let w2 = opts['w2'];
    let anchor = opts['anchor_is_tail'];

    let file_name;
    if (w1 === w2) {
      file_name = 'DUD';
    } else if (w1 < w2 && anchor === 'true') {
      file_name = 'DTDA';
    } else if (w1 < w2) {
      file_name = 'DTUD';
    } else if (w1 > w2 && anchor === 'true') {
      file_name = 'DTUA';
    } else {
      file_name = 'DTDD';
    }
    return file_name;
  }

  static get_button_tooltip() {
    return 'Add distributed load';
  }
};

mechanicsObjects.byType['pl-circle'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new fabric.Circle(options);
    obj.setControlVisible('bl', false);
    obj.setControlVisible('tl', false);
    obj.setControlVisible('br', false);
    obj.setControlVisible('tr', false);
    obj.setControlVisible('mt', false);
    obj.setControlVisible('mb', false);
    obj.setControlVisible('ml', false);
    obj.setControlVisible('mr', false);
    obj.setControlVisible('mtr', false);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    let textObj = null;
    if (obj.label) {
      textObj = new mechanicsObjects.LatexText(obj.label, {
        left: obj.left + obj.offsetx,
        top: obj.top + obj.offsety,
        fontSize: 16,
        textAlign: 'left',
        selectable: false,
      });
      canvas.add(textObj);
    }

    if (options.selectable) {
      submittedAnswer.registerAnswerObject(options, obj);
      obj.on('moving', () => {
        if (textObj) {
          textObj.left = obj.left + obj.offsetx;
          textObj.top = obj.top + obj.offsety;
        }
      });
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add circle';
  }
};

mechanicsObjects.byType['pl-point'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new fabric.Circle(options);
    obj.setControlVisible('bl', false);
    obj.setControlVisible('tl', false);
    obj.setControlVisible('br', false);
    obj.setControlVisible('tr', false);
    obj.setControlVisible('mt', false);
    obj.setControlVisible('mb', false);
    obj.setControlVisible('ml', false);
    obj.setControlVisible('mr', false);
    obj.setControlVisible('mtr', false);

    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    if (options.drawErrorBox) {
      var error_box = new fabric.Rect({
        left: options.XcenterErrorBox,
        top: options.YcenterErrorBox,
        originX: 'center',
        originY: 'center',
        width: options.widthErrorBox,
        height: options.heightErrorBox,
        angle: options.angle,
        fill: '',
        strokeWidth: 3,
        stroke: 'purple',
      });
      canvas.add(error_box);
    }

    let textObj = null;
    if (obj.label) {
      textObj = new mechanicsObjects.LatexText(obj.label, {
        left: obj.left + obj.offsetx,
        top: obj.top + obj.offsety,
        fontSize: 16,
        textAlign: 'left',
        selectable: false,
      });
      canvas.add(textObj);
    }

    if (options.selectable) {
      submittedAnswer.registerAnswerObject(options, obj);
      obj.on('moving', () => {
        if (textObj) {
          textObj.left = obj.left + obj.offsetx;
          textObj.top = obj.top + obj.offsety;
        }
      });
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add point';
  }
};

mechanicsObjects.byType['pl-roller'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    let obj = new mechanicsObjects.Roller(options);
    if (!('id' in obj)) {
      obj.id = window.PLDrawingApi.generateID();
    }
    canvas.add(obj);

    var textObj = new mechanicsObjects.LatexText(obj.label, {
      left: obj.x1 + obj.offsetx,
      top: obj.y1 + obj.offsety,
      fontSize: 20,
      textAlign: 'left',
      selectable: false,
    });
    obj.on('moving', () => {
      textObj.left = obj['x1'] + obj['offsetx'];
      textObj.top = obj['y1'] + obj['offsety'];
    });
    obj.on('rotating', () => {
      textObj.left = obj['x1'] + obj['offsetx'];
      textObj.top = obj['y1'] + obj['offsety'];
    });
    canvas.add(textObj);

    if (options.selectable) {
      obj.setControlVisible('bl', false);
      obj.setControlVisible('tl', false);
      obj.setControlVisible('br', false);
      obj.setControlVisible('tr', false);
      obj.setControlVisible('mt', false);
      obj.setControlVisible('mb', false);
      obj.setControlVisible('ml', false);
      obj.setControlVisible('mr', false);
      obj.setControlVisible('mtr', true);

      let modify = function (subObj) {
        subObj.x1 = obj.x1;
        subObj.y1 = obj.y1;
        subObj.angle = obj.angle;
      };
      submittedAnswer.registerAnswerObject(options, obj, modify);
    }

    return obj;
  }

  static get_button_tooltip() {
    return 'Add roller base';
  }
};

mechanicsObjects.byType['pl-controlled-line'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    var line = mechanicsObjects.makeControlStraightLine(
      options.x1,
      options.y1,
      options.x2,
      options.y2,
      options,
    );
    var c1 = mechanicsObjects.makeControlHandle(
      options.x1,
      options.y1,
      options.handleRadius,
      options.strokeWidth / 2,
    );
    var c2 = mechanicsObjects.makeControlHandle(
      options.x2,
      options.y2,
      options.handleRadius,
      options.strokeWidth / 2,
    );
    canvas.add(line, c1, c2);

    var options_error_box = {
      originX: 'center',
      originY: 'center',
      fill: '',
      stroke: 'green',
      width: options.widthErrorBox,
      height: options.heightErrorBox,
    };
    if (options.drawErrorBox) {
      var end_points_options_1 = {
        left: options.x1,
        top: options.y1,
      };
      let opt = Object.assign(options_error_box, end_points_options_1);
      canvas.add(new fabric.Rect(opt));

      var end_points_options_2 = {
        left: options.x2,
        top: options.y2,
      };
      opt = Object.assign(options_error_box, end_points_options_2);
      canvas.add(new fabric.Rect(opt));
    }

    if (!submittedAnswer) return [line, c1, c2];

    var subObj = mechanicsObjects.cloneMechanicsObject('pl-controlled-line', options);

    // C1
    mechanicsObjects.attachHandlersNoClone(
      subObj,
      c1,
      submittedAnswer,
      function () {
        // Modified
        subObj.x1 = c1.left;
        subObj.y1 = c1.top;
      },
      function () {
        // Removed
        canvas.remove(c2);
        canvas.remove(line);
      },
    );
    c1.on('moving', function () {
      line.set({ x1: c1.left, y1: c1.top });
    });

    // C2
    mechanicsObjects.attachHandlersNoClone(
      subObj,
      c2,
      submittedAnswer,
      function () {
        // Modified
        subObj.x2 = c2.left;
        subObj.y2 = c2.top;
      },
      function () {
        // Removed
        canvas.remove(c1);
        canvas.remove(line);
      },
    );
    c2.on('moving', function () {
      line.set({ x2: c2.left, y2: c2.top });
    });

    return [line, c1, c2];
  }

  static get_button_tooltip() {
    return 'Add controlled line';
  }
};

mechanicsObjects.byType['pl-controlled-curved-line'] = class extends PLDrawingBaseElement {
  static generate(canvas, options, submittedAnswer) {
    var line = mechanicsObjects.makeControlCurvedLine(
      options.x1,
      options.y1,
      options.x2,
      options.y2,
      options.x3,
      options.y3,
      options,
    );
    line.objectCaching = false;
    var c1 = mechanicsObjects.makeControlHandle(
      options.x1,
      options.y1,
      options.handleRadius,
      options.strokeWidth / 2,
    );
    var c2 = mechanicsObjects.makeControlHandle(
      options.x2,
      options.y2,
      options.handleRadius,
      options.strokeWidth / 2,
    );
    var c3 = mechanicsObjects.makeControlHandle(
      options.x3,
      options.y3,
      options.handleRadius,
      options.strokeWidth / 2,
    );

    // c1 and c3 are the end points of the quadratic curve
    // c2 is the control point
    canvas.add(line, c1, c2, c3);

    var options_error_box = {
      originX: 'center',
      originY: 'center',
      fill: '',
      stroke: 'green',
      width: options.widthErrorBox,
      height: options.heightErrorBox,
    };
    if (options.drawErrorBox) {
      var end_points_options_1 = {
        left: options.x1,
        top: options.y1,
      };
      let opt = Object.assign(options_error_box, end_points_options_1);
      canvas.add(new fabric.Rect(opt));

      var end_points_options_2 = {
        left: options.x3,
        top: options.y3,
      };
      opt = Object.assign(options_error_box, end_points_options_2);
      canvas.add(new fabric.Rect(opt));

      var control_point_options = {
        left: options.x2,
        top: options.y2,
        stroke: 'purple',
        width: options.widthErrorBoxControl,
        height: options.heightErrorBoxControl,
      };
      opt = Object.assign(options_error_box, control_point_options);
      canvas.add(new fabric.Rect(opt));
    }

    if (!submittedAnswer) return [line, c1, c2, c3];

    var subObj = mechanicsObjects.cloneMechanicsObject('pl-controlled-curved-line', options);

    // C1
    mechanicsObjects.attachHandlersNoClone(
      subObj,
      c1,
      submittedAnswer,
      function () {
        // Modified
        subObj.x1 = c1.left;
        subObj.y1 = c1.top;
      },
      function () {
        // Removed
        canvas.remove(c2);
        canvas.remove(c3);
        canvas.remove(line);
      },
    );
    c1.on('moving', function () {
      line.path[0][1] = c1.left;
      line.path[0][2] = c1.top;
    });

    // C2
    mechanicsObjects.attachHandlersNoClone(
      subObj,
      c2,
      submittedAnswer,
      function () {
        // Modified
        subObj.x2 = c2.left;
        subObj.y2 = c2.top;
      },
      function () {
        // Removed
        canvas.remove(c1);
        canvas.remove(c3);
        canvas.remove(line);
      },
    );
    c2.on('moving', function () {
      line.path[1][1] = c2.left;
      line.path[1][2] = c2.top;
    });

    // C3
    mechanicsObjects.attachHandlersNoClone(
      subObj,
      c3,
      submittedAnswer,
      function () {
        // Modified
        subObj.x3 = c3.left;
        subObj.y3 = c3.top;
      },
      function () {
        // Removed
        canvas.remove(c1);
        canvas.remove(c2);
        canvas.remove(line);
      },
    );
    c3.on('moving', function () {
      line.path[1][3] = c3.left;
      line.path[1][4] = c3.top;
    });

    return [line, c1, c2, c3];
  }

  static get_button_tooltip() {
    return 'Add curved controlled line';
  }
};

mechanicsObjects.byType['pl-capacitor'] = class extends PLDrawingBaseElement {
  static generate(canvas, options) {
    var gap = options.interval;
    var theta = Math.atan2(options.y2 - options.y1, options.x2 - options.x1);
    var d = Math.sqrt(Math.pow(options.y2 - options.y1, 2) + Math.pow(options.x2 - options.x1, 2));

    // Start and end positons for the capacitor supporting lines
    // which removes the distance between capacitor plates (gap)
    var xm1 = options.x1 + ((d - gap) / 2) * Math.cos(theta);
    var ym1 = options.y1 + ((d - gap) / 2) * Math.sin(theta);
    var xm2 = options.x1 + ((d + gap) / 2) * Math.cos(theta);
    var ym2 = options.y1 + ((d + gap) / 2) * Math.sin(theta);

    let supportingLine1 = new fabric.Line([options.x1, options.y1, xm1, ym1], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: options.selectable,
      evented: options.evented,
      originX: options.originX,
      originY: options.originY,
    });
    if (!('id' in supportingLine1)) {
      supportingLine1.id = window.PLDrawingApi.generateID();
    }
    let supportingLine2 = new fabric.Line([xm2, ym2, options.x2, options.y2], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: options.selectable,
      evented: options.evented,
      originX: options.originX,
      originY: options.originY,
    });
    if (!('id' in supportingLine2)) {
      supportingLine2.id = window.PLDrawingApi.generateID();
    }

    // Start and end positions for the lines that will define the capacitor plates
    var cline = options.height; // height of capacitor plate
    var c1x1 = xm1 - cline * Math.sin(theta);
    var c1y1 = ym1 + cline * Math.cos(theta);
    var c1x2 = xm1 + cline * Math.sin(theta);
    var c1y2 = ym1 - cline * Math.cos(theta);
    var c2x1 = xm2 - cline * Math.sin(theta);
    var c2y1 = ym2 + cline * Math.cos(theta);
    var c2x2 = xm2 + cline * Math.sin(theta);
    var c2y2 = ym2 - cline * Math.cos(theta);

    let capacitorPlate1 = new fabric.Line([c1x1, c1y1, c1x2, c1y2], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: options.selectable,
      evented: options.evented,
      originX: options.originX,
      originY: options.originY,
    });
    if (!('id' in capacitorPlate1)) {
      capacitorPlate1.id = window.PLDrawingApi.generateID();
    }
    let capacitorPlate2 = new fabric.Line([c2x1, c2y1, c2x2, c2y2], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: options.selectable,
      evented: options.evented,
      originX: options.originX,
      originY: options.originY,
    });
    if (!('id' in capacitorPlate2)) {
      capacitorPlate2.id = window.PLDrawingApi.generateID();
    }

    canvas.add(supportingLine1, supportingLine2, capacitorPlate1, capacitorPlate2);

    if (options.polarized) {
      var xm3 = xm2 + 4 * Math.cos(theta);
      var ym3 = ym2 + 4 * Math.sin(theta);
      let textObj = new fabric.Text('+', {
        left: xm3,
        top: ym3,
        textAlign: 'left',
        fontSize: 16,
        angle: (theta * 180) / Math.PI,
      });
      canvas.add(textObj);
    }

    let textObj = null;
    if (options.label) {
      textObj = new mechanicsObjects.LatexText(options.label, {
        left: c1x2 + options.offsetx,
        top: c1y2 + options.offsety - 10,
        textAlign: 'left',
        fontSize: options.fontSize,
        selectable: false,
        originX: 'center',
        originY: 'center',
      });
      canvas.add(textObj);
    }
  }

  static get_button_tooltip() {
    return 'Add capacitor';
  }
};

mechanicsObjects.byType['pl-battery'] = class extends PLDrawingBaseElement {
  static generate(canvas, options) {
    var gap = options.interval;
    var theta = Math.atan2(options.y2 - options.y1, options.x2 - options.x1);
    var d = Math.sqrt(Math.pow(options.y2 - options.y1, 2) + Math.pow(options.x2 - options.x1, 2));

    // Start and end positons for the battery supporting lines
    // which removes the distance between battery plates (gap)
    var xm1 = options.x1 + ((d - gap) / 2) * Math.cos(theta);
    var ym1 = options.y1 + ((d - gap) / 2) * Math.sin(theta);
    var xm2 = options.x1 + ((d + gap) / 2) * Math.cos(theta);
    var ym2 = options.y1 + ((d + gap) / 2) * Math.sin(theta);

    let supportingLine1 = new fabric.Line([options.x1, options.y1, xm1, ym1], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in supportingLine1)) {
      supportingLine1.id = window.PLDrawingApi.generateID();
    }
    let supportingLine2 = new fabric.Line([xm2, ym2, options.x2, options.y2], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in supportingLine2)) {
      supportingLine2.id = window.PLDrawingApi.generateID();
    }

    // Start and end positions for the lines that will define the battery plates
    var cline1 = options.height / 2; // height of smaller battery plate
    var cline2 = options.height; // height of bigger battery plate

    var c1x1 = xm1 - cline1 * Math.sin(theta);
    var c1y1 = ym1 + cline1 * Math.cos(theta);
    var c1x2 = xm1 + cline1 * Math.sin(theta);
    var c1y2 = ym1 - cline1 * Math.cos(theta);
    var c2x1 = xm2 - cline2 * Math.sin(theta);
    var c2y1 = ym2 + cline2 * Math.cos(theta);
    var c2x2 = xm2 + cline2 * Math.sin(theta);
    var c2y2 = ym2 - cline2 * Math.cos(theta);

    let batteryPlate1 = new fabric.Line([c1x1, c1y1, c1x2, c1y2], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in batteryPlate1)) {
      batteryPlate1.id = window.PLDrawingApi.generateID();
    }
    let batteryPlate2 = new fabric.Line([c2x1, c2y1, c2x2, c2y2], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in batteryPlate2)) {
      batteryPlate2.id = window.PLDrawingApi.generateID();
    }

    canvas.add(supportingLine1, supportingLine2, batteryPlate1, batteryPlate2);

    if (options.label) {
      let textObj = new mechanicsObjects.LatexText(options.label, {
        left: c2x1 + options.offsetx,
        top: c2y1 + options.offsety + 10,
        textAlign: 'left',
        fontSize: options.fontSize,
        selectable: false,
        originX: 'center',
        originY: 'center',
      });
      canvas.add(textObj);
    }
  }

  static get_button_tooltip() {
    return 'Add battery';
  }
};

mechanicsObjects.byType['pl-resistor'] = class extends PLDrawingBaseElement {
  static generate(canvas, options) {
    var theta = Math.atan2(options.y2 - options.y1, options.x2 - options.x1);
    var d = Math.sqrt(Math.pow(options.y2 - options.y1, 2) + Math.pow(options.x2 - options.x1, 2));
    var gap = options.interval;

    // Start and end positons for the resistor supporting lines
    // which removes the region (gap) that will be filled with a Spring
    var xm1 = options.x1 + ((d - gap) / 2) * Math.cos(theta);
    var ym1 = options.y1 + ((d - gap) / 2) * Math.sin(theta);
    var xm2 = options.x1 + ((d + gap) / 2) * Math.cos(theta);
    var ym2 = options.y1 + ((d + gap) / 2) * Math.sin(theta);

    let supportingLine1 = new fabric.Line([options.x1, options.y1, xm1, ym1], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in supportingLine1)) {
      supportingLine1.id = window.PLDrawingApi.generateID();
    }
    let supportingLine2 = new fabric.Line([xm2, ym2, options.x2, options.y2], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in supportingLine2)) {
      supportingLine2.id = window.PLDrawingApi.generateID();
    }
    canvas.add(supportingLine1, supportingLine2);

    // Add Spring between supporting lines
    // In theory, x1, y1, x2, y2 should be the same positions used when creating the
    // supporting lines, namely xm1, ym1, xm2, ym2 respectively. However, when using
    // these parameters, supportingLine 1 does not connect with the start of the spring.
    // Hack solution: to increase the spring region by increasing the value of the "gap"
    // when defining the start and end positions
    var springOptions = _.defaults(
      {
        x1: options.x1 + ((d - 1.06 * gap) / 2) * Math.cos(theta),
        y1: options.y1 + ((d - 1.06 * gap) / 2) * Math.sin(theta),
        x2: options.x1 + ((d + 1.06 * gap) / 2) * Math.cos(theta),
        y2: options.y1 + ((d + 1.06 * gap) / 2) * Math.sin(theta),
        dx: gap / 10,
      },
      options,
    );
    let resistorSpring = new mechanicsObjects.Spring(springOptions);
    if (!('id' in resistorSpring)) {
      resistorSpring.id = window.PLDrawingApi.generateID();
    }
    canvas.add(resistorSpring);

    if (options.label) {
      let textObj = new mechanicsObjects.LatexText(options.label, {
        left: xm2 - options.height * Math.sin(theta) + options.offsetx,
        top: ym2 + options.height * Math.cos(theta) + options.offsety - 30,
        textAlign: 'left',
        fontSize: options.fontSize,
        selectable: false,
        originX: 'center',
        originY: 'center',
      });
      canvas.add(textObj);
    }
  }

  static get_button_tooltip() {
    return 'Add resistor';
  }
};

mechanicsObjects.byType['pl-inductor'] = class extends PLDrawingBaseElement {
  static generate(canvas, options) {
    var theta = Math.atan2(options.y2 - options.y1, options.x2 - options.x1);
    var d = Math.sqrt(Math.pow(options.y2 - options.y1, 2) + Math.pow(options.x2 - options.x1, 2));
    var gap = options.interval;

    // Start and end positons for the inductor supporting lines
    // which removes the region (gap) that will be filled with a Coil
    var xm1 = options.x1 + ((d - gap) / 2) * Math.cos(theta);
    var ym1 = options.y1 + ((d - gap) / 2) * Math.sin(theta);
    var xm2 = options.x1 + ((d + gap) / 2) * Math.cos(theta);
    var ym2 = options.y1 + ((d + gap) / 2) * Math.sin(theta);

    let supportingLine1 = new fabric.Line([options.x1, options.y1, xm1, ym1], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in supportingLine1)) {
      supportingLine1.id = window.PLDrawingApi.generateID();
    }
    let supportingLine2 = new fabric.Line([xm2, ym2, options.x2, options.y2], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in supportingLine2)) {
      supportingLine2.id = window.PLDrawingApi.generateID();
    }
    canvas.add(supportingLine1, supportingLine2);

    // Add Coil between supporting lines
    // In theory, x1, y1, x2, y2 should be the same positions used when creating the
    // supporting lines, namely xm1, ym1, xm2, ym2 respectively. However, when using
    // these parameters, supportingLine 1 does not connect with the start of the coil.
    // Hack solution: to increase the coil region by increasing the value of the "gap"
    // when defining the start and end positions
    var coilOptions = _.defaults(
      {
        x1: options.x1 + ((d - 1.06 * gap) / 2) * Math.cos(theta),
        y1: options.y1 + ((d - 1.06 * gap) / 2) * Math.sin(theta),
        x2: options.x1 + ((d + 1.06 * gap) / 2) * Math.cos(theta),
        y2: options.y1 + ((d + 1.06 * gap) / 2) * Math.sin(theta),
      },
      options,
    );
    let inductorCoil = new mechanicsObjects.Coil(coilOptions);
    if (!('id' in inductorCoil)) {
      inductorCoil.id = window.PLDrawingApi.generateID();
    }
    canvas.add(inductorCoil);

    if (options.label) {
      let textObj = new mechanicsObjects.LatexText(options.label, {
        left: coilOptions.x1 + (options.height / 2) * Math.sin(theta) + options.offsetx,
        top: coilOptions.y1 - options.height * Math.cos(theta) - 10 + options.offsety,
        textAlign: 'left',
        fontSize: options.fontSize,
        selectable: false,
      });
      canvas.add(textObj);
    }
  }

  static get_button_tooltip() {
    return 'Add resistor';
  }
};

mechanicsObjects.byType['pl-switch'] = class extends PLDrawingBaseElement {
  static generate(canvas, options) {
    var gap = options.interval;
    var theta = Math.atan2(options.y2 - options.y1, options.x2 - options.x1);
    var d = Math.sqrt(Math.pow(options.y2 - options.y1, 2) + Math.pow(options.x2 - options.x1, 2));

    // Start and end positons for the switch supporting lines
    // which removes the region (gap) that will be filled with the switch
    var xm1 = options.x1 + ((d - gap) / 2) * Math.cos(theta);
    var ym1 = options.y1 + ((d - gap) / 2) * Math.sin(theta);
    var xm2 = options.x1 + ((d + gap) / 2) * Math.cos(theta);
    var ym2 = options.y1 + ((d + gap) / 2) * Math.sin(theta);

    let supportingLine1 = new fabric.Line([options.x1, options.y1, xm1, ym1], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in supportingLine1)) {
      supportingLine1.id = window.PLDrawingApi.generateID();
    }
    let supportingLine2 = new fabric.Line([xm2, ym2, options.x2, options.y2], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in supportingLine2)) {
      supportingLine2.id = window.PLDrawingApi.generateID();
    }
    canvas.add(supportingLine1, supportingLine2);

    // Add pins (small filled circles) denoting the start and end of switch region
    if (options.drawPin) {
      var circleOptions = _.defaults(
        {
          radius: 2,
          originX: 'center',
          originY: 'center',
          fill: options.stroke,
          left: xm1,
          top: ym1,
        },
        options,
      );
      let objPin1 = new fabric.Circle(circleOptions);
      if (!('id' in objPin1)) {
        objPin1.id = window.PLDrawingApi.generateID();
      }
      var circleOptions2 = _.defaults(
        {
          left: xm2,
          top: ym2,
        },
        circleOptions,
      );
      let objPin2 = new fabric.Circle(circleOptions2);
      if (!('id' in objPin2)) {
        objPin2.id = window.PLDrawingApi.generateID();
      }
      canvas.add(objPin1, objPin2);
    }

    // Add Switch between supporting lines
    // Uses the angle of the switch to find the end position of the switch
    // in the case it is open
    var theta2 = (options.switchAngle * Math.PI) / 180;
    var l = options.interval / Math.cos(theta2);
    var cx = xm1 + l * Math.cos(theta2 + theta);
    var cy = ym1 + l * Math.sin(theta2 + theta);

    let objSwitch = new fabric.Line([xm1, ym1, cx, cy], {
      stroke: options.stroke,
      strokeWidth: options.strokeWidth,
      selectable: false,
      evented: false,
      originX: 'center',
      originY: 'center',
    });
    if (!('id' in objSwitch)) {
      objSwitch.id = window.PLDrawingApi.generateID();
    }
    canvas.add(objSwitch);

    // Add Label
    if (options.label) {
      var offsetlabel = 10;
      let textObj = new mechanicsObjects.LatexText(options.label, {
        left: xm1 + (l / 2) * Math.cos(theta2 + theta) - offsetlabel * Math.sin(theta2 + theta),
        top: ym1 + (l / 2) * Math.sin(theta2 + theta) + offsetlabel * Math.cos(theta2 + theta),
        textAlign: 'left',
        fontSize: options.fontSize,
        selectable: false,
        originX: 'center',
        originY: 'center',
      });
      canvas.add(textObj);
    }
  }

  static get_button_tooltip() {
    return 'Add switch';
  }
};

mechanicsObjects.attachHandlersNoClone = function (
  subObj,
  reference,
  submittedAnswer,
  modifyHandler,
  removeHandler,
) {
  submittedAnswer.updateObject(subObj);
  reference.on('modified', function () {
    if (modifyHandler) {
      modifyHandler(subObj);
    }
    submittedAnswer.updateObject(subObj);
  });
  reference.on('removed', function () {
    if (removeHandler) {
      removeHandler(subObj);
    }
    submittedAnswer.deleteObject(subObj);
  });
};

mechanicsObjects.cloneMechanicsObject = function (type, options) {
  var subObj = _.clone(options);
  if (!('id' in subObj)) {
    subObj.id = window.PLDrawingApi.generateID();
  }
  subObj.type = type;
  return subObj;
};

mechanicsObjects.createObjectHandlers = function (
  type,
  options,
  reference,
  submittedAnswer,
  modifyHandler,
  removeHandler,
) {
  var subObj = mechanicsObjects.cloneMechanicsObject(type, options);
  mechanicsObjects.attachHandlersNoClone(
    subObj,
    reference,
    submittedAnswer,
    modifyHandler,
    removeHandler,
  );
};

window.PLDrawingApi.registerElements('_base', mechanicsObjects.byType, mechanicsObjects);
