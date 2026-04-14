export type ViewMode = "popup" | "manager" | "settings";

export function resolveInitialView(search: string, hash: string): ViewMode {
  const params = new URLSearchParams(search);
  const candidate = (params.get("view") ?? hash.replace("#", "")) || "popup";

  if (candidate === "popup" || candidate === "manager" || candidate === "settings") {
    return candidate;
  }

  return "popup";
}
