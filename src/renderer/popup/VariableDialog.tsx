import React, { useState, useEffect, useRef } from 'react';

interface PromptItem {
  id: string;
  name: string;
  content: string;
  variables: string[];
}

interface Props {
  prompt: PromptItem;
  onSubmit: (filledContent: string) => void;
  onCancel: () => void;
}

const api = (window as any).electronAPI;

export default function VariableDialog({ prompt, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [histories, setHistories] = useState<Record<string, string[]>>({});
  const [focusedIndex, setFocusedIndex] = useState(0);
  const inputRefs = useRef<(HTMLInputElement | HTMLTextAreaElement | null)[]>([]);

  // Load variable history
  useEffect(() => {
    const loadHistories = async () => {
      const h: Record<string, string[]> = {};
      const v: Record<string, string> = {};
      for (const varName of prompt.variables) {
        const history = await api?.getVariableHistory(varName);
        h[varName] = history || [];
        // Default to most recent value
        if (history && history.length > 0) {
          v[varName] = history[0];
        }
      }
      setHistories(h);
      setValues(v);
    };
    loadHistories();

    // Focus first input
    setTimeout(() => inputRefs.current[0]?.focus(), 100);
  }, [prompt.variables]);

  const handleSubmit = () => {
    // Replace variables in content
    let content = prompt.content;
    for (const [name, value] of Object.entries(values)) {
      content = content.replace(new RegExp(`\\{\\{\\s*${escapeRegex(name)}\\s*\\}\\}`, 'g'), value);
      // Save to history
      if (value.trim()) {
        api?.saveVariableHistory(name, value);
      }
    }
    onSubmit(content);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (index < prompt.variables.length - 1) {
        inputRefs.current[index + 1]?.focus();
      } else {
        handleSubmit();
      }
    } else if (e.key === 'Escape') {
      onCancel();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const next = e.shiftKey
        ? Math.max(0, index - 1)
        : Math.min(prompt.variables.length - 1, index + 1);
      inputRefs.current[next]?.focus();
    }
  };

  const isLongContent = (varName: string) => {
    const history = histories[varName] || [];
    return history.some(h => h.length > 80) || varName.includes('文本') || varName.includes('内容');
  };

  return (
    <div className="variable-dialog">
      <div className="var-dialog-header">
        <h3>{prompt.name}</h3>
        <span className="var-dialog-hint">填写变量后按 Enter 确认</span>
      </div>

      <div className="var-dialog-body">
        {prompt.variables.map((varName, i) => (
          <div key={varName} className="var-field">
            <label className="var-label">{varName}</label>

            {isLongContent(varName) ? (
              <textarea
                ref={el => (inputRefs.current[i] = el)}
                className="var-input var-textarea"
                value={values[varName] || ''}
                onChange={e =>
                  setValues(prev => ({ ...prev, [varName]: e.target.value }))
                }
                onKeyDown={e => handleKeyDown(e, i)}
                onFocus={() => setFocusedIndex(i)}
                placeholder={`请输入${varName}`}
                rows={3}
              />
            ) : (
              <input
                ref={el => (inputRefs.current[i] = el)}
                type="text"
                className="var-input"
                value={values[varName] || ''}
                onChange={e =>
                  setValues(prev => ({ ...prev, [varName]: e.target.value }))
                }
                onKeyDown={e => handleKeyDown(e, i)}
                onFocus={() => setFocusedIndex(i)}
                placeholder={`请输入${varName}`}
              />
            )}

            {/* History suggestions */}
            {histories[varName] && histories[varName].length > 0 && focusedIndex === i && (
              <div className="var-history">
                {histories[varName].slice(0, 5).map((h, hi) => (
                  <button
                    key={hi}
                    className="var-history-item"
                    onClick={() => {
                      setValues(prev => ({ ...prev, [varName]: h }));
                      inputRefs.current[i]?.focus();
                    }}
                  >
                    {h.length > 40 ? h.slice(0, 40) + '...' : h}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="var-dialog-footer">
        <button className="btn btn-secondary" onClick={onCancel}>
          取消
        </button>
        <button className="btn btn-primary" onClick={handleSubmit}>
          确认插入
        </button>
      </div>
    </div>
  );
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
