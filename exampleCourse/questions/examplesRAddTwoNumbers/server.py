# Access R using rpy2
import rpy2.robjects as robjects

def generate(data):

    # Sample two random integers between 5 and 10 (inclusive)
    values = robjects.r(
      '''
       x = runif(2, 5, 10)
       x = floor(x)
       x
      '''
    )
    # Cast to R
    a = values[0]
    b = values[1]

    # Put these two integers into data['params']
    data['params']['a'] = a
    data['params']['b'] = b

    # Compute the sum of these two integers
    c = a + b

    # Put the sum into data['correct_answers']
    data['correct_answers']['c'] = c
