import { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { Minus, Plus, GripVertical } from 'lucide-react';

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
    x: side === 'left' ? 20 : window.innerWidth - 340, 
    y: 100 
  });
  const [isDragging, setIsDragging] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });

  // Handle drag start
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

  // Handle drag move
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      
      const newX = Math.max(0, Math.min(
        window.innerWidth - 300,
        dragStartRef.current.panelX + deltaX
      ));
      const newY = Math.max(60, Math.min(
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

  // Update position on window resize
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 300),
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
      {/* Header - Drag Handle */}
      <div 
        className="panel-header"
        onMouseDown={handleMouseDown}
      >
        <div className="panel-title">
          <GripVertical size={14} style={{ opacity: 0.4, marginRight: -4 }} />
          {icon}
          <span>{title}</span>
        </div>
        <div className="panel-controls">
          <button
            className="panel-btn"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand' : 'Minimize'}
          >
            {isMinimized ? <Plus size={12} /> : <Minus size={12} />}
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="panel-content">
          {children}
        </div>
      )}
    </div>
  );
}

