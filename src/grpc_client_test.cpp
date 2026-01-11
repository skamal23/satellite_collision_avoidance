// Simple gRPC client test for OrbitOps
#include <grpcpp/grpcpp.h>
#include "orbit_ops.grpc.pb.h"

#include <iostream>
#include <memory>

using grpc::Channel;
using grpc::ClientContext;
using grpc::Status;
using namespace orbitops;

class OrbitOpsClient {
public:
    OrbitOpsClient(std::shared_ptr<Channel> channel)
        : stub_(OrbitOps::NewStub(channel)) {}

    void GetCatalog() {
        CatalogRequest request;
        CatalogResponse response;
        ClientContext context;

        Status status = stub_->GetCatalog(&context, request, &response);

        if (status.ok()) {
            std::cout << "✅ GetCatalog: Received " << response.total_count() 
                      << " satellites\n";
            
            // Print first 5
            std::cout << "   First 5 satellites:\n";
            int show = std::min(5, response.satellites_size());
            for (int i = 0; i < show; ++i) {
                const auto& sat = response.satellites(i);
                std::cout << "   - [" << sat.id() << "] " << sat.name() 
                          << " (incl=" << sat.inclination() << "°)\n";
            }
        } else {
            std::cerr << "❌ GetCatalog failed: " << status.error_message() << "\n";
        }
    }

    void StreamPositions() {
        TimeRange request;
        request.set_start_time(0);
        request.set_end_time(120);  // 2 minutes
        request.set_step_seconds(60);

        ClientContext context;
        std::unique_ptr<grpc::ClientReader<PositionBatch>> reader(
            stub_->StreamPositions(&context, request));

        PositionBatch batch;
        int batch_count = 0;
        while (reader->Read(&batch)) {
            batch_count++;
            std::cout << "✅ StreamPositions: Batch " << batch_count 
                      << " at t=" << batch.timestamp() << "s, "
                      << batch.positions_size() << " positions\n";
            
            // Print first position
            if (batch.positions_size() > 0) {
                const auto& pos = batch.positions(0);
                std::cout << "   First: " << pos.name() 
                          << " @ (" << pos.position().x() << ", "
                          << pos.position().y() << ", "
                          << pos.position().z() << ") km\n";
            }
        }

        Status status = reader->Finish();
        if (!status.ok()) {
            std::cerr << "❌ StreamPositions failed: " << status.error_message() << "\n";
        }
    }

    void StreamConjunctions() {
        ScreeningParams request;
        request.set_threshold_km(100);  // Large threshold for testing
        request.set_start_time(0);
        request.set_end_time(60);
        request.set_step_seconds(60);

        ClientContext context;
        std::unique_ptr<grpc::ClientReader<ConjunctionBatch>> reader(
            stub_->StreamConjunctions(&context, request));

        ConjunctionBatch batch;
        int total_conjunctions = 0;
        while (reader->Read(&batch)) {
            total_conjunctions += batch.conjunctions_size();
            std::cout << "✅ StreamConjunctions: " << batch.conjunctions_size() 
                      << " conjunctions at t=" << batch.timestamp() << "s\n";
            
            // Print first conjunction
            if (batch.conjunctions_size() > 0) {
                const auto& conj = batch.conjunctions(0);
                std::cout << "   " << conj.sat1_name() << " <-> " << conj.sat2_name()
                          << ": " << conj.miss_distance() << " km, Pc=" 
                          << conj.collision_probability() << "\n";
            }
        }

        std::cout << "   Total: " << total_conjunctions << " conjunctions\n";

        Status status = reader->Finish();
        if (!status.ok()) {
            std::cerr << "❌ StreamConjunctions failed: " << status.error_message() << "\n";
        }
    }

    void SimulateManeuver() {
        ManeuverRequest request;
        request.set_satellite_id(0);  // ISS
        request.mutable_delta_v()->set_x(0.001);  // Small delta-v
        request.mutable_delta_v()->set_y(0.0);
        request.mutable_delta_v()->set_z(0.0);
        request.set_burn_time(0);

        ManeuverResponse response;
        ClientContext context;

        Status status = stub_->SimulateManeuver(&context, request, &response);

        if (status.ok()) {
            std::cout << "✅ SimulateManeuver: " << response.message() << "\n";
            std::cout << "   Predicted path: " << response.predicted_path_size() 
                      << " points\n";
            
            if (response.predicted_path_size() > 0) {
                const auto& first = response.predicted_path(0);
                const auto& last = response.predicted_path(response.predicted_path_size() - 1);
                std::cout << "   Start: (" << first.position().x() << ", " 
                          << first.position().y() << ", " 
                          << first.position().z() << ") km\n";
                std::cout << "   End:   (" << last.position().x() << ", "
                          << last.position().y() << ", "
                          << last.position().z() << ") km\n";
            }
        } else {
            std::cerr << "❌ SimulateManeuver failed: " << status.error_message() << "\n";
        }
    }

private:
    std::unique_ptr<OrbitOps::Stub> stub_;
};

int main(int argc, char* argv[]) {
    std::string target = "localhost:50051";
    if (argc > 1) {
        target = argv[1];
    }

    std::cout << "╔══════════════════════════════════════════════════════════╗\n"
              << "║           Orbit-Ops gRPC Client Test                     ║\n"
              << "╚══════════════════════════════════════════════════════════╝\n"
              << "\nConnecting to " << target << "...\n\n";

    OrbitOpsClient client(
        grpc::CreateChannel(target, grpc::InsecureChannelCredentials()));

    std::cout << "=== Test 1: GetCatalog ===\n";
    client.GetCatalog();

    std::cout << "\n=== Test 2: StreamPositions ===\n";
    client.StreamPositions();

    std::cout << "\n=== Test 3: StreamConjunctions ===\n";
    client.StreamConjunctions();

    std::cout << "\n=== Test 4: SimulateManeuver ===\n";
    client.SimulateManeuver();

    std::cout << "\n✅ All tests completed!\n";

    return 0;
}

