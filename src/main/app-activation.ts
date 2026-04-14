export type ActivationPolicyApp = {
  setActivationPolicy?: (policy: "regular" | "accessory" | "prohibited") => void;
};

export function applyPromptBarActivationPolicy(
  app: ActivationPolicyApp,
  platform = process.platform
) {
  if (platform !== "darwin" || typeof app.setActivationPolicy !== "function") {
    return false;
  }

  app.setActivationPolicy("accessory");
  return true;
}
