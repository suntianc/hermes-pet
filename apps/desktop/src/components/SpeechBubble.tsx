import React, { useEffect, useState } from 'react';

// Add the fadeIn keyframe used by bubble animation
const styleSheet = document.createElement('style');
styleSheet.textContent = '@keyframes fadeIn{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}} @keyframes fadeOut{from{opacity:1;transform:translateX(-50%) translateY(0)}to{opacity:0;transform:translateX(-50%) translateY(8px)}}';
document.head.appendChild(styleSheet);

export type BubbleMode = 'timed' | 'tts-sync';

interface SpeechBubbleProps {
  text: string;
  duration?: number;
  mode?: BubbleMode;
  onClose?: () => void;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({ text, duration = 3000, mode = 'timed', onClose }) => {
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (text) {
      setVisible(true);
      setClosing(false);

      // timed 模式：超时自动关闭
      if (mode === 'timed') {
        const timer = setTimeout(() => {
          setClosing(true);
          setTimeout(() => {
            setVisible(false);
            onClose?.();
          }, 200); // 淡出动画时长
        }, duration);

        return () => clearTimeout(timer);
      }
    } else {
      setClosing(true);
      const fadeTimer = setTimeout(() => {
        setVisible(false);
        onClose?.();
      }, 200);
      return () => clearTimeout(fadeTimer);
    }
  }, [text, duration, mode, onClose]);

  if (!visible) return null;

  return (
    <div className="speech-bubble" style={{
      ...bubbleStyles,
      animation: closing ? 'fadeOut 0.2s ease-in forwards' : 'fadeIn 0.2s ease-out',
    }}>
      <p style={textStyles}>{text}</p>
      <div style={arrowStyles} />
    </div>
  );
};

const bubbleStyles: React.CSSProperties = {
  position: 'absolute',
  top: '20px',
  left: '50%',
  transform: 'translateX(-50%)',
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  borderRadius: '16px',
  padding: '12px 16px',
  maxWidth: '280px',
  minWidth: '100px',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
  zIndex: 100,
  animation: 'fadeIn 0.2s ease-out',
};

const textStyles: React.CSSProperties = {
  margin: 0,
  fontSize: '14px',
  color: '#333',
  lineHeight: 1.4,
  wordBreak: 'break-word',
};

const arrowStyles: React.CSSProperties = {
  position: 'absolute',
  bottom: '-8px',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 0,
  height: 0,
  borderLeft: '8px solid transparent',
  borderRight: '8px solid transparent',
  borderTop: '8px solid rgba(255, 255, 255, 0.95)',
};
