def pair_total(values):
    total = 0
    for i in range(len(values)):
        for j in range(i + 1, len(values)):
            total += values[i] + values[j]
    return total
