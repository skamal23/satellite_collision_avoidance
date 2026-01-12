import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { Minus, Maximize2, X } from 'lucide-react';

interface DraggablePanelProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultPosition: { x: number; y: number };
  defaultMinimized?: boolean;
  onClose?: () => void;
  className?: string;
}

export function DraggablePanel({
  title,
  icon,
  children,
  defaultPosition,
  defaultMinimized = false,
  onClose,
  className = '',
}: DraggablePanelProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [minimized, setMinimized] = useState(defaultMinimized);
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return;
    
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x));
    const newY = Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.current.y));
    
    setPosition({ x: newX, y: newY });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div
      ref={panelRef}
      className={`draggable-panel liquid-glass animate-in ${minimized ? 'minimized' : ''} ${className}`}
      style={{
        left: position.x,
        top: position.y,
        transform: isDragging ? 'scale(1.02)' : 'scale(1)',
        transition: isDragging ? 'none' : 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
    >
      <div className="panel-header" onMouseDown={handleMouseDown}>
        <div className="panel-title">
          {icon}
          <span>{title}</span>
        </div>
        <div className="panel-controls">
          <button
            className="panel-btn"
            onClick={() => setMinimized(!minimized)}
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? <Maximize2 size={14} /> : <Minus size={14} />}
          </button>
          {onClose && (
            <button className="panel-btn" onClick={onClose} title="Close">
              <X size={14} />
            </button>
          )}
        </div>
      </div>
      {!minimized && (
        <div className="panel-content">
          {children}
        </div>
      )}
    </div>
  );
}

