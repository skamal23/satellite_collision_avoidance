cmake_minimum_required(VERSION 3.20)
project(OrbitOps VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Find OpenMP
find_package(OpenMP)

# Compiler flags
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang|AppleClang")
    set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -Wall -Wextra")
    set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -DNDEBUG")
endif()

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)

# Core library
add_library(orbitops_core STATIC
    src/tle_parser.cpp
    src/sgp4.cpp
    src/collision_detector.cpp
    src/satellite_system.cpp
    src/sgp4_optimized.cpp
    src/collision_optimized.cpp
)

if(OpenMP_CXX_FOUND)
    target_link_libraries(orbitops_core PUBLIC OpenMP::OpenMP_CXX)
endif()

# Main executable
add_executable(orbitops src/main.cpp)
target_link_libraries(orbitops orbitops_core)

# Benchmark executable
add_executable(benchmark benchmarks/benchmark.cpp)
target_link_libraries(benchmark orbitops_core)

# Test executable
include_directories(${CMAKE_SOURCE_DIR}/tests)
add_executable(tests tests/test_main.cpp)
target_link_libraries(tests orbitops_core)

