import { memo, useCallback, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Satellite, AlertTriangle, Clock, Trash2, ChevronUp, ChevronDown } from 'lucide-react';

export type DockTab = 'satellites' | 'alerts' | 'timeline' | 'debris';

interface CommandDockProps {
  activeTab: DockTab;
  isExpanded: boolean;
  onTabChange: (tab: DockTab) => void;
  onExpandChange: (expanded: boolean) => void;
  satelliteCount: number;
  alertCount: number;
  debrisCount: number;
  children: ReactNode;
}

interface TabConfig {
  id: DockTab;
  label: string;
  icon: typeof Satellite;
  getBadge?: () => number | null;
  badgeType?: 'default' | 'alert';
}

function CommandDockComponent({
  activeTab,
  isExpanded,
  onTabChange,
  onExpandChange,
  satelliteCount,
  alertCount,
  debrisCount,
  children,
}: CommandDockProps) {
  const dockRef = useRef<HTMLDivElement>(null);

  const tabs: TabConfig[] = [
    {
      id: 'satellites',
      label: 'Satellites',
      icon: Satellite,
      getBadge: () => satelliteCount > 0 ? satelliteCount : null,
    },
    {
      id: 'alerts',
      label: 'Alerts',
      icon: AlertTriangle,
      getBadge: () => alertCount > 0 ? alertCount : null,
      badgeType: 'alert',
    },
    {
      id: 'timeline',
      label: 'Timeline',
      icon: Clock,
    },
    {
      id: 'debris',
      label: 'Debris',
      icon: Trash2,
      getBadge: () => debrisCount > 0 ? debrisCount : null,
    },
  ];

  const handleTabClick = useCallback((tab: DockTab) => {
    if (activeTab === tab && isExpanded) {
      onExpandChange(false);
    } else {
      onTabChange(tab);
      onExpandChange(true);
    }
  }, [activeTab, isExpanded, onTabChange, onExpandChange]);

  const handleToggleExpand = useCallback(() => {
    onExpandChange(!isExpanded);
  }, [isExpanded, onExpandChange]);

  // Click outside to collapse
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isExpanded && dockRef.current && !dockRef.current.contains(e.target as Node)) {
        onExpandChange(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isExpanded, onExpandChange]);

  return (
    <div
      ref={dockRef}
      className={`command-dock ${isExpanded ? 'expanded' : 'collapsed'}`}
    >
      {/* Tab Bar */}
      <div className="dock-tabs">
        <div className="dock-tabs-left">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const badge = tab.getBadge?.();
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                className={`dock-tab ${isActive ? 'active' : ''}`}
                onClick={() => handleTabClick(tab.id)}
                title={`${tab.label} (Press ${tabs.indexOf(tab) + 1})`}
              >
                <Icon size={18} />
                <span className="dock-tab-label">{tab.label}</span>
                {badge !== null && badge !== undefined && (
                  <span className={`dock-badge ${tab.badgeType === 'alert' ? 'alert' : ''}`}>
                    {badge > 999 ? '999+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="dock-tabs-right">
          <button
            className="dock-expand-btn"
            onClick={handleToggleExpand}
            title={isExpanded ? 'Collapse (Esc)' : 'Expand'}
          >
            {isExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="dock-content">
        {children}
      </div>

      <style>{`
        .command-dock {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          z-index: 100;
          background: rgba(10, 15, 25, 0.92);
          backdrop-filter: blur(24px);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          transition: max-height 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          overflow: hidden;
        }

        .command-dock.collapsed {
          max-height: 56px;
        }

        .command-dock.expanded {
          max-height: 400px;
        }

        .dock-tabs {
          display: flex;
          align-items: center;
          justify-content: space-between;
          height: 56px;
          padding: 0 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }

        .dock-tabs-left {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .dock-tabs-right {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .dock-tab {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 10px;
          background: transparent;
          border: 1px solid transparent;
          color: rgba(255, 255, 255, 0.6);
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .dock-tab:hover {
          background: rgba(255, 255, 255, 0.05);
          color: rgba(255, 255, 255, 0.8);
        }

        .dock-tab.active {
          background: rgba(0, 212, 255, 0.1);
          border-color: rgba(0, 212, 255, 0.3);
          color: var(--accent-cyan, #00d4ff);
        }

        .dock-tab-label {
          display: block;
        }

        .dock-badge {
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.15);
          font-size: 11px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .dock-badge.alert {
          background: var(--accent-red, #ff4444);
          color: white;
          animation: badge-pulse 2s ease infinite;
        }

        .dock-expand-btn {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px;
          color: rgba(255, 255, 255, 0.7);
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .dock-expand-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .dock-content {
          max-height: 340px;
          overflow: hidden;
          opacity: 0;
          transition: opacity 0.2s ease 0.1s;
        }

        .command-dock.expanded .dock-content {
          opacity: 1;
          overflow-y: auto;
        }

        @keyframes badge-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        @media (max-width: 640px) {
          .dock-tab-label {
            display: none;
          }
          .dock-tab {
            padding: 8px 10px;
          }
        }
      `}</style>
    </div>
  );
}

export const CommandDock = memo(CommandDockComponent);
