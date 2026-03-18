import React, { useState, useEffect } from 'react';

const api = (window as any).electronAPI;

export default function Settings() {
  const [shortcut, setShortcut] = useState('Control+Space');
  const [theme, setTheme] = useState('system');
  const [promptsDir, setPromptsDir] = useState('');
  const [recording, setRecording] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const s = await api?.getSettings();
    if (s) {
      setShortcut(s.shortcut || 'Control+Space');
      setTheme(s.theme || 'system');
      setPromptsDir(s.promptsDir || '');
    }
  };

  const handleSave = async () => {
    await api?.saveSettings({ shortcut, theme });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleRecordShortcut = (e: React.KeyboardEvent) => {
    if (!recording) return;
    e.preventDefault();

    const parts: string[] = [];
    if (e.ctrlKey) parts.push('Control');
    if (e.metaKey) parts.push('Command');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');

    const key = e.key;
    if (!['Control', 'Meta', 'Alt', 'Shift'].includes(key)) {
      parts.push(key.length === 1 ? key.toUpperCase() : key);
      setShortcut(parts.join('+'));
      setRecording(false);
    }
  };

  return (
    <div className="settings-container">
      <div className="settings-titlebar" />

      <h1>设置</h1>

      <div className="settings-section">
        <h3>快捷键</h3>
        <div className="shortcut-field">
          <div
            className={`shortcut-display ${recording ? 'recording' : ''}`}
            tabIndex={0}
            onKeyDown={handleRecordShortcut}
            onClick={() => setRecording(true)}
            onBlur={() => setRecording(false)}
          >
            {recording ? '请按下快捷键组合...' : shortcut}
          </div>
          <button
            className="btn btn-sm"
            onClick={() => {
              setShortcut('Control+Space');
            }}
          >
            恢复默认
          </button>
        </div>
        <p className="settings-hint">点击上方区域，然后按下新的快捷键组合</p>
      </div>

      <div className="settings-section">
        <h3>主题</h3>
        <div className="theme-options">
          {[
            { value: 'system', label: '跟随系统' },
            { value: 'light', label: '浅色' },
            { value: 'dark', label: '深色' },
          ].map(opt => (
            <button
              key={opt.value}
              className={`theme-btn ${theme === opt.value ? 'active' : ''}`}
              onClick={() => setTheme(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-section">
        <h3>提示词目录</h3>
        <div className="dir-field">
          <input
            type="text"
            value={promptsDir}
            readOnly
            className="dir-input"
          />
        </div>
        <p className="settings-hint">提示词 Markdown 文件存放位置</p>
      </div>

      <div className="settings-footer">
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? '已保存 ✓' : '保存设置'}
        </button>
      </div>
    </div>
  );
}
