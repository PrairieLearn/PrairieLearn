#pragma once

struct node {
  int value;
  struct node *next;
  int buncha_stuff[100];
};

struct list {
  struct node *head;
};

int list_delete_first(struct list *list);
