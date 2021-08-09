import numpy
import sympy

def generate(data):
    coeff_lower_bound = data['params'].get('coeff_lower_bound', -9)
    coeff_upper_bound = data['params'].get('coeff_upper_bound', 9)

    # Create a variable
    x = sympy.symbols('x')

    # Randomize the degree
    degree = numpy.random.random_integers(1,5)

    # Randomize the coefficients (make sure the leading coefficient is non-zero)
    coeffs = numpy.random.random_integers(coeff_lower_bound,coeff_upper_bound,degree+1)
    if coeffs[0]==0:
        coeffs[0]=1

    # Create the polynomial
    f = sympy.Poly(coeffs,x).as_expr()

    # Find derivative with respect to x
    df = sympy.diff(f,x)

    # Modify data and return
    data["params"]["x"] = sympy.latex(x)
    data["params"]["f"] = sympy.latex(f)
    data["params"]["coeff_lower_bound"] = coeff_lower_bound
    data["params"]["coeff_upper_bound"] = coeff_upper_bound
    data["correct_answers"]["df"] = str(df)

if __name__ == "__main__":
    generate({"params":{},"correct_answers":{}})
