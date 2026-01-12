#pragma once

#include "types.hpp"
#include "satellite_system.hpp"
#include <random>
#include <vector>

namespace orbitops {

// Covariance matrix for position uncertainty (3x3 diagonal approximation)
struct PositionCovariance {
    double sigma_x = 0.1;  // km, 1-sigma in radial direction
    double sigma_y = 0.5;  // km, 1-sigma in along-track direction
    double sigma_z = 0.3;  // km, 1-sigma in cross-track direction
    
    // Scale based on TLE age (older TLEs have more uncertainty)
    void scale_by_age(double hours_since_epoch) {
        // Uncertainty grows roughly linearly with time
        double scale = 1.0 + 0.1 * hours_since_epoch;
        sigma_x *= scale;
        sigma_y *= scale;
        sigma_z *= scale;
    }
};

// Extended conjunction with probability
struct ConjunctionProbability {
    int sat1_id;
    int sat2_id;
    std::string sat1_name;
    std::string sat2_name;
    double miss_distance;         // km, nominal
    double relative_velocity;     // km/s
    double tca;                   // Time of Closest Approach (minutes from epoch)
    double collision_probability; // Pc (0-1)
    double combined_radius;       // Hard body radius for collision (km)
    
    // Monte Carlo results
    int samples_taken;
    int collisions_detected;
    double min_miss_distance;
    double max_miss_distance;
    double mean_miss_distance;
    double std_miss_distance;
};

// Monte Carlo collision probability calculator
class CollisionProbabilityCalculator {
public:
    explicit CollisionProbabilityCalculator(unsigned seed = 42);
    
    // Set the number of Monte Carlo samples (default: 10000)
    void set_sample_count(int count) { sample_count_ = count; }
    
    // Set the combined hard body radius (default: 10m = 0.01km)
    void set_collision_radius(double radius_km) { collision_radius_ = radius_km; }
    
    // Calculate probability for a single conjunction
    ConjunctionProbability calculate(
        const Vec3& pos1, const Vec3& vel1, const PositionCovariance& cov1,
        const Vec3& pos2, const Vec3& vel2, const PositionCovariance& cov2,
        int sat1_id, int sat2_id,
        const std::string& sat1_name = "",
        const std::string& sat2_name = "",
        double time_minutes = 0.0
    );
    
    // Calculate probability using default covariances (for quick estimates)
    ConjunctionProbability calculate_quick(
        const Vec3& pos1, const Vec3& vel1,
        const Vec3& pos2, const Vec3& vel2,
        int sat1_id, int sat2_id,
        double hours_since_epoch1 = 0.0,
        double hours_since_epoch2 = 0.0
    );
    
    // Calculate probability for all conjunctions in a system
    std::vector<ConjunctionProbability> calculate_all(
        const SatelliteSystem& sys,
        const std::vector<Conjunction>& conjunctions,
        const std::vector<TLE>& tles
    );
    
    // Alternative: Analytical Pc using Foster's method (faster, less accurate)
    static double calculate_foster(
        const Vec3& pos1, const Vec3& pos2,
        const Vec3& vel1, const Vec3& vel2,
        const PositionCovariance& cov1, const PositionCovariance& cov2,
        double collision_radius
    );
    
    // Alternative: Chan's method for 2D projection (standard for ops)
    static double calculate_chan(
        double miss_distance,
        double relative_velocity,
        double sigma_total,
        double collision_radius
    );

private:
    std::mt19937_64 rng_;
    std::normal_distribution<double> normal_dist_;
    int sample_count_ = 10000;
    double collision_radius_ = 0.01; // 10 meters in km
    
    // Sample position with uncertainty
    Vec3 sample_position(const Vec3& nominal, const PositionCovariance& cov);
};

// Utility: Estimate covariance from TLE age
PositionCovariance estimate_covariance(double hours_since_epoch, bool is_debris = false);

// Utility: Calculate relative velocity between two objects
double calculate_relative_velocity(const Vec3& vel1, const Vec3& vel2);

} // namespace orbitops

