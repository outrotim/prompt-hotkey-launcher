import ApplicationServices
import Darwin
import Foundation

let commandKey: CGKeyCode = 0x37
let vKey: CGKeyCode = 0x09
let interKeyDelayUsec: useconds_t = 12_000

guard AXIsProcessTrusted() else {
  fputs("Accessibility permission is required for PromptBar native paste.\n", stderr)
  exit(2)
}

guard let eventSource = CGEventSource(stateID: .combinedSessionState) else {
  fputs("Unable to create CGEventSource for PromptBar native paste.\n", stderr)
  exit(3)
}

func postKey(_ key: CGKeyCode, keyDown: Bool, flags: CGEventFlags) {
  guard let event = CGEvent(
    keyboardEventSource: eventSource,
    virtualKey: key,
    keyDown: keyDown
  ) else {
    fputs("Unable to create keyboard event for PromptBar native paste.\n", stderr)
    exit(4)
  }

  event.flags = flags
  event.post(tap: .cghidEventTap)
}

postKey(commandKey, keyDown: true, flags: .maskCommand)
usleep(interKeyDelayUsec)
postKey(vKey, keyDown: true, flags: .maskCommand)
usleep(interKeyDelayUsec)
postKey(vKey, keyDown: false, flags: .maskCommand)
usleep(interKeyDelayUsec)
postKey(commandKey, keyDown: false, flags: [])
