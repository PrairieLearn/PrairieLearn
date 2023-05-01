define(['mersenne', 'underscore', 'PrairieGeom'], function (mersenne, _, PrairieGeom) {
  /** RandomGenerator constructor.

        @param {String} seed (Optional, default uses current time) Seed value for the generator, must be in base 36.
    */
  function RandomGenerator(seed) {
    seed = seed === undefined ? Date.now() : parseInt(seed, 36);
    this._mersenne = new mersenne.MersenneTwister19937();
    /* jshint camelcase: false */
    this._mersenne.init_genrand(seed);
  }

  /** Return a random real between min and max (exclusive).

        @param {Number} min (Optional, default 0) The minimum possible value.
        @param {Number} max (Optional, default 1) The maximum possible value.
        @return {Number} A randomly, uniformly selected real number between min and max.
    */
  RandomGenerator.prototype.randReal = function (min, max) {
    min = min === undefined ? 0 : min;
    max = max === undefined ? 1 : max;
    /* jshint camelcase: false */
    return min + this._mersenne.genrand_real2() * (max - min);
  };

  /** Return a random integer between min and max (inclusive).

        @param {Number} min (Optional, default 0) The minimum possible value.
        @param {Number} max (Optional, default 10) The maximum possible value.
        @param {Number} step (Optional, default 1) The step incrememnt for possible values.
        @return {Number} A randomly, uniformly selected integer between min and max with given step.
    */
  RandomGenerator.prototype.randInt = function (min, max, step) {
    min = min === undefined ? 0 : min;
    max = max === undefined ? 10 : max;
    step = step === undefined ? 1 : step;
    var n = (max - min) / step + 1;
    /* jshint camelcase: false */
    var i = Math.floor(this._mersenne.genrand_real2() * n);
    return min + i * step;
  };

  /** Return a non-zero random integer between min and max (inclusive).

        @param {Number} min (Optional, default 1) The minimum possible value.
        @param {Number} max (Optional, default 10) The maximum possible value.
        @param {Number} step (Optional, default 1) The step incrememnt for possible values.
        @return {Number} A randomly, uniformly selected non-zero integer between min and max with given step.
    */
  RandomGenerator.prototype.randIntNonZero = function (min, max, step) {
    min = min === undefined ? 0 : min;
    max = max === undefined ? 10 : max;
    step = step === undefined ? 1 : step;
    var n = (max - min) / step + 1;
    var i, r;
    do {
      /* jshint camelcase: false */
      i = Math.floor(this._mersenne.genrand_real2() * n);
      r = min + i * step;
    } while (r === 0);
    return r;
  };

  /** Return a random boolean.

        @param {Number} trueProb (Optional, default 0.5) The probability of returning true.
        @return {Number} A randomly selected Boolean value (true or false).
    */
  RandomGenerator.prototype.randBool = function (trueProb) {
    trueProb = trueProb === undefined ? 0.5 : trueProb;
    /* jshint camelcase: false */
    if (this._mersenne.genrand_real2() < trueProb) return true;
    return false;
  };

  /** Return a random sign (-1 or 1).

        @param {Number} posProb (Optional, default 0.5) The probability of returning 1.
        @return {Number} A randomly selected sign value (-1 or 1).
    */
  RandomGenerator.prototype.randSign = function (posProb) {
    posProb = posProb === undefined ? 0.5 : posProb;
    /* jshint camelcase: false */
    if (this._mersenne.genrand_real2() < posProb) return 1;
    return -1;
  };

  /** Return a random array with real elements between min and max (exclusive).

        @param {Number} n (Optional, default 3) The length of the array.
        @param {Number} min (Optional, default 0) The minimum possible value.
        @param {Number} max (Optional, default 1) The maximum possible value.
        @return {Number} An array of random numbers.
    */
  RandomGenerator.prototype.randArrayReal = function (n, min, max) {
    n = n === undefined ? 3 : n;
    var a = [];
    for (var i = 0; i < n; i++) {
      a.push(this.randReal(min, max));
    }
    return a;
  };

  /** Return a random array with integer elements between min and max (inclusive).

        @param {Number} n (Optional, default 3) The length of the array.
        @param {Number} min (Optional, default 0) The minimum possible value.
        @param {Number} max (Optional, default 10) The maximum possible value.
        @param {Number} step (Optional, default 1) The step incrememnt for possible values.
        @return {Number} An array of random numbers.
    */
  RandomGenerator.prototype.randArrayInt = function (n, min, max, step) {
    n = n === undefined ? 3 : n;
    var a = [];
    for (var i = 0; i < n; i++) {
      a.push(this.randInt(min, max, step));
    }
    return a;
  };

  /** Return a non-zero random array with integer elements between min and max (inclusive).

        @param {Number} n (Optional, default 3) The length of the array.
        @param {Number} min (Optional, default 1) The minimum possible value.
        @param {Number} max (Optional, default 10) The maximum possible value.
        @param {Number} step (Optional, default 1) The step incrememnt for possible values.
        @return {Number} An array of random numbers, not all zero.
    */
  RandomGenerator.prototype.randArrayIntNonZero = function (n, min, max, step) {
    n = n === undefined ? 3 : n;
    var a, allZero, i, e;
    do {
      allZero = true;
      a = [];
      for (i = 0; i < n; i++) {
        e = this.randInt(min, max, step);
        a.push(e);
        if (e !== 0) {
          allZero = false;
        }
      }
    } while (allZero);
    return a;
  };

  /** Return a random array with unique integer elements between min and max (inclusive).

        @param {Number} n (Optional, default 3) The length of the array.
        @param {Number} min (Optional, default 0) The minimum possible value.
        @param {Number} max (Optional, default 10) The maximum possible value.
        @param {Number} step (Optional, default 1) The step incrememnt for possible values.
        @return {Number} An array of unique random numbers.
    */
  RandomGenerator.prototype.randArrayUniqueInt = function (n, min, max, step) {
    n = n === undefined ? 3 : n;
    var a = [];
    while (a.length < n) {
      var e = this.randInt(min, max, step);
      var duplicate = false;
      for (var i = 0; i < n; i++) {
        if (a[i] == e) {
          duplicate = true;
          break;
        }
      }
      if (!duplicate) {
        a.push(e);
      }
    }
    return a;
  };

  /** Return a random element from an array.

        @param {Array} arr The array of options.
        @param {Array} probs (Optional, default equal) The probabilities of each element.
        @return One of the elements of the array, chosen randomly and uniformly.
    */
  RandomGenerator.prototype.randElem = function (arr, probs) {
    var n = arr.length;
    var i;
    if (probs) {
      var tot = 0;
      for (i = 0; i < n; i++) {
        tot += probs[i];
      }
      var p = this.randReal();
      var sum = 0;
      for (i = 0; i < n; i++) {
        sum += probs[i] / tot;
        if (p < sum) {
          break;
        }
      }
      i = Math.min(i, n - 1);
    } else {
      i = this.randInt(0, n - 1);
    }
    return arr[i];
  };

  /** Return an array consisting of n copies of the given element.

        @param {Number} n The number of times to repeat the element.
        @param {Object} elem The element to repeat.
        @return {Array} An array with n elements [elem, elem, ..., elem].
    */
  RandomGenerator.prototype.repeat = function (n, elem) {
    var arr = [];
    for (var i = 0; i < n; i++) {
      arr.push(elem);
    }
    return arr;
  };

  /** Return n random elements from an array without repetition.

        @param {Number} n The number of elements required.
        @param {Array} arr The array of options.
        @param {Array} probs (Optional) An array of element probabilities.
        @return A subset of the array, chosen randomly and uniformly.
    */
  RandomGenerator.prototype.randNElem = function (n, arr, probs) {
    var length = arr.length;
    if (n > length) return arr;
    var returnArr = [];
    var avail = arr.slice(),
      iElem,
      ind;
    if (probs) var p = probs.slice();
    for (iElem = 0; iElem < n; iElem++) {
      if (probs) {
        ind = this.randElem(_.range(avail.length), p);
        p.splice(ind, 1);
      } else {
        ind = this.randInt(0, avail.length - 1);
      }
      returnArr.push(avail[ind]);
      avail.splice(ind, 1);
    }
    return returnArr;
  };

  /** Return a random permutation of 0,...,(n-1).

        @param {Number} n The number of elements in the permutation.
        @return {Array} A permutation of 0,...,(n-1).
    */
  RandomGenerator.prototype.randPerm = function (n) {
    var a = [],
      i,
      j,
      tmp;
    for (i = 0; i < n; i++) {
      a.push(i);
    }
    for (i = 0; i < n - 1; i++) {
      j = this.randInt(i, n - 1);
      tmp = a[i];
      a[i] = a[j];
      a[j] = tmp;
    }
    return a;
  };

  /** Permute an array in place with the given permutation.

        @param {Array} perm The permutation.
        @param {Array} arr The array.
    */
  RandomGenerator.prototype.permuteArray = function (perm, arr) {
    var save = [],
      i;
    for (i = 0; i < arr.length; i++) {
      save.push(arr[i]);
    }
    for (i = 0; i < arr.length; i++) {
      arr[i] = save[perm[i]];
    }
  };

  /** Permute the arrays in place with the given permutation.

        @param {Array} perm The permutation.
        @param {Array} a (Optional) Arrays.
    */
  RandomGenerator.prototype.permute = function (perm, a0, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    if (a0) this.permuteArray(perm, a0);
    if (a1) this.permuteArray(perm, a1);
    if (a2) this.permuteArray(perm, a2);
    if (a3) this.permuteArray(perm, a3);
    if (a4) this.permuteArray(perm, a4);
    if (a5) this.permuteArray(perm, a5);
    if (a6) this.permuteArray(perm, a6);
    if (a7) this.permuteArray(perm, a7);
    if (a8) this.permuteArray(perm, a8);
    if (a9) this.permuteArray(perm, a9);
  };

  /** Randomly shuffle the given arrays in place with the same permutation.

        @param {Array} a (Optional) Arrays.
        @return {Array} the permutation used to shuffle.
    */
  RandomGenerator.prototype.shuffle = function (a0, a1, a2, a3, a4, a5, a6, a7, a8, a9) {
    var perm = this.randPerm(a0.length);
    this.permute(perm, a0, a1, a2, a3, a4, a5, a6, a7, a8, a9);
    return perm;
  };

  /** Make nSel near-uniform selections from nCat categories, returning the number of selections per category.

        @param {Number} nSel The number of selections.
        @param {Object} cats Either a Number (the number of categories) or an array of category weights.
        @return {Array} A length-nCat array giving the number of selections per category.
    */
  RandomGenerator.prototype.randCategoryChoices = function (nSel, cats) {
    var catWeights = _.isArray(cats) ? cats : _.times(cats, _.constant(1));
    var nCat = catWeights.length;
    var totWeight = numeric.sum(catWeights);
    var nSelIdeals = numeric.mul(catWeights, nSel / totWeight);
    var sels = numeric.floor(nSelIdeals);
    var excessProbs = numeric.sub(nSelIdeals, sels);
    var extras = this.randNElem(nSel - numeric.sum(sels), _.range(nCat), excessProbs);
    _(extras).each(function (i) {
      sels[i]++;
    });
    return sels;
  };

  /** Return a random polynomial.

        @param {Number} degree (Optional, default 2) The degree of the polynomial.
        @param {Number} maxCoeff (Optional, default 3) The maximum coefficient value.
        @param {Number} zeroProb (Optional, default 0.5) The additional probability to zero lower-degree coefficients.
        @param {Number} negCoeffs (Optional, default true) Whether negative coefficients are allowed.
        @return {Array} The polynomial coefficients [a_0, a_1, ..., a_n].
    */
  RandomGenerator.prototype.randPoly = function (degree, maxCoeff, zeroProb, negCoeffs) {
    degree = degree === undefined ? 2 : degree;
    maxCoeff = maxCoeff === undefined ? 3 : maxCoeff;
    zeroProb = zeroProb === undefined ? 0.5 : zeroProb;
    negCoeffs = negCoeffs === undefined ? true : negCoeffs;
    var minCoeff = negCoeffs ? -maxCoeff : 0;
    var i,
      p = [];
    for (i = 0; i <= degree; i++) {
      if (i < degree) {
        if (this.randReal() < zeroProb) {
          p.push(0);
        } else {
          p.push(this.randInt(minCoeff, maxCoeff));
        }
      } else {
        p.push(this.randIntNonZero(minCoeff, maxCoeff));
      }
    }
    return p;
  };

  /** Return a random exponential.

        @param {Number} maxCoeff (Optional, default 3) The maximum coefficient value.
        @param {Number} maxExp (Optional, default 3) The maximum exponent value.
        @return {Object} The exponential object.
    */
  RandomGenerator.prototype.randExp = function (maxCoeff, maxExp) {
    maxCoeff = maxCoeff === undefined ? 3 : maxCoeff;
    maxExp = maxExp === undefined ? 3 : maxExp;
    return {
      coeff: this.randIntNonZero(-maxCoeff, maxCoeff),
      exp: this.randIntNonZero(-maxExp, maxExp),
    };
  };

  /** Return a random trig function.

        @param {Number} maxCoeff (Optional, default 3) The maximum coefficient value.
        @param {Number} maxFreq (Optional, default 3) The maximum frequency value.
        @return {Object} The trig function object.
    */
  RandomGenerator.prototype.randTrig = function (maxCoeff, maxFreq) {
    maxCoeff = maxCoeff === undefined ? 3 : maxCoeff;
    maxFreq = maxFreq === undefined ? 3 : maxFreq;
    return {
      coeff: this.randIntNonZero(-maxCoeff, maxCoeff),
      fcn: this.randElem(['sin', 'cos']),
      freq: this.randIntNonZero(-maxFreq, maxFreq),
    };
  };

  /** Return a random function.

        @return {Object} The function object.
    */
  RandomGenerator.prototype.randFunc = function () {
    /* jshint indent: false */
    switch (this.randInt(1, 3)) {
      case 1:
        return { fcn: 'poly', data: this.randPoly() };
      case 2:
        return { fcn: 'exp', data: this.randExp() };
      case 3:
        return { fcn: 'trig', data: this.randTrig() };
    }
  };

  /** Return an array of random functions.

        @param {Number} n (Optional, default 3) The length of the array to return.
        @return {Array} The array of function objects.
    */
  RandomGenerator.prototype.randArrayFunc = function (n) {
    n = n === undefined ? 3 : n;
    var a = [];
    for (var i = 0; i < n; i++) {
      a.push(this.randFunc());
    }
    return a;
  };

  /** Determine how difficult it is to solve for an answer variablem given certain other variables.

        @param {Number} answerInd The index of the answer variable to find.
        @param {Array} givenInds A list of indexes that are given.
        @param {Array} lhs The left-hand-side of the system.
        @return {Number} Difficulty level (1 = single eqn, 2 = 2 sequential eqns, 3 = 2 simultaneous eqns, 4 = harder)
    */
  RandomGenerator.prototype.solveDifficulty = function (answerInd, givenInds, lhs) {
    var unknownInds = _.chain(_.range(0, lhs[0].length))
      .difference(givenInds)
      .without(answerInd)
      .value();

    if (
      _(lhs).some(function (row) {
        return (
          row[answerInd] !== 0 &&
          _(unknownInds).every(function (i) {
            return row[i] === 0;
          })
        );
      })
    ) {
      return 1;
    }

    if (
      _(unknownInds).some(function (i) {
        var extraUnknownInds = _(unknownInds).without(i);
        return (
          _(lhs).some(function (row) {
            return (
              row[answerInd] !== 0 &&
              row[i] !== 0 &&
              _(extraUnknownInds).every(function (i) {
                return row[i] === 0;
              })
            );
          }) &&
          _(lhs).some(function (row) {
            return (
              row[answerInd] === 0 &&
              row[i] !== 0 &&
              _(extraUnknownInds).every(function (i) {
                return row[i] === 0;
              })
            );
          })
        );
      })
    ) {
      return 2;
    }

    if (
      _(unknownInds).some(function (i) {
        var extraUnknownInds = _(unknownInds).without(i);
        var usefulRows = _(lhs).filter(function (row) {
          return (
            row[answerInd] !== 0 &&
            row[i] !== 0 &&
            _(extraUnknownInds).every(function (i) {
              return row[i] === 0;
            })
          );
        });
        return usefulRows.length >= 2;
      })
    ) {
      return 3;
    }

    return 4;
  };

  /** Determine the maximum solution difficulty over a range of answer variables.

        @param {Array} answerInds The indexes of the answer variables to find.
        @param {Array} givenInds A list of indexes that are given.
        @param {Array} lhs The left-hand-side of the system.
        @return {Number} Maximum difficulty level over the answerInds (see solveDifficulty()).
    */
  RandomGenerator.prototype.maxSolveDifficulty = function (answerInds, givenInds, lhs) {
    var that = this;
    return _.chain(answerInds)
      .map(function (answerInd) {
        return that.solveDifficulty(answerInd, givenInds, lhs);
      })
      .max()
      .value();
  };

  /** Choose variables to specify so that the answer is easy to find.

        @param {Number} difficulty A scalar measure of difficulty (see solveDifficulty()).
        @param {Array} varGroups An array of groups, each being an array of variable indices.
        @param {Number} answerGroup Which group is the desired answer.
        @param {Array} lhs The left-hand-side of the equation system.
        @return {Array} List of groups to specify, or null if no solution could be found.
    */
  RandomGenerator.prototype.chooseGiven = function (difficulty, varGroups, answerGroup, lhs) {
    var givenGroups, givenInds, maxDifficulty, g;
    var nTrials = 0;
    do {
      givenGroups = [];
      remainingGroups = _(_.range(0, varGroups.length)).without(answerGroup);
      givenInds = [];
      maxDifficulty = this.maxSolveDifficulty(varGroups[answerGroup], givenInds, lhs);
      while (maxDifficulty > difficulty) {
        if (nTrials++ > 1000) return null; // failure
        g = this.randElem(remainingGroups);
        givenGroups.push(g);
        remainingGroups = _(remainingGroups).without(g);
        givenInds = givenInds.concat(varGroups[g]);
        maxDifficulty = this.maxSolveDifficulty(varGroups[answerGroup], givenInds, lhs);
      }
    } while (maxDifficulty !== difficulty);
    return givenGroups;
  };

  return {
    RandomGenerator: RandomGenerator,
  };
});
