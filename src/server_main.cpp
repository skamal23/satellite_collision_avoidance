#include "grpc_server.hpp"
#include <iostream>
#include <csignal>
#include <memory>

std::unique_ptr<orbitops::OrbitOpsServer> g_server;

void signal_handler(int signal) {
    std::cout << "\n[OrbitOps] Received signal " << signal << ", shutting down...\n";
    if (g_server) {
        g_server->shutdown();
    }
}

int main(int argc, char* argv[]) {
    std::string tle_file = "data/tle/active.txt";
    uint16_t port = 50051;
    
    // Parse command line arguments
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--tle" && i + 1 < argc) {
            tle_file = argv[++i];
        } else if (arg == "--port" && i + 1 < argc) {
            port = static_cast<uint16_t>(std::stoi(argv[++i]));
        } else if (arg == "--help") {
            std::cout << "Usage: orbitops_server [options]\n"
                      << "Options:\n"
                      << "  --tle <file>   TLE data file (default: data/tle/active.txt)\n"
                      << "  --port <port>  Server port (default: 50051)\n"
                      << "  --help         Show this help\n";
            return 0;
        }
    }
    
    // Set up signal handlers
    std::signal(SIGINT, signal_handler);
    std::signal(SIGTERM, signal_handler);
    
    std::cout << "╔══════════════════════════════════════════════════════════╗\n"
              << "║           Orbit-Ops Satellite Tracking Server            ║\n"
              << "╚══════════════════════════════════════════════════════════╝\n"
              << "\n";
    
    try {
        g_server = std::make_unique<orbitops::OrbitOpsServer>(tle_file, port);
        g_server->run();
    } catch (const std::exception& e) {
        std::cerr << "[OrbitOps] Error: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}


