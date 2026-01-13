// Storage key for tour completion status
const TOUR_STORAGE_KEY = 'orbitops-tour-completed';

// Check if tour should auto-show
export const shouldShowTour = (): boolean => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(TOUR_STORAGE_KEY) !== 'true';
};

// Mark tour as completed
export const markTourCompleted = (): void => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
};

// Reset tour (for testing)
export const resetTour = (): void => {
    localStorage.removeItem(TOUR_STORAGE_KEY);
};

export { TOUR_STORAGE_KEY };
