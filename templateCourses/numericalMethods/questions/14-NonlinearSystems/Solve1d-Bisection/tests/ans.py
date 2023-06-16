def bisection(function, a, b, epsilon, n):
    if a >= b:
        raise ValueError("a must be less than b")
    if function(a) * function(b) > 0:
        raise ValueError("sign(f(a)) == sign(f(b))")

    for ite in range(n):
        fa = function(a)
        fb = function(b)

        # if abs(fa) <= epsilon:
        #     return p
        # elif (abs(fb) <= epsilon):
        #     return q

        m = (a + b) / 2
        fm = function(m)

        if abs(fm) <= epsilon:
            return m
        else:
            if fm * fa >= 0:
                a = m
            elif fm * fb >= 0:
                b = m

    raise RuntimeError("Max number of iterations reached")


roots = []
for a, b in intervals:
    try:
        roots.append(bisection(function, a, b, epsilon, n_iter))
    except (RuntimeError, ValueError):
        roots.append(None)
