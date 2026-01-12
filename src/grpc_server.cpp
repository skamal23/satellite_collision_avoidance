#include "grpc_server.hpp"
#include "tle_parser.hpp"
#include "sgp4.hpp"
#include "sgp4_optimized.hpp"
#include "collision_detector.hpp"
#include "collision_optimized.hpp"
#include "collision_probability.hpp"
#include "maneuver_optimizer.hpp"
#include "history_recorder.hpp"
#include "tle_updater.hpp"
#include "debris_model.hpp"

#include <grpcpp/grpcpp.h>
#include "orbit_ops.grpc.pb.h"

#include <chrono>
#include <thread>
#include <iostream>
#include <mutex>
#include <ctime>

namespace orbitops {

// Service implementation
class OrbitOpsServiceImpl final : public OrbitOps::Service {
public:
    OrbitOpsServiceImpl(const std::string& tle_file) {
        // Load TLEs
        tles_ = parse_tle_file(tle_file);
        std::cout << "[OrbitOps] Loaded " << tles_.size() << " satellites\n";

        // Create optimized satellite system
        system_ = create_satellite_system(tles_);
        std::cout << "[OrbitOps] Initialized satellite system\n";

        // Initialize Phase 6 modules
        probability_calculator_ = std::make_unique<CollisionProbabilityCalculator>();
        maneuver_optimizer_ = std::make_unique<ManeuverOptimizer>();
        history_recorder_ = std::make_unique<HistoryRecorder>();
        tle_updater_ = std::make_unique<TLEUpdater>();
        debris_model_ = std::make_unique<DebrisModel>();

        // Configure TLE sources
        tle_updater_->add_source(celestrak::STATIONS);
        tle_updater_->add_source(celestrak::STARLINK);
        tle_updater_->add_source(celestrak::ACTIVE);
        tle_updater_->add_source(celestrak::DEBRIS);

        // Load debris from TLEs
        debris_model_->load_from_tles(tles_);
        auto debris_stats = debris_model_->get_statistics();
        std::cout << "[OrbitOps] Identified " << debris_stats.total_debris << " debris objects\n";

        // Start history recording
        history_recorder_->start();
        std::cout << "[OrbitOps] Phase 6 modules initialized\n";
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
        
        std::lock_guard<std::mutex> lock(system_mutex_);
        
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
                position->set_x(system_.x[i]);
                position->set_y(system_.y[i]);
                position->set_z(system_.z[i]);
                
                auto* velocity = pos->mutable_velocity();
                velocity->set_x(system_.vx[i]);
                velocity->set_y(system_.vy[i]);
                velocity->set_z(system_.vz[i]);
                
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

        std::lock_guard<std::mutex> lock(system_mutex_);
        SpatialGrid grid(threshold * 2);  // Cell size = 2x threshold

        for (double t = start; t <= end && !context->IsCancelled(); t += step) {
            // Propagate
            double time_minutes = t / 60.0;
            propagate_all_optimized(system_, time_minutes);

            // Record snapshot to history
            history_recorder_->record_snapshot(system_, tles_, time_minutes);

            // Build spatial grid and detect conjunctions
            grid.build(system_);
            auto conjunctions = grid.find_conjunctions(system_, threshold, time_minutes);

            if (!conjunctions.empty()) {
                ConjunctionBatch batch;
                batch.set_timestamp(t);
                batch.set_total_screened(static_cast<int32_t>(system_.count));

                // Use full Monte Carlo probability calculation
                auto prob_results = probability_calculator_->calculate_all(system_, conjunctions, tles_);

                for (size_t i = 0; i < prob_results.size(); ++i) {
                    const auto& prob = prob_results[i];

                    auto* warning = batch.add_conjunctions();
                    warning->set_sat1_id(prob.sat1_id);
                    warning->set_sat1_name(prob.sat1_name);
                    warning->set_sat2_id(prob.sat2_id);
                    warning->set_sat2_name(prob.sat2_name);
                    warning->set_tca(t);
                    warning->set_miss_distance(prob.miss_distance);
                    warning->set_relative_velocity(prob.relative_velocity);
                    warning->set_collision_probability(prob.collision_probability);

                    // Monte Carlo details
                    warning->set_monte_carlo_samples(prob.samples_taken);
                    warning->set_min_miss_distance(prob.min_miss_distance);
                    warning->set_max_miss_distance(prob.max_miss_distance);
                    warning->set_mean_miss_distance(prob.mean_miss_distance);
                    warning->set_std_miss_distance(prob.std_miss_distance);
                    warning->set_combined_radius(prob.combined_radius);

                    // Record conjunction event to history
                    ConjunctionEvent event;
                    event.time_minutes = time_minutes;
                    event.wall_time = std::chrono::system_clock::now();
                    event.sat1_id = prob.sat1_id;
                    event.sat2_id = prob.sat2_id;
                    event.sat1_name = prob.sat1_name;
                    event.sat2_name = prob.sat2_name;
                    event.miss_distance = prob.miss_distance;
                    event.relative_velocity = prob.relative_velocity;
                    event.collision_probability = prob.collision_probability;
                    history_recorder_->record_conjunction(event);
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

        // Calculate total delta-V magnitude
        double total_dv = std::sqrt(dvx*dvx + dvy*dvy + dvz*dvz);
        response->set_total_delta_v(total_dv);

        // Calculate fuel cost if spacecraft parameters provided
        if (request->has_spacecraft()) {
            orbitops::SpacecraftParams spacecraft;
            spacecraft.mass_kg = request->spacecraft().mass_kg();
            spacecraft.isp_s = request->spacecraft().isp_s();
            spacecraft.max_thrust_n = request->spacecraft().max_thrust_n();
            spacecraft.fuel_mass_kg = request->spacecraft().fuel_mass_kg();

            double fuel_cost = spacecraft.fuel_required(total_dv);
            response->set_fuel_cost_kg(fuel_cost);

            if (!spacecraft.can_execute(total_dv)) {
                response->set_success(false);
                response->set_message("Insufficient fuel for maneuver");
                return grpc::Status::OK;
            }
        }

        // Create a separate system for simulation
        SatelliteSystem sim_system = create_satellite_system(tles_);

        // Propagate to burn time
        propagate_all_optimized(sim_system, burn_time / 60.0);

        // Apply delta-v
        sim_system.vx[sat_id] += dvx;
        sim_system.vy[sat_id] += dvy;
        sim_system.vz[sat_id] += dvz;

        // Calculate orbital period based on altitude
        double r = std::sqrt(
            sim_system.x[sat_id] * sim_system.x[sat_id] +
            sim_system.y[sat_id] * sim_system.y[sat_id] +
            sim_system.z[sat_id] * sim_system.z[sat_id]
        );
        double orbital_period_sec = 2.0 * M_PI * std::sqrt(std::pow(r, 3) / 398600.4418);
        double step = 60.0;  // 1 minute steps

        // Track minimum distance to all other objects for new miss distance
        double min_miss_distance = std::numeric_limits<double>::max();

        for (double t = burn_time; t <= burn_time + orbital_period_sec; t += step) {
            propagate_all_optimized(sim_system, t / 60.0);

            auto* pos = response->add_predicted_path();
            pos->set_id(sat_id);
            pos->set_name(tles_[sat_id].name);

            auto* position = pos->mutable_position();
            position->set_x(sim_system.x[sat_id]);
            position->set_y(sim_system.y[sat_id]);
            position->set_z(sim_system.z[sat_id]);

            auto* velocity = pos->mutable_velocity();
            velocity->set_x(sim_system.vx[sat_id]);
            velocity->set_y(sim_system.vy[sat_id]);
            velocity->set_z(sim_system.vz[sat_id]);

            pos->set_timestamp(t);

            // Check distances to other satellites for conjunction assessment
            for (size_t i = 0; i < sim_system.count; ++i) {
                if (static_cast<int>(i) == sat_id) continue;

                double dx = sim_system.x[sat_id] - sim_system.x[i];
                double dy = sim_system.y[sat_id] - sim_system.y[i];
                double dz = sim_system.z[sat_id] - sim_system.z[i];
                double dist = std::sqrt(dx*dx + dy*dy + dz*dz);

                if (dist < min_miss_distance && dist < 100.0) {  // Only track close approaches
                    min_miss_distance = dist;
                }
            }
        }

        response->set_success(true);
        response->set_message("Maneuver simulated successfully");

        if (min_miss_distance < std::numeric_limits<double>::max()) {
            response->set_new_miss_distance(min_miss_distance);
        } else {
            response->set_new_miss_distance(-1.0);  // No close approaches detected
        }

        return grpc::Status::OK;
    }

    grpc::Status GetOrbitPath(
        grpc::ServerContext* context,
        const OrbitPathRequest* request,
        OrbitPath* response
    ) override {
        int sat_id = request->satellite_id();

        if (sat_id < 0 || sat_id >= static_cast<int>(tles_.size())) {
            return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "Invalid satellite ID");
        }

        double start = request->start_time();
        double end = request->end_time();
        double step = request->step_seconds();

        if (step <= 0) step = 60.0;

        // Calculate orbital period for default end time
        if (end <= start) {
            // Default to one orbital period
            std::lock_guard<std::mutex> lock(system_mutex_);
            propagate_all_optimized(system_, start / 60.0);
            double r = std::sqrt(
                system_.x[sat_id] * system_.x[sat_id] +
                system_.y[sat_id] * system_.y[sat_id] +
                system_.z[sat_id] * system_.z[sat_id]
            );
            double orbital_period = 2.0 * M_PI * std::sqrt(std::pow(r, 3) / 398600.4418);
            end = start + orbital_period;
        }

        std::lock_guard<std::mutex> lock(system_mutex_);

        response->set_satellite_id(sat_id);
        response->set_name(tles_[sat_id].name);
        response->set_start_time(start);
        response->set_end_time(end);
        response->set_step_seconds(step);

        for (double t = start; t <= end; t += step) {
            propagate_all_optimized(system_, t / 60.0);

            auto* pos = response->add_positions();
            pos->set_x(system_.x[sat_id]);
            pos->set_y(system_.y[sat_id]);
            pos->set_z(system_.z[sat_id]);
        }

        return grpc::Status::OK;
    }

    // ========== Phase 6.3: Maneuver Optimization ==========
    grpc::Status OptimizeManeuver(
        grpc::ServerContext* context,
        const ManeuverOptimizeRequest* request,
        ManeuverOptimizeResponse* response
    ) override {
        int sat_id = request->satellite_id();
        int threat_id = request->threat_id();

        if (sat_id < 0 || sat_id >= static_cast<int>(tles_.size()) ||
            threat_id < 0 || threat_id >= static_cast<int>(tles_.size())) {
            response->set_success(false);
            response->set_message("Invalid satellite or threat ID");
            return grpc::Status::OK;
        }

        std::lock_guard<std::mutex> lock(system_mutex_);

        // Get spacecraft parameters
        orbitops::SpacecraftParams spacecraft;
        if (request->has_spacecraft()) {
            spacecraft.mass_kg = request->spacecraft().mass_kg();
            spacecraft.isp_s = request->spacecraft().isp_s();
            spacecraft.max_thrust_n = request->spacecraft().max_thrust_n();
            spacecraft.fuel_mass_kg = request->spacecraft().fuel_mass_kg();
        }
        maneuver_optimizer_->set_spacecraft(spacecraft);
        maneuver_optimizer_->set_safe_distance(request->target_miss_distance());

        // Get current positions
        Vec3 sat_pos = {system_.x[sat_id], system_.y[sat_id], system_.z[sat_id]};
        Vec3 sat_vel = {system_.vx[sat_id], system_.vy[sat_id], system_.vz[sat_id]};
        Vec3 threat_pos = {system_.x[threat_id], system_.y[threat_id], system_.z[threat_id]};
        Vec3 threat_vel = {system_.vx[threat_id], system_.vy[threat_id], system_.vz[threat_id]};

        double current_miss = std::sqrt(
            std::pow(sat_pos.x - threat_pos.x, 2) +
            std::pow(sat_pos.y - threat_pos.y, 2) +
            std::pow(sat_pos.z - threat_pos.z, 2)
        );

        // Calculate optimal maneuver
        auto result = maneuver_optimizer_->calculate_avoidance(
            sat_pos, sat_vel, threat_pos, threat_vel,
            request->time_to_tca() / 60.0,  // Convert seconds to minutes
            current_miss
        );

        response->set_success(result.success);
        response->set_message(result.message);

        auto* delta_v = response->mutable_recommended_delta_v();
        delta_v->set_x(result.delta_v.x);
        delta_v->set_y(result.delta_v.y);
        delta_v->set_z(result.delta_v.z);

        response->set_burn_time(result.burn_time * 60.0);  // Convert to seconds
        response->set_total_delta_v(result.total_delta_v);
        response->set_fuel_cost_kg(result.fuel_cost_kg);
        response->set_expected_miss_distance(result.new_miss_distance);

        // Add alternatives
        for (const auto& alt : result.alternatives) {
            auto* alt_msg = response->add_alternatives();
            auto* alt_dv = alt_msg->mutable_delta_v();
            alt_dv->set_x(alt.delta_v.x);
            alt_dv->set_y(alt.delta_v.y);
            alt_dv->set_z(alt.delta_v.z);
            alt_msg->set_burn_time(alt.burn_time * 60.0);
            alt_msg->set_new_miss_distance(alt.new_miss_distance);
            alt_msg->set_fuel_cost_kg(alt.fuel_cost_kg);
            alt_msg->set_description(alt.description);
        }

        return grpc::Status::OK;
    }

    // ========== Phase 6.2: Historical Replay ==========
    grpc::Status GetHistory(
        grpc::ServerContext* context,
        const HistoryRequest* request,
        HistoryResponse* response
    ) override {
        if (!request->has_time_range()) {
            return grpc::Status(grpc::StatusCode::INVALID_ARGUMENT, "Time range required");
        }

        double start_min = request->time_range().start_time() / 60.0;
        double end_min = request->time_range().end_time() / 60.0;

        auto snapshots = history_recorder_->get_snapshots_range(start_min, end_min);

        for (const auto& snap : snapshots) {
            auto* proto_snap = response->add_snapshots();
            proto_snap->set_timestamp(snap.time_minutes * 60.0);

            for (size_t i = 0; i < snap.satellite_ids.size(); ++i) {
                proto_snap->add_satellite_ids(snap.satellite_ids[i]);
                proto_snap->add_positions_x(snap.positions_x[i]);
                proto_snap->add_positions_y(snap.positions_y[i]);
                proto_snap->add_positions_z(snap.positions_z[i]);
            }
        }

        response->set_total_snapshots(static_cast<int>(snapshots.size()));
        return grpc::Status::OK;
    }

    grpc::Status GetConjunctionHistory(
        grpc::ServerContext* context,
        const ConjunctionHistoryRequest* request,
        ConjunctionHistoryResponse* response
    ) override {
        double start_min = 0.0;
        double end_min = std::numeric_limits<double>::max();

        if (request->has_time_range()) {
            start_min = request->time_range().start_time() / 60.0;
            end_min = request->time_range().end_time() / 60.0;
        }

        std::vector<ConjunctionEvent> events;

        if (request->has_satellite_id()) {
            events = history_recorder_->get_conjunctions_for_satellite(request->satellite_id());
            // Filter by time range
            events.erase(
                std::remove_if(events.begin(), events.end(),
                    [start_min, end_min](const ConjunctionEvent& e) {
                        return e.time_minutes < start_min || e.time_minutes > end_min;
                    }),
                events.end()
            );
        } else {
            events = history_recorder_->get_conjunctions_range(start_min, end_min);
        }

        // Filter by minimum probability if specified
        if (request->has_min_probability()) {
            double min_pc = request->min_probability();
            events.erase(
                std::remove_if(events.begin(), events.end(),
                    [min_pc](const ConjunctionEvent& e) {
                        return e.collision_probability < min_pc;
                    }),
                events.end()
            );
        }

        for (const auto& event : events) {
            auto* warning = response->add_conjunctions();
            warning->set_sat1_id(event.sat1_id);
            warning->set_sat1_name(event.sat1_name);
            warning->set_sat2_id(event.sat2_id);
            warning->set_sat2_name(event.sat2_name);
            warning->set_tca(event.time_minutes * 60.0);
            warning->set_miss_distance(event.miss_distance);
            warning->set_relative_velocity(event.relative_velocity);
            warning->set_collision_probability(event.collision_probability);
        }

        response->set_total_events(static_cast<int>(events.size()));
        return grpc::Status::OK;
    }

    // ========== Phase 6.4: TLE Updates ==========
    grpc::Status UpdateTLEs(
        grpc::ServerContext* context,
        const TLEUpdateRequest* request,
        TLEUpdateResponse* response
    ) override {
        std::vector<TLEFetchResult> results;

        if (request->source_names_size() == 0) {
            // Fetch all sources
            results = tle_updater_->fetch_all_sync();
        } else {
            // Fetch specific sources - for now fetch all and filter
            results = tle_updater_->fetch_all_sync();
        }

        int total_satellites = 0;
        for (const auto& result : results) {
            auto* result_msg = response->add_results();
            result_msg->set_source_name(result.source_name);
            result_msg->set_success(result.success);
            result_msg->set_error_message(result.error_message);
            result_msg->set_satellites_updated(static_cast<int>(result.tles.size()));

            auto fetch_time = std::chrono::system_clock::to_time_t(result.fetch_time);
            result_msg->set_fetch_time(static_cast<double>(fetch_time));

            if (result.success) {
                // Merge new TLEs into our dataset
                std::lock_guard<std::mutex> lock(system_mutex_);
                tles_ = merge_tle_sets(tles_, result.tles);
                total_satellites += result.tles.size();
            }
        }

        response->set_total_satellites(static_cast<int>(tles_.size()));
        return grpc::Status::OK;
    }

    grpc::Status GetTLESources(
        grpc::ServerContext* context,
        const TLESourcesRequest* request,
        TLESourcesResponse* response
    ) override {
        // Return configured TLE sources
        std::vector<std::pair<std::string, std::string>> sources = {
            {"Space Stations", "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle"},
            {"Starlink", "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle"},
            {"Active Satellites", "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle"},
            {"Space Debris", "https://celestrak.org/NORAD/elements/gp.php?SPECIAL=debris&FORMAT=tle"},
            {"Visual Satellites", "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle"},
            {"Weather Satellites", "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle"},
            {"GPS Constellation", "https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle"},
            {"Galileo Constellation", "https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle"},
            {"Recent Launches", "https://celestrak.org/NORAD/elements/gp.php?SPECIAL=gpz-plus&FORMAT=tle"}
        };

        for (const auto& [name, url] : sources) {
            auto* source = response->add_sources();
            source->set_name(name);
            source->set_url(url);
            source->set_refresh_interval_minutes(60);
            source->set_enabled(true);
        }

        return grpc::Status::OK;
    }

    // ========== Phase 6.5: Space Debris ==========
    grpc::Status GetDebrisField(
        grpc::ServerContext* context,
        const DebrisFieldRequest* request,
        DebrisFieldResponse* response
    ) override {
        std::lock_guard<std::mutex> lock(system_mutex_);

        // Update debris positions from current satellite system
        debris_model_->update_positions(system_, tles_);

        const auto& debris = debris_model_->get_debris();
        std::vector<DebrisObject> filtered_debris;

        double min_alt = request->has_min_altitude_km() ? request->min_altitude_km() : 0.0;
        double max_alt = request->has_max_altitude_km() ? request->max_altitude_km() : 100000.0;

        for (const auto& d : debris) {
            if (d.altitude_km >= min_alt && d.altitude_km <= max_alt) {
                filtered_debris.push_back(d);
            }
        }

        double total_volume = 0.0;
        for (const auto& d : filtered_debris) {
            auto* debris_msg = response->add_debris();
            debris_msg->set_id(d.id);
            debris_msg->set_name(d.name);
            debris_msg->set_origin(d.origin);

            auto* pos = debris_msg->mutable_position();
            pos->set_x(d.position.x);
            pos->set_y(d.position.y);
            pos->set_z(d.position.z);

            auto* vel = debris_msg->mutable_velocity();
            vel->set_x(d.velocity.x);
            vel->set_y(d.velocity.y);
            vel->set_z(d.velocity.z);

            debris_msg->set_radar_cross_section(d.rcs);
            debris_msg->set_timestamp(std::time(nullptr));

            // Calculate volume of shell for flux
            double r = 6371.0 + d.altitude_km;
            total_volume += 4.0 * M_PI * r * r * 50.0;  // 50km shell thickness
        }

        response->set_total_count(static_cast<int>(filtered_debris.size()));
        response->set_flux_density(filtered_debris.size() / (total_volume / 1e9));  // per km^3

        return grpc::Status::OK;
    }

private:
    std::vector<TLE> tles_;
    SatelliteSystem system_;
    std::mutex system_mutex_;  // Protect system_ for concurrent access

    // Phase 6 modules
    std::unique_ptr<CollisionProbabilityCalculator> probability_calculator_;
    std::unique_ptr<ManeuverOptimizer> maneuver_optimizer_;
    std::unique_ptr<HistoryRecorder> history_recorder_;
    std::unique_ptr<TLEUpdater> tle_updater_;
    std::unique_ptr<DebrisModel> debris_model_;
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
