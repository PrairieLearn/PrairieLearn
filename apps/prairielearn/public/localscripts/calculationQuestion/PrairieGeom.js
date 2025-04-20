define(['sylvester', 'underscore', 'numeric'], function (Sylvester, _, numeric) {
  var $V = Sylvester.Vector.create;
  var $M = Sylvester.Matrix.create;
  var Vector = Sylvester.Vector;
  var Matrix = Sylvester.Matrix;

  function PrairieGeom() {}

  /*****************************************************************************/

  /** The golden ratio.
   */
  PrairieGeom.prototype.goldenRatio = (1 + Math.sqrt(5)) / 2;

  /*****************************************************************************/

  /** Convert degrees to radians.
        
        @param {number} degrees The angle in degrees.
        @return {number} The angle in radians.
    */
  PrairieGeom.prototype.degToRad = function (degrees) {
    return (degrees * Math.PI) / 180;
  };

  /** Convert radians to degrees.

        @param {number} radians The angle in radians.
        @return {number} The angle in degrees.
    */
  PrairieGeom.prototype.radToDeg = function (radians) {
    return (radians * 180) / Math.PI;
  };

  /** Convert a string to a boolean.

        @param {String} s The input string.
        @return {Boolean} The boolean value of s ("true" -> true).
    */
  PrairieGeom.prototype.toBool = function (s) {
    if (s === true) return true;
    if (s === 'true') return true;
    return false;
  };

  // Histogram (bin count) data
  // From jStat, modified to include low/high args
  PrairieGeom.prototype.histogram = function (arr, bins, low, high) {
    var first = low !== undefined ? low : jStat.min(arr);
    var last = high !== undefined ? high : jStat.max(arr);
    var binCnt = bins || 4;
    var binWidth = (last - first) / binCnt;
    var len = arr.length;
    var bins = [];
    var i;

    for (i = 0; i < binCnt; i++) bins[i] = 0;
    for (i = 0; i < len; i++)
      bins[Math.min(Math.floor((arr[i] - first) / binWidth), binCnt - 1)] += 1;

    return bins;
  };

  /** Fixed modulus function (handles negatives correctly).

        @param {number} value The number to convert.
        @param {number} modulus The modulus.
        @return {number} value mod modulus.
    */
  PrairieGeom.prototype.fixedMod = function (value, modulus) {
    return ((value % modulus) + modulus) % modulus;
  };

  /** Fixed divmod function.

        @param {number} value The number to convert.
        @param {number} modulus The modulus.
        @return {Array} [a, b] = [value div modulus, value mod modulus], so value = a * modulus + b.
    */
  PrairieGeom.prototype.fixedDivMod = function (value, modulus) {
    var b = this.fixedMod(value, modulus);
    var a = (value - b) / modulus;
    return [a, b];
  };

  /** Interval modulus function.

        @param {number} x The number to convert.
        @param {number} a Lower interval end.
        @param {number} b Upper interval end.
        @return {number} The value modded to within [a,b].
    */
  PrairieGeom.prototype.intervalMod = function (x, a, b) {
    return this.fixedMod(x - a, b - a) + a;
  };

  /** Interval divide function.

        @param {number} x The number to convert.
        @param {number} a Lower interval end.
        @param {number} b Upper interval end.
        @return {number} The value divided into the interval within [a,b].
    */
  PrairieGeom.prototype.intervalDiv = function (x, a, b) {
    return Math.floor((x - a) / (b - a));
  };

  /** Vector interval modulus function.

        @param {Vector} x The vector to convert.
        @param {Vector} a Lower interval ends.
        @param {Vector} b Upper interval ends.
        @return {Vector} The vector modded to within [a,b].
    */
  PrairieGeom.prototype.vectorIntervalMod = function (x, a, b) {
    var r = [];
    for (var i = 1; i <= x.elements.length; i++) {
      r.push(this.intervalMod(x.e(i), a.e(i), b.e(i)));
    }
    return $V(r);
  };

  /** Angle difference function.

        @param {Number} a1 The first angle.
        @param {Number} a2 The second angle.
        @return {Number} The difference between a1 and a2 in [0, 2 pi).
    */
  PrairieGeom.prototype.angleDifference = function (a1, a2) {
    return Math.min(this.fixedMod(a1 - a2, 2 * Math.PI), this.fixedMod(a2 - a1, 2 * Math.PI));
  };

  /** Angle difference function in degrees.

        @param {Number} a1 The first angle (degrees).
        @param {Number} a2 The second angle (degrees).
        @return {Number} The difference between a1 and a2 (degrees, in [0, 360)).
    */
  PrairieGeom.prototype.angleDifferenceDeg = function (a1, a2) {
    return Math.min(this.fixedMod(a1 - a2, 360), this.fixedMod(a2 - a1, 360));
  };

  /** Find the gcd (greatest common divisor) of two integers with Euclid's algorithm.

        @param {Number} a First integer.
        @param {Number} b Second integer.
        @return {Number} The gcd of a and b.
    */
  PrairieGeom.prototype.gcd = function (a, b) {
    if (b === 0) return a;
    var aModB = ((a % b) + b) % b;
    return this.gcd(b, aModB);
  };

  /** Round a vector to the nearest integer components.

        @param {Vector} v The vector to round.
        @return {Vector} a Vector with components [Math.round(v.e(1)), Math.round(v.e(2)), ...].
    */
  PrairieGeom.prototype.vectorRound = function (v) {
    var r = [];
    for (var i = 0; i < v.elements.length; i++) {
      r.push(Math.round(v.e(i + 1)));
    }
    return $V(r);
  };

  /** Clip a value x to the given interval [a, b].

        @param {number} x Value to clip.
        @param {number} a Lower interval end.
        @param {number} b Upper interval end.
    */
  PrairieGeom.prototype.clip = function (x, a, b) {
    return Math.max(a, Math.min(b, x));
  };

  /** Intersection of two intervals.

        @param {Array} int1 First interval (two entries giving start and end).
        @param {Array} int2 Second interval (two entries giving start and end).
        @return {Array} Intersected interval (two entries giving start and end), or an empty array.
    */
  PrairieGeom.prototype.intersectIntervals = function (int1, int2) {
    var result = [Math.max(int1[0], int2[0]), Math.min(int1[1], int2[1])];
    if (result[1] < result[0]) {
      result = [];
    }
    return result;
  };

  /** Intersection of two angle ranges modulo 2 pi.

        @param {Array} r1 First range (two entries giving start and end), or an empty array.
        @param {Array} r2 Second range (two entries giving start and end), or an empty array.
        @return {Array} Intersected range (two entries giving start and end), or an empty array.
    */
  PrairieGeom.prototype.intersectAngleRanges = function (r1, r2) {
    if (r1.length === 0 || r2.length === 0) {
      return [];
    }
    if (r1[0] > r1[1]) {
      r1 = [r1[1], r1[0]];
    }
    if (r2[0] > r2[1]) {
      r2 = [r2[1], r2[0]];
    }
    var TWOPI = 2 * Math.PI;
    var start1 = this.fixedMod(r1[0], TWOPI);
    var end1 = this.fixedMod(r1[1], TWOPI);
    var start2 = this.fixedMod(r2[0], TWOPI);
    var end2 = this.fixedMod(r2[1], TWOPI);
    var r1List;
    if (end1 > start1) {
      r1List = [[start1, end1]];
    } else {
      r1List = [
        [start1 - TWOPI, end1],
        [start1, end1 + TWOPI],
      ];
    }
    var r2Use;
    if (end2 > start2) {
      r2Use = [start2, end2];
    } else {
      r2Use = [start2, end2 + TWOPI];
    }
    var i, r1Use, r12;
    var result = [];
    for (i = 0; i < r1List.length; i++) {
      r1Use = r1List[i];
      r12 = this.intersectIntervals(r1Use, r2Use);
      if (r12.length > 0) {
        result.push(r12);
      }
    }
    return result;
  };

  /** Convert polar to rectangular coordinates.

        @param {Vector} pP Polar coordinates (r, theta).
        @return {Vector} The position in rectangular coordinates (x, y).
    */
  PrairieGeom.prototype.polarToRect = function (pP) {
    var pR = $V([pP.e(1) * Math.cos(pP.e(2)), pP.e(1) * Math.sin(pP.e(2))]);
    return pR;
  };

  /** Convert rectangular to polar coordintes.

        @param {Vector} pR Rectangular coordinates (x, y).
        @return {Vector} Polar coordinates (r, theta).
    */
  PrairieGeom.prototype.rectToPolar = function (pR) {
    var x = pR.e(1);
    var y = pR.e(2);
    var r = Math.sqrt(x * x + y * y);
    var theta = Math.atan2(y, x);
    var pP = $V([r, theta]);
    return pP;
  };

  /** Find the polar basis vectors at a given point.

        @param {Vector} pP Polar coordinates (r, theta) of the point.
        @return {Array} The basis vectors [eR, eTheta] at pP.
    */
  PrairieGeom.prototype.polarBasis = function (pP) {
    var theta = pP.e(2);
    var eR = $V([Math.cos(theta), Math.sin(theta)]);
    var eTheta = $V([-Math.sin(theta), Math.cos(theta)]);
    return [eR, eTheta];
  };

  /** Convert a vector in a polar basis to a rectangular basis.

        @param {Vector} vP Vector in polar basis (eR, eTheta).
        @param {Vector} pP Position to convert at (r, theta).
        @return {Vector} The vector vR in rectangular coordinates.
    */
  PrairieGeom.prototype.vecPolarToRect = function (vP, pP) {
    var basis = this.polarBasis(pP);
    var eR = basis[0];
    var eTheta = basis[1];
    var vR = eR.x(vP.e(1)).add(eTheta.x(vP.e(2)));
    return vR;
  };

  /** Convert spherical to rectangular coordintes.

        @param {Vector} pS Spherical coordinates (r, theta, phi).
        @return {Vector} The position in rectangular coordinates (x, y, z).
    */
  PrairieGeom.prototype.sphericalToRect = function (pS) {
    var pR = $V([
      pS.e(1) * Math.cos(pS.e(2)) * Math.cos(pS.e(3)),
      pS.e(1) * Math.sin(pS.e(2)) * Math.cos(pS.e(3)),
      pS.e(1) * Math.sin(pS.e(3)),
    ]);
    return pR;
  };

  /** Convert rectangular to spherical coordintes.

        @param {Vector} pR Rectangular coordinates (x, y, z).
        @return {Vector} Spherical coordinates (r, theta, phi).
    */
  PrairieGeom.prototype.rectToSpherical = function (pR) {
    var x = pR.e(1);
    var y = pR.e(2);
    var z = pR.e(3);
    var r = Math.sqrt(x * x + y * y + z * z);
    var theta = Math.atan2(y, x);
    var phi = Math.asin(z / r);
    var pS = $V([r, theta, phi]);
    return pS;
  };

  /** Find the spherical basis vectors at a given point.

        @param {Vector} pS Spherical coordinates (r, theta, phi) of the point.
        @return {Array} The basis vectors [eR, eTheta, ePhi] at pS.
    */
  PrairieGeom.prototype.sphericalBasis = function (pS) {
    var theta = pS.e(2);
    var phi = pS.e(3);
    var eR = this.sphericalToRect($V([1, theta, phi]));
    var eTheta = $V([-Math.sin(theta), Math.cos(theta), 0]);
    var ePhi = $V([
      -Math.cos(theta) * Math.sin(phi),
      -Math.sin(theta) * Math.sin(phi),
      Math.cos(phi),
    ]);
    return [eR, eTheta, ePhi];
  };

  /** Convert cylindrical to rectangular coordintes.

        @param {Vector} pC Cylindrical coordinates (r, theta, z).
        @return {Vector} The position in rectangular coordinates (x, y, z).
    */
  PrairieGeom.prototype.cylindricalToRect = function (pC) {
    var pR = $V([pC.e(1) * Math.cos(pC.e(2)), pC.e(1) * Math.sin(pC.e(2)), pC.e(3)]);
    return pR;
  };

  /** Convert rectangular to cylindrical coordintes.

        @param {Vector} pR Rectangular coordinates (x, y, z).
        @return {Vector} Cylindrical coordinates (r, theta, z).
    */
  PrairieGeom.prototype.rectToCylindrical = function (pR) {
    var x = pR.e(1);
    var y = pR.e(2);
    var z = pR.e(3);
    var r = Math.sqrt(x * x + y * y);
    var theta = Math.atan2(y, x);
    var pC = $V([r, theta, z]);
    return pC;
  };

  /** Find the cylindrical basis vectors at a given point.

        @param {Vector} pC Cylindrical coordinates (r, theta, z) of the point.
        @return {Array} The basis vectors [eR, eTheta, eZ] at pC.
    */
  PrairieGeom.prototype.cylindricalBasis = function (pC) {
    var theta = pC.e(2);
    var eR = $V([Math.cos(theta), Math.sin(theta), 0]);
    var eTheta = $V([-Math.sin(theta), Math.cos(theta), 0]);
    var eZ = $V([0, 0, 1]);
    return [eR, eTheta, eZ];
  };

  /** Perpendicular vector in 2D.

        @param {Vector} v A 2D vector.
        @return {Vector} The counter-clockwise perpendicular vector to v.
    */
  PrairieGeom.prototype.perp = function (v) {
    return $V([-v.e(2), v.e(1)]);
  };

  /** Orthogonal projection.

        @param {Vector} u Vector to project.
        @param {Vector} v Vector to project onto.
        @return {Vector} The orthogonal projection of u onto v.
    */
  PrairieGeom.prototype.orthProj = function (u, v) {
    if (v.modulus() < 1e-30) {
      return Vector.Zero(u.elements.length);
    } else {
      return v.x(u.dot(v) / Math.pow(v.modulus(), 2));
    }
  };

  /** Orthogonal complement.

        @param {Vector} u Vector to project.
        @param {Vector} v Vector to complement against.
        @return {Vector} The orthogonal complement of u with respect to v.
    */
  PrairieGeom.prototype.orthComp = function (u, v) {
    return u.subtract(this.orthProj(u, v));
  };

  /** Choose a 3D unit vector orthogonal to the given vector.

        @param {Vector} v The base vector.
        @return {Vector} A unit vector n that is orthogonal to v.
    */
  PrairieGeom.prototype.chooseNormVec = function (v) {
    var e1 = Math.abs(v.e(1));
    var e2 = Math.abs(v.e(2));
    var e3 = Math.abs(v.e(3));
    var n;
    if (e1 <= Math.min(e2, e3)) {
      n = Vector.i;
    }
    if (e2 <= Math.min(e3, e1)) {
      n = Vector.j;
    }
    if (e3 <= Math.min(e1, e2)) {
      n = Vector.k;
    }
    n = this.orthComp(n, v).toUnitVector();
    return n;
  };

  /** Transpose a (column) vector to a row matrix.

        @param {Vector} v The vector.
        @return {Matrix} A row-matrix that is the transpose of v.
    */
  PrairieGeom.prototype.vecTranspose = function (v) {
    return $M([v.elements]);
  };

  /** Condition number of a matrix.

        @param {Array} m The matrix (array of arrays).
        @return {Number} The condition number of m.
    */
  PrairieGeom.prototype.cond = function (m) {
    var svd = numeric.svd(m);
    var cond = _.max(svd.S) / _.min(svd.S);
    return cond;
  };

  /** Convert everything to a 2D matrix (array of array of scalars).

        @param {Object} data A scalar, Vector, Matrix, or array.
        @return {Array} An array of arrays of scalars.
    */
  PrairieGeom.prototype.ensureArray2D = function (data) {
    if (typeof data === 'number') {
      return [[data]];
    } else if (data instanceof Vector) {
      return _(data.elements).map(function (e) {
        return [e];
      });
    } else if (data instanceof Matrix) {
      return data.elements;
    } else if (data instanceof Array) {
      if (data.length === 0) return [[]];
      if (typeof data[0] === 'number') {
        return _(data).map(function (e) {
          return [e];
        });
      }
    }
    return data;
  };

  /** Concatenate array matrices horizontally.

        @param {Array} m1 First matrix.
        @param {Array} m2 Second matrix.
        @return {Array} The matrix [m1 m2].
    */
  PrairieGeom.prototype.hConcatArray2D = function (m1, m2) {
    if (m1 === undefined) return m2;
    return _.map(_.zip(m1, m2), function (r) {
      return r[0].concat(r[1]);
    });
  };

  /** Concatenate array matrices vertically.

        @param {Array} m1 First matrix.
        @param {Array} m2 Second matrix.
        @return {Array} The matrix [m1^T m2^T]^T.
    */
  PrairieGeom.prototype.vConcatArray2D = function (m1, m2) {
    if (m1 === undefined) return m2;
    return m1.concat(m2);
  };

  /** Assemble blocks (scalars, vectors, or matrices) into a matrix.

        @param {Array} blocks An array of arrays giving blocks of the matrix.
        @return {Array} The resulting matrix array.
    */
  PrairieGeom.prototype.blocksToMatrix = function (blocks) {
    var that = this;
    return _.chain(blocks)
      .map(function (r) {
        return _.chain(r).map(that.ensureArray2D).reduce(that.hConcatArray2D, undefined).value();
      })
      .reduce(that.vConcatArray2D, undefined)
      .value();
  };

  /** Extract columns from a matrix.

        @param {Array} m The matrix.
        @param {Array} colList The list of column numbers (0-based).
        @return {Array} The matrix of columns.
    */
  PrairieGeom.prototype.getColsArray2D = function (m, colList) {
    return _(m).map(function (r) {
      return _(colList).map(function (i) {
        return r[i];
      });
    });
  };

  /** Extract entries from a vector.

        @param {Array} v The vector.
        @param {Array} indList The list of indexes (0-based).
        @return {Array} The vector of elements.
    */
  PrairieGeom.prototype.getElemsArray = function (v, indList) {
    return _(indList).map(function (i) {
      return v[i];
    });
  };

  /** Solve a linear system with partially specified data.

        @param {Array} lhs The left-hand-side.
        @param {Array} rhs The right-hand-side.
        @param {Array} givenVars A boolean array with true entries being specified variables.
        @param {Array} vars An array with entries giving the partially complete data.
        @return {Array} The complete solution.
    */
  PrairieGeom.prototype.solveRemainingVars = function (lhs, rhs, givenVars, vars) {
    var givenInds = [],
      givenX = [],
      findInds = [];
    _(givenVars).each(function (g, i) {
      if (g) {
        givenInds.push(i);
        givenX.push(vars[i]);
      } else {
        findInds.push(i);
      }
    });
    var givenLHS = this.getColsArray2D(lhs, givenInds);
    var findLHS = this.getColsArray2D(lhs, findInds);
    var finalRHS = numeric.sub(rhs, numeric.dot(givenLHS, givenX));

    if (Math.abs(numeric.det(findLHS)) < 1e-8) return null;
    var LU = numeric.LU(findLHS);
    var x = numeric.LUsolve(LU, finalRHS);

    var ans = _(vars).map(_.identity);
    _(findInds).each(function (ind, i) {
      ans[ind] = x[i];
    });

    return ans;
  };

  /** Solve A sin(x) + B cos(x) = C for x.

        @param {Number} A First coefficent.
        @param {Number} B Second coefficent.
        @param {Number} C Right hand side.
        @return {Number} The solution x in [0, 2 * pi).
    */
  PrairieGeom.prototype.solveSinCos = function (A, B, C) {
    var norm = Math.sqrt(A * A + B * B);
    var y = Math.atan2(B, A);
    var x = Math.asin(C / norm) - y;
    x = this.fixedMod(x, 2 * Math.PI);
    return x;
  };

  /** Compute a bounding box for a set of points in 2D.

        @param {Array} points Array of vectors giving point locations.
        @return {Object} A bounding box object with properties "bottomLeft", "bottomRight", "topLeft", "topRight", "center", and "extent".
    */
  PrairieGeom.prototype.boundingBox2D = function (points) {
    var xMin = points[0].e(1);
    var xMax = points[0].e(1);
    var yMin = points[0].e(2);
    var yMax = points[0].e(2);
    for (var i = 1; i < points.length; i++) {
      xMin = Math.min(xMin, points[i].e(1));
      xMax = Math.max(xMax, points[i].e(1));
      yMin = Math.min(yMin, points[i].e(2));
      yMax = Math.max(yMax, points[i].e(2));
    }
    return {
      bottomLeft: $V([xMin, yMin]),
      bottomRight: $V([xMax, yMin]),
      topLeft: $V([xMin, yMax]),
      topRight: $V([xMax, yMax]),
      center: $V([(xMin + xMax) / 2, (yMin + yMax) / 2]),
      extent: $V([xMax - xMin, yMax - yMin]),
    };
  };

  /** Test whether a point is inside a bounding box.

        @param {Vector} lower Lower corner of the bounding box (each component most negative).
        @param {Vector} upper Upper corner of the bounding box (each component most positive).
        @param {Vector} point Point to test.
        @return {Boolean} True if point is between lower and upper, otherwise false.
    */
  PrairieGeom.prototype.insideBoundingBox = function (lower, upper, point) {
    var n = point.elements.length;
    var inside = true;
    for (var i = 1; i < n + 1; i++) {
      if (point.e(i) < lower.e(i) || point.e(i) > upper.e(i)) inside = false;
    }
    return inside;
  };

  /** Test whether all points are inside a bounding box.

        @param {Vector} lower Lower corner of the bounding box (each component most negative).
        @param {Vector} upper Upper corner of the bounding box (each component most positive).
        @param {Array} points Points to test.
        @return {Boolean} True if point is between lower and upper, otherwise false.
    */
  PrairieGeom.prototype.allInsideBoundingBox = function (lower, upper, points) {
    var allInside = true;
    for (var i = 0; i < points.length; i++) {
      allInside = allInside && this.insideBoundingBox(lower, upper, points[i]);
    }
    return allInside;
  };

  /** Max and min dists between points in a set.

        @param {Array} points An array of points.
        @return {Object} An object with properties "minDist" and "maxDist".
    */
  PrairieGeom.prototype.pointSetDists = function (points) {
    if (points.length < 2) return { minDist: 0, maxDist: 0 };
    var d, maxDist, minDist;
    for (var i = 0; i < points.length; points++) {
      for (var j = i + 1; j < points.length; j++) {
        d = points[i].subtract(points[j]).modulus();
        if (i === 0 && j === 1) {
          maxDist = d;
          minDist = d;
        } else {
          maxDist = Math.max(maxDist, d);
          minDist = Math.min(minDist, d);
        }
      }
    }
    return {
      minDist: minDist,
      maxDist: maxDist,
    };
  };

  /** On which side of a line segment does another line segment lie in 2D?

        @param {Vector} a0 Start of first line segment (2D).
        @param {Vector} a1 End of first line segment (2D).
        @param {Vector} b0 Start of second line segment (2D).
        @param {Vector} b1 End of second line segment (2D).
        @return {Number} The side (1 or -1) of segment a on which segment b lies.
    */
  PrairieGeom.prototype.lineSegmentOnSide = function (a0, a1, b0, b1) {
    // make b point the same way as a
    if (b1.subtract(b0).dot(a1.subtract(a0)) < 0) {
      var tmp = b1;
      b1 = b0;
      b0 = tmp;
    }
    var side;
    var a = a1.subtract(a0);
    var b = b1.subtract(b0);
    var bPerp = this.perp(b);
    var denom = a.dot(bPerp);
    if (Math.abs(denom) < 1e-8) {
      // colinear
      side = this.sign(this.cross2DOut(b0.subtract(a0), a));
    } else {
      // fraction along (a0,a1) of the line intersection
      var lambda = b0.subtract(a0).dot(bPerp) / denom;
      if (Math.abs(lambda - 0.5) > 0.1) {
        // intersection is not near center of segment a
        side = this.sign(lambda - 0.5) * this.sign(this.cross2DOut(a, b));
      } else {
        // intersection near center of segment a
        var c = a0.x(1 - lambda).add(a1.x(lambda)); // intersection
        // bf is b0 or b1, whichever is furthest from c
        var bf = b1.subtract(c).modulus() > b0.subtract(c).modulus() ? b1 : b0;
        side = this.sign(this.cross2DOut(bf.subtract(c), a));
      }
    }
    if (side === 0)
      // degenerate case
      side = 1;
    return side;
  };

  /*****************************************************************************/

  /** Return an identity transformation matrix.

        @return {Matrix} An identity transformation.
    */
  PrairieGeom.prototype.identityTransform = function () {
    return Matrix.I(3);
  };

  /** Scale a transformation matrix.

        @param {Matrix} transform The original transformation.
        @param {Vector} factor Scale factors.
        @return {Matrix} The new transformation.
    */
  PrairieGeom.prototype.scaleTransform = function (transform, factor) {
    return transform.x(
      $M([
        [factor.e(1), 0, 0],
        [0, factor.e(2), 0],
        [0, 0, 1],
      ]),
    );
  };

  /** Translate a transformation matrix.

        @param {Matrix} transform The original transformation.
        @param {Vector} offset Translation offset (drawing coords).
        @return {Matrix} The new transformation.
    */
  PrairieGeom.prototype.translateTransform = function (transform, offset) {
    return transform.x(
      $M([
        [1, 0, offset.e(1)],
        [0, 1, offset.e(2)],
        [0, 0, 1],
      ]),
    );
  };

  /** Rotate a transformation matrix.

        @param {Matrix} transform The original transformation.
        @param {number} angle Angle to rotate by (radians).
        @return {Matrix} The new transformation.
    */
  PrairieGeom.prototype.rotateTransform = function (transform, angle) {
    return transform.x(Matrix.RotationZ(angle));
  };

  /** Transform a transformation matrix (scale, translate, rotate) to
        match old points to new. Drawing at the old locations will result
        in points at the new locations.

        @param {Matrix} transform The original transformation.
        @param {Vector} old1 The old location of point 1.
        @param {Vector} old2 The old location of point 2.
        @param {Vector} new1 The new location of point 1.
        @param {Vector} new2 The new location of point 2.
        @return {Matrix} The new transformation.
    */
  PrairieGeom.prototype.transformByPointsTransform = function (transform, old1, old2, new1, new2) {
    var oldMid = old1.add(old2).x(0.5);
    var newMid = new1.add(new2).x(0.5);
    var oldDelta = old2.subtract(old1);
    var newDelta = new2.subtract(new1);

    var factor = newDelta.modulus() / oldDelta.modulus();
    var angle = this.angleFrom(oldDelta, newDelta);

    var newTransform = transform;
    newTransform = this.translateTransform(newTransform, newMid);
    newTransform = this.rotateTransform(newTransform, angle);
    newTransform = this.scaleTransform(newTransform, $V([factor, factor]));
    newTransform = this.translateTransform(newTransform, oldMid.x(-1));
    return newTransform;
  };

  /*****************************************************************************/

  /** Transform a vector by a transformation matrix.

        @param {Matrix} transform The transformation matrix.
        @param {Vector} vec The vector.
        @return {Vector} The transformed vector.
    */
  PrairieGeom.prototype.transformVec = function (transform, vec) {
    var v3 = transform.x($V([vec.e(1), vec.e(2), 0]));
    return $V([v3.e(1), v3.e(2)]);
  };

  /** Transform a position by a transformation matrix.

        @param {Matrix} transform The transformation matrix.
        @param {Vector} pos The position.
        @return {Vector} The transformed position.
    */
  PrairieGeom.prototype.transformPos = function (transform, pos) {
    var p3 = transform.x($V([pos.e(1), pos.e(2), 1]));
    return $V([p3.e(1), p3.e(2)]);
  };

  /*****************************************************************************/

  /** Return a 3D identity transformation matrix.

        @return {Matrix} A 3D identity transformation.
    */
  PrairieGeom.prototype.identityTransform3D = function () {
    return Matrix.I(4);
  };

  /** Scale a 3D transformation matrix.

        @param {Matrix} transform The original 3D transformation.
        @param {Vector} factor Scale factor.
        @return {Matrix} The new 3D transformation.
    */
  PrairieGeom.prototype.scaleTransform3D = function (transform, factor) {
    return transform.x(
      $M([
        [factor, 0, 0, 0],
        [0, factor, 0, 0],
        [0, 0, factor, 0],
        [0, 0, 1],
      ]),
    );
  };

  /** Translate a 3D transformation matrix.

        @param {Matrix} transform The original 3D transformation.
        @param {Vector} offset Translation 3D offset.
        @return {Matrix} The new 3D transformation.
    */
  PrairieGeom.prototype.translateTransform3D = function (transform, offset) {
    return transform.x(
      $M([
        [1, 0, 0, offset.e(1)],
        [0, 1, 0, offset.e(2)],
        [0, 0, 1, offset.e(3)],
        [0, 0, 0, 1],
      ]),
    );
  };

  /** @private Extend a 3D matrix to a 4D matrix.

        @param {Matrix} mat3D The 3D matrix.
        @return {Matrix} mat4D The augmented 4D matrix.
    */
  PrairieGeom.prototype.toM4 = function (mat3D) {
    var r1 = mat3D.row(1).elements;
    var r2 = mat3D.row(2).elements;
    var r3 = mat3D.row(3).elements;
    r1.push(0);
    r2.push(0);
    r3.push(0);
    var r4 = [0, 0, 0, 1];
    return $M([r1, r2, r3, r4]);
  };

  /** Rotate a 3D transformation matrix about the X axis.

        @param {Matrix} transform The original 3D transformation.
        @param {number} angleX Angle to rotate by around the X axis (radians).
        @return {Matrix} The new 3D transformation.
    */
  PrairieGeom.prototype.rotateTransform3DX = function (transform, angleX) {
    return transform.x(this.toM4(Matrix.RotationX(angleX)));
  };

  /** Rotate a 3D transformation matrix about the Y axis.

        @param {Matrix} transform The original 3D transformation.
        @param {number} angleY Angle to rotate by around the Y axis (radians).
        @return {Matrix} The new 3D transformation.
    */
  PrairieGeom.prototype.rotateTransform3DY = function (transform, angleY) {
    return transform.x(this.toM4(Matrix.RotationY(angleY)));
  };

  /** Rotate a 3D transformation matrix about the Z axis.

        @param {Matrix} transform The original 3D transformation.
        @param {number} angleZ Angle to rotate by around the Z axis (radians).
        @return {Matrix} The new 3D transformation.
    */
  PrairieGeom.prototype.rotateTransform3DZ = function (transform, angleZ) {
    return transform.x(this.toM4(Matrix.RotationZ(angleZ)));
  };

  /** Rotate a 3D transformation matrix.

        @param {Matrix} transform The original 3D transformation.
        @param {number} angleX Angle to rotate by around the X axis (radians).
        @param {number} angleY Angle to rotate by around the Y axis (radians).
        @param {number} angleZ Angle to rotate by around the Z axis (radians).
        @return {Matrix} The new 3D transformation.
    */
  PrairieGeom.prototype.rotateTransform3D = function (transform, angleX, angleY, angleZ) {
    return this.rotateTransform3DZ(
      this.rotateTransform3DY(this.rotateTransform3DX(transform, angleX), angleY),
      angleZ,
    );
  };

  /*****************************************************************************/

  /** Transform a 3D vector by a 3D transformation matrix.

        @param {Matrix} transform The 3D transformation matrix.
        @param {Vector} vec The 3D vector.
        @return {Vector} The transformed 3D vector.
    */
  PrairieGeom.prototype.transformVec3D = function (transform, vec) {
    var v4 = transform.x($V([vec.e(1), vec.e(2), vec.e(3), 0]));
    return $V([v4.e(1), v4.e(2), v4.e(3)]);
  };

  /** Transform a 3D position by a 3D transformation matrix.

        @param {Matrix} transform The 3D transformation matrix.
        @param {Vector} pos The 3D position.
        @return {Vector} The transformed 3D position.
    */
  PrairieGeom.prototype.transformPos3D = function (transform, pos) {
    var p4 = transform.x($V([pos.e(1), pos.e(2), pos.e(3), 1]));
    return $V([p4.e(1), p4.e(2), p4.e(3)]);
  };

  /** Transform a 3D position to a 2D position by an orthographic projection.

        @param {Vector} pos The 3D position.
        @return {Vector} The transformed 3D position.
    */
  PrairieGeom.prototype.orthProjPos3D = function (pos) {
    return $V([pos.e(1), pos.e(2)]);
  };

  /*****************************************************************************/

  /** Compute the sup-norm of a vector.

        @param {Vector} vector The vector to find the norm of.
        @return {number} The sup-norm.
    */
  PrairieGeom.prototype.supNorm = function (vector) {
    return Math.abs(vector.max());
  };

  /** Take a cross product between an out-of-plane vector and a 2D vector.

        @param {Number} v1k Out-of-plane component of the first vector.
        @param {Vector} v2ij In-plane components of the second vector.
        @return {Vector} A 2D vector given by v1 x v2.
    */
  PrairieGeom.prototype.cross2D = function (v1k, v2ij) {
    return $V([-v1k * v2ij.e(2), v1k * v2ij.e(1)]);
  };

  /** Take a cross product between two 2D vectors.

        @param {Vector} v1 First 2D vector.
        @param {Vector} v2 Second 2D vector.
        @return {Number} The third component of the cross product.
    */
  PrairieGeom.prototype.cross2DOut = function (v1, v2) {
    return v1.e(1) * v2.e(2) - v1.e(2) * v2.e(1);
  };

  /** Create a 2D unit vector pointing at a given angle.

        @param {number} angle The counterclockwise angle from the positive x axis (radians).
        @return {Vector} A unit vector in direction angle.
    */
  PrairieGeom.prototype.vector2DAtAngle = function (angle) {
    return $V([Math.cos(angle), Math.sin(angle)]);
  };

  /** Find the counterclockwise angle of the vector from the x axis.

        @param {Vector} vec The vector to find the angle of.
        @return {number} The counterclockwise angle of vec from the x axis.
    */
  PrairieGeom.prototype.angleOf = function (vec) {
    var a = Math.atan2(vec.e(2), vec.e(1));
    if (a < 0) {
      a = a + 2 * Math.PI;
    }
    return a;
  };

  /** Find the counterclockwise angle from the vector vFrom to the vector vTo.

        @param {Vector} vFrom The starting vector.
        @param {Vector} vTo The ending vector.
        @return {number} The counterclockwise angle from vFrom to vTo.
    */
  PrairieGeom.prototype.angleFrom = function (vFrom, vTo) {
    return this.angleOf(vTo) - this.angleOf(vFrom);
  };

  /** Return a textual description of a direction angle (to within 45 degrees).

        @param {Number} angle The angle.
        @return {String} A description of the direction.
    */
  PrairieGeom.prototype.dirDescription = function (angle) {
    var dir = Math.round((angle / (2 * Math.PI)) * 8);
    dir = this.fixedMod(dir, 8);
    var dirDescriptions = [
      'rightwards',
      'up and right',
      'upwards',
      'up and left',
      'leftwards',
      'down and left',
      'downwards',
      'down and right',
    ];
    return dirDescriptions[dir];
  };

  /** Determine a triangle angle from the three side lengths.

        @param {number} a First adjacent side length.
        @param {number} b Second adjacent side length.
        @param {number} c Opposite side length.
        @return {number} The angle C opposite to side c.
    */
  PrairieGeom.prototype.cosLawAngle = function (a, b, c) {
    if (a > 0 && b > 0) {
      var C = Math.acos((a * a + b * b - c * c) / (2 * a * b));
      return C;
    } else {
      return 0;
    }
  };

  /** Determine a triangle side length from two side lengths and the included angle.

        @param {number} a First adjacent side length.
        @param {number} b Second adjacent side length.
        @param {number} C Angle between sides a and b.
        @return {number} The side length c opposite to angle C.
    */
  PrairieGeom.prototype.cosLawLength = function (a, b, C) {
    var c = Math.sqrt(a * a + b * b - 2 * a * b * Math.cos(C));
    return c;
  };

  /** Return the sign of the argument.

        @param {number} x The argument to find the sign of.
        @return {number} Either -1/0/+1 if x is negative/zero/positive.
    */
  PrairieGeom.prototype.sign = function (x) {
    if (x > 0) {
      return 1;
    } else if (x < 0) {
      return -1;
    } else {
      return 0;
    }
  };

  /** Linearly interpolate between two numbers.

        @param {number} x0 The first number.
        @param {number} x1 The second number.
        @param {number} alpha The proportion of x1 versus x0 (between 0 and 1).
        @return {number} The quanity (1 - alpha) * x0 + alpha * x1.
    */
  PrairieGeom.prototype.linearInterp = function (x0, x1, alpha) {
    return (1 - alpha) * x0 + alpha * x1;
  };

  /** Linearly symmetrically interpolate between two numbers (-1 to 1).

        @param {number} x0 The first number.
        @param {number} x1 The second number.
        @param {number} alpha The proportion of x1 versus x0 (between -1 and 1).
        @return {number} The quanity 0.5 * (1 - alpha) * x0 + 0.5 * (1 + alpha) * x1.
    */
  PrairieGeom.prototype.linearSymInterp = function (x0, x1, alpha) {
    return 0.5 * (1 - alpha) * x0 + 0.5 * (1 + alpha) * x1;
  };

  /** Linearly de-interpolate between two numbers.

        @param {number} x0 The first number.
        @param {number} x1 The second number.
        @param {number} x The value to be de-interpolated.
        @return {number} The value alpha so that x = linearInterp(x0, x1, alpha).
    */
  PrairieGeom.prototype.linearDeinterp = function (x0, x1, x) {
    return (x - x0) / (x1 - x0);
  };

  /** Linearly map based on two points.

        @param {number} x0 The first number.
        @param {number} x1 The second number.
        @param {number} y0 The image of x0.
        @param {number} y1 The image of y1.
        @param {number} x The value to be mapped.
        @param {number} The value y that x maps to.
    */
  PrairieGeom.prototype.linearMap = function (x0, x1, y0, y1, x) {
    return this.linearInterp(y0, y1, this.linearDeinterp(x0, x1, x));
  };

  /** Linearly interpolate between two vectors.

        @param {Vector} x0 The first vector.
        @param {Vector} x1 The second vector.
        @param {number} alpha The proportion of x1 versus x0 (between 0 and 1).
        @return {number} The quanity (1 - alpha) * x0 + alpha * x1.
    */
  PrairieGeom.prototype.linearInterpVector = function (x0, x1, alpha) {
    return x0.x(1 - alpha).add(x1.x(alpha));
  };

  /** Linearly symmetrically interpolate between two vectors (-1 to 1).

        @param {Vector} x0 The first vector.
        @param {Vector} x1 The second vector.
        @param {number} alpha The proportion of x1 versus x0 (between -1 and 1).
        @return {number} The quanity 0.5 * (1 - alpha) * x0 + 0.5 * (1 + alpha) * x1.
    */
  PrairieGeom.prototype.linearSymInterpVector = function (x0, x1, alpha) {
    return x0.x(0.5 * (1 - alpha)).add(x1.x(0.5 * (1 + alpha)));
  };

  /** Linearly interpolate between two arrays.

        @param {Array} a0 The first array.
        @param {Array} a1 The second array.
        @param {number} alpha The proportion of a1 versus a0 (between 0 and 1).
        @return {Array} The state (1 - alpha) * a0 + alpha * a1.
    */
  PrairieGeom.prototype.linearInterpArray = function (a0, a1, alpha) {
    var newArray = [];
    for (var i = 0; i < Math.min(a0.length, a1.length); i++) {
      newArray.push(this.linearInterp(a0[i], a1[i], alpha));
    }
    return newArray;
  };

  /** Linearly interpolate between two states (objects with scalar members).

        @param {Object} s0 The first state.
        @param {Object} s1 The second state.
        @param {number} alpha The proportion of s1 versus s0 (between 0 and 1).
        @return {Object} The state (1 - alpha) * s0 + alpha * s1.
    */
  PrairieGeom.prototype.linearInterpState = function (s0, s1, alpha) {
    var newState = {};
    for (var e in s0) {
      newState[e] = this.linearInterp(s0[e], s1[e], alpha);
    }
    return newState;
  };

  /** Duplicate a state (object with scalar membes).

        @param {Object} state The state to duplicate.
        @return {number} A copy of the state.
    */
  PrairieGeom.prototype.dupState = function (state) {
    var newState = {};
    for (var e in state) {
      newState[e] = state[e];
    }
    return newState;
  };

  /*****************************************************************************/

  /* Evaluate the position of a cubic Bezier curve.

       @param {Number} t The time in [0,1].
       @param {Vector} p0 The starting point.
       @param {Vector} p1 The first control point.
       @param {Vector} p2 The second control point.
       @param {Vector} p3 The ending point.
       @return {Vector} The curve position at time t.
    */
  PrairieGeom.prototype.cubicBezierPos = function (t, p0, p1, p2, p3) {
    return p0
      .x(Math.pow(1 - t, 3))
      .add(p1.x(3 * t * Math.pow(1 - t, 2)))
      .add(p2.x(3 * (1 - t) * Math.pow(t, 2)))
      .add(p3.x(Math.pow(t, 3)));
  };

  /* Evaluate the derviative of a cubic Bezier curve.

       @param {Number} t The time in [0,1].
       @param {Vector} p0 The starting point.
       @param {Vector} p1 The first control point.
       @param {Vector} p2 The second control point.
       @param {Vector} p3 The ending point.
       @return {Vector} The curve derivative at time t.
    */
  PrairieGeom.prototype.cubicBezierVel = function (t, p0, p1, p2, p3) {
    var v0 = p1.subtract(p0);
    var v1 = p2.subtract(p1);
    var v2 = p3.subtract(p2);
    return v0
      .x(3 * Math.pow(1 - t, 2))
      .add(v1.x(6 * (1 - t) * t))
      .add(v2.x(3 * Math.pow(t, 2)));
  };

  /* Evaluate the second derivative of a cubic Bezier curve.

       @param {Number} t The time in [0,1].
       @param {Vector} p0 The starting point.
       @param {Vector} p1 The first control point.
       @param {Vector} p2 The second control point.
       @param {Vector} p3 The ending point.
       @return {Vector} The curve second derviative at time t.
    */
  PrairieGeom.prototype.cubicBezierAcc = function (t, p0, p1, p2, p3) {
    var a0 = p2.subtract(p1.x(2)).add(p0);
    var a1 = p3.subtract(p2.x(2)).add(p1);
    return a0.x(6 * (1 - t)).add(a1.x(6 * t));
  };

  /*****************************************************************************/

  PrairieGeom.prototype.numDiff = function (f, t) {
    var eps = 1e-4;

    var x0 = f(t - eps);
    var x1 = f(t);
    var x2 = f(t + eps);
    var d = {};
    d.diff = {};
    d.ddiff = {};
    for (var e in x0) {
      if (x0[e] instanceof Vector) {
        d[e] = x1[e];
        d.diff[e] = x1[e].subtract(x0[e]).x(1 / eps);
        d.ddiff[e] = x2[e]
          .subtract(x1[e].x(2))
          .add(x0[e])
          .x(1 / (eps * eps));
      } else {
        d[e] = x1[e];
        d.diff[e] = (x1[e] - x0[e]) / eps;
        d.ddiff[e] = (x2[e] - 2 * x1[e] + x0[e]) / (eps * eps);
      }
    }
    return d;
  };

  /*****************************************************************************/

  /** Find the output angle beta for a four-bar linkage.

        @param {number} g Ground link length.
        @param {number} f Input link length.
        @param {number} a Output link length.
        @param {number} b Floating link length.
        @param {number} alpha Input angle.
        @param {bool} flipped Whether the output-floating triangle is flipped.
        @return {number} Output angle beta.
    */
  PrairieGeom.prototype.solveFourBar = function (g, f, a, b, alpha, flipped) {
    var l = this.cosLawLength(a, g, alpha);
    var beta1 = this.cosLawAngle(g, l, a);
    var beta2 = this.cosLawAngle(l, b, f);
    if (Math.sin(alpha) > 0) {
      if (flipped) {
        return Math.PI - beta1 + beta2;
      } else {
        return Math.PI - beta1 - beta2;
      }
    } else {
      if (flipped) {
        return Math.PI + beta1 + beta2;
      } else {
        return Math.PI + beta1 - beta2;
      }
    }
  };

  /*****************************************************************************/

  /** Covert an array of offsets to absolute points.

        @param {Array} offsets A list of offset vectors.
        @return {Array} The corresponding absolute points.
    */
  PrairieGeom.prototype.offsets2Points = function (offsets) {
    var points = [];
    if (offsets.length < 1) {
      return;
    }
    points[0] = offsets[0].dup();
    for (var i = 1; i < offsets.length; i++) {
      points[i] = points[i - 1].add(offsets[i]);
    }
    return points;
  };

  /** Rotate a list of points by a given angle.

        @param {Array} points A list of points.
        @param {number} angle The angle to rotate by (radians, counterclockwise).
        @return {Array} A list of rotated points.
    */
  PrairieGeom.prototype.rotatePoints = function (points, angle) {
    var rotM = Matrix.RotationZ(angle);
    var newPoints = [],
      p;
    for (var i = 0; i < points.length; i++) {
      p = rotM.x($V([points[i].e(1), points[i].e(2), 0]));
      newPoints.push($V([p.e(1), p.e(2)]));
    }
    return newPoints;
  };

  /** Translate a list of points by a given offset.

        @param {Array} points A list of points.
        @param {Vector} offset The offset to translate by.
        @return {Array} A list of translated points.
    */
  PrairieGeom.prototype.translatePoints = function (points, offset) {
    var newPoints = [];
    for (var i = 0; i < points.length; i++) {
      newPoints.push(points[i].add(offset));
    }
    return newPoints;
  };

  /** Scale a list of points by given horizontal and vertical factors.

        @param {Array} points A list of points.
        @param {Vector} scale The scale in each component.
        @return {Array} A list of scaled points.
    */
  PrairieGeom.prototype.scalePoints = function (points, scale) {
    var newPoints = [],
      p;
    for (var i = 0; i < points.length; i++) {
      p = $V([points[i].e(1) * scale.e(1), points[i].e(2) * scale.e(2)]);
      newPoints.push(p);
    }
    return newPoints;
  };

  /** Print a list of points to the console as an array of vectors.

        @param {string} name The name of the array.
        @param {Array} points A list of points.
        @param {number} numDecPlaces The number of decimal places to print.
    */
  PrairieGeom.prototype.printPoints = function (name, points, numDecPlaces) {
    console.log(name + ': [');
    for (var i = 0; i < points.length; i++) {
      /* jshint laxbreak: true */
      console.log(
        '$V([' +
          points[i].e(1).toFixed(numDecPlaces) +
          ', ' +
          points[i].e(2).toFixed(numDecPlaces) +
          ']),',
      );
    }
    console.log('],');
  };

  /*****************************************************************************/

  /** Evaluate a polynomial at a point.

        @param {Array} poly The coefficient array [a_0, a_1, ..., a_n].
        @param {Number} x The independent variable value to evaluate at.
        @return {Number} The value of the polynomial at x.
    */
  PrairieGeom.prototype.evalPoly = function (poly, x) {
    var i,
      y = 0;
    for (i = 0; i < poly.length; i++) {
      y += poly[i] * Math.pow(x, i);
    }
    return y;
  };

  /** Evaluate an array of polynomials at a point.

        @param {Array} polyArray The array of polynomials [p1, p2, ...].
        @param {Number} x The independent variable value to evaluate at.
        @return {Array} The value of the polynomials at x [p1(x), p2(x), ...].
    */
  PrairieGeom.prototype.evalPolyArray = function (polyArray, x) {
    var i,
      yArray = [];
    for (i = 0; i < polyArray.length; i++) {
      yArray.push(this.evalPoly(polyArray[i], x));
    }
    return yArray;
  };

  /** Differentiate a polynomial.

        @param {Array} poly The coefficient array [a_0, a_1, ..., a_n].
        @return {Array} The coefficient array of the derivative polynomial [a_1, 2 * a_2, ...].
    */
  PrairieGeom.prototype.diffPoly = function (poly) {
    var i,
      d = [];
    if (poly.length < 2) {
      return [0];
    }
    for (i = 1; i < poly.length; i++) {
      d.push(i * poly[i]);
    }
    return d;
  };

  /** Differentiate an array of polynomials.

        @param {Array} polyArray The array of polynomials [p1, p2, ...].
        @return {Array} The derivatives of the polynomials [p1', p2', ...].
    */
  PrairieGeom.prototype.diffPolyArray = function (polyArray) {
    var i,
      dArray = [];
    for (i = 0; i < polyArray.length; i++) {
      dArray.push(this.diffPoly(polyArray[i]));
    }
    return dArray;
  };

  /** Integrate a polynomial.

        @param {Array} poly The coefficient array [a_0, a_1, ..., a_n].
        @return {Array} The coefficient array of the integrated polynomial [0, a_0, a_1 / 2, ...].
    */
  PrairieGeom.prototype.intPoly = function (poly) {
    var i,
      a = [0];
    for (i = 0; i < poly.length; i++) {
      a.push(poly[i] / (i + 1));
    }
    return a;
  };

  /** Integrate an array of polynomials.

        @param {Array} polyArray The array of polynomials [p1, p2, ...].
        @return {Array} The integrals of the polynomials [\int p1, \int p2, ...].
    */
  PrairieGeom.prototype.intPolyArray = function (polyArray) {
    var i,
      aArray = [];
    for (i = 0; i < polyArray.length; i++) {
      aArray.push(this.intPoly(polyArray[i]));
    }
    return aArray;
  };

  /** Multiply (convolve) two polynomials.

        @param {Array} poly1 The coefficient array [a_0, a_1, ..., a_n].
        @param {Array} poly2 The coefficient array [b_0, b_1, ..., b_n].
        @return {Array} The product polynomial.
    */
  PrairieGeom.prototype.prodPoly = function (poly1, poly2) {
    var p = [],
      i,
      j;
    for (i = 0; i < poly1.length + poly2.length - 1; i++) p.push(0);
    for (i = 0; i < poly1.length; i++)
      for (j = 0; j < poly2.length; j++) p[i + j] += poly1[i] * poly2[j];
    return p;
  };

  /*****************************************************************************/

  /** Evaluate an exponential at a point.

        @param {Object} exp The exponential object.
        @param {Number} x The independent variable value to evaluate at.
        @return {Number} The value of the function at x.
    */
  PrairieGeom.prototype.evalExp = function (exp, x) {
    return exp.coeff * Math.exp(exp.exp * x);
  };

  /** Differentiate an exponential.

        @param {Object} exp The exponential object.
        @return {Object} The derivative object.
    */
  PrairieGeom.prototype.diffExp = function (exp) {
    return {
      coeff: exp.coeff * exp.exp,
      exp: exp.exp,
    };
  };

  /** Integrate an exponential.

        @param {Object} exp The exponential object.
        @return {Object} The integral object.
    */
  PrairieGeom.prototype.intExp = function (exp) {
    return {
      coeff: exp.coeff / exp.exp,
      exp: exp.exp,
    };
  };

  /*****************************************************************************/

  /** Evaluate a trig function at a point.

        @param {Object} trig The trig function object.
        @param {Number} x The independent variable value to evaluate at.
        @return {Number} The value of the function at x.
    */
  PrairieGeom.prototype.evalTrig = function (trig, x) {
    if (trig.fcn === 'sin') {
      return trig.coeff * Math.sin(trig.freq * x);
    } else {
      return trig.coeff * Math.cos(trig.freq * x);
    }
  };

  /** Differentiate a trig function.

        @param {Object} trig The trig function object.
        @return {Object} The derivative object.
    */
  PrairieGeom.prototype.diffTrig = function (trig) {
    if (trig.fcn === 'sin') {
      return {
        coeff: trig.coeff * trig.freq,
        fcn: 'cos',
        freq: trig.freq,
      };
    } else {
      return {
        coeff: -trig.coeff * trig.freq,
        fcn: 'sin',
        freq: trig.freq,
      };
    }
  };

  /** Integrate a trig function.

        @param {Object} trig The trig function object.
        @return {Object} The integral object.
    */
  PrairieGeom.prototype.intTrig = function (trig) {
    if (trig.fcn === 'sin') {
      return {
        coeff: -trig.coeff / trig.freq,
        fcn: 'cos',
        freq: trig.freq,
      };
    } else {
      return {
        coeff: trig.coeff / trig.freq,
        fcn: 'sin',
        freq: trig.freq,
      };
    }
  };

  /*****************************************************************************/

  /** Evaluate a function at a point.

        @param {Object} fcn The function object.
        @param {Number} x The independent variable value to evaluate at.
        @return {Number} The value of the function at x.
    */
  PrairieGeom.prototype.evalFcn = function (fcn, x) {
    /* jshint indent: false */
    switch (fcn.fcn) {
      case 'poly':
        return this.evalPoly(fcn.data, x);
      case 'exp':
        return this.evalExp(fcn.data, x);
      case 'trig':
        return this.evalTrig(fcn.data, x);
    }
  };

  /** Differentiate a function.

        @param {Object} fcn The function object.
        @return {Object} The derivative object.
    */
  PrairieGeom.prototype.diffFcn = function (fcn) {
    /* jshint indent: false */
    switch (fcn.fcn) {
      case 'poly':
        return { fcn: 'poly', data: this.diffPoly(fcn.data) };
      case 'exp':
        return { fcn: 'exp', data: this.diffExp(fcn.data) };
      case 'trig':
        return { fcn: 'trig', data: this.diffTrig(fcn.data) };
    }
  };

  /** Integrate a function.

        @param {Object} fcn The function object.
        @return {Object} The integral object.
    */
  PrairieGeom.prototype.intFcn = function (fcn) {
    /* jshint indent: false */
    switch (fcn.fcn) {
      case 'poly':
        return { fcn: 'poly', data: this.intPoly(fcn.data) };
      case 'exp':
        return { fcn: 'exp', data: this.intExp(fcn.data) };
      case 'trig':
        return { fcn: 'trig', data: this.intTrig(fcn.data) };
    }
  };

  /*****************************************************************************/

  /** Evaluate an array of functions at a point.

        @param {Array} arr The array of function object.
        @param {Number} x The independent variable value to evaluate at.
        @return {Array} The arry of values of the functions at x.
    */
  PrairieGeom.prototype.evalFcnArray = function (arr, x) {
    var yArr = [];
    for (var i = 0; i < arr.length; i++) {
      yArr.push(this.evalFcn(arr[i], x));
    }
    return yArr;
  };

  /** Differentiate an array of functions.

        @param {Array} arr The array of function objects.
        @return {Array} The array of derivative objects.
    */
  PrairieGeom.prototype.diffFcnArray = function (arr) {
    var dArr = [];
    for (var i = 0; i < arr.length; i++) {
      dArr.push(this.diffFcn(arr[i]));
    }
    return dArr;
  };

  /*****************************************************************************/

  /** Compute the vector angle error.

        @param {Vector} exact The exact value.
        @param {Vector} approx The approximate value.
        @return {Number} The angle error between the exact and approximate values (radians).
    */
  PrairieGeom.prototype.angleError = function (exact, approx) {
    return exact.angleFrom(approx);
  };

  /** Compute the vector magnitude error.

        @param {Vector} exact The exact value.
        @param {Vector} approx The approximate value.
        @return {Number} The magnitude error between the exact and approximate values.
    */
  PrairieGeom.prototype.magError = function (exact, approx) {
    return Math.abs(exact.modulus() - approx.modulus());
  };

  /** Compute the relative vector magnitude error.

        @param {Vector} exact The exact value.
        @param {Vector} approx The approximate value.
        @return {Number} The relative magnitude error between the exact and approximate values.
    */
  PrairieGeom.prototype.relMagError = function (exact, approx) {
    return this.relError(exact.modulus(), approx.modulus());
  };

  /** Transform an error in [0,Inf) to a score in [0,1], with error = tol mapping to score = 0.5. Also works for arrays of errors and tols.

        @param {Number} error The error value (or an array of error values).
        @param {Number} tol The tolerance to accept as correct (or an array of tolerances).
        @return {Number} The score (1 = no error, 0.5 = error is exactly tol, for arrays the pointwise minimum score is used).
    */
  PrairieGeom.prototype.errorToScore = function (error, tol) {
    if (_.isNumber(error) && _.isNumber(tol)) {
      var alpha = error / tol;
      if (alpha < 1) {
        return 1 - 0.5 * alpha;
      } else {
        return 0.5 * Math.exp(1 - alpha);
      }
    } else if (_.isArray(error) && _.isArray(tol)) {
      var score = 1;
      for (var i = 0; i < error.length; i++) {
        score = Math.min(score, this.errorToScore(error[i], tol[i]));
      }
      return score;
    } else {
      return 0;
    }
  };

  /** The Hamming distance between two arrays.

        @param {Array} a1 First array.
        @param {Array} a2 Second array.
        @return {Number} The number of elements that differ between a1 and a2.
    */
  PrairieGeom.prototype.hammingDistance = function (a1, a2) {
    var n = Math.max(a1.length, a2.length) - Math.min(a1.length, a2.length);
    for (var i = 0; i < Math.min(a1.length, a2.length); i++) if (a1[i] != a2[i]) n++;
    return n;
  };

  /** Compute a score from the difference between two boolean arrays. Guessing all true or all false will give zero.

        @param {Array} trueVals The array of true booleans.
        @param {Array} submittedVals The array of submitted booleans.
        @return {Number} The score (1 = no error, 0 = worse than guessing all true or all false).
    */
  PrairieGeom.prototype.hammingScore = function (trueVals, submittedVals) {
    var nTrue = 0,
      nFalse = 0,
      nWrong = 0;
    for (var i = 0; i < trueVals.length; i++) {
      if (trueVals[i]) nTrue++;
      else nFalse++;
      if (trueVals[i] !== submittedVals[i]) nWrong++;
    }
    var nWorst = Math.max(1, Math.min(nTrue, nFalse));
    var score = Math.max(0, nWorst - nWrong) / nWorst;
    return score;
  };

  /** Compute the L2 norm of an object (Number, Boolean, Array, Vector, Object).

        @param {Object} val The object value.
        @return {Number} The L2 norm of the value.
    */
  PrairieGeom.prototype.norm = function (val) {
    var that = this;
    if (_.isFinite(val)) {
      return Math.abs(val);
    } else if (_.isArray(val)) {
      return numeric.norm2(
        _(val).map(function (v) {
          return that.norm(v);
        }),
      );
    } else if (val instanceof Sylvester.Vector) {
      return val.modulus();
    } else if (_.isObject(val)) {
      if (!_.isObject(submittedVal)) return false;
      return numeric.norm2(
        _(val).map(function (v) {
          return that.norm(v);
        }),
      );
    } else {
      return Infinity;
    }
  };

  /** Compute the absolute error between two objects (Numbers, Booleans, Arrays, Vectors, Objects).

        @param {Object} trueVal The true object value.
        @param {Object} submittedVal The submitted object value.
        @return {Number} The absolute L2 error between trueVal and submittedVal.
    */
  PrairieGeom.prototype.absError = function (trueVal, submittedVal) {
    var that = this;
    var subVal;
    if (_.isFinite(trueVal)) {
      subVal = Number(submittedVal);
      return Math.abs(trueVal - subVal);
    } else if (_.isBoolean(trueVal)) {
      if (_.isBoolean(submittedVal)) subVal = submittedVal;
      else if (_.isString(submittedVal)) subVal = this.toBool(submittedVal);
      else return Infinity;
      return trueVal === subVal ? 0 : Infinity;
    } else if (_.isString(trueVal)) {
      subVal = String(submittedVal);
      return trueVal === subVal ? 0 : Infinity;
    } else if (_.isArray(trueVal)) {
      if (!_.isArray(submittedVal)) return Infinity;
      if (!trueVal.length === submittedVal.length) return Infinity;
      return numeric.norm2(
        _(_.zip(trueVal, submittedVal)).map(function (v) {
          return that.absError(v[0], v[1]);
        }),
      );
    } else if (trueVal instanceof Sylvester.Vector) {
      subVal = submittedVal;
      if (_.isArray(subVal)) subVal = $V(subVal);
      if (!(subVal instanceof Sylvester.Vector)) return Infinity;
      return trueVal.subtract(subVal).modulus();
    } else if (_.isObject(trueVal)) {
      if (!_.isObject(submittedVal)) return Infinity;
      return numeric.norm2(
        _(trueVal).map(function (val, key) {
          return that.absError(val, submittedVal[key]);
        }),
      );
    } else {
      return Infinity;
    }
  };

  /** Compute the relative error between two objects (Numbers, Arrays, Vectors, Objects).

        @param {Object} trueVal The true object value.
        @param {Object} submittedVal The submitted object value.
        @return {Number} The relative L2 error between trueVal and submittedVal.
    */
  PrairieGeom.prototype.relError = function (trueVal, submittedVal) {
    var absError = this.absError(trueVal, submittedVal);
    var norm = this.norm(trueVal);
    if (norm === 0) {
      if (absError === 0) return 0;
      else return Infinity;
    }
    return absError / norm;
  };

  /** Check whether two objects (Numbers, Booleans, Strings, Arrays, Vectors, Objects) are equal to within the given tolerances.

        @param {Object} trueVal The true object value.
        @param {Object} submittedVal The submitted object value.
        @param {Number} relTol The relative tolerance (for numerical comparisons).
        @param {Number} absTol The absolute tolerance (for numerical comparisons).
        @return {Boolean} Whether the objects are equal to within relTol or absTol.
    */
  PrairieGeom.prototype.checkEqual = function (trueVal, submittedVal, relTol, absTol) {
    var that = this;
    var subVal;
    if (_.isFinite(trueVal)) {
      subVal = Number(submittedVal);
      if (this.relError(trueVal, subVal) < relTol || this.absError(trueVal, subVal) < absTol)
        return true;
      return false;
    } else if (_.isBoolean(trueVal)) {
      if (_.isBoolean(submittedVal)) subVal = submittedVal;
      else if (_.isString(submittedVal)) subVal = this.toBool(submittedVal);
      else return false;
      return trueVal === subVal;
    } else if (_.isString(trueVal)) {
      subVal = String(submittedVal);
      return trueVal === subVal;
    } else if (_.isArray(trueVal)) {
      if (!_.isArray(submittedVal)) return false;
      if (!trueVal.length === submittedVal.length) return false;
      if (
        this.relError(trueVal, submittedVal) < relTol ||
        this.absError(trueVal, submittedVal) < absTol
      )
        return true;
      return false;
    } else if (trueVal instanceof Sylvester.Vector) {
      subVal = submittedVal;
      if (_.isArray(subVal)) subVal = $V(subVal);
      if (!(subVal instanceof Sylvester.Vector)) return false;
      if (this.relError(trueVal, subVal) < relTol || this.absError(trueVal, subVal) < absTol)
        return true;
      return false;
    } else if (_.isObject(trueVal)) {
      if (!_.isObject(submittedVal)) return false;
      return _(trueVal).every(function (val, key) {
        return that.checkEqual(val, submittedVal[key], relTol, absTol);
      });
    } else {
      return false;
    }
  };

  /*****************************************************************************/

  return new PrairieGeom();
});
