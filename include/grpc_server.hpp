#pragma once

#include <memory>
#include <string>
#include <vector>
#include <atomic>

#include "types.hpp"
#include "satellite_system.hpp"

namespace orbitops {

class OrbitOpsServer {
public:
    OrbitOpsServer(const std::string& tle_file, uint16_t port = 50051);
    ~OrbitOpsServer();

    // Run the server (blocking)
    void run();
    
    // Shutdown the server gracefully
    void shutdown();
    
    // Get server address
    std::string address() const;

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace orbitops

