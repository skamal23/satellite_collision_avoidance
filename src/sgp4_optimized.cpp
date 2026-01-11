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

    // Solve Kepler's equation
    inline double solve_kepler(double M, double e) {
        double E = M;
        for (int iter = 0; iter < 10; ++iter) {
            double delta = E - e * std::sin(E) - M;
            if (std::abs(delta) < 1e-10) break;
            E -= delta / (1.0 - e * std::cos(E));
        }
        return E;
    }
}

void propagate_all_optimized(SatelliteSystem& sys, double time_minutes) {
    const size_t n = sys.count;
    const double t = time_minutes;

    #pragma omp parallel for schedule(static)
    for (size_t i = 0; i < n; ++i) {
        // Load orbital elements
        double incl = sys.incl[i];
        double raan0 = sys.raan0[i];
        double e = sys.ecc[i];
        double argp0 = sys.argp0[i];
        double M0 = sys.M0[i];
        double n0 = sys.n0[i];
        double a = sys.a0[i];
        
        double p = a * (1.0 - e * e);
        double cosi = std::cos(incl);
        double sini = std::sin(incl);
        
        // J2 secular rates
        double factor = 1.5 * J2 * (RE / p) * (RE / p);
        double raan_dot = -factor * n0 * cosi;
        double argp_dot = factor * n0 * (2.0 - 2.5 * sini * sini);
        
        // Propagate
        double raan = raan0 + raan_dot * t;
        double argp = argp0 + argp_dot * t;
        double M = std::fmod(M0 + n0 * t, TWOPI);
        if (M < 0) M += TWOPI;
        
        // Kepler
        double E = solve_kepler(M, e);
        double cosE = std::cos(E);
        double sinE = std::sin(E);
        
        double denom = 1.0 - e * cosE;
        double sin_nu = std::sqrt(1.0 - e*e) * sinE / denom;
        double cos_nu = (cosE - e) / denom;
        double nu = std::atan2(sin_nu, cos_nu);
        
        double u = argp + nu;
        double r = a * denom;
        
        // Orbital plane position
        double xp = r * std::cos(u);
        double yp = r * std::sin(u);
        
        // Transform to ECI
        double cos_raan = std::cos(raan);
        double sin_raan = std::sin(raan);
        double cos_i = cosi;
        double sin_i = sini;
        
        sys.x[i] = xp * cos_raan - yp * cos_i * sin_raan;
        sys.y[i] = xp * sin_raan + yp * cos_i * cos_raan;
        sys.z[i] = yp * sin_i;
        
        // Velocity (simplified)
        double h = std::sqrt(398600.4418 * p);
        double r_dot = std::sqrt(398600.4418 / p) * e * std::sin(nu);
        double rf_dot = h / r;
        
        double vxp = r_dot * std::cos(u) - rf_dot * std::sin(u);
        double vyp = r_dot * std::sin(u) + rf_dot * std::cos(u);
        
        sys.vx[i] = vxp * cos_raan - vyp * cos_i * sin_raan;
        sys.vy[i] = vxp * sin_raan + vyp * cos_i * cos_raan;
        sys.vz[i] = vyp * sin_i;
    }
}

} // namespace orbitops

