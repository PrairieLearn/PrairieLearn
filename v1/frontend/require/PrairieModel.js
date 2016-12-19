
define(["underscore", "numeric", "PrairieStats", "PrairieQuad"], function(_, numeric, PrairieStats, PrairieQuad) {

    var PrairieModel = {};

    PrairieModel.MODEL_DIM = 1;
    PrairieModel.N_QUAD_POINTS = 1;
    PrairieModel.N_QUAD_POINTS_SIGMA = 15;
    PrairieModel.MC_SAMPLES = 10000; // good value is 10000

    var ones = function(n) {
        var r = [];
        for (var i = 0; i < n; i++)
            r.push(1);
        return r;
    };

    var zeros = function(n) {
        var r = [];
        for (var i = 0; i < n; i++)
            r.push(0);
        return r;
    };

    /** Create a new QuestionDist object.

        @constructor
    */
    PrairieModel.QuestionDist = function(qid) {
        this.qid = qid;
        this.alpha = {mean: ones(PrairieModel.MODEL_DIM), covariance: numeric.identity(PrairieModel.MODEL_DIM)};
        this.beta = {mean: 0, variance: 1};
        this.gamma = {mean: 0.05, variance: 0.04};
        this.delta = {mean: 0.9, variance: 0.08};
    };

    /** Create a new UserDist object.

        @constructor
        @param {Number} dim The dimension of the model.
    */
    PrairieModel.UserDist = function(uid) {
        this.uid = uid;
        this.count = 0;
        this.sigma = {mean: zeros(PrairieModel.MODEL_DIM), covariance: numeric.identity(PrairieModel.MODEL_DIM)};
        this.qHist = {};
    };

    /** Find the probability of getting a question right or wrong.

        @param {Boolean} correct Whether the question was answered right (correct is true) or wrong (correct is false).
        @param {Array} sigma The user sigma value.
        @param {Array} alpha The question alpha value.
        @param {Number} beta The question beta value.
        @param {Number} gamma The question gamma value.
        @return {Number} The probabiliy of observing the given outcome.
    */
    PrairieModel.observationProb = function(correct, sigma, alpha, beta, gamma, delta, hist, count) {
        var expTerm = Math.exp(-numeric.dot(alpha, sigma) + beta);
        var pIntrinsic = gamma + delta * (1 - gamma) / (1 + expTerm);
        var dPIntrinsicDSigma = numeric.mul(delta * (1 - gamma) / Math.pow(1 + expTerm, 2) * expTerm, alpha);
        var pMaximum = delta * (1 - gamma) + gamma;
        var nAttempts = 0, nCorrect = 0, pHistoric = 0;
        var decayCount = 20;
        var eta = 0.8;
        var nCorrect = 0, nAttempts = 0, nDecayedCorrect = 0, nDecayedAttempts = 0;
        if (hist) {
            nAttempts = hist.length;
            var i, w, wTot = 0, r, rWTot = 0, d;
            for (i = 0; i < nAttempts; i++) {
                r = hist[i].correct ? 1 : 0;
                d = Math.exp((hist[i].count - count) / decayCount);
                nCorrect += r;
                nDecayedCorrect += d * r;
                nDecayedAttempts += d;
                w = Math.pow(eta, nAttempts - i - 1);
                wTot += w;
                rWTot += r * w;
            }
            pHistoric = rWTot / wTot;
        }
        var lambda = 0.3;
        var epsilon = Math.exp(-lambda * nDecayedAttempts);
        var p = epsilon * pIntrinsic + (1 - epsilon) * pHistoric;
        var dPDSigma = epsilon * dPIntrinsicDSigma;
        //console.log("pIntrinsic", pIntrinsic, "nAttempts", nAttempts, "nCorrect", nCorrect, "nDecayedAttempts", nDecayedAttempts, "nDecayedCorrect", nDecayedCorrect, "pHistoric", pHistoric, "eta", eta, "wTot", wTot, "rWTot", rWTot, "lambda", lambda, "epsilon", epsilon, "p", p);
        if (!correct) {
            p = 1 - p;
            dPDSigma = numeric.mul(-1, dPDSigma);
        }
        return {p: p, dPDSigma: dPDSigma};
    };

    /** The expected probability of the user getting the question correct (using Monte Carlo).

        @param {Object} userDist The state distribution object for the user.
        @param {Object} questionDist The state distribution object for the question.
        @return {Number} The expected probability.
    */
    PrairieModel.userQuestionProbMC = function(userDist, questionDist) {
        var sigmaTransform = PrairieStats.normalCovToTransform(userDist.sigma.covariance);
        var alphaTransform = PrairieStats.normalCovToTransform(question.alpha.covariance);
        var gammaAB = PrairieStats.betaMeanVarToAB(question.gamma.mean, question.gamma.variance);
        var deltaAB = PrairieStats.betaMeanVarToAB(question.delta.mean, question.delta.variance);
        var nSamples = this.MC_SAMPLES, i, p, totalScore = 0;
        for (i = 0; i < nSamples; i++) {
            var sigma = PrairieStats.randNormN(userDist.sigma.mean, sigmaTransform);
            var hist = userDist.qHist[questionDist.qid];
            var alpha = PrairieStats.randNormN(question.alpha.mean, alphaTransform);
            var beta = PrairieStats.randNorm(question.beta.mean, question.beta.variance);
            var gamma = PrairieStats.randBeta(gammaAB.a, gammaAB.b);
            var delta = PrairieStats.randBeta(deltaAB.a, deltaAB.b);
            p = this.observationProb(true, sigma, alpha, beta, gamma, delta, hist, userDist.count).p;
            totalScore += p;
        }
        return totalScore / nSamples;
    };

    /** The expected probability of the user getting the question correct (using Quadrature).

        @param {Object} userDist The state distribution object for the user.
        @param {Object} questionDist The state distribution object for the question.
        @param {Boolean} useHistory (Optional, default: true) Whether to use history data for prediction.
        @return {Number} The expected probability.
    */
    PrairieModel.userQuestionProb = function(userDist, questionDist, useHistory) {
        useHistory = (useHistory === undefined) ? true : useHistory;
        var sigmaQ = PrairieQuad.normalQuadN(userDist.sigma.mean, userDist.sigma.covariance, this.N_QUAD_POINTS_SIGMA);
        var alphaQ = PrairieQuad.normalQuadN(questionDist.alpha.mean, questionDist.alpha.covariance, this.N_QUAD_POINTS);
        var betaQ = PrairieQuad.normalQuad(questionDist.beta.mean, questionDist.beta.variance, this.N_QUAD_POINTS);
        var gammaAB = PrairieStats.betaMeanVarToAB(questionDist.gamma.mean, questionDist.gamma.variance);
        var gammaQ = PrairieQuad.betaQuad(gammaAB.a, gammaAB.b, this.N_QUAD_POINTS);
        var deltaAB = PrairieStats.betaMeanVarToAB(questionDist.delta.mean, questionDist.delta.variance);
        var deltaQ = PrairieQuad.betaQuad(deltaAB.a, deltaAB.b, this.N_QUAD_POINTS);
        var hist;
        if (useHistory)
            hist = userDist.qHist[questionDist.qid];
        var totalProb = 0, totalWeight = 0, totalDProbDSigma = zeros(PrairieModel.MODEL_DIM);
        for (var iSigma = 0; iSigma < sigmaQ.x.length; iSigma++)
            for (var iAlpha = 0; iAlpha < alphaQ.x.length; iAlpha++)
                for (var iBeta = 0; iBeta < betaQ.x.length; iBeta++)
                    for (var iGamma = 0; iGamma < gammaQ.x.length; iGamma++)
                        for (var iDelta = 0; iDelta < deltaQ.x.length; iDelta++) {
                            var sigma = sigmaQ.x[iSigma];
                            var alpha = alphaQ.x[iAlpha];
                            var beta = betaQ.x[iBeta];
                            var gamma = gammaQ.x[iGamma];
                            var delta = deltaQ.x[iDelta];
                            var weight = sigmaQ.w[iSigma] * alphaQ.w[iAlpha] * betaQ.w[iBeta] * gammaQ.w[iGamma] * deltaQ.w[iDelta];
                            var obs = this.observationProb(true, sigma, alpha, beta, gamma, delta, hist, userDist.count);
                            totalProb += obs.p * weight;
                            totalDProbDSigma = numeric.add(totalDProbDSigma, numeric.mul(obs.dPDSigma, weight));
                            totalWeight += weight;
                        }
        return {
            p: totalProb / totalWeight,
            dPDSigma: numeric.div(totalDProbDSigma, totalWeight)
        };
    };

    /** Get the number of attempts by a user for a given question.

        @param {Object} userDist The state distribution object for the user.
        @param {String} qid The question ID.
        @return {Number} The number of attempts.
    */
    PrairieModel.userQuestionAttempts = function(userDist, qid) {
        var attempts = 0;
        if (userDist.qHist)
            if (userDist.qHist[qid] !== undefined)
                attempts = userDist.qHist[qid].length;
        return attempts;
    };

    /** Update the user and question distributions for a given observation (using Monte Carlo).

        @param {Boolean} correct Whether the question was answered right (correct is true) or wrong (correct is false).
        @param {Object} userDist The state distribution object for the user.
        @param {Object} questionDist The state distribution object for the question.
    */
    PrairieModel.measurementUpdateMC = function(correct, userDist, questionDist) {
        var qid = questionDist.qid;
        var sigmaTransform = PrairieStats.normalCovToTransform(userDist.sigma.covariance);
        var alphaTransform = PrairieStats.normalCovToTransform(questionDist.alpha.covariance);
        var gammaAB = PrairieStats.betaMeanVarToAB(questionDist.gamma.mean, questionDist.gamma.variance);
        var deltaAB = PrairieStats.betaMeanVarToAB(questionDist.delta.mean, questionDist.delta.variance);
        var hist = userDist.qHist[qid];
        var nSamples = this.MC_SAMPLES;
        var samples = [], weights = [], i, sigma, alpha, beta, gamma, delta, weight;
        var sigmaStats = new PrairieStats.OnlineStats();
        var alphaStats = new PrairieStats.OnlineStats();
        var betaStats = new PrairieStats.OnlineStats();
        var gammaStats = new PrairieStats.OnlineStats();
        var deltaStats = new PrairieStats.OnlineStats();
        for (i = 0; i < nSamples; i++) {
            sigma = PrairieStats.randNormN(userDist.sigma.mean, sigmaTransform);
            alpha = PrairieStats.randNormN(questionDist.alpha.mean, alphaTransform);
            beta = PrairieStats.randNorm(questionDist.beta.mean, questionDist.beta.variance);
            gamma = PrairieStats.randBeta(gammaAB.a, gammaAB.b);
            delta = PrairieStats.randBeta(deltaAB.a, deltaAB.b);
            weight = this.observationProb(correct, sigma, alpha, beta, gamma, delta, hist, userDist.count).p;
            sigmaStats.add(sigma, weight);
            alphaStats.add(alpha, weight);
            betaStats.add(beta, weight);
            gammaStats.add(gamma, weight);
            deltaStats.add(delta, weight);
        }
        userDist.count += 1;
        if (userDist.qHist[qid] === undefined)
            userDist.qHist[qid] = [];
        userDist.qHist[qid].push({correct: correct, count: userDist.count});
        userDist.sigma = {mean: sigmaStats.mean, covariance: sigmaStats.covariance};
        questionDist.alpha = {mean: alphaStats.mean, covariance: alphaStats.covariance};
        questionDist.beta = {mean: betaStats.mean, variance: betaStats.variance};
        questionDist.gamma = {mean: gammaStats.mean, variance: gammaStats.variance};
        questionDist.delta = {mean: deltaStats.mean, variance: deltaStats.variance};
    };

    /** Update the user and question distributions for a given observation (using Quadrature).

        @param {Boolean} correct Whether the question was answered right (correct is true) or wrong (correct is false).
        @param {Object} userDist The state distribution object for the user.
        @param {Object} questionDist The state distribution object for the question.
    */
    PrairieModel.measurementUpdate = function(correct, userDist, questionDist) {
        var qid = questionDist.qid;
        var sigmaQ = PrairieQuad.normalQuadN(userDist.sigma.mean, userDist.sigma.covariance, this.N_QUAD_POINTS_SIGMA);
        var alphaQ = PrairieQuad.normalQuadN(questionDist.alpha.mean, questionDist.alpha.covariance, this.N_QUAD_POINTS);
        var betaQ = PrairieQuad.normalQuad(questionDist.beta.mean, questionDist.beta.variance, this.N_QUAD_POINTS);
        var gammaAB = PrairieStats.betaMeanVarToAB(questionDist.gamma.mean, questionDist.gamma.variance);
        var gammaQ = PrairieQuad.betaQuad(gammaAB.a, gammaAB.b, this.N_QUAD_POINTS);
        var deltaAB = PrairieStats.betaMeanVarToAB(questionDist.delta.mean, questionDist.delta.variance);
        var deltaQ = PrairieQuad.betaQuad(deltaAB.a, deltaAB.b, this.N_QUAD_POINTS);
        var hist = userDist.qHist[qid];
        var sigma, alpha, beta, gamma, delta;
        var sigmaStats = new PrairieStats.OnlineStats();
        var alphaStats = new PrairieStats.OnlineStats();
        var betaStats = new PrairieStats.OnlineStats();
        var gammaStats = new PrairieStats.OnlineStats();
        var deltaStats = new PrairieStats.OnlineStats();
        for (var iSigma = 0; iSigma < sigmaQ.x.length; iSigma++)
            for (var iAlpha = 0; iAlpha < alphaQ.x.length; iAlpha++)
                for (var iBeta = 0; iBeta < betaQ.x.length; iBeta++)
                    for (var iGamma = 0; iGamma < gammaQ.x.length; iGamma++)
                        for (var iDelta = 0; iDelta < deltaQ.x.length; iDelta++) {
                            sigma = sigmaQ.x[iSigma];
                            alpha = alphaQ.x[iAlpha];
                            beta = betaQ.x[iBeta];
                            gamma = gammaQ.x[iGamma];
                            delta = deltaQ.x[iDelta];
                            weight = sigmaQ.w[iSigma] * alphaQ.w[iAlpha] * betaQ.w[iBeta] * gammaQ.w[iGamma] * deltaQ.w[iDelta];
                            p = this.observationProb(correct, sigma, alpha, beta, gamma, delta, hist, userDist.count).p;
                            weight *= p;
                            sigmaStats.add(sigma, weight);
                            alphaStats.add(alpha, weight);
                            betaStats.add(beta, weight);
                            gammaStats.add(gamma, weight);
                            deltaStats.add(delta, weight);
                        }
        userDist.count += 1;
        if (userDist.qHist[qid] === undefined)
            userDist.qHist[qid] = [];
        userDist.qHist[qid].push({correct: correct, count: userDist.count});
        userDist.sigma = {mean: sigmaStats.mean, covariance: sigmaStats.covariance};
        /*
        questionDist.alpha = {mean: alphaStats.mean, covariance: alphaStats.covariance};
        questionDist.beta = {mean: betaStats.mean, variance: betaStats.variance};
        questionDist.gamma = {mean: gammaStats.mean, variance: gammaStats.variance};
        questionDist.delta = {mean: deltaStats.mean, variance: deltaStats.variance};
        */
    };

    /** Predict the user and question distributions with dynamics.

        @param {Object} userDist The state distribution object for the user.
        @param {Object} questionDist The state distribution object for the question.
    */
    PrairieModel.dynamicPrediction = function(userDist, questionDist) {
        userDist.sigma.covariance = numeric.add(userDist.sigma.covariance, numeric.mul(0.01, numeric.identity(PrairieModel.MODEL_DIM)))
    };

    /** Test the accuracy of Monte Caro and Quadrature measurement updates.
     */
    PrairieModel.testSubmissionQuad = function() {
        var nQuad = 3;
        var nSamples = [10, 100, 1000, 10000, 100000, 1000000];

        var sigmaMean = [0.5, 0.2];
        var sigmaCovariance = [[0.2, 0.02], [0.02, 0.3]];
        var alphaMean = [1.7, 1.1];
        var alphaCovariance = [[0.1, 0.05], [0.05, 0.2]];
        var betaMean = 0.2;
        var betaVariance = 0.1;
        var gammaMean = 0.1;
        var gammaVariance = 0.01;
        var correct = true;

        /*
        *************************************************
        nSamples 10000000
        sigma { mean: [ 0.5680751304924683, 0.26755042118354816 ],
          covariance:
           [ [ 0.18668150128824243, 0.006679538542409178 ],
             [ 0.006679538542409178, 0.28603233604567474 ] ] }
        alpha { mean: [ 1.7079119593217822, 1.1065858315949588 ],
          covariance:
           [ [ 0.09951043850801485, 0.049350544195993135 ],
             [ 0.049350544195993135, 0.19890801712405312 ] ] }
        beta { mean: 0.21916806544006698, variance: 0.09900167311490887 }
        gamma { mean: 0.10347592740981586, variance: 0.010547552183199778 }
        *************************************************
        */

        /*
        *************************************************
        nQuads 13
        sigma { mean: [ 0.5679681718990248, 0.26746845553418 ],
          covariance:
           [ [ 0.1865663535201668, 0.006743395781575154 ],
             [ 0.006743395781575154, 0.28602159647967673 ] ] }
        alpha { mean: [ 1.7079157113020496, 1.106552122703762 ],
          covariance:
           [ [ 0.09947980140178568, 0.04940656535089948 ],
             [ 0.04940656535089948, 0.19893200710779113 ] ] }
        beta { mean: 0.21911003679452692, variance: 0.09897006454590315 }
        gamma { mean: 0.10346381471279663, variance: 0.010542212341688074 }
        *************************************************
        */

        // use nQuad = 13 for exact solution
        var exactSigmaMean = [0.5679681718990248, 0.26746845553418];
        var exactSigmaCovariance = [[0.1865663535201668, 0.006743395781575154], [0.006743395781575154, 0.28602159647967673]];
        var exactAlphaMean = [ 1.7079157113020496, 1.106552122703762 ];
        var exactAlphaCovariance = [[0.09947980140178568, 0.04940656535089948], [0.04940656535089948, 0.19893200710779113]];
        var exactBetaMean = 0.21911003679452692;
        var exactBetaVariance = 0.09897006454590315;
        var exactGammaMean = 0.10346381471279663;
        var exactGammaVariance = 0.010542212341688074;

        var sigmaTransform = PrairieStats.normalCovToTransform(sigmaCovariance);
        var alphaTransform = PrairieStats.normalCovToTransform(alphaCovariance);
        var gammaAB = PrairieStats.betaMeanVarToAB(gammaMean, gammaVariance);

        var iSamples, i, testSigma, testAlpha, testBeta, testGamma;
        var mcSigmaMeanErrors = [], mcSigmaCovarianceErrors = [], mcAlphaMeanErrors = [], mcAlphaCovarianceErrors = [], mcBetaMeanErrors = [], mcBetaVarianceErrors = [], mcGammaMeanErrors = [], mcGammaVarianceErrors = [];
        for (iSamples = 0; iSamples < nSamples.length; iSamples++) {
            var sigma, alpha, beta, gamma, weight;
            var sigmaStats = new PrairieStats.OnlineStats();
            var alphaStats = new PrairieStats.OnlineStats();
            var betaStats = new PrairieStats.OnlineStats();
            var gammaStats = new PrairieStats.OnlineStats();
            for (i = 0; i < nSamples[iSamples]; i++) {
                var sigma = PrairieStats.randNormN(sigmaMean, sigmaTransform);
                var alpha = PrairieStats.randNormN(alphaMean, alphaTransform);
                var beta = PrairieStats.randNorm(betaMean, betaVariance);
                var gamma = PrairieStats.randBeta(gammaAB.a, gammaAB.b);
                weight = this.observationProb(correct, sigma, alpha, beta, gamma).p;
                sigmaStats.add(sigma, weight);
                alphaStats.add(alpha, weight);
                betaStats.add(beta, weight);
                gammaStats.add(gamma, weight);
            }
            testSigma = {mean: sigmaStats.mean, covariance: sigmaStats.covariance};
            testAlpha = {mean: alphaStats.mean, covariance: alphaStats.covariance};
            testBeta = {mean: betaStats.mean, variance: betaStats.variance};
            testGamma = {mean: gammaStats.mean, variance: gammaStats.variance};

            console.log("*************************************************");
            console.log("nSamples", nSamples[iSamples]);
            console.log("sigma", testSigma);
            console.log("alpha", testAlpha);
            console.log("beta", testBeta);
            console.log("gamma", testGamma);

            mcSigmaMeanErrors.push(numeric.norm2(numeric.sub(exactSigmaMean, testSigma.mean)));
            mcSigmaCovarianceErrors.push(numeric.norm2(numeric.sub(exactSigmaCovariance, testSigma.covariance)));
            mcAlphaMeanErrors.push(numeric.norm2(numeric.sub(exactAlphaMean, testAlpha.mean)));
            mcAlphaCovarianceErrors.push(numeric.norm2(numeric.sub(exactAlphaCovariance, testAlpha.covariance)));
            mcBetaMeanErrors.push(Math.abs(exactBetaMean - testBeta.mean));
            mcBetaVarianceErrors.push(Math.abs(exactBetaVariance - testBeta.variance));
            mcGammaMeanErrors.push(Math.abs(exactGammaMean - testGamma.mean));
            mcGammaVarianceErrors.push(Math.abs(exactGammaVariance - testGamma.variance));
        }

        var nQuads = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
        var iQuads, weights;
        var qSigmaMeanErrors = [], qSigmaCovarianceErrors = [], qAlphaMeanErrors = [], qAlphaCovarianceErrors = [], qBetaMeanErrors = [], qBetaVarianceErrors = [], qGammaMeanErrors = [], qGammaVarianceErrors = [];
        for (iQuads = 0; iQuads < nQuads.length; iQuads++) {
            var sigmaQ = PrairieStats.normalQuadN(sigmaMean, sigmaCovariance, nQuads[iQuads]);
            var alphaQ = PrairieStats.normalQuadN(alphaMean, alphaCovariance, nQuads[iQuads]);
            var betaQ = PrairieStats.normalQuad(betaMean, betaVariance, nQuads[iQuads]);
            var gammaAB = PrairieStats.betaMeanVarToAB(gammaMean, gammaVariance);
            var gammaQ = PrairieQuad.betaQuad(gammaAB.a, gammaAB.b, nQuads[iQuads]);
            var sigma, alpha, beta, gamma;
            var sigmaStats = new PrairieStats.OnlineStats();
            var alphaStats = new PrairieStats.OnlineStats();
            var betaStats = new PrairieStats.OnlineStats();
            var gammaStats = new PrairieStats.OnlineStats();
            for (var iSigma = 0; iSigma < sigmaQ.x.length; iSigma++)
                for (var iAlpha = 0; iAlpha < alphaQ.x.length; iAlpha++)
                    for (var iBeta = 0; iBeta < betaQ.x.length; iBeta++)
                        for (var iGamma = 0; iGamma < gammaQ.x.length; iGamma++) {
                            sigma = sigmaQ.x[iSigma];
                            alpha = alphaQ.x[iAlpha];
                            beta = betaQ.x[iBeta];
                            gamma = gammaQ.x[iGamma];
                            weight = sigmaQ.w[iSigma] * alphaQ.w[iAlpha] * betaQ.w[iBeta] * gammaQ.w[iGamma];
                            p = this.observationProb(correct, sigma, alpha, beta, gamma).p;
                            weight *= p;
                            sigmaStats.add(sigma, weight);
                            alphaStats.add(alpha, weight);
                            betaStats.add(beta, weight);
                            gammaStats.add(gamma, weight);
                        }
            testSigma = {mean: sigmaStats.mean, covariance: sigmaStats.covariance};
            testAlpha = {mean: alphaStats.mean, covariance: alphaStats.covariance};
            testBeta = {mean: betaStats.mean, variance: betaStats.variance};
            testGamma = {mean: gammaStats.mean, variance: gammaStats.variance};

            console.log("*************************************************");
            console.log("nQuads", nQuads[iQuads]);
            console.log("sigma", testSigma);
            console.log("alpha", testAlpha);
            console.log("beta", testBeta);
            console.log("gamma", testGamma);

            qSigmaMeanErrors.push(numeric.norm2(numeric.sub(exactSigmaMean, testSigma.mean)));
            qSigmaCovarianceErrors.push(numeric.norm2(numeric.sub(exactSigmaCovariance, testSigma.covariance)));
            qAlphaMeanErrors.push(numeric.norm2(numeric.sub(exactAlphaMean, testAlpha.mean)));
            qAlphaCovarianceErrors.push(numeric.norm2(numeric.sub(exactAlphaCovariance, testAlpha.covariance)));
            qBetaMeanErrors.push(Math.abs(exactBetaMean - testBeta.mean));
            qBetaVarianceErrors.push(Math.abs(exactBetaVariance - testBeta.variance));
            qGammaMeanErrors.push(Math.abs(exactGammaMean - testGamma.mean));
            qGammaVarianceErrors.push(Math.abs(exactGammaVariance - testGamma.variance));
        }

        console.log("*************************************************");
        console.log("*************************************************");
        console.log("*************************************************");
        console.log("*************************************************");
        console.log("Monte Carlo", "nSamples", nSamples);
        console.log("mcSigmaMeanErrors", mcSigmaMeanErrors);
        console.log("mcSigmaCovarianceErrors", mcSigmaCovarianceErrors);
        console.log("mcAlphaMeanErrors", mcAlphaMeanErrors);
        console.log("mcAlphaCovarianceErrors", mcAlphaCovarianceErrors);
        console.log("mcBetaMeanErrors", mcBetaMeanErrors);
        console.log("mcBetaVarianceErrors", mcBetaVarianceErrors);
        console.log("mcGammaMeanErrors", mcGammaMeanErrors);
        console.log("mcGammaVarianceErrors", mcGammaVarianceErrors);
        console.log("*************************************************");
        console.log("*************************************************");
        console.log("*************************************************");
        console.log("*************************************************");
        console.log("Quadrature", "nQuads", nQuads);
        console.log("qSigmaMeanErrors", qSigmaMeanErrors);
        console.log("qSigmaCovarianceErrors", qSigmaCovarianceErrors);
        console.log("qAlphaMeanErrors", qAlphaMeanErrors);
        console.log("qAlphaCovarianceErrors", qAlphaCovarianceErrors);
        console.log("qBetaMeanErrors", qBetaMeanErrors);
        console.log("qBetaVarianceErrors", qBetaVarianceErrors);
        console.log("qGammaMeanErrors", qGammaMeanErrors);
        console.log("qGammaVarianceErrors", qGammaVarianceErrors);
        console.log("*************************************************");
        console.log("*************************************************");
        console.log("*************************************************");
        console.log("*************************************************");

        /*
        *************************************************
        *************************************************
        *************************************************
        *************************************************
        Monte Carlo nSamples [ 10, 100, 1000, 10000, 100000, 1000000 ]
        mcSigmaMeanErrors [ 0.27343223706187164, 0.017445369749632046, 0.02000851389921783, 0.015476862155459714, 0.0021200590745992422, 0.0012124772149351667 ]
        mcSigmaCovarianceErrors [ 0.08262369343729853, 0.0030240606890804484, 0.0005617829130167342, 0.0000031919276757327453, 8.987420103705316e-7, 7.73840254901114e-7 ]
        mcAlphaMeanErrors [ 0.3197495548461045, 0.0715914225753521, 0.03183434035114506, 0.005407863224281847, 0.0032898034817241927, 0.0008435963727812724 ]
        mcAlphaCovarianceErrors [ 0.007162959322659488, 0.0008844823212232288, 0.00014425065424691368, 0.0000014083155844297563, 0.000003239463791688652, 1.5445019600405367e-7 ]
        mcBetaMeanErrors [ 0.10906655028329876, 0.07098707889895775, 0.0006273218460630392, 0.0012588180196282384, 0.00043697931776526255, 0.0000940981029343424 ]
        mcBetaVarianceErrors [ 0.03477530646894514, 0.002523920150396375, 0.0007017057785018571, 0.00021977239845788477, 0.00017658111460988613, 0.00026428864567058785 ]
        mcGammaMeanErrors [ 0.011250494108801523, 0.01908879334103096, 0.0005342792172079447, 0.0016803805462132365, 0.0007153903512033266, 0.00016552635402584948 ]
        mcGammaVarianceErrors [ 0.0005425856951634233, 0.00046231233218507056, 0.00033633246988974165, 0.0003184790777750555, 0.00007059552468357579, 0.00005000794687219125 ]
        *************************************************
        *************************************************
        *************************************************
        *************************************************
        Quadrature nQuads [ 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ]
        qSigmaMeanErrors [ 0.003214442234040472, 0.000053004904951835374, 0.000026521766299666607, 0.00000847191499269257, 0.0000020090182263628422, 3.0939605905790984e-7, 1.0931638819917815e-7, 1.3023506327317336e-8, 5.927585264535087e-9, 1.1812837047426469e-9 ]
        qSigmaCovarianceErrors [ 0.00009842631070590927, 0.0000017590053085028026, 2.9221174033692813e-8, 3.759275565284573e-10, 6.022062202045801e-12, 6.26096088748135e-14, 2.0850530911698817e-14, 2.754827570577872e-15, 3.3093917179711212e-16, 2.26361852657314e-17 ]
        qAlphaMeanErrors [ 0.0007694903295592696, 0.00008077856028281678, 0.00001277536333141856, 3.980887197880014e-7, 1.9409303797094383e-7, 5.8862540775619224e-8, 2.997636052146566e-8, 2.5672845387355256e-9, 4.113848058805616e-9, 1.3089323073309387e-10 ]
        qAlphaCovarianceErrors [ 8.904040975488427e-7, 2.756793003409401e-10, 6.07893050831436e-11, 1.998574573741388e-13, 1.0963107290972421e-14, 8.18344849132921e-16, 4.1276182392206086e-16, 1.870082340305983e-17, 1.4271721796165993e-17, 2.425723071989352e-19 ]
        qBetaMeanErrors [ 0.00018992452978347507, 0.00004557503178173605, 0.000008508534222240183, 0.0000015371673461883617, 4.080287859808962e-7, 3.565783915360221e-8, 1.4933134451222685e-8, 1.149652595344719e-11, 3.0373784043469243e-10, 4.560324340374677e-12 ]
        qBetaVarianceErrors [ 0.0006574469469769473, 0.000015614026559876426, 8.125583956936078e-7, 1.8250800172536774e-7, 4.761511343542857e-8, 1.4691444102932216e-8, 8.04556513078758e-9, 4.991383556474105e-10, 8.51491890885292e-10, 1.2290765627476219e-11 ]
        qGammaMeanErrors [ 0.00005088215018837772, 0.0000047241613198162336, 5.361844052642617e-7, 1.6817701231630622e-8, 1.102839417010948e-9, 2.1840716457610654e-9, 9.208934309556938e-10, 1.5874590530984278e-10, 9.581807569603029e-11, 7.990164085924789e-12 ]
        qGammaVarianceErrors [ 0.000007786062350854592, 7.231608950795942e-7, 8.207472532335836e-8, 2.574330904697719e-9, 1.688194081056471e-10, 3.343158042068417e-10, 1.4096834290155957e-10, 2.4290524452963425e-11, 1.4677059914647295e-11, 1.2154027784205823e-12 ]
        *************************************************
        *************************************************
        *************************************************
        *************************************************
        */
    };

    return PrairieModel;
});
