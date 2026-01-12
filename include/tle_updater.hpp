#pragma once

#include "types.hpp"
#include <vector>
#include <string>
#include <functional>
#include <memory>
#include <chrono>
#include <atomic>
#include <thread>
#include <mutex>

namespace orbitops {

// TLE data source configuration
struct TLESource {
    std::string name;
    std::string url;
    std::chrono::minutes refresh_interval{60};  // Default: 1 hour
    bool enabled = true;
};

// Common CelesTrak data sources
namespace celestrak {
    const TLESource STATIONS = {"Space Stations", "https://celestrak.org/NORAD/elements/gp.php?GROUP=stations&FORMAT=tle", std::chrono::minutes{30}};
    const TLESource STARLINK = {"Starlink", "https://celestrak.org/NORAD/elements/gp.php?GROUP=starlink&FORMAT=tle", std::chrono::minutes{60}};
    const TLESource ACTIVE = {"Active Satellites", "https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=tle", std::chrono::minutes{120}};
    const TLESource DEBRIS = {"Space Debris", "https://celestrak.org/NORAD/elements/gp.php?SPECIAL=debris&FORMAT=tle", std::chrono::minutes{180}};
    const TLESource VISUAL = {"Visual Satellites", "https://celestrak.org/NORAD/elements/gp.php?GROUP=visual&FORMAT=tle", std::chrono::minutes{60}};
    const TLESource WEATHER = {"Weather Satellites", "https://celestrak.org/NORAD/elements/gp.php?GROUP=weather&FORMAT=tle", std::chrono::minutes{60}};
    const TLESource NOAA = {"NOAA Satellites", "https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle", std::chrono::minutes{60}};
    const TLESource GPS = {"GPS Constellation", "https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=tle", std::chrono::minutes{180}};
    const TLESource GALILEO = {"Galileo Constellation", "https://celestrak.org/NORAD/elements/gp.php?GROUP=galileo&FORMAT=tle", std::chrono::minutes{180}};
    const TLESource RECENT_LAUNCHES = {"Recent Launches", "https://celestrak.org/NORAD/elements/gp.php?SPECIAL=gpz-plus&FORMAT=tle", std::chrono::minutes{15}};
}

// Result of a TLE fetch operation
struct TLEFetchResult {
    bool success = false;
    std::string source_name;
    std::string error_message;
    std::vector<TLE> tles;
    std::chrono::system_clock::time_point fetch_time;
    size_t bytes_downloaded = 0;
};

// Callback types
using TLEUpdateCallback = std::function<void(const TLEFetchResult&)>;
using TLEErrorCallback = std::function<void(const std::string& source, const std::string& error)>;

// TLE updater service
class TLEUpdater {
public:
    TLEUpdater();
    ~TLEUpdater();
    
    // Add a data source to monitor
    void add_source(const TLESource& source);
    void remove_source(const std::string& source_name);
    void clear_sources();
    
    // Manual fetch
    TLEFetchResult fetch_sync(const TLESource& source);
    void fetch_async(const TLESource& source, TLEUpdateCallback callback);
    
    // Fetch all configured sources
    std::vector<TLEFetchResult> fetch_all_sync();
    void fetch_all_async(TLEUpdateCallback callback);
    
    // Automatic updates
    void start_auto_update(TLEUpdateCallback on_update, TLEErrorCallback on_error = nullptr);
    void stop_auto_update();
    bool is_auto_updating() const { return auto_update_running_.load(); }
    
    // Configuration
    void set_user_agent(const std::string& user_agent) { user_agent_ = user_agent; }
    void set_timeout(std::chrono::seconds timeout) { timeout_ = timeout; }
    void set_max_retries(int retries) { max_retries_ = retries; }
    
    // Statistics
    struct Stats {
        size_t total_fetches = 0;
        size_t successful_fetches = 0;
        size_t failed_fetches = 0;
        size_t total_tles_fetched = 0;
        std::chrono::system_clock::time_point last_successful_fetch;
    };
    Stats get_stats() const;

private:
    std::vector<TLESource> sources_;
    std::string user_agent_ = "OrbitOps/1.0 (Satellite Collision Avoidance System)";
    std::chrono::seconds timeout_{30};
    int max_retries_ = 3;
    
    std::atomic<bool> auto_update_running_{false};
    std::unique_ptr<std::thread> update_thread_;
    std::mutex sources_mutex_;
    
    Stats stats_;
    mutable std::mutex stats_mutex_;
    
    // HTTP fetch implementation
    std::string http_get(const std::string& url);
    
    // Parse TLE from raw text
    std::vector<TLE> parse_tle_text(const std::string& text);
    
    // Auto-update loop
    void auto_update_loop(TLEUpdateCallback on_update, TLEErrorCallback on_error);
};

// Utility: Calculate hours since TLE epoch
double hours_since_epoch(const TLE& tle);

// Utility: Check if TLE is stale (older than threshold)
bool is_tle_stale(const TLE& tle, double hours_threshold = 48.0);

// Utility: Merge TLE sets (update existing, add new)
std::vector<TLE> merge_tle_sets(
    const std::vector<TLE>& existing,
    const std::vector<TLE>& updates
);

} // namespace orbitops

