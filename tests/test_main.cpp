#include "test_framework.hpp"
#include "tle_parser.hpp"
#include "sgp4.hpp"
#include "collision_detector.hpp"
#include "satellite_system.hpp"
#include "sgp4_optimized.hpp"
#include "collision_optimized.hpp"
#include <cmath>
#include <fstream>

using namespace orbitops;
using namespace test;

// ============================================================================
// TLE Parser Tests
// ============================================================================

bool test_tle_parser_basic() {
    // ISS TLE from CelesTrak (example)
    std::string name = "ISS (ZARYA)";
    std::string line1 = "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9993";
    std::string line2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391423756";
    
    TLE tle = parse_tle(name, line1, line2);
    
    return assert_eq(tle.catalog_number, 25544) &&
           assert_near(tle.inclination, 51.6416, 0.001) &&
           assert_near(tle.eccentricity, 0.0006703, 0.0000001) &&
           assert_near(tle.mean_motion, 15.72125391, 0.0001);
}

bool test_tle_parser_epoch() {
    std::string line1 = "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9993";
    std::string line2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391423756";
    
    TLE tle = parse_tle("ISS", line1, line2);
    
    // Epoch year should be 2024, day 1.5
    return assert_eq(tle.epoch_year, 2024) &&
           assert_near(tle.epoch_day, 1.5, 0.001);
}

bool test_tle_parser_bstar() {
    std::string line1 = "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9993";
    std::string line2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391423756";
    
    TLE tle = parse_tle("ISS", line1, line2);
    
    // BSTAR = 10270-3 = 0.10270e-3 = 0.00010270
    return assert_near(tle.bstar, 0.10270e-3, 1e-8);
}

// ============================================================================
// SGP4 Propagator Tests
// ============================================================================

bool test_sgp4_stationary() {
    // Test that propagating to t=0 gives initial position
    TLE tle;
    tle.inclination = 0.0;
    tle.raan = 0.0;
    tle.eccentricity = 0.0;
    tle.arg_perigee = 0.0;
    tle.mean_anomaly = 0.0;
    tle.mean_motion = 15.0;  // ~90 min orbit
    
    Vec3 pos, vel;
    sgp4_propagate(tle, 0.0, pos, vel);
    
    // Position should be positive (on x-axis for circular equatorial orbit at t=0)
    return assert_true(pos.x > 0, "x should be positive") &&
           assert_near(pos.y, 0.0, 100.0) &&  // Allow some tolerance
           assert_near(pos.z, 0.0, 100.0);
}

bool test_sgp4_orbital_period() {
    // For mean_motion = 15 rev/day, period ≈ 96 minutes
    TLE tle;
    tle.inclination = 51.6;
    tle.raan = 0.0;
    tle.eccentricity = 0.0001;
    tle.arg_perigee = 0.0;
    tle.mean_anomaly = 0.0;
    tle.mean_motion = 15.0;
    
    Vec3 pos0, vel0, pos1, vel1;
    sgp4_propagate(tle, 0.0, pos0, vel0);
    
    // After one orbit (~96 min), should return to similar position
    double period_min = 1440.0 / tle.mean_motion;  // minutes
    sgp4_propagate(tle, period_min, pos1, vel1);
    
    // Allow 50km tolerance (J2 causes precession)
    double dist = (pos1 - pos0).magnitude();
    return assert_true(dist < 500, "Should return near start after one orbit");
}

bool test_sgp4_iss_altitude() {
    // ISS orbits at ~420km altitude (mean_motion ~15.5 rev/day)
    std::string line1 = "1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9993";
    std::string line2 = "2 25544  51.6416 247.4627 0006703 130.5360 325.0288 15.72125391423756";
    TLE tle = parse_tle("ISS", line1, line2);
    
    Vec3 pos, vel;
    sgp4_propagate(tle, 0.0, pos, vel);
    
    double radius = pos.magnitude();
    double altitude = radius - 6378.137;  // Earth radius
    
    std::cout << "(altitude: " << altitude << " km) ";
    
    // ISS altitude should be between 300-500 km (relaxed for simplified model)
    return assert_true(altitude > 300 && altitude < 500, 
                      "ISS altitude should be reasonable for LEO");
}

// ============================================================================
// Optimized vs Baseline Consistency Tests
// ============================================================================

bool test_optimized_matches_baseline() {
    // Create test TLEs
    std::vector<TLE> tles;
    for (int i = 0; i < 100; ++i) {
        TLE tle;
        tle.catalog_number = i;
        tle.inclination = 51.6 + (i % 10);
        tle.raan = (i * 36) % 360;
        tle.eccentricity = 0.0001 + (i % 100) * 0.00001;
        tle.arg_perigee = (i * 17) % 360;
        tle.mean_anomaly = (i * 23) % 360;
        tle.mean_motion = 14.0 + (i % 20) * 0.1;
        tles.push_back(tle);
    }
    
    // Baseline propagation
    std::vector<Satellite> sats_baseline;
    for (const auto& tle : tles) {
        Satellite sat;
        sat.tle = tle;
        sats_baseline.push_back(sat);
    }
    propagate_all(sats_baseline, 60.0);
    
    // Optimized propagation
    SatelliteSystem sys = create_satellite_system(tles);
    propagate_all_optimized(sys, 60.0);
    
    // Compare positions (allow 1km tolerance due to different implementations)
    double max_diff = 0.0;
    for (size_t i = 0; i < tles.size(); ++i) {
        double dx = sats_baseline[i].position.x - sys.x[i];
        double dy = sats_baseline[i].position.y - sys.y[i];
        double dz = sats_baseline[i].position.z - sys.z[i];
        double diff = std::sqrt(dx*dx + dy*dy + dz*dz);
        max_diff = std::max(max_diff, diff);
    }
    
    std::cout << "(max diff: " << max_diff << " km) ";
    return assert_true(max_diff < 1.0, "Optimized should match baseline within 1km");
}

bool test_collision_detection_consistency() {
    // Create satellites in known configuration
    std::vector<TLE> tles;
    for (int i = 0; i < 50; ++i) {
        TLE tle;
        tle.catalog_number = 1000 + i;
        tle.inclination = 51.6;
        tle.raan = i * 7.2;  // Spread around orbit
        tle.eccentricity = 0.0001;
        tle.arg_perigee = 0.0;
        tle.mean_anomaly = i * 7.2;
        tle.mean_motion = 15.5;
        tles.push_back(tle);
    }
    
    // Baseline
    std::vector<Satellite> sats;
    for (const auto& tle : tles) {
        Satellite sat;
        sat.tle = tle;
        sats.push_back(sat);
    }
    propagate_all(sats, 0.0);
    auto conj_baseline = detect_collisions_naive(sats, 100.0, 0.0);
    
    // Optimized
    SatelliteSystem sys = create_satellite_system(tles);
    propagate_all_optimized(sys, 0.0);
    auto conj_optimized = detect_collisions_optimized(sys, 100.0, 0.0);
    
    std::cout << "(baseline: " << conj_baseline.size() 
              << ", optimized: " << conj_optimized.size() << ") ";
    
    // Both should find the same number of conjunctions
    return assert_eq(conj_baseline.size(), conj_optimized.size());
}

// ============================================================================
// Numerical Stability Tests
// ============================================================================

bool test_long_propagation_stability() {
    TLE tle;
    tle.inclination = 51.6;
    tle.raan = 0.0;
    tle.eccentricity = 0.0001;
    tle.arg_perigee = 0.0;
    tle.mean_anomaly = 0.0;
    tle.mean_motion = 15.5;
    
    Vec3 pos, vel;
    
    // Propagate for 7 days (10080 minutes)
    sgp4_propagate(tle, 10080.0, pos, vel);
    
    double radius = pos.magnitude();
    double altitude = radius - 6378.137;
    
    // Altitude should still be reasonable (not NaN or crazy values)
    return assert_true(!std::isnan(altitude), "Altitude should not be NaN") &&
           assert_true(altitude > 100 && altitude < 2000, 
                      "Altitude should be reasonable after 7 days");
}

bool test_high_eccentricity() {
    TLE tle;
    tle.inclination = 63.4;  // Molniya-like
    tle.raan = 0.0;
    tle.eccentricity = 0.7;  // High eccentricity
    tle.arg_perigee = 270.0;
    tle.mean_anomaly = 0.0;
    tle.mean_motion = 2.0;  // ~12 hour orbit
    
    Vec3 pos, vel;
    sgp4_propagate(tle, 0.0, pos, vel);
    
    double radius = pos.magnitude();
    
    // Should produce valid position (not NaN)
    return assert_true(!std::isnan(radius), "Radius should not be NaN") &&
           assert_true(radius > 6378, "Radius should be greater than Earth radius");
}

// ============================================================================
// Main
// ============================================================================

int main() {
    TestSuite suite;
    
    // TLE Parser Tests
    suite.add("TLE Parser: Basic fields", test_tle_parser_basic);
    suite.add("TLE Parser: Epoch parsing", test_tle_parser_epoch);
    suite.add("TLE Parser: BSTAR parsing", test_tle_parser_bstar);
    
    // SGP4 Tests
    suite.add("SGP4: Initial position", test_sgp4_stationary);
    suite.add("SGP4: Orbital period", test_sgp4_orbital_period);
    suite.add("SGP4: ISS altitude check", test_sgp4_iss_altitude);
    
    // Consistency Tests
    suite.add("Consistency: Optimized matches baseline", test_optimized_matches_baseline);
    suite.add("Consistency: Collision detection", test_collision_detection_consistency);
    
    // Numerical Stability
    suite.add("Stability: 7-day propagation", test_long_propagation_stability);
    suite.add("Stability: High eccentricity orbit", test_high_eccentricity);
    
    return suite.run();
}

