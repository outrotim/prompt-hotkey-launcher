#include <napi.h>
#include <windows.h>

namespace {

HWND g_lastForegroundWindow = nullptr;

bool isUsableWindow(HWND windowHandle) {
  return windowHandle != nullptr && IsWindow(windowHandle) != FALSE;
}

void throwLastError(Napi::Env env, const char* message) {
  const DWORD errorCode = GetLastError();
  Napi::Error::New(env, std::string(message) + " (Win32 error " + std::to_string(errorCode) + ")")
    .ThrowAsJavaScriptException();
}

Napi::Value captureForegroundWindow(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  HWND foregroundWindow = GetForegroundWindow();

  if (!isUsableWindow(foregroundWindow)) {
    Napi::Error::New(env, "Unable to capture the current foreground window.")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  g_lastForegroundWindow = foregroundWindow;
  return Napi::Boolean::New(env, true);
}

Napi::Value restoreForegroundWindow(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (!isUsableWindow(g_lastForegroundWindow)) {
    Napi::Error::New(env, "No captured foreground window is available to restore.")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  DWORD currentThreadId = GetCurrentThreadId();
  DWORD targetThreadId = GetWindowThreadProcessId(g_lastForegroundWindow, nullptr);

  if (IsIconic(g_lastForegroundWindow) != FALSE) {
    ShowWindow(g_lastForegroundWindow, SW_RESTORE);
  }

  const BOOL attached = AttachThreadInput(currentThreadId, targetThreadId, TRUE);
  SetLastError(0);
  const BOOL activated = SetForegroundWindow(g_lastForegroundWindow);
  BringWindowToTop(g_lastForegroundWindow);
  SetActiveWindow(g_lastForegroundWindow);

  if (attached != FALSE) {
    AttachThreadInput(currentThreadId, targetThreadId, FALSE);
  }

  if (activated == FALSE) {
    throwLastError(env, "Unable to restore the captured foreground window.");
    return env.Undefined();
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value pasteControlV(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  INPUT inputs[4] = {};

  inputs[0].type = INPUT_KEYBOARD;
  inputs[0].ki.wVk = VK_CONTROL;

  inputs[1].type = INPUT_KEYBOARD;
  inputs[1].ki.wVk = 'V';

  inputs[2].type = INPUT_KEYBOARD;
  inputs[2].ki.wVk = 'V';
  inputs[2].ki.dwFlags = KEYEVENTF_KEYUP;

  inputs[3].type = INPUT_KEYBOARD;
  inputs[3].ki.wVk = VK_CONTROL;
  inputs[3].ki.dwFlags = KEYEVENTF_KEYUP;

  SetLastError(0);
  const UINT sent = SendInput(4, inputs, sizeof(INPUT));

  if (sent != 4) {
    throwLastError(env, "Unable to send Ctrl+V through SendInput.");
    return env.Undefined();
  }

  return env.Undefined();
}

Napi::Object init(Napi::Env env, Napi::Object exports) {
  exports.Set("captureForegroundWindow", Napi::Function::New(env, captureForegroundWindow));
  exports.Set("restoreForegroundWindow", Napi::Function::New(env, restoreForegroundWindow));
  exports.Set("pasteControlV", Napi::Function::New(env, pasteControlV));
  return exports;
}

}  // namespace

NODE_API_MODULE(promptbar_native_paste, init)
