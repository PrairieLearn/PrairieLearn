define(['underscore'], function (_) {
  /** Format a floating point number with a fixed precision after the decimal point.

        @param {Number} x The floating point number.
        @param {Number} n The number of digits (0 or more, integer).
        @return {String} The formatted string.
    */
  var floatFixedString = function (x, n) {
    if (_.isNumber(x)) return x.toFixed(n);
    return '';
  };

  /** Make a LaTeX math array from the given entries, dropping rows with only empty strings.

        @param {Array} entries An array of row arrays that contain element strings.
        @param {String} The TeX array string.
    */
  var makeTeXArray = function (entries) {
    return _.chain(entries)
      .filter(function (row) {
        return _(row).some(function (e) {
          return e.length > 0;
        });
      })
      .map(function (row, i, list) {
        return _(row)
          .map(function (e) {
            return e.length > 0 ? e : ' &amp; ';
          })
          .join(' &amp; ');
      })
      .value()
      .join(' \\\\ ');
  };

  /** Join strings with commas and "and" to make a list.

        @param {Array} items An array of strings.
        @params {String} The single list string.
    */
  var textList = function (items) {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return items[0] + ' and ' + items[1];
    return _(items).initial().join(', ') + ', and ' + items[items.length - 1];
  };

  /** Find the gcd (greatest common divisor) of two integers with Euclid's algorithm.

        @param {Number} a First integer.
        @param {Number} b Second integer.
        @return {Number} The gcd of a and b.
    */
  var gcd = function (a, b) {
    if (b === 0) return a;
    var aModB = ((a % b) + b) % b;
    return gcd(b, aModB);
  };

  /** Convert a two-element integer array [a, b] to a TeX fraction \frac{a}{b}, simplified.

        @param {Array} elems The two-element array [a, b].
        @return {String} The formatted TeX string "\frac{a}{b}" or "a", as appropriate.
    */
  var rationalString = function (elems) {
    var a = elems[0];
    var b = elems[1];
    if (b === 0) return '{\rm divide-by-zero}';
    if (a === 0) return '0';
    var g = gcd(elems[0], elems[1]);
    if (g !== 0) {
      a = elems[0] / g;
      b = elems[1] / g;
    }
    if (b < 0) {
      a = -a;
      b = -b;
    }
    if (b === 0) {
      return '\\infty';
    } else if (a === 0) {
      return '0';
    } else if (b === 1) {
      return String(a);
    } else if (a < 0) {
      return '-\\frac{' + String(Math.abs(a)) + '}{' + String(b) + '}';
    } else {
      return '\\frac{' + String(a) + '}{' + String(b) + '}';
    }
  };

  /** Same as rationalString(), but as a coefficient.

        @param {Array} elems The two-element array [a, b].
        @return {String} The formatted TeX string "\frac{a}{b}", "a", or "-", as appropriate.
    */
  var rationalCoeffString = function (elems) {
    var s = rationalString(elems);
    switch (s /* jshint indent: false */) {
      case '1':
        return '';
      case '-1':
        return '-';
    }
    return s;
  };

  /** Same as rationalCoeffString(), but with the operand as an argument, displayed if non-zero.

        @param {Array} elems The two-element array [a, b].
        @param {String} op The operand.
        @return {String} The formatted TeX string "\frac{a}{b} op", "a op", "-op", or "0", as appropriate.
    */
  var rationalCoeffZeroString = function (elems, op) {
    var s = rationalCoeffString(elems);
    if (s === '0') return s;
    return s + op;
  };

  /** Convert a vector to a TeX string with brackets.

        @param {Array} vec The vector components [a_1, a_2, ...], each a number or string.
        @return {String} The formatted vector TeX string.
    */
  var vectorString = function (vec) {
    return '[' + _(vec).map(String).join(', ') + ']';
  };

  /** Convert a vector to a TeX string with the given basis elements.

        @param {Array} vec The vector components [a_1, a_2, ...], each a number or string.
        @param {String} basis1 The first basis element (can be "").
        @param {String} basis2 The second basis element (can be "").
        @param {String} basis3 The third basis element (can be "").
        @return {String} The formatted vector TeX string.
    */
  var vectorInBasisString = function (vec, basis1, basis2, basis3, basis4, basis5, basis6) {
    basis1 = basis1 === undefined ? '' : basis1;
    basis2 = basis1 === undefined ? '' : basis2;
    basis3 = basis1 === undefined ? '' : basis3;
    basis4 = basis1 === undefined ? '' : basis4;
    basis5 = basis1 === undefined ? '' : basis5;
    basis6 = basis1 === undefined ? '' : basis6;
    var basis = [basis1, basis2, basis3, basis4, basis5, basis6];
    var i,
      e,
      s = [];
    for (i = 0; i < vec.length; i++) {
      e = String(vec[i]);
      if (e === '0') continue;
      if (e === '1' && basis[i] !== '') {
        e = '';
      }
      if (e === '-1' && basis[i] !== '') {
        e = '-';
      }
      e += basis[i];
      if (s.length > 0 && e[0] !== '-') {
        e = '+' + e;
      }
      s.push(e);
    }
    if (s.length === 0) {
      s.push('0');
    }
    return s.join(' ');
  };

  /** Convert a vector to a TeX string with Cartesian basis.

        @param {Array} vec The vector components [a_1, a_2, ...], each a number.
        @return {String} The formatted vector TeX string.
    */
  var cartesianVectorString = function (vec) {
    return vectorInBasisString(vec, '\\hat\\imath', '\\hat\\jmath', '\\hat{k}');
  };

  /** Convert a vector to a TeX string with cylindrical basis.

        @param {Array} vec The vector components [a_1, a_2, ...], each a number.
        @return {String} The formatted vector TeX string.
    */
  var cylindricalVectorString = function (vec) {
    return vectorInBasisString(vec, '\\hat{e}_r', '\\hat{e}_{\\theta}', '\\hat{k}');
  };

  /** Convert a vector to a TeX string with the given basis elements and fixed precision.

        @param {Array} vec The vector components [a_1, a_2, ...], each a number or string.
        @param {Number} n The number of digits after the decimal point (0 or more, integer).
        @param {String} basis1 The first basis element (can be "").
        @param {String} basis2 The second basis element (can be "").
        @param {String} basis3 The third basis element (can be "").
        @return {String} The formatted vector TeX string.
    */
  var vectorFixedString = function (vec, n, basis1, basis2, basis3) {
    var vecFixed = _(vec).map(function (x) {
      return floatFixedString(x, n);
    });
    return vectorInBasisString(vecFixed, basis1, basis2, basis3);
  };

  /** Convert a vector to a TeX string with Cartesian basis and fixed precision.

        @param {Array} vec The vector components [a_1, a_2, ...], each a number.
        @param {Number} n The number of digits after the decimal point (0 or more, integer).
        @return {String} The formatted vector TeX string.
    */
  var cartesianVectorFixedString = function (vec, n) {
    return vectorFixedString(vec, n, '\\hat\\imath', '\\hat\\jmath', '\\hat{k}');
  };

  /** Convert a polynomial to a TeX string.

        @param {Array} poly The polynomial coefficients [a_0, a_1, ...], each a number.
        @param {String} indVar The independent variable (e.g., "t", "x").
        @return {String} The formatted polynomial TeX string (e.g., "a_0 + a_1 t + ...").
    */
  var polyString = function (poly, indVar) {
    var i,
      vec = [],
      basis = ['', '', '', '', '', ''];
    if (poly.length > 6) throw Error('poly length exceeds 6');
    for (i = poly.length - 1; i >= 0; i--) {
      vec.push(poly[i]);
      if (i > 1) {
        basis[poly.length - 1 - i] = indVar + '^' + i;
      } else if (i === 1) {
        basis[poly.length - 1 - i] = indVar;
      }
    }
    return vectorInBasisString(vec, basis[0], basis[1], basis[2], basis[3], basis[4], basis[5]);
  };

  /** Convert a polynomial to a TeX string with parentheses if needed.

        @param {Array} poly The polynomial coefficients [a_0, a_1, ...], each a number.
        @param {String} indVar The independent variable (e.g., "t", "x").
        @return {String} The formatted polynomial TeX string (e.g., "(a_0 + a_1 t + ...)").
    */
  var parenPolyString = function (poly, indVar) {
    var e = polyString(poly, indVar);
    var nnz = _.without(poly, 0).length;
    if (nnz > 1) {
      e = '(' + e + ')';
    }
    return e;
  };

  /** Convert a polynomial vector function to a TeX string.

        @param {Array} vecPoly The vector of polynomial coefficients [p_1, p_2, ...], each a poly array.
        @param {String} indVar The independent variable (e.g., "t", "x").
        @param {String} basis1 The first basis element (can be "").
        @param {String} basis2 The second basis element (can be "").
        @param {String} basis3 The third basis element (can be "").
        @return {String} The formatted polynomial vector TeX string.
    */
  var vectorPolyString = function (vecPoly, indVar, basis1, basis2, basis3) {
    basis1 = basis1 === undefined ? '' : basis1;
    basis2 = basis1 === undefined ? '' : basis2;
    basis3 = basis1 === undefined ? '' : basis3;
    var basis = [basis1, basis2, basis3];
    var i,
      e,
      s = [];
    for (i = 0; i < vecPoly.length; i++) {
      e = parenPolyString(vecPoly[i], indVar);
      if (e === '0') continue;
      if (e === '1' && basis[i] !== '') {
        e = '';
      }
      if (e === '-1' && basis[i] !== '') {
        e = '-';
      }
      e += basis[i];
      if (s.length > 0 && e[0] !== '-') {
        e = '+' + e;
      }
      s.push(e);
    }
    if (s.length === 0) {
      s.push('0');
    }
    return s.join(' ');
  };

  /** Convert a polynomial vector function to a TeX string with Cartesian basis.

        @param {Array} vecPoly The vector of polynomial coefficients [p_1, p_2, ...], each a poly array.
        @param {String} indVar The independent variable (e.g., "t", "x").
        @return {String} The formatted polynomial vector TeX string.
    */
  var cartesianVectorPolyString = function (vecPoly, indVar) {
    return vectorPolyString(vecPoly, indVar, '\\hat\\imath', '\\hat\\jmath', '\\hat{k}');
  };

  /** Render a number as a scalar coefficient, so 1 and -1 are convert to "" and "-".

        @param {Number} coeff The scalar coefficient.
        @return {String} The formatted coefficient.
    */
  var scalarCoeff = function (coeff) {
    /* jshint indent: false */
    switch (coeff) {
      case 1:
        return '';
      case -1:
        return '-';
      default:
        return String(coeff);
    }
  };

  /** Render a scalar product with collapsing of 1, -1, and 0.

        @param {Number} coeff The scalar coefficient.
        @param {String} arg1 The second argument (if no arg2), or the spacing between the arguments.
        @param {String} arg2 (Optional) If present, The second argument.
        @return {String} The formatted product.
    */
  var scalarProduct = function (coeff, arg1, arg2) {
    var space, arg;
    if (arg2 === undefined) {
      arg = arg1;
      space = '';
    } else {
      arg = arg2;
      space = arg1;
    }
    var c = scalarCoeff(coeff);
    /* jshint indent: false */
    switch (c) {
      case '':
        return arg;
      case '-':
        return '-' + arg;
      case '0':
        return '0';
      default:
        return c + space + arg;
    }
  };

  /** Convert a exponential to a TeX string.

        @param {Object} exp The exponential function object.
        @param {String} indVar The independent variable (e.g., "t", "x").
        @return {String} The formatted exponential TeX string (e.g., "3 e^{4t}").
    */
  var expString = function (exp, indVar) {
    var s = [scalarCoeff(exp.coeff), 'e^{', scalarCoeff(exp.exp), indVar, '}'];
    return s.join(' ');
  };

  /** Convert a trig function to a TeX string.

        @param {Object} trig The trig function object.
        @param {String} indVar The independent variable (e.g., "t", "x").
        @return {String} The formatted trig TeX string (e.g., "3 sin(4t)").
    */
  var trigString = function (trig, indVar) {
    var s = [scalarCoeff(trig.coeff), '\\' + trig.fcn, '(', scalarCoeff(trig.freq), indVar, ')'];
    return s.join(' ');
  };

  /** Convert a function object to a TeX string.

        @param {Object} fcn The function object.
        @param {String} indVar The independent variable (e.g., "t", "x").
        @return {String} The formatted TeX string.
    */
  var fcnString = function (fcn, indVar) {
    /* jshint indent: false */
    switch (fcn.fcn) {
      case 'poly':
        return polyString(fcn.data, indVar);
      case 'exp':
        return expString(fcn.data, indVar);
      case 'trig':
        return trigString(fcn.data, indVar);
    }
  };

  /** Convert a function object to a parenthesized TeX string.

        @param {Object} fcn The function object.
        @param {String} indVar The independent variable (e.g., "t", "x").
        @return {String} The formatted TeX string with parentheses if needed.
    */
  var parenFcnString = function (fcn, indVar) {
    /* jshint indent: false */
    switch (fcn.fcn) {
      case 'poly':
        return parenPolyString(fcn.data, indVar);
      case 'exp':
        return expString(fcn.data, indVar);
      case 'trig':
        return trigString(fcn.data, indVar);
    }
  };

  /** Convert a vector of functions to a TeX string.

        @param {Array} vecFcn The vector of function objects [f_1, f_2, ...].
        @param {String} indVar The independent variable (e.g., "t", "x").
        @param {String} basis1 The first basis element (can be "").
        @param {String} basis2 The second basis element (can be "").
        @param {String} basis3 The third basis element (can be "").
        @return {String} The formatted vector TeX string.
    */
  var vectorFcnString = function (vecFcn, indVar, basis1, basis2, basis3) {
    basis1 = basis1 === undefined ? '' : basis1;
    basis2 = basis1 === undefined ? '' : basis2;
    basis3 = basis1 === undefined ? '' : basis3;
    var basis = [basis1, basis2, basis3];
    var i,
      e,
      s = [];
    for (i = 0; i < vecFcn.length; i++) {
      e = parenFcnString(vecFcn[i], indVar);
      if (e === '0') continue;
      if (e === '1' && basis[i] !== '') {
        e = '';
      }
      if (e === '-1' && basis[i] !== '') {
        e = '-';
      }
      e += basis[i];
      if (s.length > 0 && e[0] !== '-') {
        e = '+' + e;
      }
      s.push(e);
    }
    if (s.length === 0) {
      s.push('0');
    }
    return s.join(' ');
  };

  /** Convert a vector of function objects to a TeX string with Cartesian basis.

        @param {Array} vecFcn The vector of function objects [f_1, f_2, ...].
        @param {String} indVar The independent variable (e.g., "t", "x").
        @return {String} The formatted vector TeX string.
    */
  var cartesianVectorFcnString = function (vecFcn, indVar) {
    return vectorFcnString(vecFcn, indVar, '\\hat\\imath', '\\hat\\jmath', '\\hat{k}');
  };

  function template(text, data, questionDataModel, appModel, tInstance) {
    var localData = _.clone(data);

    localData.floatFixedString = floatFixedString;
    localData.rationalString = rationalString;
    localData.rationalCoeffString = rationalCoeffString;
    localData.rationalCoeffZeroString = rationalCoeffZeroString;
    localData.vectorString = vectorString;
    localData.vectorInBasisString = vectorInBasisString;
    localData.cartesianVectorString = cartesianVectorString;
    localData.cylindricalVectorString = cylindricalVectorString;
    localData.vectorFixedString = vectorFixedString;
    localData.cartesianVectorFixedString = cartesianVectorFixedString;
    localData.polyString = polyString;
    localData.vectorPolyString = vectorPolyString;
    localData.cartesianVectorPolyString = cartesianVectorPolyString;
    localData.scalarCoeff = scalarCoeff;
    localData.scalarProduct = scalarProduct;
    localData.fcnString = fcnString;
    localData.parenFcnString = parenFcnString;
    localData.vectorFcnString = vectorFcnString;
    localData.cartesianVectorFcnString = cartesianVectorFcnString;
    localData.questionFile = function (name) {
      return questionDataModel.get('questionFilePath') + '/' + name;
    };
    localData.testFile = function (name) {
      return appModel.apiURL('tests/' + tInstance.get('tid') + '/' + name);
    };
    localData.clientFile = function (name) {
      return document.urlPrefix + '/clientFilesCourse/' + name;
    };
    localData.generatedQuestionFile = function (name) {
      return questionDataModel.get('questionGeneratedFilePath') + '/' + name;
    };

    var compiled = _.template(text);
    var rendered = compiled(localData);
    return rendered;
  }

  return {
    floatFixedString: floatFixedString,
    makeTeXArray: makeTeXArray,
    textList: textList,
    rationalString: rationalString,
    rationalCoeffString: rationalCoeffString,
    rationalCoeffZeroString: rationalCoeffZeroString,
    vectorString: vectorString,
    vectorInBasisString: vectorInBasisString,
    cartesianVectorString: cartesianVectorString,
    cylindricalVectorString: cylindricalVectorString,
    vectorFixedString: vectorFixedString,
    cartesianVectorFixedString: cartesianVectorFixedString,
    polyString: polyString,
    parenPolyString: parenPolyString,
    vectorPolyString: vectorPolyString,
    cartesianVectorPolyString: cartesianVectorPolyString,
    scalarCoeff: scalarCoeff,
    scalarProduct: scalarProduct,
    fcnString: fcnString,
    parenFcnString: parenFcnString,
    vectorFcnString: vectorFcnString,
    cartesianVectorFcnString: cartesianVectorFcnString,
    template: template,
  };
});
