import type { Locale } from "./types";

export type LocalizedMessage = {
  en: string;
  zhCN: string;
};

export const messages = {
  saveCurrentFile: { en: "Save Current File", zhCN: "保存当前文件" },
  openSettings: { en: "Open Settings", zhCN: "打开设置" },
  fileTags: { en: "File tags", zhCN: "文件标签" },
  fileAliases: { en: "File aliases", zhCN: "文件别名" },
  markFileAsFavorite: { en: "Mark file as favorite", zhCN: "将文件标记为收藏" },
  packName: { en: "Pack name", zhCN: "分组名称" },
  promptTitle: { en: "Prompt title", zhCN: "提示词标题" },
  promptBody: { en: "Prompt body", zhCN: "提示词正文" },
  none: { en: "None", zhCN: "无" },
  launchAtLoginEnabled: {
    en: "PromptBar will launch automatically at login.",
    zhCN: "PromptBar 将在登录时自动启动。"
  },
  launchAtLoginUpdateFailed: {
    en: "Failed to update launch at login.",
    zhCN: "更新登录启动设置失败。"
  },
  interfaceLanguageSwitchedToEnglish: {
    en: "Interface language switched to English.",
    zhCN: "界面语言已切换为英文。"
  },
  autoPastePermissionHelp: {
    en: "PromptBar needs Accessibility permission to return focus. Automatic write-in also needs Automation permission for System Events.",
    zhCN: "PromptBar 在 macOS 上需要辅助功能权限来恢复焦点；自动写入还需要自动化里的 System Events 授权。"
  },
  autoPasteFallbackMessage: {
    en: "Automatic paste was blocked. Check PromptBar Accessibility permission and System Events Automation access. The content has been copied to the clipboard; please paste manually.",
    zhCN: "自动粘贴被系统拦住了。请检查 PromptBar 的辅助功能权限，以及自动化里的 System Events 授权。内容已复制到剪贴板，请手动粘贴一次。"
  }
} as const satisfies Record<string, LocalizedMessage>;

export function translateMessage(locale: Locale, message: LocalizedMessage) {
  return locale === "zh-CN" ? message.zhCN : message.en;
}

export function createTranslator(locale: Locale) {
  return (messageOrEnglish: LocalizedMessage | string, chinese?: string) => {
    if (typeof messageOrEnglish === "string") {
      return translateMessage(locale, {
        en: messageOrEnglish,
        zhCN: chinese ?? messageOrEnglish
      });
    }

    return translateMessage(locale, messageOrEnglish);
  };
}
