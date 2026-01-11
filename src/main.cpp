#include "tle_parser.hpp"
#include "sgp4.hpp"
#include "collision_detector.hpp"
#include <iostream>
#include <chrono>
#include <iomanip>

using namespace orbitops;

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <tle_file> [threshold_km] [time_minutes]\n";
        return 1;
    }

    const std::string tle_file = argv[1];
    const double threshold_km = (argc > 2) ? std::stod(argv[2]) : 10.0;
    const double time_minutes = (argc > 3) ? std::stod(argv[3]) : 0.0;

    std::cout << "=== Orbit-Ops Baseline ===" << std::endl;
    std::cout << "TLE File: " << tle_file << std::endl;
    std::cout << "Threshold: " << threshold_km << " km" << std::endl;
    std::cout << "Time: " << time_minutes << " minutes from epoch" << std::endl;
    std::cout << std::endl;

    // Parse TLE file
    auto start = std::chrono::high_resolution_clock::now();
    std::vector<TLE> tles = parse_tle_file(tle_file);
    auto end = std::chrono::high_resolution_clock::now();
    auto parse_time = std::chrono::duration<double, std::milli>(end - start).count();
    
    std::cout << "Parsed " << tles.size() << " satellites in " 
              << std::fixed << std::setprecision(2) << parse_time << " ms" << std::endl;

    // Create satellites
    std::vector<Satellite> satellites;
    satellites.reserve(tles.size());
    for (const auto& tle : tles) {
        satellites.push_back({tle, {}, {}});
    }

    // Propagate all satellites
    start = std::chrono::high_resolution_clock::now();
    propagate_all(satellites, time_minutes);
    end = std::chrono::high_resolution_clock::now();
    auto prop_time = std::chrono::duration<double, std::milli>(end - start).count();
    
    std::cout << "Propagated " << satellites.size() << " satellites in " 
              << prop_time << " ms" << std::endl;
    std::cout << "  Per satellite: " << (prop_time / satellites.size() * 1000.0) 
              << " µs" << std::endl;

    // Detect collisions
    start = std::chrono::high_resolution_clock::now();
    auto conjunctions = detect_collisions_naive(satellites, threshold_km, time_minutes);
    end = std::chrono::high_resolution_clock::now();
    auto coll_time = std::chrono::duration<double, std::milli>(end - start).count();
    
    size_t n = satellites.size();
    size_t pairs_checked = n * (n - 1) / 2;
    
    std::cout << "Collision detection in " << coll_time << " ms" << std::endl;
    std::cout << "  Pairs checked: " << pairs_checked << std::endl;
    std::cout << "  Checks per ms: " << (pairs_checked / coll_time) << std::endl;
    std::cout << std::endl;

    // Report results
    std::cout << "=== Results ===" << std::endl;
    std::cout << "Conjunctions within " << threshold_km << " km: " 
              << conjunctions.size() << std::endl;
    
    // Show top 10 closest approaches
    if (!conjunctions.empty()) {
        std::sort(conjunctions.begin(), conjunctions.end(),
            [](const Conjunction& a, const Conjunction& b) {
                return a.distance < b.distance;
            });
        
        std::cout << "\nClosest approaches:" << std::endl;
        size_t show = std::min(conjunctions.size(), size_t(10));
        for (size_t i = 0; i < show; ++i) {
            std::cout << "  " << conjunctions[i].sat1_id << " <-> " 
                      << conjunctions[i].sat2_id << ": "
                      << std::fixed << std::setprecision(3) 
                      << conjunctions[i].distance << " km" << std::endl;
        }
    }

    return 0;
}

