#include "tle_parser.hpp"
#include "sgp4.hpp"
#include "collision_detector.hpp"
#include "satellite_system.hpp"
#include "sgp4_optimized.hpp"
#include "collision_optimized.hpp"
#include <iostream>
#include <chrono>
#include <iomanip>
#include <vector>
#include <numeric>

using namespace orbitops;

template<typename Func>
double benchmark(Func f, int iterations = 10) {
    std::vector<double> times;
    times.reserve(iterations);
    
    for (int i = 0; i < iterations; ++i) {
        auto start = std::chrono::high_resolution_clock::now();
        f();
        auto end = std::chrono::high_resolution_clock::now();
        times.push_back(std::chrono::duration<double, std::milli>(end - start).count());
    }
    
    return std::accumulate(times.begin(), times.end(), 0.0) / times.size();
}

void print_separator() {
    std::cout << std::string(70, '-') << std::endl;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <tle_file>\n";
        return 1;
    }

    std::cout << "╔══════════════════════════════════════════════════════════════════╗\n";
    std::cout << "║           ORBIT-OPS PERFORMANCE BENCHMARK SUITE                  ║\n";
    std::cout << "╚══════════════════════════════════════════════════════════════════╝\n\n";

    // Parse TLE file
    std::vector<TLE> tles = parse_tle_file(argv[1]);
    std::cout << "Loaded " << tles.size() << " satellites\n\n";

    // Create both data structures
    std::vector<Satellite> satellites_aos;
    satellites_aos.reserve(tles.size());
    for (const auto& tle : tles) {
        satellites_aos.push_back({tle, {}, {}});
    }
    
    SatelliteSystem satellites_soa = create_satellite_system(tles);

    print_separator();
    std::cout << "PROPAGATION BENCHMARK\n";
    print_separator();
    std::cout << std::setw(8) << "N" 
              << std::setw(15) << "Baseline(ms)"
              << std::setw(15) << "Optimized(ms)"
              << std::setw(12) << "Speedup"
              << std::endl;
    print_separator();

    for (size_t n : {1000, 5000, 10000, 14000}) {
        if (n > tles.size()) break;
        
        // Baseline (AoS)
        std::vector<Satellite> subset_aos(satellites_aos.begin(), satellites_aos.begin() + n);
        double baseline_time = benchmark([&]() {
            propagate_all(subset_aos, 60.0);
        }, 5);
        
        // Optimized (SoA + OpenMP)
        std::vector<TLE> subset_tles(tles.begin(), tles.begin() + n);
        SatelliteSystem subset_soa = create_satellite_system(subset_tles);
        double optimized_time = benchmark([&]() {
            propagate_all_optimized(subset_soa, 60.0);
        }, 5);
        
        double speedup = baseline_time / optimized_time;
        
        std::cout << std::setw(8) << n
                  << std::setw(15) << std::fixed << std::setprecision(2) << baseline_time
                  << std::setw(15) << optimized_time
                  << std::setw(10) << std::setprecision(1) << speedup << "x"
                  << std::endl;
    }

    std::cout << std::endl;
    print_separator();
    std::cout << "COLLISION DETECTION BENCHMARK\n";
    print_separator();
    std::cout << std::setw(8) << "N" 
              << std::setw(12) << "Pairs"
              << std::setw(15) << "Baseline(ms)"
              << std::setw(15) << "Optimized(ms)"
              << std::setw(12) << "Speedup"
              << std::endl;
    print_separator();

    // Propagate full datasets first
    propagate_all(satellites_aos, 0.0);
    propagate_all_optimized(satellites_soa, 0.0);

    for (size_t n : {1000, 2000, 5000, 10000, 14000}) {
        if (n > tles.size()) break;
        
        size_t pairs = n * (n - 1) / 2;
        
        // Baseline O(N^2)
        std::vector<Satellite> subset_aos(satellites_aos.begin(), satellites_aos.begin() + n);
        propagate_all(subset_aos, 0.0);
        
        double baseline_time = benchmark([&]() {
            detect_collisions_naive(subset_aos, 10.0, 0.0);
        }, 3);
        
        // Optimized (Spatial Grid)
        std::vector<TLE> subset_tles(tles.begin(), tles.begin() + n);
        SatelliteSystem subset_soa = create_satellite_system(subset_tles);
        propagate_all_optimized(subset_soa, 0.0);
        
        double optimized_time = benchmark([&]() {
            detect_collisions_optimized(subset_soa, 10.0, 0.0);
        }, 3);
        
        double speedup = baseline_time / optimized_time;
        
        std::cout << std::setw(8) << n
                  << std::setw(12) << pairs
                  << std::setw(15) << std::fixed << std::setprecision(2) << baseline_time
                  << std::setw(15) << optimized_time
                  << std::setw(10) << std::setprecision(1) << speedup << "x"
                  << std::endl;
    }

    std::cout << std::endl;
    print_separator();
    std::cout << "FULL SYSTEM BENCHMARK (" << tles.size() << " satellites)\n";
    print_separator();

    // Full baseline
    auto start = std::chrono::high_resolution_clock::now();
    propagate_all(satellites_aos, 0.0);
    auto conj_baseline = detect_collisions_naive(satellites_aos, 10.0, 0.0);
    auto end = std::chrono::high_resolution_clock::now();
    double full_baseline = std::chrono::duration<double, std::milli>(end - start).count();

    // Full optimized
    start = std::chrono::high_resolution_clock::now();
    propagate_all_optimized(satellites_soa, 0.0);
    auto conj_optimized = detect_collisions_optimized(satellites_soa, 10.0, 0.0);
    end = std::chrono::high_resolution_clock::now();
    double full_optimized = std::chrono::duration<double, std::milli>(end - start).count();

    std::cout << "Baseline:  " << std::fixed << std::setprecision(2) << full_baseline 
              << " ms  (conjunctions: " << conj_baseline.size() << ")\n";
    std::cout << "Optimized: " << full_optimized 
              << " ms  (conjunctions: " << conj_optimized.size() << ")\n";
    std::cout << "Speedup:   " << std::setprecision(1) << (full_baseline / full_optimized) << "x\n";

    std::cout << std::endl;
    print_separator();
    std::cout << "SUMMARY\n";
    print_separator();
    std::cout << "Total satellites:     " << tles.size() << std::endl;
    std::cout << "Naive pair checks:    " << (tles.size() * (tles.size()-1) / 2) << std::endl;
    std::cout << "Baseline total time:  " << std::fixed << std::setprecision(2) << full_baseline << " ms\n";
    std::cout << "Optimized total time: " << full_optimized << " ms\n";
    std::cout << "Overall speedup:      " << std::setprecision(1) << (full_baseline / full_optimized) << "x\n";

    return 0;
}
