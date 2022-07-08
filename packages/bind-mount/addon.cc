#include <nan.h>

NAN_METHOD(Mount) {
  auto message = Nan::New<v8::String>("Mounting...").ToLocalChecked();
  info.GetReturnValue().Set(message);
}

NAN_METHOD(Unmount) {
  auto message = Nan::New<v8::String>("Unmounting...").ToLocalChecked();
  info.GetReturnValue().Set(message);
}

NAN_MODULE_INIT(Initialize) {
  NAN_EXPORT(target, Mount);
  NAN_EXPORT(target, Unmount);
}

NODE_MODULE(addon, Initialize)
