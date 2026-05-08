// Source: Gemini

#define _GNU_SOURCE
#include <dlfcn.h>
#include <string.h>
#include <errno.h>
#include <stdarg.h>
#include <stdlib.h>
#include <limits.h>

// Helper to check if a path (resolved or not) points to /proc
static int is_forbidden(const char *path) {
  if (!path) return 0;

  // 1. Direct check for absolute/simple relative starts
  if (strncmp(path, "/proc", 5) == 0 || strncmp(path, "proc/", 5) == 0 ||
      strcmp(path, "proc") == 0) {
    return 1;
  }

  // 2. Resolve the path to handle ../ or current-dir relative paths
  char actualpath[PATH_MAX];
  char *ptr = realpath(path, actualpath);
  if (ptr) {
    if (strncmp(ptr, "/proc", 5) == 0) {
      return 1;
    }
  } else {
    // If realpath fails (file doesn't exist yet), we still block
    // if the raw string contains "proc" to be safe.
    if (strstr(path, "/proc") != NULL) {
      return 1;
    }
  }

  return 0;
}

// Macro to boilerplate the hooks
#define HOOK_OPEN(name, type)                   \
  int name(const char *path, int flags, ...) {  \
    if (is_forbidden(path)) {                   \
      errno = EACCES;                           \
      return -1;                                \
    }                                           \
    va_list args;                               \
    va_start(args, flags);                      \
    int mode = va_arg(args, int);               \
    va_end(args);                               \
    type orig = (type) dlsym(RTLD_NEXT, #name); \
    return orig(path, flags, mode);             \
  }

typedef int (*fn_open)(const char *, int, ...);
HOOK_OPEN(open, fn_open)
HOOK_OPEN(open64, fn_open)

// Specialized hook for openat
int openat(int dirfd, const char *path, int flags, ...) {
  // If it's an absolute path, check it directly
  // If it's relative, we still check the string for safety
  if (is_forbidden(path)) {
    errno = EACCES;
    return -1;
  }

  va_list args;
  va_start(args, flags);
  int mode = va_arg(args, int);
  va_end(args);
  typedef int (*fn_openat)(int, const char *, int, ...);
  fn_openat orig = (fn_openat) dlsym(RTLD_NEXT, "openat");
  return orig(dirfd, path, flags, mode);
}
