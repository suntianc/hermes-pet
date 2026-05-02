import React, { useEffect, useState } from 'react';

interface SpeechBubbleProps {
  text: string;
  duration?: number;
  onClose?: () => void;
}

export const SpeechBubble: React.FC<SpeechBubbleProps> = ({ text, duration = 3000, onClose }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (text) {
      setVisible(true);

      const timer = setTimeout(() => {
        setVisible(false);
        onClose?.();
      }, duration);

      return () => clearTimeout(timer);
    } else {
      setVisible(false);
    }
  }, [text, duration, onClose]);

  if (!visible) return null;

  return (
    <div className="speech-bubble" style={bubbleStyles}>
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
