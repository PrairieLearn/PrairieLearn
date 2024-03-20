#pragma once

struct node {
  int value;
  struct node *next;
};

struct list {
  struct node *head;
};

int list_delete_first(struct list *list);
