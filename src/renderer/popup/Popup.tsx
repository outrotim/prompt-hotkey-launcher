import React, { useState, useEffect, useCallback, useRef } from 'react';
import VariableDialog from './VariableDialog';

interface PromptItem {
  id: string;
  name: string;
  content: string;
  variables: string[];
  useCount: number;
  isFavorite: boolean;
  lastUsedAt?: number;
}

interface PromptPack {
  id: string;
  name: string;
  description?: string;
  prompts: PromptItem[];
}

interface SearchResult {
  packId: string;
  packName: string;
  prompt: PromptItem;
  score: number;
}

const api = (window as any).electronAPI;

type View = 'packs' | 'prompts' | 'search';

export default function Popup() {
  const [packs, setPacks] = useState<PromptPack[]>([]);
  const [selectedPackIndex, setSelectedPackIndex] = useState(0);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [view, setView] = useState<View>('packs');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [showVariableDialog, setShowVariableDialog] = useState(false);
  const [pendingPrompt, setPendingPrompt] = useState<PromptItem | null>(null);
  const [previewPrompt, setPreviewPrompt] = useState<PromptItem | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load packs on mount
  useEffect(() => {
    loadPacks();
    api?.onPopupShown?.(() => {
      setView('packs');
      setSearchQuery('');
      setSelectedPackIndex(0);
      loadPacks();
    });
  }, []);

  const loadPacks = async () => {
    const data = await api?.getPacks();
    if (data) setPacks(data);
  };

  // Search handler
  useEffect(() => {
    if (searchQuery.trim()) {
      setView('search');
      api?.searchPrompts(searchQuery).then((results: SearchResult[]) => {
        setSearchResults(results || []);
      });
    } else if (view === 'search') {
      setView('packs');
    }
  }, [searchQuery]);

  // Update preview
  useEffect(() => {
    if (view === 'prompts' && packs[selectedPackIndex]) {
      const prompts = packs[selectedPackIndex].prompts;
      setPreviewPrompt(prompts[selectedPromptIndex] || null);
    } else if (view === 'search' && searchResults[selectedPromptIndex]) {
      setPreviewPrompt(searchResults[selectedPromptIndex].prompt);
    } else {
      setPreviewPrompt(null);
    }
  }, [view, selectedPackIndex, selectedPromptIndex, packs, searchResults]);

  const selectPrompt = useCallback((prompt: PromptItem) => {
    if (prompt.variables.length > 0) {
      setPendingPrompt(prompt);
      setShowVariableDialog(true);
    } else {
      api?.insertPrompt(prompt.content);
    }
  }, []);

  const handleVariableSubmit = useCallback((filledContent: string) => {
    setShowVariableDialog(false);
    setPendingPrompt(null);
    api?.insertPrompt(filledContent);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (showVariableDialog) return;

      // Escape to close or go back
      if (e.key === 'Escape') {
        if (searchQuery) {
          setSearchQuery('');
          setView('packs');
        } else if (view === 'prompts') {
          setView('packs');
          setSelectedPromptIndex(0);
        } else {
          api?.hidePopup();
        }
        return;
      }

      // Number keys 1-9 for quick select
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key) - 1;
        if (view === 'packs' && idx < packs.length) {
          setSelectedPackIndex(idx);
          setView('prompts');
          setSelectedPromptIndex(0);
        } else if (view === 'prompts') {
          const prompts = packs[selectedPackIndex]?.prompts;
          if (prompts && idx < prompts.length) {
            selectPrompt(prompts[idx]);
          }
        } else if (view === 'search' && idx < searchResults.length) {
          selectPrompt(searchResults[idx].prompt);
        }
        return;
      }

      // Arrow keys for pack switching
      if (view === 'packs') {
        if (e.key === 'ArrowLeft') {
          setSelectedPackIndex(i => Math.max(0, i - 1));
        } else if (e.key === 'ArrowRight') {
          setSelectedPackIndex(i => Math.min(packs.length - 1, i + 1));
        } else if (e.key === 'ArrowDown') {
          setSelectedPackIndex(i => Math.min(packs.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
          setSelectedPackIndex(i => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
          setView('prompts');
          setSelectedPromptIndex(0);
        }
      } else if (view === 'prompts') {
        // Left/Right to switch packs
        if (e.key === 'ArrowLeft') {
          if (selectedPackIndex > 0) {
            setSelectedPackIndex(i => i - 1);
            setSelectedPromptIndex(0);
          }
        } else if (e.key === 'ArrowRight') {
          if (selectedPackIndex < packs.length - 1) {
            setSelectedPackIndex(i => i + 1);
            setSelectedPromptIndex(0);
          }
        } else if (e.key === 'ArrowDown') {
          const max = packs[selectedPackIndex]?.prompts.length - 1 || 0;
          setSelectedPromptIndex(i => Math.min(max, i + 1));
        } else if (e.key === 'ArrowUp') {
          setSelectedPromptIndex(i => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
          const prompt = packs[selectedPackIndex]?.prompts[selectedPromptIndex];
          if (prompt) selectPrompt(prompt);
        }
      } else if (view === 'search') {
        if (e.key === 'ArrowDown') {
          setSelectedPromptIndex(i => Math.min(searchResults.length - 1, i + 1));
        } else if (e.key === 'ArrowUp') {
          setSelectedPromptIndex(i => Math.max(0, i - 1));
        } else if (e.key === 'Enter') {
          const result = searchResults[selectedPromptIndex];
          if (result) selectPrompt(result.prompt);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [view, packs, selectedPackIndex, selectedPromptIndex, searchResults, searchQuery, showVariableDialog, selectPrompt]);

  if (showVariableDialog && pendingPrompt) {
    return (
      <div className="popup-container">
        <VariableDialog
          prompt={pendingPrompt}
          onSubmit={handleVariableSubmit}
          onCancel={() => {
            setShowVariableDialog(false);
            setPendingPrompt(null);
          }}
        />
      </div>
    );
  }

  const currentPack = packs[selectedPackIndex];

  return (
    <div className="popup-container">
      {/* Search bar */}
      <div className="search-bar">
        <input
          ref={searchInputRef}
          type="text"
          placeholder="搜索提示词..."
          value={searchQuery}
          onChange={e => {
            setSearchQuery(e.target.value);
            setSelectedPromptIndex(0);
          }}
          className="search-input"
          autoFocus
        />
      </div>

      {/* Pack tabs */}
      <div className="pack-tabs">
        {packs.map((pack, i) => (
          <button
            key={pack.id}
            className={`pack-tab ${i === selectedPackIndex ? 'active' : ''}`}
            onClick={() => {
              setSelectedPackIndex(i);
              setView('prompts');
              setSelectedPromptIndex(0);
            }}
          >
            <span className="pack-number">{i + 1}</span>
            <span className="pack-name">{pack.name}</span>
          </button>
        ))}
      </div>

      {/* Content area */}
      <div className="content-area">
        {view === 'search' ? (
          <div className="prompt-list">
            {searchResults.length === 0 ? (
              <div className="empty-state">无匹配结果</div>
            ) : (
              searchResults.map((result, i) => (
                <div
                  key={result.prompt.id}
                  className={`prompt-item ${i === selectedPromptIndex ? 'selected' : ''}`}
                  onClick={() => selectPrompt(result.prompt)}
                  onMouseEnter={() => setSelectedPromptIndex(i)}
                >
                  <span className="prompt-number">{i + 1}</span>
                  <div className="prompt-info">
                    <span className="prompt-name">{result.prompt.name}</span>
                    <span className="prompt-pack-badge">{result.packName}</span>
                  </div>
                  {result.prompt.variables.length > 0 && (
                    <span className="var-badge">变量</span>
                  )}
                </div>
              ))
            )}
          </div>
        ) : view === 'packs' ? (
          <div className="prompt-list">
            {packs.length === 0 ? (
              <div className="empty-state">
                暂无提示词包
                <button className="text-btn" onClick={() => api?.openManager()}>
                  去管理
                </button>
              </div>
            ) : (
              packs.map((pack, i) => (
                <div
                  key={pack.id}
                  className={`prompt-item pack-item ${i === selectedPackIndex ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedPackIndex(i);
                    setView('prompts');
                    setSelectedPromptIndex(0);
                  }}
                  onMouseEnter={() => setSelectedPackIndex(i)}
                >
                  <span className="prompt-number">{i + 1}</span>
                  <div className="prompt-info">
                    <span className="prompt-name">{pack.name}</span>
                    <span className="prompt-count">{pack.prompts.length} 个提示词</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="prompt-list">
            {currentPack?.prompts.map((prompt, i) => (
              <div
                key={prompt.id}
                className={`prompt-item ${i === selectedPromptIndex ? 'selected' : ''}`}
                onClick={() => selectPrompt(prompt)}
                onMouseEnter={() => setSelectedPromptIndex(i)}
              >
                <span className="prompt-number">{i + 1}</span>
                <div className="prompt-info">
                  <span className="prompt-name">{prompt.name}</span>
                </div>
                {prompt.isFavorite && <span className="fav-badge">★</span>}
                {prompt.variables.length > 0 && (
                  <span className="var-badge">变量</span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Preview panel */}
        {previewPrompt && (view === 'prompts' || view === 'search') && (
          <div className="preview-panel">
            <div className="preview-title">{previewPrompt.name}</div>
            <div className="preview-content">{previewPrompt.content}</div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="footer-hint">
        {view === 'packs' && <span>数字键选择 · ←→ 切换 · Enter 进入</span>}
        {view === 'prompts' && <span>数字键选择 · ←→ 切包 · Esc 返回</span>}
        {view === 'search' && <span>↑↓ 选择 · Enter 使用 · Esc 返回</span>}
      </div>
    </div>
  );
}
