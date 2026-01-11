#include "tle_parser.hpp"
#include "sgp4.hpp"
#include "collision_detector.hpp"
#include <iostream>
#include <chrono>
#include <iomanip>
#include <vector>
#include <numeric>

using namespace orbitops;

// Run a function multiple times and return average time in ms
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

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cerr << "Usage: " << argv[0] << " <tle_file>\n";
        return 1;
    }

    std::cout << "=== Orbit-Ops Benchmark Suite ===" << std::endl;
    std::cout << std::endl;

    // Parse TLE file
    std::vector<TLE> tles = parse_tle_file(argv[1]);
    std::cout << "Loaded " << tles.size() << " satellites" << std::endl;
    std::cout << std::endl;

    // Create satellites
    std::vector<Satellite> satellites;
    satellites.reserve(tles.size());
    for (const auto& tle : tles) {
        satellites.push_back({tle, {}, {}});
    }

    // Benchmark propagation
    std::cout << "--- Propagation Benchmark ---" << std::endl;
    for (size_t n : {100, 500, 1000, 5000, 10000}) {
        if (n > satellites.size()) break;
        
        std::vector<Satellite> subset(satellites.begin(), satellites.begin() + n);
        double avg_time = benchmark([&]() {
            propagate_all(subset, 60.0);  // 1 hour from epoch
        }, 5);
        
        std::cout << "  N=" << std::setw(5) << n 
                  << "  Time: " << std::fixed << std::setprecision(2) 
                  << std::setw(8) << avg_time << " ms"
                  << "  Per-sat: " << std::setw(6) << (avg_time / n * 1000) << " µs"
                  << std::endl;
    }
    std::cout << std::endl;

    // Benchmark collision detection
    std::cout << "--- Collision Detection Benchmark (O(N^2)) ---" << std::endl;
    propagate_all(satellites, 0.0);  // Ensure positions are set
    
    for (size_t n : {100, 500, 1000, 2000, 5000}) {
        if (n > satellites.size()) break;
        
        std::vector<Satellite> subset(satellites.begin(), satellites.begin() + n);
        propagate_all(subset, 0.0);
        
        size_t pairs = n * (n - 1) / 2;
        double avg_time = benchmark([&]() {
            detect_collisions_naive(subset, 10.0, 0.0);
        }, 5);
        
        std::cout << "  N=" << std::setw(5) << n 
                  << "  Pairs: " << std::setw(10) << pairs
                  << "  Time: " << std::fixed << std::setprecision(2) 
                  << std::setw(8) << avg_time << " ms"
                  << "  Mpairs/s: " << std::setw(6) << std::setprecision(1) 
                  << (pairs / avg_time / 1000) 
                  << std::endl;
    }
    std::cout << std::endl;

    // Summary
    std::cout << "--- Summary ---" << std::endl;
    size_t total = satellites.size();
    size_t total_pairs = total * (total - 1) / 2;
    
    propagate_all(satellites, 0.0);
    auto start = std::chrono::high_resolution_clock::now();
    auto conj = detect_collisions_naive(satellites, 10.0, 0.0);
    auto end = std::chrono::high_resolution_clock::now();
    double full_time = std::chrono::duration<double, std::milli>(end - start).count();
    
    std::cout << "Full dataset: " << total << " satellites" << std::endl;
    std::cout << "Total pairs checked: " << total_pairs << std::endl;
    std::cout << "Collision check time: " << std::fixed << std::setprecision(2) 
              << full_time << " ms" << std::endl;
    std::cout << "Conjunctions found (<10km): " << conj.size() << std::endl;

    return 0;
}

