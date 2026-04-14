import type { AppSettings } from "./settings";

export type SettingsUpdatePlan = {
  current: AppSettings;
  next: AppSettings;
  needsHotkeyRegistration: boolean;
};

export function createSettingsUpdatePlan(
  current: AppSettings,
  partial: Partial<AppSettings>
): SettingsUpdatePlan {
  const next = {
    ...current,
    ...partial
  };

  return {
    current,
    next,
    needsHotkeyRegistration:
      typeof partial.hotkey === "string" && partial.hotkey !== current.hotkey
  };
}
