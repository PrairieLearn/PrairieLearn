#include <stdlib.h>
#include "list.h"

int list_delete_first(struct list *list) {

  if (!list->head) return -1;
  
  int old_value = list->head->value;
  struct node *old_node = list->head;
  list->head = old_node->next;
  free(old_node);
  return old_value;
}
