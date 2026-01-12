#pragma once

#include "types.hpp"
#include <vector>
#include <optional>

namespace orbitops {

// Result of a collision avoidance maneuver calculation
struct ManeuverResult {
    bool success = false;
    std::string message;
    
    // Maneuver parameters
    Vec3 delta_v;              // Required velocity change (km/s)
    double burn_time;          // When to execute (minutes from now)
    double total_delta_v;      // Magnitude of delta-V (km/s)
    
    // Predicted outcome
    double new_miss_distance;  // Miss distance after maneuver (km)
    double fuel_cost_kg;       // Estimated fuel mass (kg)
    
    // Alternative maneuvers
    struct Alternative {
        Vec3 delta_v;
        double burn_time;
        double new_miss_distance;
        double fuel_cost_kg;
        std::string description;
    };
    std::vector<Alternative> alternatives;
};

// Spacecraft parameters for maneuver calculations
struct SpacecraftParams {
    double mass_kg = 1000.0;       // Dry mass
    double isp_s = 300.0;          // Specific impulse (seconds)
    double max_thrust_n = 100.0;   // Maximum thrust (Newtons)
    double fuel_mass_kg = 50.0;    // Available fuel mass
    
    // Calculate fuel consumption using Tsiolkovsky equation
    double fuel_required(double delta_v_km_s) const {
        double delta_v_m_s = delta_v_km_s * 1000.0;
        double g0 = 9.80665; // m/s^2
        double mass_ratio = std::exp(delta_v_m_s / (isp_s * g0));
        return mass_kg * (1.0 - 1.0 / mass_ratio);
    }
    
    // Check if maneuver is feasible
    bool can_execute(double delta_v_km_s) const {
        return fuel_required(delta_v_km_s) <= fuel_mass_kg;
    }
};

// Maneuver optimizer
class ManeuverOptimizer {
public:
    // Set spacecraft parameters
    void set_spacecraft(const SpacecraftParams& params) { spacecraft_ = params; }
    
    // Set minimum safe distance threshold (km)
    void set_safe_distance(double km) { safe_distance_ = km; }
    
    // Calculate minimum delta-V maneuver to avoid collision
    ManeuverResult calculate_avoidance(
        const Vec3& sat_pos, const Vec3& sat_vel,
        const Vec3& threat_pos, const Vec3& threat_vel,
        double time_to_tca_minutes,
        double current_miss_distance = 0.0
    );
    
    // Calculate optimal Hohmann transfer between two orbits
    static ManeuverResult calculate_hohmann_transfer(
        double r1_km,  // Initial orbit radius
        double r2_km,  // Final orbit radius
        const SpacecraftParams& spacecraft
    );
    
    // Calculate plane change maneuver
    static ManeuverResult calculate_plane_change(
        double velocity_km_s,
        double inclination_change_rad,
        const SpacecraftParams& spacecraft
    );
    
    // Calculate phasing maneuver (to change along-track position)
    static ManeuverResult calculate_phasing(
        double current_altitude_km,
        double phase_angle_rad,
        const SpacecraftParams& spacecraft
    );

private:
    SpacecraftParams spacecraft_;
    double safe_distance_ = 1.0;  // 1 km default safe distance
    
    // Calculate relative motion in the RIC frame (Radial, In-track, Cross-track)
    struct RICState {
        Vec3 position;  // Position in RIC
        Vec3 velocity;  // Velocity in RIC
    };
    
    RICState to_ric_frame(
        const Vec3& sat_pos, const Vec3& sat_vel,
        const Vec3& relative_pos, const Vec3& relative_vel
    );
    
    // Clohessy-Wiltshire equations for relative motion prediction
    Vec3 predict_relative_position(
        const RICState& initial,
        double mean_motion,  // rad/s
        double dt_seconds
    );
};

// Calculate orbital period from semi-major axis
double orbital_period(double semi_major_axis_km);

// Calculate semi-major axis from position and velocity
double calculate_semi_major_axis(const Vec3& pos, const Vec3& vel);

// Calculate mean motion from semi-major axis
double calculate_mean_motion(double semi_major_axis_km);

} // namespace orbitops

