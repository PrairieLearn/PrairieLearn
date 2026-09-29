def count_increases(values):
    count = 0
    for i in range(1, len(values)):
        if values[i] > values[i - 1]:
            count += 1
    return count


assert count_increases([3, 5, 5, 2, 8]) == 2
assert count_increases([]) == 0
