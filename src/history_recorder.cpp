#include "history_recorder.hpp"
#include <fstream>
#include <algorithm>
#include <cmath>

namespace orbitops {

HistoryRecorder::HistoryRecorder(const RecorderConfig& config)
    : config_(config) {}

void HistoryRecorder::start() {
    std::lock_guard<std::mutex> lock(mutex_);
    recording_ = true;
    start_time_ = std::chrono::system_clock::now();
}

void HistoryRecorder::stop() {
    std::lock_guard<std::mutex> lock(mutex_);
    recording_ = false;
}

void HistoryRecorder::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    snapshots_.clear();
    conjunctions_.clear();
}

void HistoryRecorder::record_snapshot(
    const SatelliteSystem& sys,
    const std::vector<TLE>& tles,
    double time_minutes
) {
    if (!recording_) return;
    
    std::lock_guard<std::mutex> lock(mutex_);
    
    PositionSnapshot snapshot;
    snapshot.time_minutes = time_minutes;
    snapshot.wall_time = std::chrono::system_clock::now();
    
    snapshot.positions_x.resize(sys.count);
    snapshot.positions_y.resize(sys.count);
    snapshot.positions_z.resize(sys.count);
    snapshot.satellite_ids.resize(sys.count);
    
    for (size_t i = 0; i < sys.count; ++i) {
        snapshot.positions_x[i] = static_cast<float>(sys.x[i]);
        snapshot.positions_y[i] = static_cast<float>(sys.y[i]);
        snapshot.positions_z[i] = static_cast<float>(sys.z[i]);
        snapshot.satellite_ids[i] = i < tles.size() ? tles[i].catalog_number : static_cast<int>(i);
    }
    
    snapshots_.push_back(std::move(snapshot));
    trim_old_data();
}

void HistoryRecorder::record_conjunction(const ConjunctionEvent& event) {
    if (!recording_ || !config_.record_conjunctions) return;
    
    std::lock_guard<std::mutex> lock(mutex_);
    conjunctions_.push_back(event);
    trim_old_data();
}

void HistoryRecorder::trim_old_data() {
    // Remove oldest snapshots if over limit
    while (snapshots_.size() > config_.max_snapshots) {
        snapshots_.pop_front();
    }
    
    // Remove oldest conjunctions if over limit
    while (conjunctions_.size() > config_.max_conjunction_events) {
        conjunctions_.pop_front();
    }
}

std::optional<PositionSnapshot> HistoryRecorder::get_snapshot_at(double time_minutes) const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    auto it = std::lower_bound(snapshots_.begin(), snapshots_.end(), time_minutes,
        [](const PositionSnapshot& s, double t) { return s.time_minutes < t; });
    
    if (it != snapshots_.end() && std::abs(it->time_minutes - time_minutes) < 0.001) {
        return *it;
    }
    
    return std::nullopt;
}

std::optional<PositionSnapshot> HistoryRecorder::get_snapshot_nearest(double time_minutes) const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    if (snapshots_.empty()) return std::nullopt;
    
    auto it = std::lower_bound(snapshots_.begin(), snapshots_.end(), time_minutes,
        [](const PositionSnapshot& s, double t) { return s.time_minutes < t; });
    
    if (it == snapshots_.end()) {
        return snapshots_.back();
    }
    
    if (it == snapshots_.begin()) {
        return *it;
    }
    
    // Check which is closer: it or it-1
    auto prev = std::prev(it);
    if (std::abs(it->time_minutes - time_minutes) < std::abs(prev->time_minutes - time_minutes)) {
        return *it;
    }
    return *prev;
}

std::vector<PositionSnapshot> HistoryRecorder::get_snapshots_range(
    double start_minutes,
    double end_minutes
) const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    std::vector<PositionSnapshot> result;
    
    for (const auto& snapshot : snapshots_) {
        if (snapshot.time_minutes >= start_minutes && snapshot.time_minutes <= end_minutes) {
            result.push_back(snapshot);
        }
    }
    
    return result;
}

std::vector<ConjunctionEvent> HistoryRecorder::get_conjunctions_range(
    double start_minutes,
    double end_minutes
) const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    std::vector<ConjunctionEvent> result;
    
    for (const auto& event : conjunctions_) {
        if (event.time_minutes >= start_minutes && event.time_minutes <= end_minutes) {
            result.push_back(event);
        }
    }
    
    return result;
}

std::vector<ConjunctionEvent> HistoryRecorder::get_conjunctions_for_satellite(int satellite_id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    std::vector<ConjunctionEvent> result;
    
    for (const auto& event : conjunctions_) {
        if (event.sat1_id == satellite_id || event.sat2_id == satellite_id) {
            result.push_back(event);
        }
    }
    
    return result;
}

HistoryRecorder::TimeRange HistoryRecorder::get_time_range() const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    TimeRange range{};
    range.snapshot_count = snapshots_.size();
    range.conjunction_count = conjunctions_.size();
    
    if (!snapshots_.empty()) {
        range.start_minutes = snapshots_.front().time_minutes;
        range.end_minutes = snapshots_.back().time_minutes;
        range.wall_start = snapshots_.front().wall_time;
        range.wall_end = snapshots_.back().wall_time;
    }
    
    return range;
}

HistoryRecorder::Stats HistoryRecorder::get_stats() const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    Stats stats{};
    stats.total_snapshots = snapshots_.size();
    stats.total_conjunctions = conjunctions_.size();
    
    // Calculate memory usage
    for (const auto& snapshot : snapshots_) {
        stats.memory_usage_bytes += snapshot.memory_bytes();
    }
    stats.memory_usage_bytes += conjunctions_.size() * sizeof(ConjunctionEvent);
    
    // Calculate duration
    if (!snapshots_.empty()) {
        auto duration = snapshots_.back().wall_time - snapshots_.front().wall_time;
        stats.recording_duration_seconds = 
            std::chrono::duration<double>(duration).count();
    }
    
    return stats;
}

void HistoryRecorder::export_to_file(const std::string& filename) const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    std::ofstream file(filename, std::ios::binary);
    if (!file) return;
    
    // Write header
    uint32_t magic = 0x4F524249; // "ORBI"
    uint32_t version = 1;
    file.write(reinterpret_cast<const char*>(&magic), sizeof(magic));
    file.write(reinterpret_cast<const char*>(&version), sizeof(version));
    
    // Write snapshot count
    uint64_t snapshot_count = snapshots_.size();
    file.write(reinterpret_cast<const char*>(&snapshot_count), sizeof(snapshot_count));
    
    // Write snapshots
    for (const auto& snapshot : snapshots_) {
        file.write(reinterpret_cast<const char*>(&snapshot.time_minutes), sizeof(double));
        
        uint32_t sat_count = static_cast<uint32_t>(snapshot.satellite_count());
        file.write(reinterpret_cast<const char*>(&sat_count), sizeof(sat_count));
        
        file.write(reinterpret_cast<const char*>(snapshot.positions_x.data()), 
                   sat_count * sizeof(float));
        file.write(reinterpret_cast<const char*>(snapshot.positions_y.data()), 
                   sat_count * sizeof(float));
        file.write(reinterpret_cast<const char*>(snapshot.positions_z.data()), 
                   sat_count * sizeof(float));
        file.write(reinterpret_cast<const char*>(snapshot.satellite_ids.data()), 
                   sat_count * sizeof(int));
    }
    
    // Write conjunction count
    uint64_t conj_count = conjunctions_.size();
    file.write(reinterpret_cast<const char*>(&conj_count), sizeof(conj_count));
    
    // Write conjunctions
    for (const auto& conj : conjunctions_) {
        file.write(reinterpret_cast<const char*>(&conj.time_minutes), sizeof(double));
        file.write(reinterpret_cast<const char*>(&conj.sat1_id), sizeof(int));
        file.write(reinterpret_cast<const char*>(&conj.sat2_id), sizeof(int));
        file.write(reinterpret_cast<const char*>(&conj.miss_distance), sizeof(double));
        file.write(reinterpret_cast<const char*>(&conj.relative_velocity), sizeof(double));
        file.write(reinterpret_cast<const char*>(&conj.collision_probability), sizeof(double));
    }
}

void HistoryRecorder::import_from_file(const std::string& filename) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    std::ifstream file(filename, std::ios::binary);
    if (!file) return;
    
    // Read and verify header
    uint32_t magic, version;
    file.read(reinterpret_cast<char*>(&magic), sizeof(magic));
    file.read(reinterpret_cast<char*>(&version), sizeof(version));
    
    if (magic != 0x4F524249 || version != 1) return;
    
    snapshots_.clear();
    conjunctions_.clear();
    
    // Read snapshots
    uint64_t snapshot_count;
    file.read(reinterpret_cast<char*>(&snapshot_count), sizeof(snapshot_count));
    
    for (uint64_t i = 0; i < snapshot_count; ++i) {
        PositionSnapshot snapshot;
        file.read(reinterpret_cast<char*>(&snapshot.time_minutes), sizeof(double));
        
        uint32_t sat_count;
        file.read(reinterpret_cast<char*>(&sat_count), sizeof(sat_count));
        
        snapshot.positions_x.resize(sat_count);
        snapshot.positions_y.resize(sat_count);
        snapshot.positions_z.resize(sat_count);
        snapshot.satellite_ids.resize(sat_count);
        
        file.read(reinterpret_cast<char*>(snapshot.positions_x.data()), 
                  sat_count * sizeof(float));
        file.read(reinterpret_cast<char*>(snapshot.positions_y.data()), 
                  sat_count * sizeof(float));
        file.read(reinterpret_cast<char*>(snapshot.positions_z.data()), 
                  sat_count * sizeof(float));
        file.read(reinterpret_cast<char*>(snapshot.satellite_ids.data()), 
                  sat_count * sizeof(int));
        
        snapshot.wall_time = std::chrono::system_clock::now();  // Approximate
        snapshots_.push_back(std::move(snapshot));
    }
    
    // Read conjunctions
    uint64_t conj_count;
    file.read(reinterpret_cast<char*>(&conj_count), sizeof(conj_count));
    
    for (uint64_t i = 0; i < conj_count; ++i) {
        ConjunctionEvent conj;
        file.read(reinterpret_cast<char*>(&conj.time_minutes), sizeof(double));
        file.read(reinterpret_cast<char*>(&conj.sat1_id), sizeof(int));
        file.read(reinterpret_cast<char*>(&conj.sat2_id), sizeof(int));
        file.read(reinterpret_cast<char*>(&conj.miss_distance), sizeof(double));
        file.read(reinterpret_cast<char*>(&conj.relative_velocity), sizeof(double));
        file.read(reinterpret_cast<char*>(&conj.collision_probability), sizeof(double));
        
        conj.wall_time = std::chrono::system_clock::now();  // Approximate
        conjunctions_.push_back(std::move(conj));
    }
}

void HistoryRecorder::set_config(const RecorderConfig& config) {
    std::lock_guard<std::mutex> lock(mutex_);
    config_ = config;
    trim_old_data();
}

// TimeScrubber implementation
TimeScrubber::TimeScrubber(const HistoryRecorder& recorder)
    : recorder_(recorder) {}

void TimeScrubber::play() {
    playing_ = true;
}

void TimeScrubber::pause() {
    playing_ = false;
}

void TimeScrubber::stop() {
    playing_ = false;
    auto range = recorder_.get_time_range();
    current_time_ = range.start_minutes;
}

void TimeScrubber::seek(double time_minutes) {
    current_time_ = time_minutes;
    
    if (callback_) {
        auto snapshot = get_current_snapshot();
        callback_(current_time_, snapshot ? &*snapshot : nullptr);
    }
}

void TimeScrubber::set_playback_speed(double speed) {
    playback_speed_ = std::max(0.1, std::min(10.0, speed));
}

double TimeScrubber::get_current_time() const {
    return current_time_;
}

std::optional<PositionSnapshot> TimeScrubber::get_current_snapshot() const {
    return recorder_.get_snapshot_nearest(current_time_);
}

void TimeScrubber::set_time_update_callback(TimeUpdateCallback callback) {
    callback_ = std::move(callback);
}

void TimeScrubber::tick(double delta_seconds) {
    if (!playing_) return;
    
    // Convert delta to minutes and apply playback speed
    double delta_minutes = (delta_seconds / 60.0) * playback_speed_;
    current_time_ += delta_minutes;
    
    // Clamp to recorded range
    auto range = recorder_.get_time_range();
    if (current_time_ > range.end_minutes) {
        current_time_ = range.end_minutes;
        playing_ = false;  // Auto-pause at end
    }
    if (current_time_ < range.start_minutes) {
        current_time_ = range.start_minutes;
    }
    
    if (callback_) {
        auto snapshot = get_current_snapshot();
        callback_(current_time_, snapshot ? &*snapshot : nullptr);
    }
}

} // namespace orbitops

