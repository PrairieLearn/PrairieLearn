MAX_NUMBER = 20

# For the same of this example, we use a hardcoded list of all primes up to 20.
# Update this list if you change `MAX_NUMBER` above.
PRIME_NUMBERS_UNDER_20 = {2, 3, 5, 7, 11, 13, 17, 19}


def factors(n):
    factors = set()
    for i in range(1, n + 1):
        if n % i == 0:
            factors.add(i)
    return factors


def feedback_for_number(number):
    if number in PRIME_NUMBERS_UNDER_20:
        return f"Correct! {number} is a prime number."
    elif number == 1:
        return "Incorrect; 1 is neither prime nor composite."
    else:
        factors_hint = ", ".join(str(factor) for factor in factors(number))
        return f"Incorrect; {number} has the following factors: {factors_hint}"


def generate(data):
    data["params"]["options"] = [
        {
            "correct": num in PRIME_NUMBERS_UNDER_20,
            "answer": str(num),
            "feedback": feedback_for_number(num),
        }
        for num in range(1, MAX_NUMBER + 1)
    ]
