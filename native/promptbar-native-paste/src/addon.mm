#include <napi.h>
#include <ApplicationServices/ApplicationServices.h>
#include <unistd.h>

namespace {

constexpr CGKeyCode kCommandKeyCode = 0x37;
constexpr CGKeyCode kVKeyCode = 0x09;
constexpr useconds_t kInterKeyDelayMicroseconds = 12000;

void postKey(CGEventSourceRef source, CGKeyCode keyCode, bool keyDown, CGEventFlags flags) {
  CGEventRef event = CGEventCreateKeyboardEvent(source, keyCode, keyDown);
  if (event == nullptr) {
    return;
  }

  CGEventSetFlags(event, flags);
  CGEventPost(kCGHIDEventTap, event);
  CFRelease(event);
}

Napi::Value pasteCommandV(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!AXIsProcessTrusted()) {
    Napi::Error::New(env, "Accessibility permission is required for PromptBar native paste.")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStateCombinedSessionState);
  if (source == nullptr) {
    Napi::Error::New(env, "Unable to create CGEventSource for PromptBar native paste.")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  postKey(source, kCommandKeyCode, true, kCGEventFlagMaskCommand);
  usleep(kInterKeyDelayMicroseconds);
  postKey(source, kVKeyCode, true, kCGEventFlagMaskCommand);
  usleep(kInterKeyDelayMicroseconds);
  postKey(source, kVKeyCode, false, kCGEventFlagMaskCommand);
  usleep(kInterKeyDelayMicroseconds);
  postKey(source, kCommandKeyCode, false, 0);

  CFRelease(source);

  return env.Undefined();
}

Napi::Object init(Napi::Env env, Napi::Object exports) {
  exports.Set("pasteCommandV", Napi::Function::New(env, pasteCommandV));
  return exports;
}

}  // namespace

NODE_API_MODULE(promptbar_native_paste, init)
