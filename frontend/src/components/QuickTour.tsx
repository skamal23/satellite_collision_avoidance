import { memo, useState, useCallback, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Globe, Satellite, AlertTriangle, Clock, Settings } from 'lucide-react';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: typeof Globe;
  position: 'center' | 'bottom-left' | 'bottom-center' | 'top-right';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'globe',
    title: 'Interactive 3D Globe',
    description: 'Drag to rotate, scroll to zoom. Click on any satellite to select it and view details. Use two fingers to tilt the view.',
    icon: Globe,
    position: 'center',
  },
  {
    id: 'satellites',
    title: 'Satellites Tab',
    description: 'Browse and search all tracked satellites. Filter by orbit type (LEO, MEO, GEO) or inclination. Click any satellite to select it.',
    icon: Satellite,
    position: 'bottom-left',
  },
  {
    id: 'alerts',
    title: 'Alerts Tab',
    description: 'Monitor collision risks in real-time. Alerts are sorted by risk level. Click an alert to view the conjunction details and plan maneuvers.',
    icon: AlertTriangle,
    position: 'bottom-left',
  },
  {
    id: 'timeline',
    title: 'Timeline Tab',
    description: 'Replay historical data or scrub through time. Record sessions for later analysis. Adjust playback speed from 0.25x to 8x.',
    icon: Clock,
    position: 'bottom-center',
  },
  {
    id: 'stats',
    title: 'Quick Stats',
    description: 'Key metrics always visible: total satellites tracked, active alerts, and system performance (FPS).',
    icon: Satellite,
    position: 'top-right',
  },
  {
    id: 'settings',
    title: 'Settings & Help',
    description: 'Customize visualization options, toggle debris display, and access this tour anytime from the help button.',
    icon: Settings,
    position: 'top-right',
  },
];

const TOUR_STORAGE_KEY = 'orbitops-tour-completed';

interface QuickTourProps {
  isOpen: boolean;
  onClose: () => void;
}

function QuickTourComponent({ isOpen, onClose }: QuickTourProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  const handleNext = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      localStorage.setItem(TOUR_STORAGE_KEY, 'true');
      onClose();
    }
  }, [currentStep, onClose]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const handleSkip = useCallback(() => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    onClose();
  }, [onClose]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === 'Escape') {
      handleSkip();
    } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
      handleNext();
    } else if (e.key === 'ArrowLeft') {
      handlePrev();
    }
  }, [isOpen, handleSkip, handleNext, handlePrev]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (!isOpen) return null;

  const step = TOUR_STEPS[currentStep];
  const Icon = step.icon;
  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  return (
    <div className="quick-tour">
      <div className="tour-overlay" onClick={handleSkip} />

      <div className={`tour-card ${step.position}`}>
        {/* Step indicator */}
        <div className="step-indicator">
          {TOUR_STEPS.map((_, i) => (
            <div
              key={i}
              className={`indicator-dot ${i === currentStep ? 'active' : ''} ${i < currentStep ? 'completed' : ''}`}
            />
          ))}
        </div>

        {/* Content */}
        <div className="tour-content">
          <div className="tour-icon">
            <Icon size={24} />
          </div>
          <h3>{step.title}</h3>
          <p>{step.description}</p>
        </div>

        {/* Navigation */}
        <div className="tour-nav">
          <button onClick={handleSkip} className="skip-btn">
            Skip tour
          </button>
          <div className="nav-buttons">
            <button
              onClick={handlePrev}
              disabled={currentStep === 0}
              className="nav-btn prev"
            >
              <ChevronLeft size={16} />
            </button>
            <button onClick={handleNext} className="nav-btn next">
              {isLastStep ? 'Get Started' : 'Next'}
              {!isLastStep && <ChevronRight size={16} />}
            </button>
          </div>
        </div>

        {/* Close button */}
        <button onClick={handleSkip} className="close-btn">
          <X size={16} />
        </button>
      </div>

      <style>{`
        .quick-tour {
          position: fixed;
          inset: 0;
          z-index: 500;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .tour-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
        }

        .tour-card {
          position: relative;
          width: 90%;
          max-width: 400px;
          background: rgba(15, 20, 35, 0.95);
          backdrop-filter: blur(24px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 24px;
          animation: fadeIn 0.3s ease;
        }

        .tour-card.center {
          /* Default center position */
        }

        .tour-card.bottom-left {
          position: absolute;
          bottom: 100px;
          left: 20px;
        }

        .tour-card.bottom-center {
          position: absolute;
          bottom: 100px;
        }

        .tour-card.top-right {
          position: absolute;
          top: 80px;
          right: 20px;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .step-indicator {
          display: flex;
          justify-content: center;
          gap: 8px;
          margin-bottom: 20px;
        }

        .indicator-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: rgba(255, 255, 255, 0.2);
          transition: all 0.2s ease;
        }

        .indicator-dot.active {
          width: 24px;
          border-radius: 4px;
          background: var(--accent-cyan, #00d4ff);
        }

        .indicator-dot.completed {
          background: rgba(0, 212, 255, 0.4);
        }

        .tour-content {
          text-align: center;
          margin-bottom: 24px;
        }

        .tour-icon {
          width: 56px;
          height: 56px;
          margin: 0 auto 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 212, 255, 0.1);
          border: 1px solid rgba(0, 212, 255, 0.3);
          border-radius: 16px;
          color: var(--accent-cyan, #00d4ff);
        }

        .tour-content h3 {
          font-size: 18px;
          font-weight: 600;
          color: white;
          margin: 0 0 8px;
        }

        .tour-content p {
          font-size: 14px;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.7);
          margin: 0;
        }

        .tour-nav {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .skip-btn {
          background: none;
          border: none;
          color: rgba(255, 255, 255, 0.4);
          font-size: 13px;
          cursor: pointer;
          padding: 8px 12px;
          margin: -8px -12px;
        }

        .skip-btn:hover {
          color: rgba(255, 255, 255, 0.7);
        }

        .nav-buttons {
          display: flex;
          gap: 8px;
        }

        .nav-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 10px 16px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .nav-btn.prev {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: rgba(255, 255, 255, 0.7);
        }

        .nav-btn.prev:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        .nav-btn.prev:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .nav-btn.next {
          background: var(--accent-cyan, #00d4ff);
          border: none;
          color: rgba(10, 15, 25, 0.95);
        }

        .nav-btn.next:hover {
          background: var(--accent-green, #00ff88);
        }

        .close-btn {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 8px;
          color: rgba(255, 255, 255, 0.5);
          cursor: pointer;
        }

        .close-btn:hover {
          background: rgba(255, 255, 255, 0.1);
          color: white;
        }

        @media (max-width: 640px) {
          .tour-card {
            bottom: 20px !important;
            left: 10px !important;
            right: 10px !important;
            top: auto !important;
            width: auto;
          }
        }
      `}</style>
    </div>
  );
}

// Export helper to check if tour should auto-show
export const shouldShowTour = (): boolean => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(TOUR_STORAGE_KEY) !== 'true';
};

export const QuickTour = memo(QuickTourComponent);
