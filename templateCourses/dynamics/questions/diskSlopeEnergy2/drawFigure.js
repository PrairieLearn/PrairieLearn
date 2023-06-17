var $V = Sylvester.Vector.create;
		this.pd.setUnits(10, 10 / this.pd.goldenRatio);

        var orient = this.params.get("orient");

        var h = 3;
        var d = 5;
        var dLeft = 2;
        var dRight = 2;
        var theta1 = 1/2 * Math.PI - orient * 5/6 * Math.PI;
        var c1 = 2;
        var c2 = 3;
        var dExtra = 1;

        var B = $V([-orient * (d - dLeft * Math.abs(Math.cos(theta1)) + dRight) / 2, -(h + dLeft * Math.abs(Math.sin(theta1))) / 2]);
        var BExtra = B.add($V([-orient * dExtra, 0]));

        var p1 = B.add($V([0, h]));
        var p0 = p1.subtract(PrairieGeom.vector2DAtAngle(theta1).x(dLeft));
        var p2 = p1.add(PrairieGeom.vector2DAtAngle(theta1).x(c1));
        var p4 = B.add($V([orient * d, 0]));
        var p3 = p4.add($V([-orient * c2, 0]));
        var p5 = p4.add($V([orient * dRight, 0]));

        var r = 1;
        var C = p1.add(PrairieGeom.vector2DAtAngle(theta1 + orient * 1/2 * Math.PI).x(r));
        var D = $V([BExtra.e(1), C.e(2)]);

        this.pd.line(p0, p1);
        this.pd.cubicBezier(p1, p2, p3, p4);
        this.pd.line(p4, p5);

        this.pd.save();
        this.pd.setProp("shapeStrokePattern", "dashed");
        this.pd.line(BExtra, D);
        this.pd.line(D, D.add($V([orient * 0.5, 0])));
        this.pd.line(BExtra, p4);
        this.pd.labelLine(BExtra, D, $V([0, orient]), "TEX:$h$");
        this.pd.restore();

        this.pd.circle(C, r, false);
        this.pd.circle(C, r - 0.1, false);
        this.pd.point(C);
        this.pd.text(C, $V([-1, 1]), "TEX:$C$");

        var gx = orient * ((d + dRight) / 2 - 1);
        var gy1 = h / 2;
        var gy2 = gy1 - 2;
        this.pd.arrow($V([gx, gy1]), $V([gx, gy2]), "acceleration");
        this.pd.labelLine($V([gx, gy1]), $V([gx, gy2]), $V([0, orient]), "TEX:$g$");