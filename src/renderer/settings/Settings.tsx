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

      <h1>\u8bbe\u7f6e</h1>

      <div className="settings-section">
        <h3>\u5feb\u6377\u952e</h3>
        <div className="shortcut-field">
          <div
            className={`shortcut-display ${recording ? 'recording' : ''}`}
            tabIndex={0}
            onKeyDown={handleRecordShortcut}
            onClick={() => setRecording(true)}
            onBlur={() => setRecording(false)}
          >
            {recording ? '\u8bf7\u6309\u4e0b\u5feb\u6377\u952e\u7ec4\u5408...' : shortcut}
          </div>
          <button
            className="btn btn-sm"
            onClick={() => {
              setShortcut('Control+Space');
            }}
          >
            \u6062\u590d\u9ed8\u8ba4
          </button>
        </div>
        <p className="settings-hint">\u70b9\u51fb\u4e0a\u65b9\u533a\u57df\uff0c\u7136\u540e\u6309\u4e0b\u65b0\u7684\u5feb\u6377\u952e\u7ec4\u5408</p>
      </div>

      <div className="settings-section">
        <h3>\u4e3b\u9898</h3>
        <div className="theme-options">
          {[
            { value: 'system', label: '\u8ddf\u968f\u7cfb\u7edf' },
            { value: 'light', label: '\u6d45\u8272' },
            { value: 'dark', label: '\u6df1\u8272' },
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
        <h3>\u63d0\u793a\u8bcd\u76ee\u5f55</h3>
        <div className="dir-field">
          <input
            type="text"
            value={promptsDir}
            readOnly
            className="dir-input"
          />
        </div>
        <p className="settings-hint">\u63d0\u793a\u8bcd Markdown \u6587\u4ef6\u5b58\u653e\u4f4d\u7f6e</p>
      </div>

      <div className="settings-footer">
        <button className="btn btn-primary" onClick={handleSave}>
          {saved ? '\u5df2\u4fdd\u5b58 \u2713' : '\u4fdd\u5b58\u8bbe\u7f6e'}
        </button>
      </div>
    </div>
  );
}
