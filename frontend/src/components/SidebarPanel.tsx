import { useState, useRef, useCallback, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Minus, Plus } from 'lucide-react';

interface SidebarPanelProps {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  side?: 'left' | 'right';
  defaultMinimized?: boolean;
}

export function SidebarPanel({
  title,
  icon,
  children,
  defaultPosition,
  defaultSize = { width: 340, height: 500 },
  minSize = { width: 280, height: 200 },
  side = 'left',
  defaultMinimized = false,
}: SidebarPanelProps) {
  const [isMinimized, setIsMinimized] = useState(defaultMinimized);
  const [position, setPosition] = useState(defaultPosition || { 
    x: side === 'left' ? 20 : window.innerWidth - defaultSize.width - 40, 
    y: 20 
  });
  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState<string | null>(null);
  
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, panelX: 0, panelY: 0 });
  const resizeStartRef = useRef({ x: 0, y: 0, width: 0, height: 0, panelX: 0, panelY: 0 });

  // Drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('.panel-btn') || 
        (e.target as HTMLElement).closest('.resize-handle')) return;
    
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panelX: position.x,
      panelY: position.y,
    };
    e.preventDefault();
  }, [position]);

  // Resize handling
  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    e.stopPropagation();
    e.preventDefault();
    setIsResizing(direction);
    resizeStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
      panelX: position.x,
      panelY: position.y,
    };
  }, [size, position]);

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

        // Handle horizontal resize
        if (isResizing.includes('e')) {
          newWidth = Math.max(minSize.width, resizeStartRef.current.width + deltaX);
        }
        if (isResizing.includes('w')) {
          const widthDelta = -deltaX;
          newWidth = Math.max(minSize.width, resizeStartRef.current.width + widthDelta);
          if (newWidth !== resizeStartRef.current.width) {
            newX = resizeStartRef.current.panelX - (newWidth - resizeStartRef.current.width);
          }
        }

        // Handle vertical resize
        if (isResizing.includes('s')) {
          newHeight = Math.max(minSize.height, resizeStartRef.current.height + deltaY);
        }
        if (isResizing.includes('n')) {
          const heightDelta = -deltaY;
          newHeight = Math.max(minSize.height, resizeStartRef.current.height + heightDelta);
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
  }, [isDragging, isResizing, minSize]);

  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.min(prev.x, window.innerWidth - 100),
        y: Math.min(prev.y, window.innerHeight - 100),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div
      ref={panelRef}
      className={`sidebar-panel liquid-glass ${isMinimized ? 'minimized' : ''} ${isDragging ? 'dragging' : ''} ${isResizing ? 'resizing' : ''}`}
      style={{
        left: position.x,
        top: position.y,
        width: isMinimized ? 200 : size.width,
        height: isMinimized ? 56 : size.height,
        position: 'fixed',
      }}
    >
      {/* Resize handles - all edges and corners */}
      {!isMinimized && (
        <>
          {/* Edges */}
          <div className="resize-handle resize-n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
          <div className="resize-handle resize-s" onMouseDown={(e) => handleResizeStart(e, 's')} />
          <div className="resize-handle resize-e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
          <div className="resize-handle resize-w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
          {/* Corners */}
          <div className="resize-handle resize-nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
          <div className="resize-handle resize-ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
          <div className="resize-handle resize-sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
          <div className="resize-handle resize-se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
        </>
      )}

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
