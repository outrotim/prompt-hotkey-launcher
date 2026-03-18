import React, { useState, useEffect } from 'react';

interface PromptItem {
  id: string;
  name: string;
  content: string;
  variables: string[];
  useCount: number;
  isFavorite: boolean;
}

interface PromptPack {
  id: string;
  name: string;
  description?: string;
  prompts: PromptItem[];
  filePath: string;
}

const api = (window as any).electronAPI;

export default function Manager() {
  const [packs, setPacks] = useState<PromptPack[]>([]);
  const [selectedPackIndex, setSelectedPackIndex] = useState(0);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(-1);
  const [editingPack, setEditingPack] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);

  // Edit form state
  const [packName, setPackName] = useState('');
  const [packDesc, setPackDesc] = useState('');
  const [promptName, setPromptName] = useState('');
  const [promptContent, setPromptContent] = useState('');

  useEffect(() => {
    loadPacks();
  }, []);

  const loadPacks = async () => {
    const data = await api?.getAllPacks();
    if (data) setPacks(data);
  };

  const currentPack = packs[selectedPackIndex];
  const currentPrompt =
    currentPack && selectedPromptIndex >= 0
      ? currentPack.prompts[selectedPromptIndex]
      : null;

  const handleNewPack = () => {
    setPackName('');
    setPackDesc('');
    setEditingPack(true);
    setSelectedPackIndex(-1);
  };

  const handleEditPack = () => {
    if (!currentPack) return;
    setPackName(currentPack.name);
    setPackDesc(currentPack.description || '');
    setEditingPack(true);
  };

  const handleSavePack = async () => {
    const pack: any = {
      id: currentPack?.id || '',
      name: packName,
      description: packDesc,
      prompts: currentPack?.prompts || [],
      filePath: currentPack?.filePath || '',
    };
    await api?.savePack(pack);
    setEditingPack(false);
    await loadPacks();
  };

  const handleDeletePack = async () => {
    if (!currentPack) return;
    if (confirm(`确定删除提示词包"${currentPack.name}"？`)) {
      await api?.deletePack(currentPack.id);
      setSelectedPackIndex(0);
      await loadPacks();
    }
  };

  const handleNewPrompt = () => {
    setPromptName('');
    setPromptContent('');
    setEditingPrompt(true);
    setSelectedPromptIndex(-1);
  };

  const handleEditPrompt = () => {
    if (!currentPrompt) return;
    setPromptName(currentPrompt.name);
    setPromptContent(currentPrompt.content);
    setEditingPrompt(true);
  };

  const handleSavePrompt = async () => {
    if (!currentPack) return;

    const updatedPrompts = [...currentPack.prompts];
    const promptData: any = {
      id: currentPrompt?.id || '',
      name: promptName,
      content: promptContent,
      variables: extractVars(promptContent),
      useCount: currentPrompt?.useCount || 0,
      isFavorite: currentPrompt?.isFavorite || false,
    };

    if (selectedPromptIndex >= 0) {
      updatedPrompts[selectedPromptIndex] = promptData;
    } else {
      updatedPrompts.push(promptData);
    }

    const updatedPack = { ...currentPack, prompts: updatedPrompts };
    await api?.savePack(updatedPack);
    setEditingPrompt(false);
    await loadPacks();
  };

  const handleDeletePrompt = async () => {
    if (!currentPack || !currentPrompt) return;
    if (confirm(`确定删除提示词"${currentPrompt.name}"？`)) {
      const updatedPrompts = currentPack.prompts.filter(
        (_, i) => i !== selectedPromptIndex
      );
      const updatedPack = { ...currentPack, prompts: updatedPrompts };
      await api?.savePack(updatedPack);
      setSelectedPromptIndex(-1);
      await loadPacks();
    }
  };

  const handleImport = async () => {
    await api?.importMarkdown();
    await loadPacks();
  };

  return (
    <div className="manager-container">
      {/* Sidebar: Pack list */}
      <div className="manager-sidebar">
        <div className="sidebar-header">
          <h2>提示词包</h2>
          <div className="sidebar-actions">
            <button className="icon-btn" onClick={handleNewPack} title="新建">
              +
            </button>
            <button className="icon-btn" onClick={handleImport} title="导入 Markdown">
              ↓
            </button>
          </div>
        </div>

        <div className="pack-list">
          {packs.map((pack, i) => (
            <div
              key={pack.id}
              className={`pack-list-item ${i === selectedPackIndex ? 'active' : ''}`}
              onClick={() => {
                setSelectedPackIndex(i);
                setSelectedPromptIndex(-1);
                setEditingPack(false);
                setEditingPrompt(false);
              }}
            >
              <span className="pack-list-name">{pack.name}</span>
              <span className="pack-list-count">{pack.prompts.length}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      <div className="manager-main">
        {editingPack ? (
          <div className="edit-form">
            <h3>{currentPack ? '编辑提示词包' : '新建提示词包'}</h3>
            <div className="form-field">
              <label>包名称</label>
              <input
                type="text"
                value={packName}
                onChange={e => setPackName(e.target.value)}
                placeholder="例如：写作助手"
              />
            </div>
            <div className="form-field">
              <label>描述</label>
              <textarea
                value={packDesc}
                onChange={e => setPackDesc(e.target.value)}
                placeholder="简要描述这个提示词包"
                rows={2}
              />
            </div>
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setEditingPack(false)}>
                取消
              </button>
              <button className="btn btn-primary" onClick={handleSavePack} disabled={!packName.trim()}>
                保存
              </button>
            </div>
          </div>
        ) : editingPrompt ? (
          <div className="edit-form">
            <h3>{currentPrompt ? '编辑提示词' : '新建提示词'}</h3>
            <div className="form-field">
              <label>名称</label>
              <input
                type="text"
                value={promptName}
                onChange={e => setPromptName(e.target.value)}
                placeholder="例如：文本润色"
              />
            </div>
            <div className="form-field">
              <label>
                内容 <span className="form-hint">使用 {'{{变量名}}'} 添加变量占位符</span>
              </label>
              <textarea
                value={promptContent}
                onChange={e => setPromptContent(e.target.value)}
                placeholder={'请帮我润色以下文本：\n{{文本}}'}
                rows={10}
                className="code-textarea"
              />
            </div>
            {extractVars(promptContent).length > 0 && (
              <div className="detected-vars">
                检测到变量：{extractVars(promptContent).map(v => (
                  <span key={v} className="var-tag">{`{{${v}}}`}</span>
                ))}
              </div>
            )}
            <div className="form-actions">
              <button className="btn btn-secondary" onClick={() => setEditingPrompt(false)}>
                取消
              </button>
              <button
                className="btn btn-primary"
                onClick={handleSavePrompt}
                disabled={!promptName.trim() || !promptContent.trim()}
              >
                保存
              </button>
            </div>
          </div>
        ) : currentPack ? (
          <>
            {/* Pack header */}
            <div className="main-header">
              <div>
                <h2>{currentPack.name}</h2>
                {currentPack.description && (
                  <p className="pack-description">{currentPack.description}</p>
                )}
              </div>
              <div className="header-actions">
                <button className="btn btn-sm" onClick={handleEditPack}>
                  编辑
                </button>
                <button className="btn btn-sm btn-danger" onClick={handleDeletePack}>
                  删除
                </button>
              </div>
            </div>

            {/* Prompt list */}
            <div className="prompt-table">
              <div className="prompt-table-header">
                <span>提示词列表</span>
                <button className="icon-btn" onClick={handleNewPrompt}>
                  + 新建提示词
                </button>
              </div>
              {currentPack.prompts.map((prompt, i) => (
                <div
                  key={prompt.id || i}
                  className={`prompt-table-row ${i === selectedPromptIndex ? 'active' : ''}`}
                  onClick={() => setSelectedPromptIndex(i)}
                >
                  <div className="prompt-row-info">
                    <span className="prompt-row-name">{prompt.name}</span>
                    <span className="prompt-row-preview">
                      {prompt.content.slice(0, 60)}
                      {prompt.content.length > 60 ? '...' : ''}
                    </span>
                  </div>
                  <div className="prompt-row-actions">
                    {prompt.variables.length > 0 && (
                      <span className="var-tag-sm">
                        {prompt.variables.length} 个变量
                      </span>
                    )}
                    <button
                      className="icon-btn-sm"
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedPromptIndex(i);
                        setPromptName(prompt.name);
                        setPromptContent(prompt.content);
                        setEditingPrompt(true);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="icon-btn-sm danger"
                      onClick={e => {
                        e.stopPropagation();
                        setSelectedPromptIndex(i);
                        setTimeout(handleDeletePrompt, 0);
                      }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              ))}
              {currentPack.prompts.length === 0 && (
                <div className="empty-state">
                  暂无提示词，点击上方"新建提示词"添加
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="empty-state center">
            <p>选择左侧提示词包或创建新的</p>
          </div>
        )}
      </div>
    </div>
  );
}

function extractVars(content: string): string[] {
  const regex = /\{\{([^}]+)\}\}/g;
  const vars: string[] = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    const v = match[1].trim();
    if (!vars.includes(v)) vars.push(v);
  }
  return vars;
}
