#pragma once

#include <string>
#include <cmath>

// 3D vector for positions and velocities (in km and km/s)
// Not in orbitops namespace to avoid conflict with protobuf-generated Vec3
struct Vec3 {
    double x = 0.0;
    double y = 0.0;
    double z = 0.0;

    Vec3 operator-(const Vec3& other) const {
        return {x - other.x, y - other.y, z - other.z};
    }

    double magnitude() const {
        return std::sqrt(x*x + y*y + z*z);
    }
};

// Two-Line Element data
struct TLE {
    std::string name;
    std::string intl_designator;       // International designator (e.g., "98067A")
    int catalog_number = 0;
    double epoch_year = 0.0;
    double epoch_day = 0.0;
    double epoch_jd = 0.0;             // Julian date of epoch
    double mean_motion_dot = 0.0;      // rev/day^2
    double mean_motion_ddot = 0.0;     // rev/day^3
    double bstar = 0.0;                // drag term
    double inclination = 0.0;          // radians
    double raan = 0.0;                 // right ascension of ascending node (radians)
    double eccentricity = 0.0;         // dimensionless
    double arg_perigee = 0.0;          // radians
    double mean_anomaly = 0.0;         // radians
    double mean_motion = 0.0;          // rad/min
    int rev_number = 0;
};

// Satellite with current state
struct Satellite {
    TLE tle;
    Vec3 position;   // km (ECI frame)
    Vec3 velocity;   // km/s (ECI frame)
};

// Conjunction warning
struct Conjunction {
    int sat1_id;
    int sat2_id;
    double distance;     // km
    double time_minutes; // minutes from epoch
};

