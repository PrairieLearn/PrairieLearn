#include <check.h>

extern int factorial(int x);

START_TEST(test_factorial) {
    ck_assert_int_eq(factorial(0), 1);
    ck_assert_int_eq(factorial(1), 1);
    ck_assert_int_eq(factorial(2), 2);
    ck_assert_int_eq(factorial(5), 120);
    ck_assert_int_eq(factorial(10), 3628800);
}
END_TEST

int main(void) {
    Suite *s = suite_create("factorial");

    TCase *tc_factorial = tcase_create("Check factorial return value");
    tcase_add_test(tc_factorial, test_factorial);
    suite_add_tcase(s, tc_factorial);

    SRunner *sr = srunner_create(s);
    srunner_run_all(sr, CK_NORMAL);
    srunner_free(sr);
    return 0;
}
