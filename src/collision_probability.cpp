#include "collision_probability.hpp"
#include <cmath>
#include <algorithm>
#include <numeric>

namespace orbitops {

CollisionProbabilityCalculator::CollisionProbabilityCalculator(unsigned seed)
    : rng_(seed), normal_dist_(0.0, 1.0) {}

Vec3 CollisionProbabilityCalculator::sample_position(
    const Vec3& nominal,
    const PositionCovariance& cov
) {
    return {
        nominal.x + normal_dist_(rng_) * cov.sigma_x,
        nominal.y + normal_dist_(rng_) * cov.sigma_y,
        nominal.z + normal_dist_(rng_) * cov.sigma_z
    };
}

ConjunctionProbability CollisionProbabilityCalculator::calculate(
    const Vec3& pos1, const Vec3& vel1, const PositionCovariance& cov1,
    const Vec3& pos2, const Vec3& vel2, const PositionCovariance& cov2,
    int sat1_id, int sat2_id,
    const std::string& sat1_name,
    const std::string& sat2_name,
    double time_minutes
) {
    ConjunctionProbability result;
    result.sat1_id = sat1_id;
    result.sat2_id = sat2_id;
    result.sat1_name = sat1_name;
    result.sat2_name = sat2_name;
    result.tca = time_minutes;
    result.combined_radius = collision_radius_;
    result.samples_taken = sample_count_;
    
    // Nominal values
    Vec3 diff = pos1 - pos2;
    result.miss_distance = diff.magnitude();
    result.relative_velocity = calculate_relative_velocity(vel1, vel2);
    
    // Monte Carlo sampling
    int collisions = 0;
    double min_dist = std::numeric_limits<double>::max();
    double max_dist = 0.0;
    double sum_dist = 0.0;
    double sum_dist_sq = 0.0;
    
    for (int i = 0; i < sample_count_; ++i) {
        Vec3 sampled_pos1 = sample_position(pos1, cov1);
        Vec3 sampled_pos2 = sample_position(pos2, cov2);
        
        Vec3 sampled_diff = sampled_pos1 - sampled_pos2;
        double dist = sampled_diff.magnitude();
        
        if (dist < collision_radius_) {
            ++collisions;
        }
        
        min_dist = std::min(min_dist, dist);
        max_dist = std::max(max_dist, dist);
        sum_dist += dist;
        sum_dist_sq += dist * dist;
    }
    
    result.collisions_detected = collisions;
    result.collision_probability = static_cast<double>(collisions) / sample_count_;
    result.min_miss_distance = min_dist;
    result.max_miss_distance = max_dist;
    result.mean_miss_distance = sum_dist / sample_count_;
    
    double variance = (sum_dist_sq / sample_count_) - 
                      (result.mean_miss_distance * result.mean_miss_distance);
    result.std_miss_distance = std::sqrt(std::max(0.0, variance));
    
    return result;
}

ConjunctionProbability CollisionProbabilityCalculator::calculate_quick(
    const Vec3& pos1, const Vec3& vel1,
    const Vec3& pos2, const Vec3& vel2,
    int sat1_id, int sat2_id,
    double hours_since_epoch1,
    double hours_since_epoch2
) {
    PositionCovariance cov1 = estimate_covariance(hours_since_epoch1);
    PositionCovariance cov2 = estimate_covariance(hours_since_epoch2);
    return calculate(pos1, vel1, cov1, pos2, vel2, cov2, sat1_id, sat2_id);
}

std::vector<ConjunctionProbability> CollisionProbabilityCalculator::calculate_all(
    const SatelliteSystem& sys,
    const std::vector<Conjunction>& conjunctions,
    const std::vector<TLE>& tles
) {
    std::vector<ConjunctionProbability> results;
    results.reserve(conjunctions.size());
    
    for (const auto& conj : conjunctions) {
        size_t i1 = static_cast<size_t>(conj.sat1_id);
        size_t i2 = static_cast<size_t>(conj.sat2_id);
        
        if (i1 >= sys.count || i2 >= sys.count) continue;
        
        Vec3 pos1 = {sys.x[i1], sys.y[i1], sys.z[i1]};
        Vec3 vel1 = {sys.vx[i1], sys.vy[i1], sys.vz[i1]};
        Vec3 pos2 = {sys.x[i2], sys.y[i2], sys.z[i2]};
        Vec3 vel2 = {sys.vx[i2], sys.vy[i2], sys.vz[i2]};
        
        // Estimate hours since epoch (simplified)
        double hours1 = i1 < tles.size() ? 24.0 : 48.0; // Default to 1-2 days
        double hours2 = i2 < tles.size() ? 24.0 : 48.0;
        
        PositionCovariance cov1 = estimate_covariance(hours1);
        PositionCovariance cov2 = estimate_covariance(hours2);
        
        std::string name1 = i1 < tles.size() ? tles[i1].name : "";
        std::string name2 = i2 < tles.size() ? tles[i2].name : "";
        
        auto prob = calculate(pos1, vel1, cov1, pos2, vel2, cov2,
                             conj.sat1_id, conj.sat2_id,
                             name1, name2, conj.time_minutes);
        results.push_back(prob);
    }
    
    return results;
}

double CollisionProbabilityCalculator::calculate_foster(
    const Vec3& pos1, const Vec3& pos2,
    const Vec3& vel1, const Vec3& vel2,
    const PositionCovariance& cov1, const PositionCovariance& cov2,
    double collision_radius
) {
    // Foster's probability formula (simplified)
    // Pc = (pi * R^2) / (2 * pi * sigma_x * sigma_y) * exp(-r^2 / (2 * sigma^2))
    
    Vec3 diff = pos1 - pos2;
    double r = diff.magnitude();
    
    // Combined covariance (root sum squared)
    double sigma_combined = std::sqrt(
        cov1.sigma_x * cov1.sigma_x + cov2.sigma_x * cov2.sigma_x +
        cov1.sigma_y * cov1.sigma_y + cov2.sigma_y * cov2.sigma_y +
        cov1.sigma_z * cov1.sigma_z + cov2.sigma_z * cov2.sigma_z
    ) / std::sqrt(3.0);
    
    // Cross-sectional area
    double cross_section = M_PI * collision_radius * collision_radius;
    
    // Gaussian probability
    double exponent = -(r * r) / (2.0 * sigma_combined * sigma_combined);
    double normalization = 2.0 * M_PI * sigma_combined * sigma_combined;
    
    return (cross_section / normalization) * std::exp(exponent);
}

double CollisionProbabilityCalculator::calculate_chan(
    double miss_distance,
    double relative_velocity,
    double sigma_total,
    double collision_radius
) {
    // Chan's 2D probability method
    // Assumes encounter plane perpendicular to relative velocity
    // Pc = 1 - exp(-R^2 / (2 * sigma^2)) for miss_distance << sigma
    
    if (miss_distance < 1e-10) {
        // At collision point
        return 1.0 - std::exp(-collision_radius * collision_radius / 
                              (2.0 * sigma_total * sigma_total));
    }
    
    // General case: integrate over encounter B-plane
    double u = miss_distance / sigma_total;
    double v = collision_radius / sigma_total;
    
    // Approximate using bivariate Gaussian CDF
    // This is a simplified version of the full integral
    double pc = v * v * std::exp(-u * u / 2.0);
    
    return std::min(1.0, std::max(0.0, pc));
}

PositionCovariance estimate_covariance(double hours_since_epoch, bool is_debris) {
    PositionCovariance cov;
    
    // Base uncertainty (typical for well-tracked objects)
    cov.sigma_x = 0.05;  // 50 meters radial
    cov.sigma_y = 0.5;   // 500 meters along-track
    cov.sigma_z = 0.1;   // 100 meters cross-track
    
    // Debris has higher uncertainty
    if (is_debris) {
        cov.sigma_x *= 3.0;
        cov.sigma_y *= 3.0;
        cov.sigma_z *= 3.0;
    }
    
    // Scale by time since epoch
    // Uncertainty grows roughly linearly for first few days,
    // then quadratically due to atmospheric drag uncertainty
    if (hours_since_epoch <= 24.0) {
        double scale = 1.0 + 0.05 * hours_since_epoch;
        cov.sigma_x *= scale;
        cov.sigma_y *= scale;
        cov.sigma_z *= scale;
    } else if (hours_since_epoch <= 168.0) { // Up to 1 week
        double days = hours_since_epoch / 24.0;
        double scale = 1.5 + 0.5 * days;
        cov.sigma_x *= scale;
        cov.sigma_y *= scale;
        cov.sigma_z *= scale;
    } else {
        // Very old TLE - high uncertainty
        double days = hours_since_epoch / 24.0;
        double scale = 3.0 + 0.2 * days * days / 7.0;
        cov.sigma_x *= std::min(scale, 50.0);
        cov.sigma_y *= std::min(scale, 100.0);
        cov.sigma_z *= std::min(scale, 50.0);
    }
    
    return cov;
}

double calculate_relative_velocity(const Vec3& vel1, const Vec3& vel2) {
    Vec3 rel_vel = vel1 - vel2;
    return rel_vel.magnitude();
}

} // namespace orbitops

