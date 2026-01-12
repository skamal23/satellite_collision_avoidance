import { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';

interface SidebarPanelProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultPosition?: { x: number; y: number };
  side?: 'left' | 'right';
  defaultMinimized?: boolean;
}

export function SidebarPanel({
  title,
  icon,
  children,
  defaultPosition,
  side = 'left',
  defaultMinimized = false,
}: SidebarPanelProps) {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [position, setPosition] = useState(defaultPosition || { 
    x: side === 'left' ? 20 : window.innerWidth - 360, 
    y: 90 
  });
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-btn')) return;
    
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panelX: position.x,
      panelY: position.y,
    };
    e.preventDefault();
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      
      const newX = Math.max(10, Math.min(
        window.innerWidth - 350,
        dragStartRef.current.panelX + deltaX
      ));
      const newY = Math.max(70, Math.min(
        window.innerHeight - 100,
        dragStartRef.current.panelY + deltaY
      ));
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 350),
        y: Math.min(prev.y, window.innerHeight - 100),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={panelRef}
      className={`sidebar-panel liquid-glass ${isMinimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        position: 'fixed',
      }}
    >
      <div 
        className="panel-header"
        onMouseDown={handleMouseDown}
      >
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
        </div>
      </div>

      {!isMinimized && (
        <div className="panel-content">
          {children}
        </div>
      )}
    </div>
  );
}
