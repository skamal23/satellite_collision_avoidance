#include "maneuver_optimizer.hpp"
#include <cmath>
#include <algorithm>

namespace orbitops {

// Earth gravitational parameter (km^3/s^2)
constexpr double MU_EARTH = 398600.4418;
constexpr double EARTH_RADIUS = 6371.0;

double orbital_period(double semi_major_axis_km) {
    return 2.0 * M_PI * std::sqrt(
        (semi_major_axis_km * semi_major_axis_km * semi_major_axis_km) / MU_EARTH
    );
}

double calculate_semi_major_axis(const Vec3& pos, const Vec3& vel) {
    double r = pos.magnitude();
    double v = vel.magnitude();
    double energy = (v * v / 2.0) - (MU_EARTH / r);
    return -MU_EARTH / (2.0 * energy);
}

double calculate_mean_motion(double semi_major_axis_km) {
    return std::sqrt(MU_EARTH / (semi_major_axis_km * semi_major_axis_km * semi_major_axis_km));
}

ManeuverOptimizer::RICState ManeuverOptimizer::to_ric_frame(
    const Vec3& sat_pos, const Vec3& sat_vel,
    const Vec3& relative_pos, const Vec3& relative_vel
) {
    // Calculate RIC unit vectors
    double r_mag = sat_pos.magnitude();
    
    // R (radial) - along position vector
    Vec3 R_hat = {sat_pos.x / r_mag, sat_pos.y / r_mag, sat_pos.z / r_mag};
    
    // C (cross-track) - perpendicular to orbital plane (r x v)
    Vec3 h = {
        sat_pos.y * sat_vel.z - sat_pos.z * sat_vel.y,
        sat_pos.z * sat_vel.x - sat_pos.x * sat_vel.z,
        sat_pos.x * sat_vel.y - sat_pos.y * sat_vel.x
    };
    double h_mag = h.magnitude();
    Vec3 C_hat = {h.x / h_mag, h.y / h_mag, h.z / h_mag};
    
    // I (in-track) - completes right-hand system (C x R)
    Vec3 I_hat = {
        C_hat.y * R_hat.z - C_hat.z * R_hat.y,
        C_hat.z * R_hat.x - C_hat.x * R_hat.z,
        C_hat.x * R_hat.y - C_hat.y * R_hat.x
    };
    
    // Transform relative position and velocity to RIC
    RICState ric;
    ric.position = {
        relative_pos.x * R_hat.x + relative_pos.y * R_hat.y + relative_pos.z * R_hat.z,
        relative_pos.x * I_hat.x + relative_pos.y * I_hat.y + relative_pos.z * I_hat.z,
        relative_pos.x * C_hat.x + relative_pos.y * C_hat.y + relative_pos.z * C_hat.z
    };
    ric.velocity = {
        relative_vel.x * R_hat.x + relative_vel.y * R_hat.y + relative_vel.z * R_hat.z,
        relative_vel.x * I_hat.x + relative_vel.y * I_hat.y + relative_vel.z * I_hat.z,
        relative_vel.x * C_hat.x + relative_vel.y * C_hat.y + relative_vel.z * C_hat.z
    };
    
    return ric;
}

Vec3 ManeuverOptimizer::predict_relative_position(
    const RICState& initial,
    double mean_motion,
    double dt_seconds
) {
    // Clohessy-Wiltshire equations for relative motion
    double n = mean_motion;
    double t = dt_seconds;
    
    double c = std::cos(n * t);
    double s = std::sin(n * t);
    
    // Extract initial conditions
    double x0 = initial.position.x;  // Radial
    double y0 = initial.position.y;  // In-track
    double z0 = initial.position.z;  // Cross-track
    double vx0 = initial.velocity.x;
    double vy0 = initial.velocity.y;
    double vz0 = initial.velocity.z;
    
    // Propagate using CW equations
    Vec3 final_pos;
    final_pos.x = (4.0 - 3.0*c)*x0 + (s/n)*vx0 + (2.0/n)*(1.0-c)*vy0;
    final_pos.y = 6.0*(s - n*t)*x0 + y0 - (2.0/n)*(1.0-c)*vx0 + (4.0*s/n - 3.0*t)*vy0;
    final_pos.z = z0*c + (vz0/n)*s;
    
    return final_pos;
}

ManeuverResult ManeuverOptimizer::calculate_avoidance(
    const Vec3& sat_pos, const Vec3& sat_vel,
    const Vec3& threat_pos, const Vec3& threat_vel,
    double time_to_tca_minutes,
    double current_miss_distance
) {
    ManeuverResult result;
    result.success = false;
    
    double dt_seconds = time_to_tca_minutes * 60.0;
    
    // Calculate relative state
    Vec3 rel_pos = threat_pos - sat_pos;
    Vec3 rel_vel = threat_vel - sat_vel;
    
    // Transform to RIC frame
    RICState ric = to_ric_frame(sat_pos, sat_vel, rel_pos, rel_vel);
    
    // Calculate orbital parameters
    double a = calculate_semi_major_axis(sat_pos, sat_vel);
    double n = calculate_mean_motion(a);
    
    // Strategy 1: Radial maneuver (most efficient for close approaches)
    // Move perpendicular to relative velocity
    double req_separation = safe_distance_ - current_miss_distance;
    if (req_separation <= 0) {
        result.message = "Current miss distance already safe";
        result.success = true;
        result.delta_v = {0, 0, 0};
        result.total_delta_v = 0;
        result.new_miss_distance = current_miss_distance;
        result.fuel_cost_kg = 0;
        return result;
    }
    
    // Calculate required delta-V for radial separation
    // Using simplified CW response: delta_r ≈ (3/n) * delta_v_radial * t
    double dv_radial = (req_separation * n) / (3.0 * dt_seconds);
    
    // Strategy 2: In-track maneuver (changes phasing)
    // delta_y ≈ 6 * n * t * delta_v_radial (from radial impulse)
    // Or direct: delta_v_intrack for along-track separation
    double dv_intrack = req_separation / (2.0 * dt_seconds);
    
    // Strategy 3: Cross-track maneuver (most fuel efficient if plane change needed)
    double dv_crosstrack = req_separation / dt_seconds;
    
    // Choose minimum delta-V option
    struct Option {
        Vec3 dv;
        double magnitude;
        std::string desc;
    };
    
    std::vector<Option> options = {
        {{dv_radial, 0, 0}, std::abs(dv_radial), "Radial burn"},
        {{0, dv_intrack, 0}, std::abs(dv_intrack), "In-track burn"},
        {{0, 0, dv_crosstrack}, std::abs(dv_crosstrack), "Cross-track burn"}
    };
    
    // Sort by delta-V magnitude
    std::sort(options.begin(), options.end(),
        [](const Option& a, const Option& b) { return a.magnitude < b.magnitude; });
    
    // Primary maneuver (minimum delta-V)
    result.delta_v = options[0].dv;
    result.total_delta_v = options[0].magnitude;
    result.burn_time = 0; // Immediate
    result.new_miss_distance = safe_distance_;
    result.fuel_cost_kg = spacecraft_.fuel_required(result.total_delta_v);
    
    // Check feasibility
    if (!spacecraft_.can_execute(result.total_delta_v)) {
        result.success = false;
        result.message = "Insufficient fuel for maneuver";
        return result;
    }
    
    result.success = true;
    result.message = options[0].desc + " - minimum delta-V solution";
    
    // Add alternatives
    for (size_t i = 1; i < options.size(); ++i) {
        ManeuverResult::Alternative alt;
        alt.delta_v = options[i].dv;
        alt.burn_time = 0;
        alt.new_miss_distance = safe_distance_;
        alt.fuel_cost_kg = spacecraft_.fuel_required(options[i].magnitude);
        alt.description = options[i].desc;
        result.alternatives.push_back(alt);
    }
    
    return result;
}

ManeuverResult ManeuverOptimizer::calculate_hohmann_transfer(
    double r1_km,
    double r2_km,
    const SpacecraftParams& spacecraft
) {
    ManeuverResult result;
    
    // Hohmann transfer semi-major axis
    double a_transfer = (r1_km + r2_km) / 2.0;
    
    // Velocities at each radius for circular orbits
    double v1_circular = std::sqrt(MU_EARTH / r1_km);
    double v2_circular = std::sqrt(MU_EARTH / r2_km);
    
    // Velocities on transfer orbit at perigee and apogee
    double v_transfer_perigee = std::sqrt(2.0 * MU_EARTH * (1.0/r1_km - 1.0/(2.0*a_transfer)));
    double v_transfer_apogee = std::sqrt(2.0 * MU_EARTH * (1.0/r2_km - 1.0/(2.0*a_transfer)));
    
    // Delta-V for each burn
    double dv1, dv2;
    if (r2_km > r1_km) {
        // Raising orbit
        dv1 = v_transfer_perigee - v1_circular;
        dv2 = v2_circular - v_transfer_apogee;
    } else {
        // Lowering orbit
        dv1 = v1_circular - v_transfer_perigee;
        dv2 = v_transfer_apogee - v2_circular;
    }
    
    result.delta_v = {0, dv1, 0};  // First burn in velocity direction
    result.total_delta_v = std::abs(dv1) + std::abs(dv2);
    
    // Transfer time (half the transfer orbit period)
    double transfer_period = orbital_period(a_transfer);
    result.burn_time = transfer_period / 2.0 / 60.0;  // minutes for second burn
    
    result.fuel_cost_kg = spacecraft.fuel_required(result.total_delta_v);
    result.new_miss_distance = 0;  // N/A for transfer
    
    if (spacecraft.can_execute(result.total_delta_v)) {
        result.success = true;
        result.message = "Hohmann transfer feasible";
    } else {
        result.success = false;
        result.message = "Insufficient fuel for Hohmann transfer";
    }
    
    // Add individual burns as alternatives
    result.alternatives.push_back({
        {0, dv1, 0}, 0, 0, spacecraft.fuel_required(std::abs(dv1)), "First burn (departure)"
    });
    result.alternatives.push_back({
        {0, dv2, 0}, static_cast<double>(result.burn_time), 0, 
        spacecraft.fuel_required(std::abs(dv2)), "Second burn (arrival)"
    });
    
    return result;
}

ManeuverResult ManeuverOptimizer::calculate_plane_change(
    double velocity_km_s,
    double inclination_change_rad,
    const SpacecraftParams& spacecraft
) {
    ManeuverResult result;
    
    // Delta-V for plane change: dv = 2 * v * sin(di/2)
    double delta_v = 2.0 * velocity_km_s * std::sin(inclination_change_rad / 2.0);
    
    result.delta_v = {0, 0, delta_v};  // Cross-track burn
    result.total_delta_v = delta_v;
    result.burn_time = 0;  // At node crossing
    result.fuel_cost_kg = spacecraft.fuel_required(delta_v);
    
    if (spacecraft.can_execute(delta_v)) {
        result.success = true;
        result.message = "Plane change feasible";
    } else {
        result.success = false;
        result.message = "Insufficient fuel for plane change";
    }
    
    return result;
}

ManeuverResult ManeuverOptimizer::calculate_phasing(
    double current_altitude_km,
    double phase_angle_rad,
    const SpacecraftParams& spacecraft
) {
    ManeuverResult result;
    
    double r = EARTH_RADIUS + current_altitude_km;
    double period = orbital_period(r);
    
    // Time to wait for natural phasing (one orbit)
    double target_period = period * (1.0 - phase_angle_rad / (2.0 * M_PI));
    
    // Required phasing orbit semi-major axis
    double a_phase = std::pow((target_period / (2.0 * M_PI)) * (target_period / (2.0 * M_PI)) * MU_EARTH, 1.0/3.0);
    
    // Delta-V for entering and exiting phasing orbit
    double v_circular = std::sqrt(MU_EARTH / r);
    double v_phase = std::sqrt(2.0 * MU_EARTH * (1.0/r - 1.0/(2.0*a_phase)));
    
    double dv = 2.0 * std::abs(v_phase - v_circular);  // Two burns
    
    result.delta_v = {0, dv/2.0, 0};
    result.total_delta_v = dv;
    result.burn_time = target_period / 60.0;  // Time for phasing orbit
    result.fuel_cost_kg = spacecraft.fuel_required(dv);
    
    if (spacecraft.can_execute(dv)) {
        result.success = true;
        result.message = "Phasing maneuver feasible";
    } else {
        result.success = false;
        result.message = "Insufficient fuel for phasing";
    }
    
    return result;
}

} // namespace orbitops

