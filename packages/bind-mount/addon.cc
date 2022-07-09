#include <nan.h>
#include <stdio.h>

#ifdef __linux__
#include <sys/mount.h>
#endif

enum Command { MountCommand, UnmountCommand };

struct MountContext {
  Command command;
  std::string source;
  std::string target;
  int error;
};

#ifdef __linux__

class BindMountWorker : public Nan::AsyncWorker {
public:
  BindMountWorker(Nan::Callback *callback, MountContext *command): Nan::AsyncWorker(callback, "PrairieLearn:BindMountWorker"), command(command) {}
  ~BindMountWorker() {}

  void Execute() {
    int ret = 0;

    switch (this->command->command) {
    case Command::MountCommand:
      ret = mount(this->command->source.c_str(), this->command->target.c_str(), NULL, MS_BIND, NULL);
      break;
    case Command::UnmountCommand:
      ret = umount(this->command->target.c_str());
      break;
    }

    if (ret == -1) {
      this->command->error = errno;
    }
  }

  void HandleOKCallback() {
    Nan::HandleScope scope;

    v8::Local<v8::Value> argv[] = {Nan::Null()};

    if (this->command->error > 0) {
      const char *syscall = this->command->command == Command::MountCommand ? "mount" : "umount";
      argv[0] = Nan::ErrnoException(this->command->error, syscall, "", this->command->target.c_str());
    }

    this->callback->Call(2, argv, this->async_resource);

    delete this->command;
  }

private:
  MountContext *command;
};

void Mount(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  if (info.Length() != 3) {
    Nan::ThrowError("Requires three arguments");
    return;
  }

  const char *source = *Nan::Utf8String(info[0]);
  const char *target = *Nan::Utf8String(info[1]);

  MountContext *command = new MountContext();
  command->command = Command::MountCommand;
  command->source = source;
  command->target = target;

  Nan::Callback *callback = new Nan::Callback(Nan::To<v8::Function>(info[2]).ToLocalChecked());
  Nan::AsyncQueueWorker(new BindMountWorker(callback, command));
}

void Unmount(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  if (info.Length() != 2) {
    Nan::ThrowError("Requires two arguments");
    return;
  }

  MountContext *command = new MountContext();
  command->command = Command::UnmountCommand;
  command->target = *Nan::Utf8String(Nan::To<v8::String>(info[0]).ToLocalChecked());

  Nan::Callback *callback = new Nan::Callback(Nan::To<v8::Function>(info[1]).ToLocalChecked());
  Nan::AsyncQueueWorker(new BindMountWorker(callback, command));
}

#else

void Mount(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  Nan::ThrowError("bind-mount is only supported on Linux");
}

void Unmount(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  Nan::ThrowError("bind-mount is only supported on Linux");
}

#endif

NAN_MODULE_INIT(Initialize) {
  NAN_EXPORT(target, Mount);
  NAN_EXPORT(target, Unmount);
}

NODE_MODULE(addon, Initialize)
