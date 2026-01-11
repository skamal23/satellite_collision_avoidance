#pragma once

#include <iostream>
#include <string>
#include <cmath>
#include <vector>
#include <functional>

namespace test {

struct TestResult {
    std::string name;
    bool passed;
    std::string message;
};

class TestSuite {
public:
    void add(const std::string& name, std::function<bool()> test) {
        tests.push_back({name, test});
    }

    int run() {
        int passed = 0, failed = 0;
        std::cout << "\n========================================\n";
        std::cout << "Running " << tests.size() << " tests...\n";
        std::cout << "========================================\n\n";

        for (const auto& [name, test] : tests) {
            std::cout << "  " << name << "... ";
            try {
                if (test()) {
                    std::cout << "✓ PASS\n";
                    passed++;
                } else {
                    std::cout << "✗ FAIL\n";
                    failed++;
                }
            } catch (const std::exception& e) {
                std::cout << "✗ EXCEPTION: " << e.what() << "\n";
                failed++;
            }
        }

        std::cout << "\n========================================\n";
        std::cout << "Results: " << passed << " passed, " << failed << " failed\n";
        std::cout << "========================================\n";
        
        return failed;
    }

private:
    std::vector<std::pair<std::string, std::function<bool()>>> tests;
};

// Assertion helpers
inline bool assert_true(bool condition, const char* msg = "") {
    if (!condition) std::cerr << "    Assert failed: " << msg << "\n";
    return condition;
}

inline bool assert_eq(double a, double b, double tolerance = 1e-6) {
    bool ok = std::abs(a - b) < tolerance;
    if (!ok) std::cerr << "    Expected " << a << " == " << b << " (diff=" << std::abs(a-b) << ")\n";
    return ok;
}

inline bool assert_near(double a, double b, double tolerance) {
    bool ok = std::abs(a - b) < tolerance;
    if (!ok) std::cerr << "    Expected " << a << " ≈ " << b << " (diff=" << std::abs(a-b) << ", tol=" << tolerance << ")\n";
    return ok;
}

} // namespace test

