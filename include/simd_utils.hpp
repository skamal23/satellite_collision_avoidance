#pragma once

#include <cstddef>

// Detect SIMD support
#if defined(__AVX2__)
    #define ORBITOPS_AVX2 1
    #include <immintrin.h>
#elif defined(__SSE4_1__)
    #define ORBITOPS_SSE4 1
    #include <smmintrin.h>
#endif

#if defined(__ARM_NEON) || defined(__aarch64__)
    #define ORBITOPS_NEON 1
    #include <arm_neon.h>
#endif

namespace orbitops {
namespace simd {

// SIMD-accelerated distance squared calculation
// Computes (x1-x2)^2 + (y1-y2)^2 + (z1-z2)^2 for multiple pairs

#ifdef ORBITOPS_NEON

// ARM NEON: Process 2 doubles at a time
inline void distance_squared_batch(
    const double* __restrict x1, const double* __restrict y1, const double* __restrict z1,
    const double* __restrict x2, const double* __restrict y2, const double* __restrict z2,
    double* __restrict dist_sq,
    size_t count
) {
    size_t i = 0;
    
    // Process 2 at a time with NEON
    for (; i + 1 < count; i += 2) {
        float64x2_t vx1 = vld1q_f64(x1 + i);
        float64x2_t vy1 = vld1q_f64(y1 + i);
        float64x2_t vz1 = vld1q_f64(z1 + i);
        float64x2_t vx2 = vld1q_f64(x2 + i);
        float64x2_t vy2 = vld1q_f64(y2 + i);
        float64x2_t vz2 = vld1q_f64(z2 + i);
        
        float64x2_t dx = vsubq_f64(vx1, vx2);
        float64x2_t dy = vsubq_f64(vy1, vy2);
        float64x2_t dz = vsubq_f64(vz1, vz2);
        
        float64x2_t dx2 = vmulq_f64(dx, dx);
        float64x2_t dy2 = vmulq_f64(dy, dy);
        float64x2_t dz2 = vmulq_f64(dz, dz);
        
        float64x2_t sum = vaddq_f64(vaddq_f64(dx2, dy2), dz2);
        vst1q_f64(dist_sq + i, sum);
    }
    
    // Remainder
    for (; i < count; ++i) {
        double dx = x1[i] - x2[i];
        double dy = y1[i] - y2[i];
        double dz = z1[i] - z2[i];
        dist_sq[i] = dx*dx + dy*dy + dz*dz;
    }
}

#elif defined(ORBITOPS_AVX2)

// AVX2: Process 4 doubles at a time
inline void distance_squared_batch(
    const double* __restrict x1, const double* __restrict y1, const double* __restrict z1,
    const double* __restrict x2, const double* __restrict y2, const double* __restrict z2,
    double* __restrict dist_sq,
    size_t count
) {
    size_t i = 0;
    
    for (; i + 3 < count; i += 4) {
        __m256d vx1 = _mm256_loadu_pd(x1 + i);
        __m256d vy1 = _mm256_loadu_pd(y1 + i);
        __m256d vz1 = _mm256_loadu_pd(z1 + i);
        __m256d vx2 = _mm256_loadu_pd(x2 + i);
        __m256d vy2 = _mm256_loadu_pd(y2 + i);
        __m256d vz2 = _mm256_loadu_pd(z2 + i);
        
        __m256d dx = _mm256_sub_pd(vx1, vx2);
        __m256d dy = _mm256_sub_pd(vy1, vy2);
        __m256d dz = _mm256_sub_pd(vz1, vz2);
        
        __m256d dx2 = _mm256_mul_pd(dx, dx);
        __m256d dy2 = _mm256_mul_pd(dy, dy);
        __m256d dz2 = _mm256_mul_pd(dz, dz);
        
        __m256d sum = _mm256_add_pd(_mm256_add_pd(dx2, dy2), dz2);
        _mm256_storeu_pd(dist_sq + i, sum);
    }
    
    // Remainder
    for (; i < count; ++i) {
        double dx = x1[i] - x2[i];
        double dy = y1[i] - y2[i];
        double dz = z1[i] - z2[i];
        dist_sq[i] = dx*dx + dy*dy + dz*dz;
    }
}

#else

// Scalar fallback
inline void distance_squared_batch(
    const double* __restrict x1, const double* __restrict y1, const double* __restrict z1,
    const double* __restrict x2, const double* __restrict y2, const double* __restrict z2,
    double* __restrict dist_sq,
    size_t count
) {
    for (size_t i = 0; i < count; ++i) {
        double dx = x1[i] - x2[i];
        double dy = y1[i] - y2[i];
        double dz = z1[i] - z2[i];
        dist_sq[i] = dx*dx + dy*dy + dz*dz;
    }
}

#endif

// Single distance squared (inlined for hot paths)
inline double distance_squared(
    double x1, double y1, double z1,
    double x2, double y2, double z2
) {
    double dx = x1 - x2;
    double dy = y1 - y2;
    double dz = z1 - z2;
    return dx*dx + dy*dy + dz*dz;
}

} // namespace simd
} // namespace orbitops

