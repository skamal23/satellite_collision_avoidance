import { useState, useRef, useCallback, useEffect, memo } from 'react';
import type { ReactNode } from 'react';
import { Minus, Plus, X, Maximize2, Minimize2 } from 'lucide-react';

interface FloatingPanelProps {
  id: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  isOpen: boolean;
  onClose: () => void;
  zIndex?: number;
  onFocus?: () => void;
}

function FloatingPanelComponent({
  id,
  title,
  icon,
  children,
  defaultPosition,
  defaultSize = { width: 380, height: 550 },
  minSize = { width: 300, height: 250 },
  maxSize = { width: 600, height: 800 },
  isOpen,
  onClose,
  zIndex = 100,
  onFocus,
}: FloatingPanelProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [position, setPosition] = useState(defaultPosition || { x: 20, y: 70 });
  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  const [preMaxState, setPreMaxState] = useState<{ pos: typeof position; size: typeof size } | null>(null);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, panelX: 0, panelY: 0 });

  // Reset position when panel opens
  useEffect(() => {
    if (isOpen && defaultPosition) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPosition(defaultPosition);
    }
  }, [isOpen, defaultPosition]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-btn') ||
      (e.target as HTMLElement).closest('.resize-handle')) return;

    onFocus?.();
    if (isMaximized) return;

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panelX: position.x,
      panelY: position.y,
    };
    e.preventDefault();
  }, [position, isMaximized, onFocus]);

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    if (isMaximized) return;
    e.stopPropagation();
    e.preventDefault();
    onFocus?.();
    setIsResizing(direction);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      panelX: position.x,
      panelY: position.y,
    };
  }, [size, position, isMaximized, onFocus]);

  const handleMaximize = useCallback(() => {
    if (isMaximized) {
      if (preMaxState) {
        setPosition(preMaxState.pos);
        setSize(preMaxState.size);
      }
      setIsMaximized(false);
    } else {
      setPreMaxState({ pos: position, size });
      setPosition({ x: 10, y: 60 });
      setSize({ width: window.innerWidth - 20, height: window.innerHeight - 130 });
      setIsMaximized(true);
    }
  }, [isMaximized, preMaxState, position, size]);

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const deltaY = e.clientY - dragStartRef.current.y;

        const newX = Math.max(0, Math.min(
          window.innerWidth - 100,
          dragStartRef.current.panelX + deltaX
        ));
        const newY = Math.max(0, Math.min(
          window.innerHeight - 100,
          dragStartRef.current.panelY + deltaY
        ));

        setPosition({ x: newX, y: newY });
      }

      if (isResizing) {
        const deltaX = e.clientX - resizeStartRef.current.x;
        const deltaY = e.clientY - resizeStartRef.current.y;

        let newWidth = resizeStartRef.current.width;
        let newHeight = resizeStartRef.current.height;
        let newX = resizeStartRef.current.panelX;
        let newY = resizeStartRef.current.panelY;

        if (isResizing.includes('e')) {
          newWidth = Math.min(maxSize.width, Math.max(minSize.width, resizeStartRef.current.width + deltaX));
        }
        if (isResizing.includes('w')) {
          const widthDelta = -deltaX;
          newWidth = Math.min(maxSize.width, Math.max(minSize.width, resizeStartRef.current.width + widthDelta));
          if (newWidth !== resizeStartRef.current.width) {
            newX = resizeStartRef.current.panelX - (newWidth - resizeStartRef.current.width);
          }
        }
        if (isResizing.includes('s')) {
          newHeight = Math.min(maxSize.height, Math.max(minSize.height, resizeStartRef.current.height + deltaY));
        }
        if (isResizing.includes('n')) {
          const heightDelta = -deltaY;
          newHeight = Math.min(maxSize.height, Math.max(minSize.height, resizeStartRef.current.height + heightDelta));
          if (newHeight !== resizeStartRef.current.height) {
            newY = resizeStartRef.current.panelY - (newHeight - resizeStartRef.current.height);
          }
        }

        setSize({ width: newWidth, height: newHeight });
        setPosition({ x: Math.max(0, newX), y: Math.max(0, newY) });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, minSize, maxSize]);

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className={`floating-panel liquid-glass ${isMinimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''} ${isMaximized ? 'maximized' : ''}`}
      style={{
        left: isMaximized ? 10 : position.x,
        top: isMaximized ? 60 : position.y,
        width: isMinimized ? 220 : (isMaximized ? window.innerWidth - 20 : size.width),
        height: isMinimized ? 52 : (isMaximized ? window.innerHeight - 130 : size.height),
        zIndex,
      }}
      onClick={onFocus}
      data-panel-id={id}
    >
      {/* Resize handles */}
      {!isMinimized && !isMaximized && (
        <>
          <div className="resize-handle resize-n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
          <div className="resize-handle resize-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
          <div className="resize-handle resize-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
          <div className="resize-handle resize-w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
          <div className="resize-handle resize-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
          <div className="resize-handle resize-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
          <div className="resize-handle resize-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
          <div className="resize-handle resize-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
        </>
      )}

      {/* Header */}
      <div className="panel-header" onMouseDown={handleMouseDown}>
        <div className="panel-title">
          {icon}
          <span>{title}</span>
        </div>
        <div className="panel-controls">
          <button
            className="panel-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <Plus size={14} /> : <Minus size={14} />}
          </button>
          <button
            className="panel-btn"
            onClick={handleMaximize}
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
          <button
            className="panel-btn close"
            onClick={onClose}
            title="Close"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="panel-content">
          {children}
        </div>
      )}

      <style>{`
        .floating-panel {
          position: fixed;
          display: flex;
          flex-direction: column;
          transition: box-shadow 0.2s ease;
          animation: panelFadeIn 0.2s ease;
        }

        @keyframes panelFadeIn {
          from {
            opacity: 0;
            transform: scale(0.95) translateY(10px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .floating-panel.minimized {
          overflow: hidden;
        }

        .floating-panel.dragging {
          cursor: grabbing;
          box-shadow:
            0 0 0 2px var(--accent-cyan),
            0 25px 80px rgba(0, 212, 255, 0.2),
            var(--glass-shadow);
        }

        .floating-panel.resizing {
          transition: none;
        }

        .floating-panel.maximized {
          border-radius: 16px;
        }

        .floating-panel .panel-btn.close:hover {
          background: rgba(255, 68, 68, 0.2);
          border-color: rgba(255, 68, 68, 0.4);
          color: var(--accent-red);
        }

        .floating-panel .panel-content {
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
        }
      `}</style>
    </div>
  );
}

export const FloatingPanel = memo(FloatingPanelComponent);
