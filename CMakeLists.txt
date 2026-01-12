cmake_minimum_required(VERSION 3.20)
project(OrbitOps VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Find OpenMP
find_package(OpenMP)

# Find gRPC and Protobuf
find_package(protobuf CONFIG REQUIRED)
find_package(gRPC CONFIG REQUIRED)

# Get the protoc and grpc_cpp_plugin executables
find_program(_PROTOBUF_PROTOC protoc)
find_program(_GRPC_CPP_PLUGIN_EXECUTABLE grpc_cpp_plugin)

# Compiler flags
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang|AppleClang")
    set(CMAKE_CXX_FLAGS_DEBUG "-g -O0 -Wall -Wextra")
    set(CMAKE_CXX_FLAGS_RELEASE "-O3 -march=native -DNDEBUG")
endif()

# Include directories
include_directories(${CMAKE_SOURCE_DIR}/include)

# Proto file
set(PROTO_FILE "${CMAKE_SOURCE_DIR}/proto/orbit_ops.proto")
set(PROTO_OUT_DIR "${CMAKE_BINARY_DIR}/generated")
file(MAKE_DIRECTORY ${PROTO_OUT_DIR})

# Generate protobuf and gRPC sources
set(PROTO_SRCS "${PROTO_OUT_DIR}/orbit_ops.pb.cc")
set(PROTO_HDRS "${PROTO_OUT_DIR}/orbit_ops.pb.h")
set(GRPC_SRCS "${PROTO_OUT_DIR}/orbit_ops.grpc.pb.cc")
set(GRPC_HDRS "${PROTO_OUT_DIR}/orbit_ops.grpc.pb.h")

add_custom_command(
    OUTPUT "${PROTO_SRCS}" "${PROTO_HDRS}" "${GRPC_SRCS}" "${GRPC_HDRS}"
    COMMAND ${_PROTOBUF_PROTOC}
    ARGS --grpc_out "${PROTO_OUT_DIR}"
         --cpp_out "${PROTO_OUT_DIR}"
         -I "${CMAKE_SOURCE_DIR}/proto"
         --plugin=protoc-gen-grpc="${_GRPC_CPP_PLUGIN_EXECUTABLE}"
         "${PROTO_FILE}"
    DEPENDS "${PROTO_FILE}"
    COMMENT "Generating gRPC/Protobuf sources"
)

# Proto library
add_library(orbitops_proto STATIC
    ${PROTO_SRCS}
    ${GRPC_SRCS}
)
target_include_directories(orbitops_proto PUBLIC ${PROTO_OUT_DIR})
target_link_libraries(orbitops_proto PUBLIC
    protobuf::libprotobuf
    gRPC::grpc++
)

# Core library
add_library(orbitops_core STATIC
    src/tle_parser.cpp
    src/sgp4.cpp
    src/collision_detector.cpp
    src/satellite_system.cpp
    src/sgp4_optimized.cpp
    src/collision_optimized.cpp
    src/collision_probability.cpp
    src/maneuver_optimizer.cpp
    src/tle_updater.cpp
    src/history_recorder.cpp
    src/debris_model.cpp
)

if(OpenMP_CXX_FOUND)
    target_link_libraries(orbitops_core PUBLIC OpenMP::OpenMP_CXX)
endif()

# gRPC server library
add_library(orbitops_grpc STATIC
    src/grpc_server.cpp
)
target_include_directories(orbitops_grpc PUBLIC ${PROTO_OUT_DIR})
target_link_libraries(orbitops_grpc PUBLIC
    orbitops_core
    orbitops_proto
)

# Main executable
add_executable(orbitops src/main.cpp)
target_link_libraries(orbitops orbitops_core)

# gRPC Server executable
add_executable(orbitops_server src/server_main.cpp)
target_link_libraries(orbitops_server orbitops_grpc)

# gRPC Client test executable
add_executable(grpc_client_test src/grpc_client_test.cpp)
target_include_directories(grpc_client_test PRIVATE ${PROTO_OUT_DIR})
target_link_libraries(grpc_client_test orbitops_proto)

# Benchmark executable
add_executable(benchmark benchmarks/benchmark.cpp)
target_link_libraries(benchmark orbitops_core)

# Test executables
include_directories(${CMAKE_SOURCE_DIR}/tests)
add_executable(tests tests/test_main.cpp)
target_link_libraries(tests orbitops_core)

add_executable(test_validation tests/test_sgp4_validation.cpp)
target_link_libraries(test_validation orbitops_core)
