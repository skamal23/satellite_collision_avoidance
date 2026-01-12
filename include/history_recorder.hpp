#pragma once

#include "types.hpp"
#include "satellite_system.hpp"
#include <vector>
#include <deque>
#include <mutex>
#include <chrono>
#include <optional>
#include <functional>

namespace orbitops {

// A single snapshot of satellite positions at a point in time
struct PositionSnapshot {
    double time_minutes;                          // Time from epoch
    std::chrono::system_clock::time_point wall_time;  // Real wall clock time
    std::vector<float> positions_x;              // Packed positions (float for storage efficiency)
    std::vector<float> positions_y;
    std::vector<float> positions_z;
    std::vector<int> satellite_ids;              // Corresponding satellite IDs
    
    size_t satellite_count() const { return satellite_ids.size(); }
    
    // Estimate memory usage
    size_t memory_bytes() const {
        return sizeof(*this) + 
               positions_x.capacity() * sizeof(float) * 3 +
               satellite_ids.capacity() * sizeof(int);
    }
};

// A recorded conjunction event
struct ConjunctionEvent {
    double time_minutes;
    std::chrono::system_clock::time_point wall_time;
    int sat1_id;
    int sat2_id;
    std::string sat1_name;
    std::string sat2_name;
    double miss_distance;
    double relative_velocity;
    double collision_probability;
};

// Configuration for the history recorder
struct RecorderConfig {
    double snapshot_interval_seconds = 1.0;       // How often to record snapshots
    size_t max_snapshots = 86400;                 // Max snapshots to keep (1 day at 1/sec)
    size_t max_conjunction_events = 10000;        // Max conjunction events to keep
    bool record_conjunctions = true;              // Whether to record conjunction events
    double conjunction_threshold_km = 10.0;       // Threshold for recording conjunctions
};

// History recorder for satellite positions and events
class HistoryRecorder {
public:
    explicit HistoryRecorder(const RecorderConfig& config = {});
    
    // Recording control
    void start();
    void stop();
    void clear();
    bool is_recording() const { return recording_; }
    
    // Record a snapshot
    void record_snapshot(
        const SatelliteSystem& sys,
        const std::vector<TLE>& tles,
        double time_minutes
    );
    
    // Record a conjunction event
    void record_conjunction(const ConjunctionEvent& event);
    
    // Playback - get snapshot at or near a specific time
    std::optional<PositionSnapshot> get_snapshot_at(double time_minutes) const;
    std::optional<PositionSnapshot> get_snapshot_nearest(double time_minutes) const;
    
    // Get range of snapshots between times
    std::vector<PositionSnapshot> get_snapshots_range(
        double start_minutes,
        double end_minutes
    ) const;
    
    // Get conjunction events in time range
    std::vector<ConjunctionEvent> get_conjunctions_range(
        double start_minutes,
        double end_minutes
    ) const;
    
    // Get all conjunction events for a specific satellite
    std::vector<ConjunctionEvent> get_conjunctions_for_satellite(int satellite_id) const;
    
    // Time range of recorded data
    struct TimeRange {
        double start_minutes;
        double end_minutes;
        std::chrono::system_clock::time_point wall_start;
        std::chrono::system_clock::time_point wall_end;
        size_t snapshot_count;
        size_t conjunction_count;
    };
    TimeRange get_time_range() const;
    
    // Statistics
    struct Stats {
        size_t total_snapshots;
        size_t total_conjunctions;
        size_t memory_usage_bytes;
        double recording_duration_seconds;
    };
    Stats get_stats() const;
    
    // Export/Import (for persistence)
    void export_to_file(const std::string& filename) const;
    void import_from_file(const std::string& filename);
    
    // Configuration
    void set_config(const RecorderConfig& config);
    RecorderConfig get_config() const { return config_; }

private:
    RecorderConfig config_;
    bool recording_ = false;
    
    std::deque<PositionSnapshot> snapshots_;
    std::deque<ConjunctionEvent> conjunctions_;
    
    mutable std::mutex mutex_;
    
    std::chrono::system_clock::time_point start_time_;
    
    // Trim old data to stay within limits
    void trim_old_data();
};

// Time scrubber for playback control
class TimeScrubber {
public:
    explicit TimeScrubber(const HistoryRecorder& recorder);
    
    // Playback control
    void play();
    void pause();
    void stop();
    void seek(double time_minutes);
    void set_playback_speed(double speed);  // 1.0 = realtime, 2.0 = 2x speed
    
    // Get current playback state
    double get_current_time() const;
    bool is_playing() const { return playing_; }
    double get_playback_speed() const { return playback_speed_; }
    
    // Get current snapshot
    std::optional<PositionSnapshot> get_current_snapshot() const;
    
    // Register callback for time updates
    using TimeUpdateCallback = std::function<void(double time_minutes, const PositionSnapshot*)>;
    void set_time_update_callback(TimeUpdateCallback callback);
    
    // Call this periodically to advance playback
    void tick(double delta_seconds);

private:
    const HistoryRecorder& recorder_;
    double current_time_ = 0.0;
    double playback_speed_ = 1.0;
    bool playing_ = false;
    TimeUpdateCallback callback_;
};

} // namespace orbitops

