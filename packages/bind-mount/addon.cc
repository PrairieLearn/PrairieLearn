#include <nan.h>
#include <stdio.h>

#ifdef __linux__
#include <sys/mount.h>
#endif

enum Command { MountCommand, UmountCommand };

struct MountContext {
  Command command;
  std::string source;
  std::string target;
  int error;
};

#ifdef __linux__

class BindMountWorker : public Nan::AsyncWorker {
public:
  BindMountWorker(Nan::Callback *callback, MountContext *context): Nan::AsyncWorker(callback, "PrairieLearn:BindMountWorker"), context(context) {}
  ~BindMountWorker() {}

  void Execute() {
    int ret = 0;

    switch (this->context->command) {
    case Command::MountCommand:
      ret = mount(this->context->source.c_str(), this->context->target.c_str(), NULL, MS_BIND, NULL);
      break;
    case Command::UmountCommand:
      ret = umount(this->context->target.c_str());
      break;
    }

    if (ret == -1) {
      this->context->error = errno;
    }
  }

  void HandleOKCallback() {
    Nan::HandleScope scope;

    v8::Local<v8::Value> argv[] = {Nan::Null()};

    if (this->context->error > 0) {
      const char *syscall = this->context->command == Command::MountCommand ? "mount" : "umount";
      argv[0] = Nan::ErrnoException(this->context->error, syscall, "", this->context->target.c_str());
    }

    this->callback->Call(1, argv, this->async_resource);

    delete this->context;
  }

private:
  MountContext *context;
};

void Mount(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  if (info.Length() != 3) {
    Nan::ThrowError("Requires three arguments");
    return;
  }

  const char *source = *Nan::Utf8String(info[0]);
  const char *target = *Nan::Utf8String(info[1]);

  MountContext *context = new MountContext();
  context->command = Command::MountCommand;
  context->source = source;
  context->target = target;

  Nan::Callback *callback = new Nan::Callback(Nan::To<v8::Function>(info[2]).ToLocalChecked());
  Nan::AsyncQueueWorker(new BindMountWorker(callback, context));
}

void Umount(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  if (info.Length() != 2) {
    Nan::ThrowError("Requires two arguments");
    return;
  }

  MountContext *context = new MountContext();
  context->command = Command::UmountCommand;
  context->target = *Nan::Utf8String(Nan::To<v8::String>(info[0]).ToLocalChecked());

  Nan::Callback *callback = new Nan::Callback(Nan::To<v8::Function>(info[1]).ToLocalChecked());
  Nan::AsyncQueueWorker(new BindMountWorker(callback, context));
}

#else

void Mount(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  Nan::ThrowError("bind-mount is only supported on Linux");
}

void Umount(const Nan::FunctionCallbackInfo<v8::Value> &info) {
  Nan::ThrowError("bind-mount is only supported on Linux");
}

#endif

NAN_MODULE_INIT(Initialize) {
  NAN_EXPORT(target, Mount);
  NAN_EXPORT(target, Umount);
}

NODE_MODULE(addon, Initialize)
