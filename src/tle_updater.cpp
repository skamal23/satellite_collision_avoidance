#include "tle_updater.hpp"
#include "tle_parser.hpp"
#include <sstream>
#include <algorithm>
#include <ctime>
#include <map>

// Note: This implementation uses a simple approach.
// For production, link against libcurl for robust HTTP.
// Here we provide a stub that can be extended.

#ifdef _WIN32
#include <windows.h>
#include <wininet.h>
#pragma comment(lib, "wininet.lib")
#else
#include <cstdio>
#include <array>
#endif

namespace orbitops {

TLEUpdater::TLEUpdater() = default;

TLEUpdater::~TLEUpdater() {
    stop_auto_update();
}

void TLEUpdater::add_source(const TLESource& source) {
    std::lock_guard<std::mutex> lock(sources_mutex_);
    
    // Check if source already exists
    auto it = std::find_if(sources_.begin(), sources_.end(),
        [&](const TLESource& s) { return s.name == source.name; });
    
    if (it != sources_.end()) {
        *it = source;  // Update existing
    } else {
        sources_.push_back(source);
    }
}

void TLEUpdater::remove_source(const std::string& source_name) {
    std::lock_guard<std::mutex> lock(sources_mutex_);
    sources_.erase(
        std::remove_if(sources_.begin(), sources_.end(),
            [&](const TLESource& s) { return s.name == source_name; }),
        sources_.end()
    );
}

void TLEUpdater::clear_sources() {
    std::lock_guard<std::mutex> lock(sources_mutex_);
    sources_.clear();
}

std::string TLEUpdater::http_get(const std::string& url) {
    std::string result;
    
#ifdef _WIN32
    // Windows implementation using WinINet
    HINTERNET hInternet = InternetOpenA(user_agent_.c_str(), 
        INTERNET_OPEN_TYPE_PRECONFIG, NULL, NULL, 0);
    if (hInternet) {
        HINTERNET hUrl = InternetOpenUrlA(hInternet, url.c_str(), 
            NULL, 0, INTERNET_FLAG_RELOAD, 0);
        if (hUrl) {
            char buffer[4096];
            DWORD bytesRead;
            while (InternetReadFile(hUrl, buffer, sizeof(buffer) - 1, &bytesRead) && bytesRead > 0) {
                buffer[bytesRead] = '\0';
                result += buffer;
            }
            InternetCloseHandle(hUrl);
        }
        InternetCloseHandle(hInternet);
    }
#else
    // Unix implementation using curl command
    std::string cmd = "curl -s -A '" + user_agent_ + "' --max-time " + 
                      std::to_string(timeout_.count()) + " '" + url + "' 2>/dev/null";
    
    std::array<char, 4096> buffer;
    FILE* pipe = popen(cmd.c_str(), "r");
    if (pipe) {
        while (fgets(buffer.data(), buffer.size(), pipe) != nullptr) {
            result += buffer.data();
        }
        pclose(pipe);
    }
#endif
    
    return result;
}

std::vector<TLE> TLEUpdater::parse_tle_text(const std::string& text) {
    std::vector<TLE> tles;
    std::istringstream stream(text);
    std::string line0, line1, line2;
    
    while (std::getline(stream, line0)) {
        // Skip empty lines
        while (line0.empty() || line0[0] == '\r') {
            if (!std::getline(stream, line0)) return tles;
        }
        
        // Check if this is line 0 (name) or line 1
        if (line0.length() >= 2 && line0[0] == '1' && line0[1] == ' ') {
            // No name line, line0 is actually line1
            line1 = line0;
            line0 = "UNKNOWN";
        } else {
            // Name line present, read line 1
            if (!std::getline(stream, line1)) break;
        }
        
        // Read line 2
        if (!std::getline(stream, line2)) break;
        
        // Trim whitespace
        auto trim = [](std::string& s) {
            s.erase(0, s.find_first_not_of(" \t\r\n"));
            s.erase(s.find_last_not_of(" \t\r\n") + 1);
        };
        trim(line0);
        trim(line1);
        trim(line2);
        
        // Validate line format
        if (line1.length() < 69 || line1[0] != '1') continue;
        if (line2.length() < 69 || line2[0] != '2') continue;
        
        // Parse using existing parser
        TLE tle = parse_tle(line0, line1, line2);
        if (tle.catalog_number > 0) {
            tles.push_back(tle);
        }
    }
    
    return tles;
}

TLEFetchResult TLEUpdater::fetch_sync(const TLESource& source) {
    TLEFetchResult result;
    result.source_name = source.name;
    result.fetch_time = std::chrono::system_clock::now();
    
    // Update stats
    {
        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_.total_fetches++;
    }
    
    // Fetch with retries
    std::string data;
    int attempts = 0;
    
    while (attempts < max_retries_) {
        try {
            data = http_get(source.url);
            if (!data.empty()) break;
        } catch (...) {
            // Retry on exception
        }
        attempts++;
    }
    
    if (data.empty()) {
        result.success = false;
        result.error_message = "Failed to fetch data after " + std::to_string(max_retries_) + " attempts";
        
        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_.failed_fetches++;
        return result;
    }
    
    result.bytes_downloaded = data.size();
    
    // Parse TLEs
    try {
        result.tles = parse_tle_text(data);
        result.success = !result.tles.empty();
        
        if (result.tles.empty()) {
            result.error_message = "No valid TLEs found in response";
            std::lock_guard<std::mutex> lock(stats_mutex_);
            stats_.failed_fetches++;
        } else {
            std::lock_guard<std::mutex> lock(stats_mutex_);
            stats_.successful_fetches++;
            stats_.total_tles_fetched += result.tles.size();
            stats_.last_successful_fetch = result.fetch_time;
        }
    } catch (const std::exception& e) {
        result.success = false;
        result.error_message = std::string("Parse error: ") + e.what();
        
        std::lock_guard<std::mutex> lock(stats_mutex_);
        stats_.failed_fetches++;
    }
    
    return result;
}

void TLEUpdater::fetch_async(const TLESource& source, TLEUpdateCallback callback) {
    std::thread([this, source, callback]() {
        auto result = fetch_sync(source);
        if (callback) callback(result);
    }).detach();
}

std::vector<TLEFetchResult> TLEUpdater::fetch_all_sync() {
    std::vector<TLEFetchResult> results;
    
    std::vector<TLESource> sources_copy;
    {
        std::lock_guard<std::mutex> lock(sources_mutex_);
        sources_copy = sources_;
    }
    
    for (const auto& source : sources_copy) {
        if (source.enabled) {
            results.push_back(fetch_sync(source));
        }
    }
    
    return results;
}

void TLEUpdater::fetch_all_async(TLEUpdateCallback callback) {
    std::thread([this, callback]() {
        auto results = fetch_all_sync();
        for (const auto& result : results) {
            if (callback) callback(result);
        }
    }).detach();
}

void TLEUpdater::start_auto_update(TLEUpdateCallback on_update, TLEErrorCallback on_error) {
    if (auto_update_running_.load()) return;
    
    auto_update_running_.store(true);
    update_thread_ = std::make_unique<std::thread>(
        &TLEUpdater::auto_update_loop, this, on_update, on_error
    );
}

void TLEUpdater::stop_auto_update() {
    auto_update_running_.store(false);
    if (update_thread_ && update_thread_->joinable()) {
        update_thread_->join();
    }
    update_thread_.reset();
}

void TLEUpdater::auto_update_loop(TLEUpdateCallback on_update, TLEErrorCallback on_error) {
    // Track last fetch time for each source
    std::map<std::string, std::chrono::system_clock::time_point> last_fetch;
    
    while (auto_update_running_.load()) {
        auto now = std::chrono::system_clock::now();
        
        std::vector<TLESource> sources_copy;
        {
            std::lock_guard<std::mutex> lock(sources_mutex_);
            sources_copy = sources_;
        }
        
        for (const auto& source : sources_copy) {
            if (!source.enabled) continue;
            
            // Check if it's time to refresh this source
            auto it = last_fetch.find(source.name);
            bool should_fetch = (it == last_fetch.end()) ||
                (now - it->second >= source.refresh_interval);
            
            if (should_fetch) {
                auto result = fetch_sync(source);
                last_fetch[source.name] = now;
                
                if (result.success) {
                    if (on_update) on_update(result);
                } else {
                    if (on_error) on_error(source.name, result.error_message);
                }
            }
        }
        
        // Sleep for a bit before checking again
        std::this_thread::sleep_for(std::chrono::seconds(10));
    }
}

TLEUpdater::Stats TLEUpdater::get_stats() const {
    std::lock_guard<std::mutex> lock(stats_mutex_);
    return stats_;
}

double hours_since_epoch(const TLE& tle) {
    // Get current Julian date
    auto now = std::chrono::system_clock::now();
    auto time_t_now = std::chrono::system_clock::to_time_t(now);
    struct tm* utc = gmtime(&time_t_now);
    
    // Calculate current Julian date
    int y = utc->tm_year + 1900;
    int m = utc->tm_mon + 1;
    int d = utc->tm_mday;
    double h = utc->tm_hour + utc->tm_min / 60.0 + utc->tm_sec / 3600.0;
    
    // Julian date formula
    double jd = 367.0 * y - 
                static_cast<int>(7.0 * (y + static_cast<int>((m + 9.0) / 12.0)) / 4.0) +
                static_cast<int>(275.0 * m / 9.0) + 
                d + 1721013.5 + h / 24.0;
    
    // Difference in days
    double days_diff = jd - tle.epoch_jd;
    
    return days_diff * 24.0;
}

bool is_tle_stale(const TLE& tle, double hours_threshold) {
    return hours_since_epoch(tle) > hours_threshold;
}

std::vector<TLE> merge_tle_sets(
    const std::vector<TLE>& existing,
    const std::vector<TLE>& updates
) {
    // Create map by catalog number
    std::map<int, TLE> merged;
    
    // Add existing
    for (const auto& tle : existing) {
        merged[tle.catalog_number] = tle;
    }
    
    // Update/add from updates (newer takes precedence)
    for (const auto& tle : updates) {
        auto it = merged.find(tle.catalog_number);
        if (it == merged.end() || it->second.epoch_jd < tle.epoch_jd) {
            merged[tle.catalog_number] = tle;
        }
    }
    
    // Convert back to vector
    std::vector<TLE> result;
    result.reserve(merged.size());
    for (const auto& [id, tle] : merged) {
        result.push_back(tle);
    }
    
    return result;
}

} // namespace orbitops

