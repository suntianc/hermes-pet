import React, { useCallback, useEffect, useRef } from 'react';
import { ModelConfig } from '../features/pet/model-registry';

interface PetContextMenuProps {
  x: number;
  y: number;
  models: ModelConfig[];
  onAction: (action: string) => void;
  onClose: () => void;
}

const itemStyle: React.CSSProperties = {
  padding: '8px 16px',
  cursor: 'pointer',
  fontSize: '13px',
  color: '#333',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  backgroundColor: '#eee',
  margin: '4px 0',
};

export const PetContextMenu: React.FC<PetContextMenuProps> = ({ x, y, models, onAction, onClose }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  const handleHide = useCallback(() => {
    window.electronAPI?.petWindow.hide();
    onClose();
  }, [onClose]);

  const handleAlwaysOnTop = useCallback(() => {
    window.electronAPI?.petWindow.setAlwaysOnTop(true);
    onClose();
  }, [onClose]);

  const handleMouseThrough = useCallback(() => {
    window.electronAPI?.petWindow.setIgnoreMouseEvents(true, { forward: true });
    onClose();
  }, [onClose]);

  const handleSettings = useCallback(() => {
    onAction('settings');
  }, [onAction]);

  const handleQuit = useCallback(() => {
    window.electronAPI?.petWindow.close();
  }, []);

  const handleSwitchModel = useCallback((index: number) => {
    onAction(`model:${index}`);
  }, [onAction]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const menuStyle: React.CSSProperties = {
    position: 'fixed',
    top: y,
    left: x,
    backgroundColor: '#fff',
    borderRadius: '8px',
    padding: '4px 0',
    minWidth: '160px',
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
    zIndex: 1000,
    userSelect: 'none',
  };

  const submenuLabelStyle: React.CSSProperties = {
    ...itemStyle,
    fontWeight: 600,
    color: '#666',
    fontSize: '11px',
    textTransform: 'uppercase',
    cursor: 'default',
  };

  const activeModelStyle: React.CSSProperties = {
    ...itemStyle,
    paddingLeft: 24,
  };

  return (
    <div ref={menuRef} style={menuStyle}>
      <div style={itemStyle} onClick={handleHide}>Hide</div>
      <div style={itemStyle} onClick={handleAlwaysOnTop}>Always on Top</div>
      <div style={itemStyle} onClick={handleMouseThrough}>Mouse Passthrough</div>
      <div style={dividerStyle} />
      <div style={submenuLabelStyle}>Switch Model</div>
      {models.map((model, i) => (
        <div key={i} style={activeModelStyle} onClick={() => handleSwitchModel(i)}>
          {model.name}
        </div>
      ))}
      <div style={dividerStyle} />
      <div style={itemStyle} onClick={handleSettings}>Settings</div>
      <div style={dividerStyle} />
      <div style={{ ...itemStyle, color: '#e53935' }} onClick={handleQuit}>Quit</div>
    </div>
  );
};
