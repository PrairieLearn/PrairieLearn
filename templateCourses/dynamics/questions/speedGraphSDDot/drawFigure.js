var $V = Sylvester.Vector.create;
		var dt = this.params.get("dt");
        var vp = this.params.get("vp");

        var width = 5 * PrairieGeom.goldenRatio;
        var height = 5;

        this.pd.setUnits(width, height);

        var O = $V([0, 0]);

        var n = 20;
        var data = [], i, cp, j;
        for (i = 0; i < (vp.length - 1) / 3; i++) {
            cp = [$V(vp[3 * i]), $V(vp[3 * i + 1]), $V(vp[3 * i + 2]), $V(vp[3 * i + 3])];
            for (j = 0; j < n; j++) {
                data.push(PrairieGeom.cubicBezierPos(j / n, cp[0], cp[1], cp[2], cp[3]));
            }
        }
        data.push($V(vp[vp.length - 1]));
        var tf = data[data.length - 1].e(1) + dt - 0.2;

        var options = {
            drawXGrid: true,
            drawYGrid: true,
            dXGrid: dt,
            dYGrid: 1,
            drawXTickLabels: true,
            drawYTickLabels: true,
            xLabelPos: 0.5,
            yLabelPos: 0.5,
            xLabelAnchor: $V([0, 2.5]),
            yLabelAnchor: $V([0, -2.5]),
            yLabelRotate: true,
        };
        this.pd.plot(data, $V([-0.4 * width, -0.35 * height]), $V([0.85 * width, 0.8 * height]), $V([0, 0]), $V([tf, 9.9]), "TEX:time $t$ / $\\rm s$", "TEX:speed $v$ / $\\rm m\\ s^{-1}$", "position", true, false, undefined, undefined, options);