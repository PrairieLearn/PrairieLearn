#include <criterion/criterion.h>
#include <criterion/parameterized.h>
#include <criterion/new/assert.h>
#include <plcriterion.h>

extern int square(int x);

Test(main, test_zero, .description = "Test with input 0")
{
  cr_assert(eq(int, square(0), 0));
}

ParameterizedTestParameters(main, test_loop)
{
  static int values[] = {1, 2, 3, 5, 10, -20, 100, 512, -23, -4};
  return cr_make_param_array(int, values, sizeof(values) / sizeof(*values));
}

ParameterizedTest(int input, main, test_loop, .description = "Test with varied input values")
{
  int output = input * input;
  cr_assert(eq(int, square(input), output));
}
