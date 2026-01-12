#include "debris_model.hpp"
#include <algorithm>
#include <cstring>
#include <regex>
#include <map>

namespace orbitops {

// Known debris-related keywords in TLE names
static const std::vector<std::string> DEBRIS_KEYWORDS = {
    "DEB", "DEBRIS", "R/B", "ROCKET", "FRAG", "FRAGMENT",
    "COOLANT", "NaK", "TANK", "PLATFORM", "OBJECT"
};

// Known fragmentation event parent objects (partial catalog numbers)
static const std::vector<int> KNOWN_DEBRIS_PARENTS = {
    13552,   // Cosmos 954 (nuclear reactor debris)
    25730,   // Fengyun-1C (Chinese ASAT test 2007)
    24946,   // Cosmos 2251 (Iridium-Cosmos collision 2009)
    25544,   // ISS-related debris
    36499,   // Briz-M R/B explosion 2012
    40258,   // Cosmos 1408 (Russian ASAT test 2021)
};

DebrisModel::DebrisModel() : config_() {}

DebrisModel::DebrisModel(const DebrisConfig& config) : config_(config) {}

bool DebrisModel::is_debris(const TLE& tle) {
    // Check name for debris keywords
    std::string upper_name = tle.name;
    std::transform(upper_name.begin(), upper_name.end(), upper_name.begin(), ::toupper);
    
    for (const auto& keyword : DEBRIS_KEYWORDS) {
        if (upper_name.find(keyword) != std::string::npos) {
            return true;
        }
    }
    
    // Check international designator for debris indicators
    // Format: YYNNNXX where XX can indicate debris piece
    if (tle.intl_designator.length() >= 7) {
        char piece = tle.intl_designator.back();
        // Pieces beyond 'Z' or numbered fragments indicate debris
        if (piece >= 'B' && tle.intl_designator.find("DEB") == std::string::npos) {
            // Multiple pieces from same launch could be debris
            int piece_count = piece - 'A';
            if (piece_count > 5) {
                return true;  // Likely debris if many pieces
            }
        }
    }
    
    // High B* drag term indicates small, high-drag object (possible debris)
    if (std::abs(tle.bstar) > 0.01) {
        return true;
    }
    
    return false;
}

DebrisType DebrisModel::classify_debris(const TLE& tle) {
    std::string upper_name = tle.name;
    std::transform(upper_name.begin(), upper_name.end(), upper_name.begin(), ::toupper);
    
    if (upper_name.find("R/B") != std::string::npos ||
        upper_name.find("ROCKET") != std::string::npos) {
        return DebrisType::ROCKET_BODY;
    }
    
    if (upper_name.find("FRAG") != std::string::npos ||
        upper_name.find("FRAGMENT") != std::string::npos) {
        return DebrisType::FRAGMENTATION;
    }
    
    if (upper_name.find("DEB") != std::string::npos) {
        // Could be from mission or fragmentation
        // Check if it's from a known fragmentation event
        for (int parent : KNOWN_DEBRIS_PARENTS) {
            if (std::abs(tle.catalog_number - parent) < 5000) {
                return DebrisType::FRAGMENTATION;
            }
        }
        return DebrisType::PAYLOAD_DEBRIS;
    }
    
    if (upper_name.find("COOLANT") != std::string::npos ||
        upper_name.find("NAK") != std::string::npos ||
        upper_name.find("TANK") != std::string::npos) {
        return DebrisType::MISSION_DEBRIS;
    }
    
    return DebrisType::UNKNOWN;
}

DebrisSize DebrisModel::estimate_size(const TLE& tle) {
    // Estimate based on B* drag term and mean motion
    // Higher B* and faster decay = smaller/lighter object
    
    double a = 42241.122 / std::pow(tle.mean_motion * 1440 / (2 * M_PI), 2.0/3.0);
    double altitude = a - 6371.0;
    
    // Objects in very low orbits with high B* are typically small
    if (altitude < 300 && std::abs(tle.bstar) > 0.001) {
        return DebrisSize::SMALL;
    }
    
    // Rocket bodies are typically large
    std::string upper_name = tle.name;
    std::transform(upper_name.begin(), upper_name.end(), upper_name.begin(), ::toupper);
    if (upper_name.find("R/B") != std::string::npos) {
        return DebrisSize::LARGE;
    }
    
    // Most tracked debris is medium to large (small is not typically tracked)
    if (std::abs(tle.bstar) > 0.005) {
        return DebrisSize::MEDIUM;
    }
    
    return DebrisSize::LARGE;
}

double DebrisModel::estimate_rcs(const TLE& tle) {
    // Rough estimate based on debris type and size
    DebrisSize size = estimate_size(tle);
    DebrisType type = classify_debris(tle);
    
    double base_rcs = 0.01;  // 0.01 m² default
    
    switch (size) {
        case DebrisSize::LARGE:
            base_rcs = 1.0;
            break;
        case DebrisSize::MEDIUM:
            base_rcs = 0.1;
            break;
        case DebrisSize::SMALL:
            base_rcs = 0.01;
            break;
    }
    
    // Rocket bodies are typically larger
    if (type == DebrisType::ROCKET_BODY) {
        base_rcs *= 5.0;
    }
    
    return base_rcs;
}

int DebrisModel::estimate_decay_days(const TLE& tle) {
    // Calculate semi-major axis
    double n_rad_min = tle.mean_motion;
    double n_rev_day = n_rad_min * 1440 / (2 * M_PI);
    double a = 42241.122 / std::pow(n_rev_day, 2.0/3.0);
    double altitude_km = a - 6371.0;
    
    // Very rough decay estimate based on altitude and B*
    if (altitude_km > 800) {
        return -1;  // Essentially permanent
    }
    
    if (altitude_km < 200) {
        return 1;  // Days
    }
    
    // Rough lifetime formula: L ≈ H / (k * B* * rho)
    // where H is scale height, k is constant, rho is density
    double bstar_abs = std::abs(tle.bstar) + 1e-10;
    double decay_years = std::pow(altitude_km / 100.0, 2.5) / (bstar_abs * 1e6);
    
    return static_cast<int>(decay_years * 365);
}

void DebrisModel::load_from_tles(const std::vector<TLE>& tles) {
    debris_.clear();
    
    int debris_id = 0;
    for (const auto& tle : tles) {
        if (!is_debris(tle)) {
            continue;
        }
        
        if (static_cast<int>(debris_.size()) >= config_.max_debris_objects) {
            break;
        }
        
        DebrisObject obj;
        obj.id = debris_id++;
        obj.name = tle.name;
        obj.origin = tle.intl_designator;
        obj.type = classify_debris(tle);
        obj.size = estimate_size(tle);
        obj.rcs = estimate_rcs(tle);
        
        // Estimate mass from RCS (very rough)
        obj.estimated_mass_kg = obj.rcs * 10.0;  // 10 kg/m² average
        
        // Calculate orbital parameters
        double n_rad_min = tle.mean_motion;
        double n_rev_day = n_rad_min * 1440 / (2 * M_PI);
        double a = 42241.122 / std::pow(n_rev_day, 2.0/3.0);
        
        obj.apogee_km = a * (1 + tle.eccentricity) - 6371.0;
        obj.perigee_km = a * (1 - tle.eccentricity) - 6371.0;
        obj.altitude_km = (obj.apogee_km + obj.perigee_km) / 2.0;
        obj.inclination_deg = tle.inclination * 180.0 / M_PI;
        obj.decay_days = estimate_decay_days(tle);
        obj.created_epoch = tle.epoch_jd;
        
        // Position will be updated separately
        obj.position = {0, 0, 0};
        obj.velocity = {0, 0, 0};
        
        // Apply altitude filter
        if (obj.perigee_km < config_.min_altitude_km ||
            obj.apogee_km > config_.max_altitude_km) {
            continue;
        }
        
        // Type filter
        if (obj.type == DebrisType::ROCKET_BODY && !config_.include_rocket_bodies) {
            continue;
        }
        if ((obj.type == DebrisType::FRAGMENTATION || 
             obj.type == DebrisType::PAYLOAD_DEBRIS) && !config_.include_fragments) {
            continue;
        }
        
        debris_.push_back(obj);
    }
    
    identify_debris_fields();
}

void DebrisModel::update_positions(const SatelliteSystem& sys, const std::vector<TLE>& tles) {
    // Match debris objects to satellite system positions by catalog number
    for (auto& obj : debris_) {
        // Find matching TLE by name
        for (size_t i = 0; i < sys.count && i < tles.size(); ++i) {
            if (tles[i].name == obj.name) {
                obj.position = {sys.x[i], sys.y[i], sys.z[i]};
                obj.velocity = {sys.vx[i], sys.vy[i], sys.vz[i]};
                double r = obj.position.magnitude();
                obj.altitude_km = r - 6371.0;
                break;
            }
        }
    }
}

void DebrisModel::identify_debris_fields() {
    debris_fields_.clear();
    
    // Group debris by international designator prefix (YYNNN)
    std::map<std::string, std::vector<int>> designator_groups;
    
    for (size_t i = 0; i < debris_.size(); ++i) {
        if (debris_[i].origin.length() >= 5) {
            std::string prefix = debris_[i].origin.substr(0, 5);
            designator_groups[prefix].push_back(static_cast<int>(i));
        }
    }
    
    // Create debris fields for groups with multiple objects
    int field_id = 0;
    for (const auto& [prefix, indices] : designator_groups) {
        if (indices.size() >= 3) {  // At least 3 pieces to be a "field"
            DebrisField field;
            field.event_id = field_id++;
            field.event_name = "Debris from " + prefix;
            field.debris_ids = indices;
            field.total_fragments = static_cast<int>(indices.size());
            
            // Calculate average position and spread
            Vec3 center = {0, 0, 0};
            for (int idx : indices) {
                center.x += debris_[idx].position.x;
                center.y += debris_[idx].position.y;
                center.z += debris_[idx].position.z;
            }
            center.x /= indices.size();
            center.y /= indices.size();
            center.z /= indices.size();
            field.event_location = center;
            
            double max_dist = 0;
            for (int idx : indices) {
                Vec3 diff = debris_[idx].position - center;
                max_dist = std::max(max_dist, diff.magnitude());
            }
            field.spread_radius_km = max_dist;
            
            debris_fields_.push_back(field);
        }
    }
}

std::vector<DebrisObject> DebrisModel::get_debris_in_shell(double min_alt, double max_alt) const {
    std::vector<DebrisObject> result;
    for (const auto& obj : debris_) {
        if (obj.altitude_km >= min_alt && obj.altitude_km <= max_alt) {
            result.push_back(obj);
        }
    }
    return result;
}

std::vector<DebrisObject> DebrisModel::get_debris_by_type(DebrisType type) const {
    std::vector<DebrisObject> result;
    for (const auto& obj : debris_) {
        if (obj.type == type) {
            result.push_back(obj);
        }
    }
    return result;
}

std::vector<DebrisObject> DebrisModel::get_debris_by_risk(DebrisRisk risk) const {
    // This would require satellite positions to calculate - return all for now
    return debris_;
}

std::vector<DebrisModel::ShellDensity> DebrisModel::calculate_shell_densities(double shell_thickness) const {
    std::vector<ShellDensity> densities;
    
    // Calculate from 200 km to 2000 km (LEO)
    for (double alt = 200; alt < 2000; alt += shell_thickness) {
        ShellDensity shell;
        shell.min_altitude_km = alt;
        shell.max_altitude_km = alt + shell_thickness;
        shell.debris_count = 0;
        
        for (const auto& obj : debris_) {
            if (obj.altitude_km >= shell.min_altitude_km &&
                obj.altitude_km < shell.max_altitude_km) {
                shell.debris_count++;
            }
        }
        
        // Calculate shell volume
        double r_inner = 6371.0 + shell.min_altitude_km;
        double r_outer = 6371.0 + shell.max_altitude_km;
        double volume = (4.0/3.0) * M_PI * (r_outer*r_outer*r_outer - r_inner*r_inner*r_inner);
        
        shell.spatial_density = shell.debris_count / volume;
        
        // Flux estimate (simplified)
        // F = n * v_avg where v_avg ≈ 7.5 km/s for LEO
        double avg_velocity = 7.5;  // km/s
        shell.flux = shell.spatial_density * avg_velocity * 1e6 * 3.15e7;  // per m² per year
        
        densities.push_back(shell);
    }
    
    return densities;
}

DebrisModel::DebrisRiskAssessment DebrisModel::assess_risk(
    int satellite_id,
    const Vec3& sat_position,
    double altitude_km
) const {
    DebrisRiskAssessment assessment;
    assessment.satellite_id = satellite_id;
    assessment.nearby_debris_count = 0;
    
    // Find nearby debris
    std::vector<std::pair<int, double>> debris_distances;
    
    for (const auto& obj : debris_) {
        if (obj.position.magnitude() < 0.1) continue;  // Skip if position not set
        
        Vec3 diff = obj.position - sat_position;
        double dist = diff.magnitude();
        
        if (dist < 100.0) {  // Within 100 km
            assessment.nearby_debris_count++;
            debris_distances.push_back({obj.id, dist});
        }
    }
    
    // Sort by distance and keep closest
    std::sort(debris_distances.begin(), debris_distances.end(),
              [](const auto& a, const auto& b) { return a.second < b.second; });
    
    if (debris_distances.size() > 10) {
        debris_distances.resize(10);
    }
    assessment.closest_debris = debris_distances;
    
    // Calculate flux at this altitude
    auto densities = calculate_shell_densities(50.0);
    for (const auto& shell : densities) {
        if (altitude_km >= shell.min_altitude_km && altitude_km < shell.max_altitude_km) {
            assessment.estimated_flux = shell.flux;
            break;
        }
    }
    
    // Determine overall risk
    if (!debris_distances.empty() && debris_distances[0].second < 1.0) {
        assessment.overall_risk = DebrisRisk::CRITICAL;
    } else if (!debris_distances.empty() && debris_distances[0].second < 10.0) {
        assessment.overall_risk = DebrisRisk::HIGH;
    } else if (assessment.nearby_debris_count > 10) {
        assessment.overall_risk = DebrisRisk::MEDIUM;
    } else if (assessment.nearby_debris_count > 0) {
        assessment.overall_risk = DebrisRisk::LOW;
    } else {
        assessment.overall_risk = DebrisRisk::NEGLIGIBLE;
    }
    
    return assessment;
}

DebrisModel::Statistics DebrisModel::get_statistics() const {
    Statistics stats = {};
    stats.total_debris = static_cast<int>(debris_.size());
    
    double alt_sum = 0;
    std::map<int, int> alt_histogram;  // 50km bins
    
    for (const auto& obj : debris_) {
        switch (obj.type) {
            case DebrisType::ROCKET_BODY:
                stats.rocket_bodies++;
                break;
            case DebrisType::PAYLOAD_DEBRIS:
                stats.payload_debris++;
                break;
            case DebrisType::FRAGMENTATION:
            case DebrisType::MISSION_DEBRIS:
            case DebrisType::UNKNOWN:
                stats.fragments++;
                break;
        }
        
        if (obj.altitude_km < 2000) {
            stats.leo_debris++;
        } else if (obj.altitude_km < 35786) {
            stats.meo_debris++;
        } else {
            stats.geo_debris++;
        }
        
        alt_sum += obj.altitude_km;
        int bin = static_cast<int>(obj.altitude_km / 50);
        alt_histogram[bin]++;
    }
    
    if (!debris_.empty()) {
        stats.average_altitude_km = alt_sum / debris_.size();
        
        // Find max density altitude
        int max_bin = 0;
        int max_count = 0;
        for (const auto& [bin, count] : alt_histogram) {
            if (count > max_count) {
                max_count = count;
                max_bin = bin;
            }
        }
        stats.max_density_altitude_km = (max_bin + 0.5) * 50;
    }
    
    return stats;
}

DebrisVisualizationData prepare_debris_for_visualization(
    const std::vector<DebrisObject>& debris,
    double scale_factor
) {
    DebrisVisualizationData data;
    data.positions.reserve(debris.size() * 3);
    data.colors.reserve(debris.size() * 3);
    data.sizes.reserve(debris.size());
    data.ids.reserve(debris.size());
    
    for (const auto& obj : debris) {
        // Position
        data.positions.push_back(static_cast<float>(obj.position.x * scale_factor));
        data.positions.push_back(static_cast<float>(obj.position.y * scale_factor));
        data.positions.push_back(static_cast<float>(obj.position.z * scale_factor));
        
        // Color based on type
        const float* color;
        switch (obj.type) {
            case DebrisType::ROCKET_BODY:
                color = DebrisColors::ROCKET_BODY;
                break;
            case DebrisType::PAYLOAD_DEBRIS:
                color = DebrisColors::PAYLOAD_DEBRIS;
                break;
            case DebrisType::FRAGMENTATION:
                color = DebrisColors::FRAGMENTATION;
                break;
            case DebrisType::MISSION_DEBRIS:
                color = DebrisColors::MISSION_DEBRIS;
                break;
            default:
                color = DebrisColors::UNKNOWN;
        }
        data.colors.push_back(color[0]);
        data.colors.push_back(color[1]);
        data.colors.push_back(color[2]);
        
        // Size based on debris size
        float size;
        switch (obj.size) {
            case DebrisSize::LARGE:
                size = 3.0f;
                break;
            case DebrisSize::MEDIUM:
                size = 2.0f;
                break;
            default:
                size = 1.0f;
        }
        data.sizes.push_back(size);
        
        data.ids.push_back(obj.id);
    }
    
    return data;
}

} // namespace orbitops

