#include "tle_parser.hpp"
#include <fstream>
#include <sstream>
#include <stdexcept>
#include <algorithm>

namespace orbitops {

namespace {

// Trim whitespace from string
std::string trim(const std::string& s) {
    auto start = s.find_first_not_of(" \t\r\n");
    auto end = s.find_last_not_of(" \t\r\n");
    return (start == std::string::npos) ? "" : s.substr(start, end - start + 1);
}

// Parse scientific notation like "12345-4" -> 0.12345e-4
double parse_exponential(const std::string& s) {
    std::string str = trim(s);
    if (str.empty()) return 0.0;
    
    // Handle format like " 12345-4" or "-12345-4"
    size_t sign_pos = str.find_last_of("+-");
    if (sign_pos != std::string::npos && sign_pos > 0) {
        std::string mantissa = str.substr(0, sign_pos);
        std::string exponent = str.substr(sign_pos);
        double m = std::stod("0." + mantissa);
        int e = std::stoi(exponent);
        return m * std::pow(10.0, e);
    }
    return std::stod(str);
}

} // anonymous namespace

TLE parse_tle(const std::string& name, const std::string& line1, const std::string& line2) {
    TLE tle;
    tle.name = trim(name);

    // Line 1 parsing
    tle.catalog_number = std::stoi(line1.substr(2, 5));
    
    // Epoch: columns 18-32 (YYDDD.DDDDDDDD)
    int epoch_year_2digit = std::stoi(line1.substr(18, 2));
    tle.epoch_year = (epoch_year_2digit < 57) ? 2000 + epoch_year_2digit : 1900 + epoch_year_2digit;
    tle.epoch_day = std::stod(line1.substr(20, 12));
    
    // Mean motion derivative (rev/day^2)
    tle.mean_motion_dot = std::stod(line1.substr(33, 10));
    
    // Mean motion second derivative (rev/day^3)
    tle.mean_motion_ddot = parse_exponential(line1.substr(44, 8));
    
    // BSTAR drag term
    tle.bstar = parse_exponential(line1.substr(53, 8));

    // Line 2 parsing
    tle.inclination = std::stod(line2.substr(8, 8));
    tle.raan = std::stod(line2.substr(17, 8));
    
    // Eccentricity (implied decimal point)
    tle.eccentricity = std::stod("0." + line2.substr(26, 7));
    
    tle.arg_perigee = std::stod(line2.substr(34, 8));
    tle.mean_anomaly = std::stod(line2.substr(43, 8));
    tle.mean_motion = std::stod(line2.substr(52, 11));
    tle.rev_number = std::stoi(line2.substr(63, 5));

    return tle;
}

std::vector<TLE> parse_tle_file(const std::string& filepath) {
    std::ifstream file(filepath);
    if (!file.is_open()) {
        throw std::runtime_error("Cannot open TLE file: " + filepath);
    }

    std::vector<TLE> tles;
    std::string line0, line1, line2;

    while (std::getline(file, line0)) {
        if (line0.empty() || !std::getline(file, line1) || !std::getline(file, line2)) {
            break;
        }

        // Validate line numbers
        if (line1[0] != '1' || line2[0] != '2') {
            continue; // Skip malformed entries
        }

        try {
            tles.push_back(parse_tle(line0, line1, line2));
        } catch (...) {
            // Skip entries that fail to parse
            continue;
        }
    }

    return tles;
}

} // namespace orbitops

