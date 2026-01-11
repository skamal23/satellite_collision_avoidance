#include "grpc_server.hpp"
#include "tle_parser.hpp"
#include "sgp4.hpp"
#include "sgp4_optimized.hpp"
#include "collision_detector.hpp"
#include "collision_optimized.hpp"

#include <grpcpp/grpcpp.h>
#include "orbit_ops.grpc.pb.h"

#include <chrono>
#include <thread>
#include <iostream>

namespace orbitops {

// Convert internal Vec3 to protobuf Vec3
void to_proto(const ::Vec3& v, ::orbitops::Vec3* pb) {
    pb->set_x(v.x);
    pb->set_y(v.y);
    pb->set_z(v.z);
}

// Service implementation
class OrbitOpsServiceImpl final : public OrbitOps::Service {
public:
    OrbitOpsServiceImpl(const std::string& tle_file) {
        // Load TLEs
        tles_ = TLEParser::parse_tles(tle_file);
        std::cout << "[OrbitOps] Loaded " << tles_.size() << " satellites\n";
        
        // Create optimized satellite system
        system_ = create_satellite_system(tles_);
        std::cout << "[OrbitOps] Initialized satellite system\n";
    }

    grpc::Status GetCatalog(
        grpc::ServerContext* context,
        const CatalogRequest* request,
        CatalogResponse* response
    ) override {
        for (size_t i = 0; i < tles_.size(); ++i) {
            auto* sat = response->add_satellites();
            sat->set_id(static_cast<int32_t>(i));
            sat->set_name(tles_[i].name);
            sat->set_intl_designator(tles_[i].intl_designator);
            sat->set_inclination(tles_[i].inclination * 180.0 / M_PI);
            sat->set_eccentricity(tles_[i].eccentricity);
            sat->set_mean_motion(tles_[i].mean_motion * 1440.0 / (2.0 * M_PI)); // rad/min to rev/day
            sat->set_epoch(tles_[i].epoch_jd);
        }
        response->set_total_count(static_cast<int32_t>(tles_.size()));
        return grpc::Status::OK;
    }

    grpc::Status StreamPositions(
        grpc::ServerContext* context,
        const TimeRange* request,
        grpc::ServerWriter<PositionBatch>* writer
    ) override {
        double start = request->start_time();
        double end = request->end_time();
        double step = request->step_seconds();
        
        if (step <= 0) step = 60.0;  // Default 1 minute
        
        for (double t = start; t <= end && !context->IsCancelled(); t += step) {
            // Propagate all satellites
            propagate_all_optimized(system_, t / 60.0);  // Convert seconds to minutes
            
            PositionBatch batch;
            batch.set_timestamp(t);
            
            for (size_t i = 0; i < system_.count; ++i) {
                auto* pos = batch.add_positions();
                pos->set_id(static_cast<int32_t>(i));
                pos->set_name(tles_[i].name);
                
                auto* position = pos->mutable_position();
                position->set_x(system_.pos_x[i]);
                position->set_y(system_.pos_y[i]);
                position->set_z(system_.pos_z[i]);
                
                auto* velocity = pos->mutable_velocity();
                velocity->set_x(system_.vel_x[i]);
                velocity->set_y(system_.vel_y[i]);
                velocity->set_z(system_.vel_z[i]);
                
                pos->set_timestamp(t);
            }
            
            if (!writer->Write(batch)) {
                break;  // Client disconnected
            }
        }
        
        return grpc::Status::OK;
    }

    grpc::Status StreamConjunctions(
        grpc::ServerContext* context,
        const ScreeningParams* request,
        grpc::ServerWriter<ConjunctionBatch>* writer
    ) override {
        double threshold = request->threshold_km();
        if (threshold <= 0) threshold = 10.0;  // Default 10km
        
        double start = request->start_time();
        double end = request->end_time();
        double step = request->step_seconds();
        
        if (step <= 0) step = 60.0;  // Default 1 minute
        
        SpatialGrid grid;
        
        for (double t = start; t <= end && !context->IsCancelled(); t += step) {
            // Propagate
            propagate_all_optimized(system_, t / 60.0);
            
            // Build spatial grid and detect conjunctions
            grid.build(system_, threshold);
            auto conjunctions = grid.find_conjunctions(system_, threshold);
            
            if (!conjunctions.empty()) {
                ConjunctionBatch batch;
                batch.set_timestamp(t);
                batch.set_total_screened(static_cast<int32_t>(system_.count));
                
                for (const auto& conj : conjunctions) {
                    auto* warning = batch.add_conjunctions();
                    warning->set_sat1_id(conj.sat1_id);
                    warning->set_sat1_name(tles_[conj.sat1_id].name);
                    warning->set_sat2_id(conj.sat2_id);
                    warning->set_sat2_name(tles_[conj.sat2_id].name);
                    warning->set_tca(t);
                    warning->set_miss_distance(conj.distance);
                    
                    // Calculate relative velocity
                    double dvx = system_.vel_x[conj.sat1_id] - system_.vel_x[conj.sat2_id];
                    double dvy = system_.vel_y[conj.sat1_id] - system_.vel_y[conj.sat2_id];
                    double dvz = system_.vel_z[conj.sat1_id] - system_.vel_z[conj.sat2_id];
                    double rel_vel = std::sqrt(dvx*dvx + dvy*dvy + dvz*dvz);
                    warning->set_relative_velocity(rel_vel);
                    
                    // Simplified collision probability (Pc) estimation
                    // Using a simplified formula: Pc ~ exp(-d^2 / (2*sigma^2))
                    // where sigma is the combined position uncertainty (~100m typical)
                    double sigma = 0.1;  // 100m in km
                    double pc = std::exp(-conj.distance * conj.distance / (2 * sigma * sigma));
                    warning->set_collision_probability(pc);
                }
                
                if (!writer->Write(batch)) {
                    break;
                }
            }
        }
        
        return grpc::Status::OK;
    }

    grpc::Status SimulateManeuver(
        grpc::ServerContext* context,
        const ManeuverRequest* request,
        ManeuverResponse* response
    ) override {
        int sat_id = request->satellite_id();
        
        if (sat_id < 0 || sat_id >= static_cast<int>(tles_.size())) {
            response->set_success(false);
            response->set_message("Invalid satellite ID");
            return grpc::Status::OK;
        }
        
        // Get delta-v
        double dvx = request->delta_v().x();
        double dvy = request->delta_v().y();
        double dvz = request->delta_v().z();
        double burn_time = request->burn_time();
        
        // Create a copy of the system for simulation
        SatelliteSystem sim_system = system_;
        
        // Propagate to burn time
        propagate_all_optimized(sim_system, burn_time / 60.0);
        
        // Apply delta-v
        sim_system.vel_x[sat_id] += dvx;
        sim_system.vel_y[sat_id] += dvy;
        sim_system.vel_z[sat_id] += dvz;
        
        // Propagate for one orbit (~90 minutes for LEO) and record positions
        double orbital_period = 90.0 * 60.0;  // seconds
        double step = 60.0;  // 1 minute steps
        
        for (double t = burn_time; t <= burn_time + orbital_period; t += step) {
            propagate_all_optimized(sim_system, t / 60.0);
            
            auto* pos = response->add_predicted_path();
            pos->set_id(sat_id);
            pos->set_name(tles_[sat_id].name);
            
            auto* position = pos->mutable_position();
            position->set_x(sim_system.pos_x[sat_id]);
            position->set_y(sim_system.pos_y[sat_id]);
            position->set_z(sim_system.pos_z[sat_id]);
            
            auto* velocity = pos->mutable_velocity();
            velocity->set_x(sim_system.vel_x[sat_id]);
            velocity->set_y(sim_system.vel_y[sat_id]);
            velocity->set_z(sim_system.vel_z[sat_id]);
            
            pos->set_timestamp(t);
        }
        
        response->set_success(true);
        response->set_message("Maneuver simulated successfully");
        
        // TODO: Calculate new miss distance if there was a pending conjunction
        response->set_new_miss_distance(-1.0);  // -1 indicates no conjunction was being tracked
        
        return grpc::Status::OK;
    }

    grpc::Status GetOrbitPath(
        grpc::ServerContext* context,
        const TimeRange* request,
        OrbitPath* response
    ) override {
        // Default to first satellite if not specified
        // In a real implementation, we'd extend the proto to include satellite_id
        int sat_id = 0;
        
        double start = request->start_time();
        double end = request->end_time();
        double step = request->step_seconds();
        
        if (step <= 0) step = 60.0;
        
        response->set_satellite_id(sat_id);
        response->set_name(tles_[sat_id].name);
        response->set_start_time(start);
        response->set_end_time(end);
        response->set_step_seconds(step);
        
        for (double t = start; t <= end; t += step) {
            propagate_all_optimized(system_, t / 60.0);
            
            auto* pos = response->add_positions();
            pos->set_x(system_.pos_x[sat_id]);
            pos->set_y(system_.pos_y[sat_id]);
            pos->set_z(system_.pos_z[sat_id]);
        }
        
        return grpc::Status::OK;
    }

private:
    std::vector<TLE> tles_;
    SatelliteSystem system_;
};

// Pimpl implementation
class OrbitOpsServer::Impl {
public:
    Impl(const std::string& tle_file, uint16_t port)
        : service_(tle_file)
        , port_(port)
        , address_("0.0.0.0:" + std::to_string(port))
    {}

    void run() {
        grpc::ServerBuilder builder;
        builder.AddListeningPort(address_, grpc::InsecureServerCredentials());
        builder.RegisterService(&service_);
        
        // Performance settings
        builder.SetMaxReceiveMessageSize(64 * 1024 * 1024);  // 64MB
        builder.SetMaxSendMessageSize(64 * 1024 * 1024);
        
        server_ = builder.BuildAndStart();
        std::cout << "[OrbitOps] Server listening on " << address_ << std::endl;
        server_->Wait();
    }

    void shutdown() {
        if (server_) {
            server_->Shutdown();
        }
    }

    std::string address() const { return address_; }

private:
    OrbitOpsServiceImpl service_;
    uint16_t port_;
    std::string address_;
    std::unique_ptr<grpc::Server> server_;
};

// Public interface
OrbitOpsServer::OrbitOpsServer(const std::string& tle_file, uint16_t port)
    : impl_(std::make_unique<Impl>(tle_file, port))
{}

OrbitOpsServer::~OrbitOpsServer() = default;

void OrbitOpsServer::run() {
    impl_->run();
}

void OrbitOpsServer::shutdown() {
    impl_->shutdown();
}

std::string OrbitOpsServer::address() const {
    return impl_->address();
}

} // namespace orbitops

