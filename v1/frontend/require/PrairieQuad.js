
define(["gamma"], function(gamma) {

    var PrairieQuad = {};

    var zeros = function(n) {
        var r = [];
        for (var i = 0; i < n; i++)
            r.push(0);
        return r;
    };

    PrairieQuad.cdgqf = function(nt, kind, alpha, beta) {
        var t, wts, data;

        this.parchk(kind, 2 * nt, alpha, beta);
        data = this.classMatrix(kind, nt, alpha, beta);
        var aj = data.aj;
        var bj = data.bj;
        var zemu = data.zemu;
        data = this.sgqf(nt, aj, bj, zemu);
        var t = data.t;
        var wts = data.wts;
        return {
            t: t,
            wts: wts
        };
    };

    PrairieQuad.cgqf = function(nt, kind, alpha, beta, a, b) {
        /*
          %
          %% CGQF computes knots and weights of a Gauss quadrature formula.
          %
          %  Discussion:
          %
          %    The user may specify the interval (A,B).
          %
          %    Only simple knots are produced.
          %
          %    The user may request that the routine print the knots and weights,
          %    and perform a moment check.
          %
          %    Use routine EIQFS to evaluate this quadrature formula.
          %
          %  Licensing:
          %
          %    This code is distributed under the GNU LGPL license.
          %
          %  Modified:
          %
          %    19 September 2013
          %
          %  Author:
          %
          %    Original FORTRAN77 version by Sylvan Elhay, Jaroslav Kautsky.
          %    MATLAB version by John Burkardt.
          %
          %  Reference:
          %
          %    Sylvan Elhay, Jaroslav Kautsky,
          %    Algorithm 655: IQPACK, FORTRAN Subroutines for the Weights of
          %    Interpolatory Quadrature,
          %    ACM Transactions on Mathematical Software,
          %    Volume 13, Number 4, December 1987, pages 399-415.
          %
          %  Parameters:
          %
          %    Input, integer NT, the number of knots.
          %
          %    Input, integer KIND, the rule.
          %    1, Legendre,             (a,b)       1.0
          %    2, Chebyshev Type 1,     (a,b)       ((b-x)*(x-a))^(-0.5)
          %    3, Gegenbauer,           (a,b)       ((b-x)*(x-a))^alpha
          %    4, Jacobi,               (a,b)       (b-x)^alpha*(x-a)^beta
          %    5, Generalized Laguerre, (a,+oo)     (x-a)^alpha*exp(-b*(x-a))
          %    6, Generalized Hermite,  (-oo,+oo)   |x-a|^alpha*exp(-b*(x-a)^2)
          %    7, Exponential,          (a,b)       |x-(a+b)/2.0|^alpha
          %    8, Rational,             (a,+oo)     (x-a)^alpha*(x+b)^beta
          %    9, Chebyshev Type 2,     (a,b)       ((b-x)*(x-a))^(+0.5)
          %
          %    Input, real ALPHA, the value of Alpha, if needed.
          %
          %    Input, real BETA, the value of Beta, if needed.
          %
          %    Input, real A, B, the interval endpoints.
          %
          %    Output, real T(NT), the knots.
          %
          %    Output, real WTS(NT), the weights.
        */
        var t, wts, mlt, ndx, data, i;

        // Compute the Gauss quadrature formula for default values of A and B.
        data = this.cdgqf(nt, kind, alpha, beta);
        t = data.t;
        wts = data.wts;

        // All knots have multiplicity = 1.
        mlt = ones(nt);

        // NDX(I) = I.
        ndx = [];
        for (i = 1; i <+ nt; i++)
            ndx.push(i);

        // Scale the quadrature rule.
        data = this.scqf(nt, t, mlt, wts, nt, ndx, kind, alpha, beta, a, b);
        t = data.t;
        wts = data.wts;

        return {
            t: t,
            wts: wts
        };
    };

    PrairieQuad.scqf = function(nt, t, mlt, wts, nwts, ndx, kind, alpha, beta, a, b) {
        var temp = 2.220446049250313e-16;;

        this.parchk(kind, 1, alpha, beta);

        var al, be, shft, slp;
        switch (kind) {
        case 4:
            al = alpha;
            be = beta;
            if (Math.abs(b - a) <= temp)
                throw Error("Fatal error: |B - A| too small.");
            shft = (a + b) / 2;
            slp = (b - a) / 2;
            break;
        case 6:
            if (b <= 0)
                throw Error("Fatal error: B <= 0.");
            shft = a;
            slp = 1 / Math.sqrt(b);
            al = alpha;
            be = 0;
            break;
        default:
            throw Error("unknown KIND");
        }

        var p, k, l, tmp, i;
        p = Math.pow(slp, al + be + 1);
        for (k = 1; k <= nt; k++) {

            t[k - 1] = shft + slp * t[k - 1];
            l = Math.abs(ndx[k - 1]);

            if (l !== 0) {
                tmp = p;
                for (i = l; i <= l + mlt[k - 1] - 1; i++) {
                    wts[i - 1] = wts[i - 1] * tmp;
                    tmp = tmp * slp;
                }
            }
        }
        return {
            t: t,
            wts: wts
        };
    };

    PrairieQuad.classMatrix = function(kind, m, alpha, beta) {

        var temp = 2.220446049250313e-16;

        this.parchk(kind, 2 * m - 1, alpha, beta);

        var temp2 = 0.5;
        if (500 * temp < Math.abs(Math.pow(gamma(temp2), 2) - Math.PI))
            throw Error("Fatal error: Gamma function does not match machine parameters.");
        var bj = zeros(m);
        var aj = zeros(m);
        var zemu, i, ab, abi, abj, a2b2, apone, aba, abti;

        switch (kind) {
        case 4:
            ab = alpha + beta;
            abi = 2 + ab;
            //zemu = Math.pow(2, ab + 1) * gamma(alpha + 1) * gamma(beta + 1) / gamma(abi);
            zemu = Math.exp((ab + 1) * Math.log(2) + gamma.log(alpha + 1) + gamma.log(beta + 1) - gamma.log(abi));
            aj[0] = (beta - alpha) / abi;
            bj[0] = 4 * (1 + alpha) * (1 + beta) / ((abi + 1) * abi * abi);
            a2b2 = beta * beta - alpha * alpha;
            for (i = 2; i <= m; i++) {
                abi = 2 * i + ab;
                aj[i - 1] = a2b2 / ((abi - 2) * abi);
                abi = Math.pow(abi, 2);
                bj[i - 1] = 4 * i * (i + alpha) * (i + beta) * (i + ab) / ((abi - 1) * abi);
            }
            bj = numeric.sqrt(bj);
            break;
        case 6:
            zemu = gamma((alpha + 1) / 2);
            for (i = 1; i <= m; i++)
                bj[i - 1] = (i + alpha * (i % 2)) / 2;
            bj = numeric.sqrt(bj);
            break;
        default:
            throw Error("Unknown KIND: " + kind);
        }
        return {
            aj: aj,
            bj: bj,
            zemu: zemu
        };
    };

    PrairieQuad.sgqf = function(nt, aj, bj, zemu) {
        var wts = zeros(nt);
        wts[0] = Math.sqrt(zemu);
        var data = this.imtqlx(nt, aj, bj, wts);
        var t = data.d;
        wts = data.z;
        wts = numeric.mul(wts, wts);
        return {
            t: t,
            wts: wts
        };
    };

    PrairieQuad.parchk = function(kind, m, alpha, beta) {
        if (kind <= 0)
            throw Error("Fatal error: KIND <= 0.");

        // Check ALPHA for Gegenbauer, Jacobi, Laguerre, Hermite, Exponential.
        if (3 <= kind && kind <= 8 && alpha <= -1)
            throw Error("Fatal erorr: 3 <= KIND and ALPHA <= -1.");

        // Check BETA for Jacobi.
        if (kind == 4 && beta <= -1)
            throw Error("Fatal erorr: KIND == 4 and BETA <= -1.0.");

        // Check ALPHA and BETA for rational.
        if (kind == 8) {
            var tmp = alpha + beta + m + 1;
            if (0 <= tmp || tmp <= beta)
                throw Error("Fatal erorr: KIND == 8 but condition on ALPHA and BETA fails.");
        }
    };

    PrairieQuad.r8Sign = function(x) {
        if (0 <= x)
            return +1;
        else
            return -1;
    };

    PrairieQuad.imtqlx = function(n, d, e, z) {
        var itn = 30;
        var prec = 2.220446049250313e-16;

        if (n === 1)
            return;
        e[n - 1] = 0;
        var l, j, m, p, g, r, s, c, mml, ii;
        for (l = 1; l <= n; l++) {
            j = 0;
            while (true) {
                for (m = l; m <= n; m++) {
                    if (m === n)
                        break;
                    if (Math.abs(e[m - 1]) <= prec * (Math.abs(d[m - 1]) + Math.abs(d[m])))
                        break;
                }
                p = d[l - 1];
                if (m === l)
                    break;
                if (j === itn)
                    throw Error("Fatal error: Iteration limit exceeded.");

                j = j + 1;
                g = (d[l] - p) / (2 * e[l - 1]);
                r = Math.sqrt(g * g + 1);
                g = d[m - 1] - p + e[l - 1] / (g + this.r8Sign(g) * Math.abs(r));
                s = 1;
                c = 1;
                p = 0;
                mml = m - l;

                for (ii = 1; ii <= mml; ii++) {
                    i = m - ii;
                    f = s * e[i - 1];
                    b = c * e[i - 1];
                    if (Math.abs(f) >= Math.abs(g)) {
                        c = g / f;
                        r = Math.sqrt(c * c + 1);
                        e[i] = f * r;
                        s = 1 / r;
                        c = c * s;
                    } else {
                        s = f / g;
                        r = Math.sqrt(s * s + 1);
                        e[i] = g * r;
                        c = 1 / r;
                        s = s * c;
                    }

                    g = d[i] - p;
                    r = (d[i - 1] - g) * s + 2 * c * b;
                    p = s * r;
                    d[i] = g + p;
                    g = c * r - b;
                    f = z[i];
                    z[i] = s * z[i - 1] + c * f;
                    z[i - 1] = c * z[i - 1] - s * f;
                }

                d[l - 1] = d[l - 1] - p;
                e[l - 1] = g;
                e[m - 1] = 0;
            }
        }

        for (ii = 2; ii <= n; ii++) {
            i = ii - 1;
            k = i;
            p = d[i - 1];

            for (j = ii; j <= n; j++) {
                if (d[j - 1] < p) {
                    k = j;
                    p = d[j - 1];
                }
            }

            if (k !== i) {
                d[k - 1] = d[i - 1];
                d[i - 1] = p;
                p = z[i - 1];
                z[i - 1] = z[k - 1];
                z[k - 1] = p;
            }

        }
        return {
            d: d,
            z: z
        };
    };

    PrairieQuad.matrixSqrt = function(m) {
        // assumes m is positive definite
        var svd = numeric.svd(m);
        return numeric.dot(numeric.dot(svd.U, numeric.diag(numeric.sqrt(svd.S))), numeric.transpose(svd.V));
    };

    PrairieQuad.quadTensorProduct = function(x1, w1, nDim) {
        // x1 = points in 1D
        // w1 = weights in 1D
        // n = number of dimensions
        var nPoint = x1.length;
        var ind = zeros(nDim);
        var x = [], w = [], i, xp, wp;
        for (;;) {
            xp = [], wp = 1;
            for (i = 0; i < nDim; i++) {
                xp.push(x1[ind[i]]);
                wp *= w1[ind[i]];
            }
            x.push(xp);
            w.push(wp);
            for (i = 0; i < nDim; i++) {
                ind[i]++;
                if (ind[i] < nPoint)
                    break;
                ind[i] = 0;
            }
            if (i === nDim)
                break;
        }
        return {x: x, w: w};
    };

    PrairieQuad.normalQuad = function(mean, variance, nQuad) {
        if (nQuad === 1)
            return {x: [mean], w: [1]};
        var data = this.cdgqf(nQuad, 6, 0, 0);
        var z = data.t;
        var w = data.wts;
        w = numeric.mul(w, 1 / numeric.sum(w));
        var x = [], i;
        for (i = 0; i < z.length; i++)
            x.push(Math.sqrt(2 * variance) * z[i] + mean);
        return {
            x: x,
            w: w
        };
    };

    PrairieQuad.normalQuadN = function(mean, covariance, nQuad) {
        if (nQuad === 1)
            return {x: [mean], w: [1]};
        var nDim = mean.length;
        var zw1 = this.normalQuad(0, 1, nQuad);
        var zw = this.quadTensorProduct(zw1.x, zw1.w, nDim);
        var s = this.matrixSqrt(covariance);
        var x = [], i;
        for (i = 0; i < zw.x.length; i++)
            x.push(numeric.add(numeric.dot(s, zw.x[i]), mean));
        return {
            x: x,
            w: zw.w
        };
    };

    PrairieQuad.testQuadNormN = function() {
        var mean = [4, -2, 0.4];
        var covariance = [[1.7, -1.3, 0.5], [-1.3, 2.5, -1], [0.5, -1, 1.5]];
        var nQuad = 3;
        var quad = this.normalQuadN(mean, covariance, nQuad);
        var mc = meanCovarianceN(quad.x, quad.w);
        var meanError = numeric.norm2(numeric.sub(mean, mc.mean));
        var covError = numeric.norm2(numeric.sub(covariance, mc.covariance));
        var meanRelError = meanError / numeric.norm2(mean);
        var covRelError = covError / numeric.norm2(covariance);
        console.log("mean", "abs error", meanError, "rel error", meanRelError);
        console.log("covariance", "abs error", covError, "rel error", covRelError);
        process.exit(0);
    };

    PrairieQuad.betaQuad = function(a, b, nQuad) {
        if (nQuad === 1)
            return {x: [a / (a + b)], w: [1]};
        var data = this.cdgqf(nQuad, 4, b - 1, a - 1);
        var x = data.t;
        x = numeric.add(0.5, numeric.mul(0.5, x));
        var w = data.wts;
        w = numeric.mul(w, 1 / numeric.sum(w));
        return {
            x: x,
            w: w
        };
    };

    PrairieQuad.testQuadBeta = function() {
        // var mean = 0.20679165333697952;
        // var variance = 0.0009801568824852219;
        a = null;
        b = null;
        var nQuad = 3;
        var quad = betaQuad(a, b, nQuad);
        var mv = meanVar(quad.x, quad.w);
        var meanError = Math.abs(mean - mv.mean);
        var varError = Math.abs(variance - mv.variance);
        var meanRelError = meanError / Math.abs(mean);
        var varRelError = varError / Math.abs(variance);
        console.log("mean", mean, "mv.mean", mv.mean, "abs error", meanError, "rel error", meanRelError);
        console.log("variance", variance, "mv.variance", mv.variance, "abs error", varError, "rel error", varRelError);
        process.exit(0);
    };

    // p is probability of being 1
    // (1 - p) is probability of being 0
    PrairieQuad.binaryQuad = function(p) {
        return {x: [1, 0], w: [p, 1 - p]};
    };

    return PrairieQuad;
});
