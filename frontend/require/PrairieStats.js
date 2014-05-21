
define(["numeric", "gamma"], function(numeric, gamma) {

    var PrairieStats = {};

    /** Compute the mean of a list of numbers.

        @param {Array} x List of scalar numbers.
        @param {Array} weights (Optional) List of associated weights.
        @return {Number} Mean of the x values (weighted mean if weights provided).
    */
    PrairieStats.mean = function(x, weights) {
        if (x.length <= 0)
            throw Error("length must be greater than zero");
        if (weights && weights.length !== x.length)
            throw Error("weights and x must have the same lengths");
        var sumV = 0, sumW = 0, w, i;
        for (i = 0; i < x.length; i++) {
            w = weights ? weights[i] : 1;
            sumV += x[i] * w;
            sumW += w;
        }
        return sumV / sumW;
    };

    /** Compute the variance of a list of numbers (not sample variance).

        @param {Array} x List of scalar numbers.
        @param {Array} weights (Optional) List of associated weights.
        @return {Number} Variance of the x values (weighted variance if weights provided).
    */
    PrairieStats.variance = function(x, weights) {
        if (x.length <= 0)
            throw Error("length must be greater than zero");
        if (weights && weights.length !== x.length)
            throw Error("weights and x must have the same lengths");
        if (x.length === 1)
            return 0;
        var sumW = 0, mean = 0, M2 = 0, i, w, delta;
        for (i = 0; i < x.length; i++) {
            w = weights ? weights[i] : 1;
            sumW += w;
            delta = x[i] - mean;
            mean += delta * w / sumW;
            M2 += w * delta * (x[i] - mean);
        }
        var variance = M2 / sumW;
        return variance;
    };

    /** Compute the standard deviation of a list of numbers.

        @param {Array} x List of scalar numbers.
        @param {Array} weights (Optional) List of associated weights.
        @return {Number} Standard deviation of the x values (weighted standard deviation if weights provided).
    */
    PrairieStats.stddev = function(x, weights) {
        return Math.sqrt(this.variance(x, weights));
    };

    /** Compute the covariance between two lists of numbers.

        @param {Array} x First list of scalar numbers.
        @param {Array} y Second list of scalar numbers.
        @param {Array} weights (Optional) List of associated weights.
        @return {Number} Covariance of x and y (weighted covariance if weights provided).
    */
    PrairieStats.covariance = function(x, y, weights) {
        if (x.length <= 0)
            throw Error("length must be greater than zero");
        if (x.length !== y.length)
            throw Error("x and y must have the same length");
        if (weights && weights.length !== x.weights)
            throw Error("weights and x must have the same lengths");
        if (x.length === 1)
            return 0;
        var sumW = 0, meanX = 0, meanY = 0, C2 = 0, i, w, deltaX, deltaY;
        for (i = 0; i < x.length; i++) {
            w = weights ? weights[i] : 1;
            sumW += w;
            deltaX = x[i] - meanX;
            deltaY = y[i] - meanY;
            meanX += deltaX * w / sumW;
            meanY += deltaY * w / sumW;
            C2 += w * deltaX * (y[i] - meanY);
        }
        var covariance = C2 / sumW;
        return covariance;
    };

    /** Compute the Pearson correlation coefficient between two lists of numbers.

        @param {Array} x First list of scalar numbers.
        @param {Array} y Second list of scalar numbers.
        @param {Array} weights (Optional) List of associated weights.
        @return {Number} Covariance coefficient r between  x and y (weighted if weights provided).
    */
    PrairieStats.corrcoeff = function(x, y, weights) {
        return this.covariance(x, y, weights) / (this.stddev(x, weights) * this.stddev(y, weights));
    };

    /** Compute the linear regression between two lists of numbers.

        @param {Array} x First list of scalar numbers.
        @param {Array} y Second list of scalar numbers.
        @param {Array} weights (Optional) List of associated weights.
        @return {Array} Coefficients [a0, a1] of the linear regression y = a0 + a1 * x.
    */
    PrairieStats.linearRegression = function(x, y, weights) {
        var a1 = this.covariance(x, y, weights) / this.variance(x, weights);
        var a0 = this.mean(y, weights) - a1 * this.mean(x, weights);
        return [a0, a1];
    };

    /** Create a new OnlineStats object.

        @constructor
    */
    PrairieStats.OnlineStats = function() {
        this.n = 0; // number of data samples so far
        this.totalWeight = 0; // total weight of samples so far
        this.mean = null; // mean of samples so far
        this.M2 = null; // internal-use for second moments
        this.variance = null; // only for scalar data
        this.covariance = null; // only for vector data
    }

    /** Add a data element to the statistics.

        @param {Object} x The value to add (scalar/Number or vector/Array).
        @param {Number} weight (Optional) The weight of the data element.
        @return {Object} The updated OnlineStats object.
    */
    PrairieStats.OnlineStats.prototype.add = function(x, weight) {
        this.n++;
        var w = (weight === undefined) ? 1 : weight;
        this.totalWeight += w;
        var delta;
        if (this.n === 1) {
            this.mean = x;
            if (typeof(x) === "number") {
                this.M2 = 0;
                this.variance = 0;
            } else {
                delta = numeric.sub(x, this.mean);
                this.M2 = numeric.tensor(delta, delta);
                this.covariance = this.M2;
            }
        } else {
            if (typeof(x) === "number") {
                delta = x - this.mean;
                this.mean += delta * w / this.totalWeight;
                this.M2 += w * delta * (x - this.mean);
                this.variance = this.M2 / this.totalWeight;
            } else {
                delta = numeric.sub(x, this.mean);
                this.mean = numeric.add(this.mean, numeric.mul(delta, w / this.totalWeight));
                this.M2 = numeric.add(this.M2, numeric.mul(w, numeric.tensor(delta, numeric.sub(x, this.mean))));
                this.covariance = numeric.div(this.M2, this.totalWeight);
            }
        }
    };

    /** Determine gamma distribution parameters from mean and variance.

        @param {Number} mean The mean of the distribution.
        @param {Number} variance The variance of the distribution.
        @return {Object} The parameter object {k: <Number>, theta: <Number>}.
    */
    PrairieStats.gammaMeanVarToKTheta = function(mean, variance) {
        return {
            k: Math.pow(mean, 2) / variance,
            theta: variance / mean
        };
    };

    /** The gamma probability density function.

        @param {Number} x The value at which to evaluate the PDF.
        @param {Number} k The shape parameter of the distribution.
        @param {Number} theta The scale parameter of the distribution.
        @return {Number} The PDF evaluated at x.
    */
    PrairieStats.gammaPDF = function(x, k, theta) {
        return Math.pow(x, k - 1) * Math.exp(-x / theta) / (gamma(k) * Math.pow(theta, k));
    };

    /** Determine beta distribution parameters from mean and variance.

        @param {Number} mean The mean of the distribution.
        @param {Number} variance The variance of the distribution.
        @return {Object} The parameter object {a: <Number>, b: <Number>}.
    */
    PrairieStats.betaMeanVarToAB = function(mean, variance) {
        return {
            a: (mean * (1 - mean) / variance - 1) * mean,
            b: (mean * (1 - mean) / variance - 1) * (1 - mean)
        };
    };

    /** The beta probability density function.

        @param {Number} x The value at which to evaluate the PDF.
        @param {Number} a The first parameter of the distribution.
        @param {Number} b The second parameter of the distribution.
        @return {Number} The PDF evaluated at x.
    */
    PrairieStats.betaPDF = function(x, a, b) {
        return Math.pow(x, a - 1) * Math.pow(1 - x, b - 1) * gamma(a + b) / gamma(a) / gamma(b);
    };

    /** Determine the normal distrbution transform A from the covariance matrix.

        @param {Array} covariance The covariance matrix.
        @return {Array} A transform A such that A A^T = covariance.
    */
    PrairieStats.normalCovToTransform = function(covariance) {
        var svd = numeric.svd(covariance);
        var transform = numeric.dot(svd.U, numeric.diag(numeric.sqrt(svd.S)));
        return transform;
    };

    /* Generate a normally-distribution scalar.

       @param {Number} mean The mean of the distribution.
       @param {Number} variance The variance of the distribution.
       @return {Number} The sampled value.
    */
    PrairieStats.randNorm = function(mean, variance) {
        var u = Math.random();
        var v = Math.random();
        var z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
        var x = z * Math.sqrt(variance) + mean;
        return x;
    };

    /* Generate a normally-distrbuted vector.

       @param {Array} mean The mean of the distribution.
       @param {Array} transform A transform so that A A^T = covariance.
       @return {Array} The sampled value.
    */
    PrairieStats.randNormN = function(mean, transform) {
        var z = [];
        for (var i = 0; i < mean.length; i++)
            z.push(randNorm(0, 1));
        var x = numeric.add(mean, numeric.dot(transform, z));
        return x;
    };

    /** Test the randNormN() function.
     */
    PrairieStats.testRandNormN = function() {
        var mean = [4, -2, 0.4];
        var covariance = [[1.7, -1.3, 0.5], [-1.3, 2.5, -1], [0.5, -1, 1.5]];
        var transform = normalCovToTransform(covariance);
        var nSamples = 1000000;
        var x = [];
        for (var i = 0; i < nSamples; i++)
            x.push(randNormN(mean, transform));
        var mc = meanCovarianceN(x);
        var meanError = numeric.norm2(numeric.sub(mean, mc.mean));
        var covError = numeric.norm2(numeric.sub(covariance, mc.covariance));
        var meanRelError = meanError / numeric.norm2(mean);
        var covRelError = covError / numeric.norm2(covariance);
        console.log("mean", "abs error", meanError, "rel error", meanRelError);
        console.log("covariance", "abs error", covError, "rel error", covRelError);
    };

    /** Generate an exponentially-distrbuted random scalar.

        @param {Number} lambda The rate parameter of the distribution.
        @return {Number} The sampled value.
    */
    PrairieStats.randExp = function(lambda) {
        return -Math.log(Math.random()) / lambda;
    };

    /** Generate a Gamma(a,1)-distrbuted random scalar using Johnk's algorithm.

        @param {Number} a The first parameter of the distribution (must be < 1).
        @return {Number} The sampled value.
    */
    PrairieStats.randGammaJohnk = function(a) {
        // Johnk's algorithm, Devroye [1986] page 418
        // only use for a < 1
        var u, v, x, y, e;
        do {
            u = Math.random();
            v = Math.random();
            x = Math.pow(u, 1 / a);
            y = Math.pow(v, 1 / (1 - a));
        } while (x + y > 1);
        e = randExp(1);
        return e * x / (x + y);
    };

    /** Generate a Gamma(a,1)-distrbuted random scalar using Best's XG algorithm.

        @param {Number} a The first parameter of the distribution (must be > 1).
        @return {Number} The sampled value.
    */
    PrairieStats.randGammaBest = function(a) {
        // Best's algorithm XG, Devroye [1986] page 410
        // only use for a > 1
        var b = a - 1;
        var c = 3 * a - 0.75;
        var u, v, w, y, x, z, accept;
        do {
            u = Math.random();
            v = Math.random();
            w = u * (1 - u);
            y = Math.sqrt(c / w) * (u - 0.5);
            x = b + y;
            if (x >= 0) {
                z = 64 * Math.pow(w, 3) * Math.pow(v, 2);
                accept = (z <= 1 - 2 * Math.pow(y, 2) / x);
                if (!accept) {
                    accept = (Math.log(z) <= 2 * (b * Math.log(x / b) - y));
                }
            }
        } while (!accept);
        return x;
    }

    /** Generate a Gamma-distrbuted random scalar.

        @param {Number} k The shape parameter of the distribution.
        @param {Number} theta The scale parameter of the distribution.
        @return {Number} The sampled value.
    */
    PrairieStats.randGamma = function(k, theta) {
        var x;
        if (k === 1)
            x = randExp(1);
        else if (k < 1)
            x = randGammaJohnk(k);
        else
            x = randGammaBest(k);
        x *= theta;
        return x;
    };

    /** Generate a Beta-distrbuted random scalar.

        @param {Number} a The first parameter of the distribution.
        @param {Number} b The second parameter of the distribution.
        @return {Number} The sampled value.
    */
    PrairieStats.randBeta = function(a, b) {
        var x = randGamma(a, 1);
        var y = randGamma(b, 1);
        return x / (x + y);
    };

    /** Test the randBeta() function for the given parameters.
     */
    PrairieStats.testRandBeta = function(a, b) {
        var nBin = 10; // number of histogram bins in [0, 1]
        var nSample = 10000000; // number of random samples
        var nQuad = 1000000; // number of quadrature points per bin

        var iBin, iSample, sampleMeans = [], x;
        for (iBin = 0; iBin < nBin; iBin++) {
            sampleMeans.push(0);
        }
        for (iSample = 0; iSample < nSample; iSample++) {
            x = randBeta(a, b);
            iBin = Math.floor(x * nBin);
            sampleMeans[iBin] += 1 / nSample * nBin;
        }
        var quadMeans = [];
        var iQuad, value;
        for (iBin = 0; iBin < nBin; iBin++) {
            value = 0;
            for (iQuad = 0; iQuad < nQuad; iQuad++) {
                x = ((iQuad + 1) / (nQuad + 1) + iBin) / nBin;
                value += betaPDF(x, a, b);
            }
            quadMeans.push(value / nQuad);
        }
        var std, errStd, maxAbsErrStd = 0;
        console.log("a", a, "b", b);
        for (iBin = 0; iBin < nBin; iBin++) {
            std = Math.sqrt(quadMeans[iBin] / nBin * nSample) / nSample * nBin;
            errStd = (quadMeans[iBin] - sampleMeans[iBin]) / std; // error in standard deviations
            console.log("iBin", iBin, "quadMean", quadMeans[iBin], "sampleMean", sampleMeans[iBin], "errStd", errStd);
            maxAbsErrStd = Math.max(maxAbsErrStd, Math.abs(errStd));
        }
        console.log("maxAbsErrStd", maxAbsErrStd);
        return maxAbsErrStd;
    };

    /** Test the randBeta() function for a set of parameters.
     */
    PrairieStats.multiTestRandBeta = function() {
        var maxAbsErrStd = 0;
        maxAbsErrStd = Math.max(maxAbsErrStd, testRandBeta(0.5, 0.5));
        maxAbsErrStd = Math.max(maxAbsErrStd, testRandBeta(0.5, 1));
        maxAbsErrStd = Math.max(maxAbsErrStd, testRandBeta(1, 0.5));
        maxAbsErrStd = Math.max(maxAbsErrStd, testRandBeta(1, 1));
        maxAbsErrStd = Math.max(maxAbsErrStd, testRandBeta(1, 5));
        maxAbsErrStd = Math.max(maxAbsErrStd, testRandBeta(5, 1));
        maxAbsErrStd = Math.max(maxAbsErrStd, testRandBeta(5, 5));
        console.log("Max of maxAbsErrStd", maxAbsErrStd);
        if (maxAbsErrStd < 3)
            console.log("success: all tests pass");
        else
            console.log("error: maxAbsErrStd is more than 3");
    };

    return PrairieStats;
});
