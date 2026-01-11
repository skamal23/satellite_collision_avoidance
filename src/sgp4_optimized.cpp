#include "sgp4_optimized.hpp"
#include <cmath>

#ifdef _OPENMP
#include <omp.h>
#endif

namespace orbitops {

namespace {
    constexpr double RE = 6378.137;           // km
    constexpr double J2 = 1.08262668e-3;
    constexpr double TWOPI = 2.0 * M_PI;
    constexpr double MU = 398600.4418;        // km^3/s^2

    // Solve Kepler's equation with Newton-Raphson
    inline double solve_kepler(double M, double e) {
        double E = M;  // Initial guess
        
        // Most orbits converge in 3-5 iterations
        for (int iter = 0; iter < 10; ++iter) {
            double sinE = std::sin(E);
            double cosE = std::cos(E);
            double delta = E - e * sinE - M;
            
            if (std::abs(delta) < 1e-12) [[likely]] break;
            
            E -= delta / (1.0 - e * cosE);
        }
        return E;
    }
}

void propagate_all_optimized(SatelliteSystem& sys, double time_minutes) {
    const size_t n = sys.count;
    const double t = time_minutes;
    
    // Pre-compute constants
    const double j2_factor = 1.5 * J2 * RE * RE;

    #pragma omp parallel for schedule(static, 256)
    for (size_t i = 0; i < n; ++i) {
        // Prefetch next satellite's orbital elements
        if (i + 4 < n) [[likely]] {
            __builtin_prefetch(&sys.incl[i + 4], 0, 1);
            __builtin_prefetch(&sys.ecc[i + 4], 0, 1);
            __builtin_prefetch(&sys.n0[i + 4], 0, 1);
        }
        
        // Load orbital elements into registers
        const double incl = sys.incl[i];
        const double raan0 = sys.raan0[i];
        const double e = sys.ecc[i];
        const double argp0 = sys.argp0[i];
        const double M0 = sys.M0[i];
        const double n0 = sys.n0[i];
        const double a = sys.a0[i];
        
        // Derived quantities
        const double p = a * (1.0 - e * e);
        const double p_inv_sq = 1.0 / (p * p);  // Avoid division in loop
        const double cosi = std::cos(incl);
        const double sini = std::sin(incl);
        const double sini_sq = sini * sini;
        
        // J2 secular rates
        const double factor = j2_factor * p_inv_sq;
        const double raan_dot = -factor * n0 * cosi;
        const double argp_dot = factor * n0 * (2.0 - 2.5 * sini_sq);
        
        // Propagate angles
        double raan = raan0 + raan_dot * t;
        double argp = argp0 + argp_dot * t;
        double M = M0 + n0 * t;
        
        // Normalize mean anomaly to [0, 2π)
        M = std::fmod(M, TWOPI);
        if (M < 0) M += TWOPI;
        
        // Solve Kepler's equation
        const double E = solve_kepler(M, e);
        const double cosE = std::cos(E);
        const double sinE = std::sin(E);
        
        // True anomaly
        const double denom = 1.0 - e * cosE;
        const double sqrt_1_e2 = std::sqrt(1.0 - e * e);
        const double sin_nu = sqrt_1_e2 * sinE / denom;
        const double cos_nu = (cosE - e) / denom;
        const double nu = std::atan2(sin_nu, cos_nu);
        
        // Argument of latitude and radius
        const double u = argp + nu;
        const double r = a * denom;
        
        // Position in orbital plane
        const double cos_u = std::cos(u);
        const double sin_u = std::sin(u);
        const double xp = r * cos_u;
        const double yp = r * sin_u;
        
        // Rotation to ECI
        const double cos_raan = std::cos(raan);
        const double sin_raan = std::sin(raan);
        
        sys.x[i] = xp * cos_raan - yp * cosi * sin_raan;
        sys.y[i] = xp * sin_raan + yp * cosi * cos_raan;
        sys.z[i] = yp * sini;
        
        // Velocity calculation
        const double h = std::sqrt(MU * p);
        const double r_dot = std::sqrt(MU / p) * e * std::sin(nu);
        const double rf_dot = h / r;
        
        const double vxp = r_dot * cos_u - rf_dot * sin_u;
        const double vyp = r_dot * sin_u + rf_dot * cos_u;
        
        sys.vx[i] = vxp * cos_raan - vyp * cosi * sin_raan;
        sys.vy[i] = vxp * sin_raan + vyp * cosi * cos_raan;
        sys.vz[i] = vyp * sini;
    }
}

} // namespace orbitops
