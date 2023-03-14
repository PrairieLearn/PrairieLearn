/* #include <stdio.h> */
#include <stdlib.h>
/* #include <unistd.h> */
/* #include <sys/types.h> */
/* #include <sys/stat.h> */
/* #include <fcntl.h> */
/* #include <malloc.h> */
#include <check.h>
#include <time.h>
#include <sanitizer/asan_interface.h>

#include "list.h"

int malloc_error_should_abort = 1;
int num_errors = 0;

const char* __asan_default_options() { return "detect_leaks=0"; }

static void asan_abort_hook(const char *msg) {
  ck_abort_msg("Detected an error in the use of pointers and dynamic allocation. This is \n"
               "typically related to the use of values in the heap (malloc and friends) \n"
               "after free or beyond their allocated area, or freeing a value not in the heap.\n"
               "Details:\n\n%s", msg);
}

START_TEST(test_empty_list) {

  struct list empty = { NULL };

  int return_value = list_delete_first(&empty);
  ck_assert_int_eq(return_value, -1);
  ck_assert_msg(!empty.head, "Head of the original list was modified.");
}
END_TEST

START_TEST(test_with_elements) {

  size_t size = _i;

  struct list *list = malloc(sizeof(struct list));
  int original_values[size];
  struct node *nodes[size + 1];
  for (int i = 0; i < size; i++) {
    original_values[i] = random();
    nodes[i] = malloc(sizeof(struct node));
    nodes[i]->value = original_values[i];
    if (i) nodes[i - 1]->next = nodes[i];
  }
  list->head = nodes[0];
  nodes[size] = nodes[size-1]->next = NULL;

  int return_value = list_delete_first(list);

  ck_assert_msg(!__asan_address_is_poisoned(list), "List itself has been freed");
  ck_assert_msg(__asan_address_is_poisoned(nodes[0]), "Deleted node has not been freed");
  ck_assert_msg(list->head == nodes[1], "Head value has not been changed to the new first element");
  ck_assert_int_eq(return_value, original_values[0]);

  for (int i = 1; i < size; i++) {
    ck_assert_msg(!__asan_address_is_poisoned(nodes[i]),
                  "Node other than the first element has been freed");
    ck_assert_msg(nodes[i]->value == original_values[i],
                  "Value of node at position %d has been modified, expected %d, got %d.",
                  i, original_values[i], nodes[i]->value);
    ck_assert_msg(nodes[i]->next == nodes[i+1],
                  "Next pointer of node at position %d has been modified.", i);
  }
}

int main(int argc, char *argv[]) {

  __asan_set_error_report_callback(asan_abort_hook);
  srandom(time(NULL));

  Suite *s = suite_create("Linked list");

  TCase *tc_empty = tcase_create("Deleting from an empty list");
  tcase_add_test(tc_empty, test_empty_list);
  suite_add_tcase(s, tc_empty);
  
  TCase *tc_loop = tcase_create("Deleting from a list that has elements");
  tcase_add_loop_test(tc_loop, test_with_elements, 1, 10);
  suite_add_tcase(s, tc_loop);
  
  SRunner *sr = srunner_create(s);
  
  srunner_run_all(sr, CK_NORMAL);
  srunner_free(sr);
  return 0;
}
