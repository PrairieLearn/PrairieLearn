order = data["params"]["order"]

if order == "ascending":

    sorted_nums = sorted(nums)

else:

    sorted_nums = sorted(nums, reverse=True)
