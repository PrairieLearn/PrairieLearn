#include <check.h>

extern int square(int x);

START_TEST(test_zero)
{
  ck_assert_int_eq(square(0), 0);
}
END_TEST

int values[] = {1, 2, 3, 5, 10, -20, 100, 512, -23, -4};

START_TEST(test_loop)
{
  int input = values[_i];
  int output = values[_i] * values[_i];
  ck_assert_int_eq(square(input), output);
}
END_TEST

int main(int argc, char *argv[]) {
  
  // A suite is a combination of test cases. Most applications only
  // use one suite, but it is possible to organize tests into multiple
  // suites.
  Suite *s = suite_create("Square");

  // A test case can contain one or more unit tests, each
  // corresponding to a test function.
  TCase *tc_zero = tcase_create("Zero");
  tcase_add_test(tc_zero, test_zero);
  suite_add_tcase(s, tc_zero);

  // It is possible to test multiple values by using a loop. The
  // following code calls test_loop with values of _i from 0
  // (inclusive) to 10 (exclusive).
  TCase *tc_loop = tcase_create("Varied input values");
  tcase_add_loop_test(tc_loop, test_loop, 0, 10);
  suite_add_tcase(s, tc_loop);
  
  SRunner *sr = srunner_create(s);
  
  srunner_run_all(sr, CK_NORMAL);
  srunner_free(sr);
  return 0;
}
