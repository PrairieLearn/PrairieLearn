import numpy
import sympy

def generate(data):

    # Create a variable
    x = sympy.symbols('x')

    # Randomize the degree
    degree = numpy.random.random_integers(1,5)

    # Randomize the coefficients (make sure the leading coefficient is non-zero)
    coeffs = numpy.random.random_integers(-9,9,degree+1)
    if coeffs[0]==0:
        coeffs[0]=1

    # Create the polynomial
    f = sympy.Poly(coeffs,x).as_expr()

    # Find derivative with respect to x
    df = sympy.diff(f,x)

    # Modify data and return
    data["params"]["x"] = sympy.latex(x)
    data["params"]["f"] = sympy.latex(f)
    data["correct_answers"]["df"] = str(df)

if __name__ == "__main__":
    generate({"params":{},"correct_answers":{}})
