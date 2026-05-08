/*
 * A simple sandbox implementation using Landlock. Blocks access to files in the
 * /proc, /sys and /dev filesystems, but allows access to everything else. This
 * is intended to prevent students from using content of files like
 * /proc/self/maps to bypass the sandbox or retrieve information they shouldn't
 * have access to.
 *
 * landlock works on an allow-list basis, so we create a ruleset that allows
 * access to all current directories in the root filesystem except for /proc,
 * /sys and /dev, and then apply that ruleset to the current process before
 * executing the autograder.
 *
 * Code written with support from Gemini. Details on landlock can be found here:
 * https://man7.org/linux/man-pages/man7/landlock.7.html
 */
#define _GNU_SOURCE
#include <linux/landlock.h>
#include <linux/prctl.h>
#include <sys/prctl.h>
#include <sys/syscall.h>
#include <unistd.h>
#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <dirent.h>
#include <string.h>

#define ACCESS_ALL                                                  \
  (LANDLOCK_ACCESS_FS_READ_FILE | LANDLOCK_ACCESS_FS_READ_DIR |     \
   LANDLOCK_ACCESS_FS_WRITE_FILE | LANDLOCK_ACCESS_FS_EXECUTE |     \
   LANDLOCK_ACCESS_FS_REMOVE_DIR | LANDLOCK_ACCESS_FS_REMOVE_FILE | \
   LANDLOCK_ACCESS_FS_MAKE_CHAR | LANDLOCK_ACCESS_FS_MAKE_DIR |     \
   LANDLOCK_ACCESS_FS_MAKE_REG | LANDLOCK_ACCESS_FS_MAKE_SOCK |     \
   LANDLOCK_ACCESS_FS_MAKE_FIFO | LANDLOCK_ACCESS_FS_MAKE_BLOCK |   \
   LANDLOCK_ACCESS_FS_TRUNCATE)

void add_path_rule(int ruleset_fd, const char *path) {
  int fd = open(path, O_PATH | O_CLOEXEC);
  if (fd < 0)
    return;  // Skip directories we can't open (like some system mounts)

  struct landlock_path_beneath_attr path_attr = {
      .allowed_access = ACCESS_ALL,
      .parent_fd = fd,
  };

  if (syscall(SYS_landlock_add_rule, ruleset_fd, LANDLOCK_RULE_PATH_BENEATH,
              &path_attr, 0) < 0) {
    perror("Failed to add path rule");
  }
  close(fd);
}

int main(int argc, char *argv[]) {
  if (argc < 2) return 1;

  // Create a landlock ruleset that handles all filesystem access.
  struct landlock_ruleset_attr attr = {.handled_access_fs = ACCESS_ALL};
  int ruleset_fd = syscall(SYS_landlock_create_ruleset, &attr, sizeof(attr), 0);
  if (ruleset_fd < 0) {
    perror("Landlock init failed");
    return 1;
  }

  // Scan / and add everything EXCEPT proc, sys and dev.
  DIR *d = opendir("/");
  if (!d) {
    perror("Failed to open root directory");
    return 1;
  }
  struct dirent *dir;
  while ((dir = readdir(d)) != NULL) {
    if (strcmp(dir->d_name, ".") == 0 || strcmp(dir->d_name, "..") == 0)
      continue;
    if (strcmp(dir->d_name, "proc") == 0 || strcmp(dir->d_name, "sys") == 0 ||
        strcmp(dir->d_name, "dev") == 0)
      continue;

    char full_path[512];
    snprintf(full_path, sizeof(full_path), "/%s", dir->d_name);
    add_path_rule(ruleset_fd, full_path);
  }
  closedir(d);

  // Blocks the process or its children from gaining new privileges, e.g., via
  // setuid binaries. This is required to use landlock.
  if (prctl(PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) != 0) {
    perror("PR_SET_NO_NEW_PRIVS failed");
    return 1;
  }
  // Apply the landlock ruleset to the current process and its future children.
  if (syscall(SYS_landlock_restrict_self, ruleset_fd, 0)) {
    perror("Enforce failed");
    return 1;
  }
  close(ruleset_fd);

  execvp(argv[1], &argv[1]);
  perror("Exec failed");
  return 1;
}
