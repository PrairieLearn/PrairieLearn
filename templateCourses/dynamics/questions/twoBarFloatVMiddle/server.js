
define(["QServer", "PrairieRandom", "sylvester", "PrairieGeom", "underscore"], function(QServer, PrairieRandom, Sylvester, PrairieGeom, _) {
    var $V = Sylvester.Vector.create;

    var server = new QServer();

    server.getData = function(vid) {
        var rand = new PrairieRandom.RandomGenerator(vid);

        var rPA, rQA, vP, vQ, bbox, maxExtent;
        do {
            rPA = $V(rand.randArrayIntNonZero(2, -3, 3));
            rQA = $V(rand.randArrayIntNonZero(2, -3, 3));
            vP = $V(rand.randArrayIntNonZero(2, -3, 3));
            vQ = $V(rand.randArrayIntNonZero(2, -3, 3));
            var P = $V([0, 0]);
            var A = P.add(rPA);
            var Q = A.subtract(rQA);
            var PPV = P.add(vP);
            var QPV = Q.add(vQ);
            bbox = PrairieGeom.boundingBox2D([P, A, Q, P.add(vP), Q.add(vQ)]);
            maxExtent = Math.max(bbox.extent.e(1), bbox.extent.e(2));
        } while (maxExtent < 4 || maxExtent > 9                    // make sure we are in the bounding box
                 || Math.abs(PrairieGeom.cross2DOut(rPA, rQA)) < 1 // don't want rPA, rQA colinear
                 || Math.abs(PrairieGeom.cross2DOut(vP, vQ)) < 1   // don't want vP, vQ colinear
                 || Math.abs(PrairieGeom.cross2DOut(rPA, vP)) < 1  // don't want rPA, vP colinear
                 || Math.abs(PrairieGeom.cross2DOut(rQA, vQ)) < 1  // don't want rQA, vQ colinear
                 || Math.abs(rPA.modulus() - rQA.modulus()) < 1    // don't want too much length symmetry
                 || Math.abs(vP.modulus() - vQ.modulus()) < 1      // don't want too much velocity symmetry
                 || P.subtract(Q).modulus() < 2                    // don't want P close to Q
                 || PPV.subtract(Q).modulus() < 1                  // don't want vP tip close to Q
                 || QPV.subtract(P).modulus() < 1                  // don't want vQ tip close to P
                 || PPV.subtract(QPV).modulus() < 1);              // don't want vP and vQ tips close

        var params = {
            rPA: rPA.elements,
            rQA: rQA.elements,
            vP: vP.elements,
            vQ: vQ.elements,
            C: bbox.center,
        };

        var omegaPA = vP.subtract(vQ).dot(rQA) / PrairieGeom.perp(rQA).dot(rPA);
        var vA = vP.add(PrairieGeom.cross2D(omegaPA, rPA));

        var trueAnswer = {
            vA: vA.elements,
        };
        var questionData = {
            params: params,
            trueAnswer: trueAnswer,
        };
        return questionData;
    };

    server.transformSubmittedAnswer = function(vid, params, trueAnswer, submittedAnswer, options) {
        return {vA: [submittedAnswer.vAi, submittedAnswer.vAj]};
    };

    return server;
});
