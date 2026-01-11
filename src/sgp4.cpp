#include "sgp4.hpp"
#include <cmath>

namespace orbitops {

namespace {

// WGS84 / EGM96 Constants
constexpr double MU = 398600.4418;        // km^3/s^2 (Earth gravitational parameter)
constexpr double RE = 6378.137;           // km (Earth equatorial radius)
constexpr double J2 = 1.08262668e-3;      // J2 perturbation
constexpr double XKE = 0.0743669161;      // sqrt(MU) in earth radii^1.5 / min
constexpr double TWOPI = 2.0 * M_PI;
constexpr double DEG2RAD = M_PI / 180.0;
constexpr double MIN_PER_DAY = 1440.0;

// Solve Kepler's equation using Newton-Raphson
double solve_kepler(double M, double e, double tolerance = 1e-10) {
    double E = M; // Initial guess
    for (int i = 0; i < 50; ++i) {
        double delta = E - e * std::sin(E) - M;
        if (std::abs(delta) < tolerance) break;
        E -= delta / (1.0 - e * std::cos(E));
    }
    return E;
}

} // anonymous namespace

void sgp4_propagate(const TLE& tle, double time_minutes, Vec3& position, Vec3& velocity) {
    // Convert TLE elements to radians and standard units
    double incl = tle.inclination * DEG2RAD;
    double raan0 = tle.raan * DEG2RAD;
    double ecc = tle.eccentricity;
    double argp0 = tle.arg_perigee * DEG2RAD;
    double M0 = tle.mean_anomaly * DEG2RAD;
    double n0 = tle.mean_motion * TWOPI / MIN_PER_DAY;  // rad/min

    // Semi-major axis from mean motion (Kepler's 3rd law)
    double a0 = std::pow(MU / (n0 * n0 / 3600.0), 1.0/3.0);  // km
    
    // Calculate orbital parameters
    double p = a0 * (1.0 - ecc * ecc);  // semi-latus rectum
    
    // J2 secular perturbations (simplified)
    double cosi = std::cos(incl);
    double sini = std::sin(incl);
    double cosi2 = cosi * cosi;
    
    // Secular rates due to J2
    double n_dot_factor = 1.5 * J2 * (RE / p) * (RE / p);
    double raan_dot = -n_dot_factor * n0 * cosi;
    double argp_dot = n_dot_factor * n0 * (2.0 - 2.5 * sini * sini);
    double M_dot = n0;  // Base mean motion
    
    // Propagate to time t
    double t = time_minutes;
    double raan = raan0 + raan_dot * t;
    double argp = argp0 + argp_dot * t;
    double M = M0 + M_dot * t;
    
    // Normalize mean anomaly
    M = std::fmod(M, TWOPI);
    if (M < 0) M += TWOPI;
    
    // Solve Kepler's equation for eccentric anomaly
    double E = solve_kepler(M, ecc);
    
    // True anomaly
    double sin_nu = std::sqrt(1.0 - ecc*ecc) * std::sin(E) / (1.0 - ecc * std::cos(E));
    double cos_nu = (std::cos(E) - ecc) / (1.0 - ecc * std::cos(E));
    double nu = std::atan2(sin_nu, cos_nu);
    
    // Argument of latitude
    double u = argp + nu;
    
    // Radius
    double r = a0 * (1.0 - ecc * std::cos(E));
    
    // Position in orbital plane
    double xp = r * std::cos(u);
    double yp = r * std::sin(u);
    
    // Transform to ECI (Earth-Centered Inertial)
    double cos_raan = std::cos(raan);
    double sin_raan = std::sin(raan);
    double cos_i = std::cos(incl);
    double sin_i = std::sin(incl);
    
    position.x = xp * cos_raan - yp * cos_i * sin_raan;
    position.y = xp * sin_raan + yp * cos_i * cos_raan;
    position.z = yp * sin_i;
    
    // Velocity calculation
    double h = std::sqrt(MU * p);  // specific angular momentum
    double r_dot = std::sqrt(MU / p) * ecc * std::sin(nu);
    double rf_dot = h / r;
    
    double vxp = r_dot * std::cos(u) - rf_dot * std::sin(u);
    double vyp = r_dot * std::sin(u) + rf_dot * std::cos(u);
    
    velocity.x = vxp * cos_raan - vyp * cos_i * sin_raan;
    velocity.y = vxp * sin_raan + vyp * cos_i * cos_raan;
    velocity.z = vyp * sin_i;
}

void propagate_all(std::vector<Satellite>& satellites, double time_minutes) {
    for (auto& sat : satellites) {
        sgp4_propagate(sat.tle, time_minutes, sat.position, sat.velocity);
    }
}

} // namespace orbitops

