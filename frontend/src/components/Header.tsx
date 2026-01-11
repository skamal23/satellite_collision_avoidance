import { Sun, Moon, Satellite, RefreshCw, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Theme } from '../types';

interface HeaderProps {
  theme: Theme;
  onThemeToggle: () => void;
  satelliteCount: number;
  conjunctionCount: number;
  onRefresh: () => void;
  loading: boolean;
}

export function Header({ 
  theme, 
  onThemeToggle, 
  satelliteCount, 
  conjunctionCount,
  onRefresh,
  loading 
}: HeaderProps) {
  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50"
    >
      <nav className="glass-panel px-2 py-2 flex items-center gap-1">
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-2 border-r border-[var(--border-glass)]">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
          >
            <Satellite className="w-6 h-6 text-[var(--accent-primary)]" />
          </motion.div>
          <span className="font-semibold text-lg tracking-tight">
            Orbit<span className="text-gradient">Ops</span>
          </span>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 px-4">
          <div className="flex items-center gap-2">
            <span className="status-dot active" />
            <span className="text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{satelliteCount.toLocaleString()}</span> satellites
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`status-dot ${conjunctionCount > 0 ? 'warning' : 'active'}`} />
            <span className="text-sm text-[var(--text-secondary)]">
              <span className="font-semibold text-[var(--text-primary)]">{conjunctionCount}</span> conjunctions
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 px-2 border-l border-[var(--border-glass)]">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onRefresh}
            disabled={loading}
            className="glass-button p-2.5"
            title="Refresh data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="glass-button p-2.5"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </motion.button>

          {/* Theme Toggle */}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onThemeToggle}
            className="glass-button p-2.5 flex items-center gap-2"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <motion.div
              initial={false}
              animate={{ rotate: theme === 'dark' ? 0 : 180 }}
              transition={{ duration: 0.3 }}
            >
              {theme === 'dark' ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </motion.div>
          </motion.button>
        </div>
      </nav>
    </motion.header>
  );
}


