#pragma once

#include "types.hpp"
#include "satellite_system.hpp"
#include <vector>
#include <string>
#include <cmath>

namespace orbitops {

// Space debris classification
enum class DebrisType {
    ROCKET_BODY,      // Spent rocket stages
    PAYLOAD_DEBRIS,   // Fragments from satellite breakups
    MISSION_DEBRIS,   // Items released during missions
    FRAGMENTATION,    // Collision/explosion fragments
    UNKNOWN           // Unclassified debris
};

// Debris size category (based on trackability)
enum class DebrisSize {
    LARGE,            // > 10 cm (trackable by ground radar)
    MEDIUM,           // 1-10 cm (tracked by some sensors)
    SMALL             // < 1 cm (modeled statistically)
};

// Risk level for debris encounters
enum class DebrisRisk {
    CRITICAL,         // Immediate collision risk
    HIGH,             // High risk within 24 hours
    MEDIUM,           // Moderate risk within week
    LOW,              // Low risk
    NEGLIGIBLE        // No significant risk
};

// Individual debris object
struct DebrisObject {
    int id;
    std::string name;
    std::string origin;           // Source satellite/event
    DebrisType type;
    DebrisSize size;
    double rcs;                   // Radar cross-section (m²)
    double estimated_mass_kg;
    Vec3 position;                // Current ECI position (km)
    Vec3 velocity;                // Current ECI velocity (km/s)
    double altitude_km;           // Current altitude
    double apogee_km;             // Apogee altitude
    double perigee_km;            // Perigee altitude
    double inclination_deg;
    int decay_days;               // Estimated days until reentry (-1 if stable)
    double created_epoch;         // When debris was created (Julian date)
};

// Debris field from a fragmentation event
struct DebrisField {
    int event_id;
    std::string event_name;
    double event_date;            // Julian date
    Vec3 event_location;          // ECI position at time of event
    std::vector<int> debris_ids;  // IDs of debris objects from this event
    int total_fragments;
    double spread_radius_km;      // Current spread radius
};

// Configuration for debris model
struct DebrisConfig {
    bool include_rocket_bodies = true;
    bool include_fragments = true;
    bool include_small_debris = false;  // Statistical model
    double min_altitude_km = 150.0;     // Below this altitude, debris will decay
    double max_altitude_km = 50000.0;   // GEO + margin
    int max_debris_objects = 10000;     // Limit for performance
    double small_debris_density = 1e-8; // particles per km³ in LEO
};

// Debris model and analytics
class DebrisModel {
public:
    DebrisModel();
    explicit DebrisModel(const DebrisConfig& config);
    
    // Load debris from TLE data
    void load_from_tles(const std::vector<TLE>& tles);
    
    // Identify debris vs active satellites
    static bool is_debris(const TLE& tle);
    static DebrisType classify_debris(const TLE& tle);
    static DebrisSize estimate_size(const TLE& tle);
    
    // Get debris objects
    const std::vector<DebrisObject>& get_debris() const { return debris_; }
    std::vector<DebrisObject> get_debris_in_shell(double min_alt, double max_alt) const;
    std::vector<DebrisObject> get_debris_by_type(DebrisType type) const;
    std::vector<DebrisObject> get_debris_by_risk(DebrisRisk risk) const;
    
    // Update debris positions from SatelliteSystem
    void update_positions(const SatelliteSystem& sys, const std::vector<TLE>& tles);
    
    // Debris analytics
    struct ShellDensity {
        double min_altitude_km;
        double max_altitude_km;
        int debris_count;
        double spatial_density;   // objects per km³
        double flux;              // objects crossing per m² per year
    };
    
    std::vector<ShellDensity> calculate_shell_densities(double shell_thickness = 50.0) const;
    
    // Risk assessment for a satellite
    struct DebrisRiskAssessment {
        int satellite_id;
        DebrisRisk overall_risk;
        int nearby_debris_count;
        std::vector<std::pair<int, double>> closest_debris; // debris_id, distance
        double estimated_flux;    // particles per m² per year
    };
    
    DebrisRiskAssessment assess_risk(
        int satellite_id,
        const Vec3& sat_position,
        double altitude_km
    ) const;
    
    // Get debris fields
    const std::vector<DebrisField>& get_debris_fields() const { return debris_fields_; }
    
    // Statistics
    struct Statistics {
        int total_debris;
        int rocket_bodies;
        int payload_debris;
        int fragments;
        int leo_debris;       // < 2000 km
        int meo_debris;       // 2000-35786 km
        int geo_debris;       // > 35786 km
        double average_altitude_km;
        double max_density_altitude_km;
    };
    
    Statistics get_statistics() const;

private:
    DebrisConfig config_;
    std::vector<DebrisObject> debris_;
    std::vector<DebrisField> debris_fields_;
    
    // Known debris events (Cosmos-Iridium, Chinese ASAT test, etc.)
    void identify_debris_fields();
    
    // Estimate RCS from TLE data
    static double estimate_rcs(const TLE& tle);
    
    // Calculate decay time estimate
    static int estimate_decay_days(const TLE& tle);
};

// Debris visualization helper
struct DebrisVisualizationData {
    std::vector<float> positions;    // x,y,z interleaved
    std::vector<float> colors;       // r,g,b interleaved
    std::vector<float> sizes;        // point sizes
    std::vector<int> ids;            // debris IDs
};

DebrisVisualizationData prepare_debris_for_visualization(
    const std::vector<DebrisObject>& debris,
    double scale_factor = 1.0 / 6371.0  // Normalize to Earth radius
);

// Color scheme for debris types
struct DebrisColors {
    static constexpr float ROCKET_BODY[3] = {1.0f, 0.4f, 0.0f};     // Orange
    static constexpr float PAYLOAD_DEBRIS[3] = {1.0f, 0.2f, 0.2f};  // Red
    static constexpr float FRAGMENTATION[3] = {0.8f, 0.8f, 0.0f};   // Yellow
    static constexpr float MISSION_DEBRIS[3] = {0.6f, 0.6f, 0.6f};  // Gray
    static constexpr float UNKNOWN[3] = {0.5f, 0.5f, 0.5f};         // Dark gray
};

} // namespace orbitops

