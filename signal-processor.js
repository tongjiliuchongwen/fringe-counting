// 信号处理模块 - 专门处理亮度信号的噪声和平滑

class SignalProcessor {
    // 移动平均滤波器
    static movingAverage(data, windowSize = 5) {
        const smoothed = [];
        const halfWindow = Math.floor(windowSize / 2);
        
        for (let i = 0; i < data.length; i++) {
            let sum = 0;
            let count = 0;
            
            for (let j = Math.max(0, i - halfWindow); j <= Math.min(data.length - 1, i + halfWindow); j++) {
                sum += data[j];
                count++;
            }
            
            smoothed.push(sum / count);
        }
        
        return smoothed;
    }
    
    // 中值滤波器（去除脉冲噪声）
    static medianFilter(data, windowSize = 5) {
        const filtered = [];
        const halfWindow = Math.floor(windowSize / 2);
        
        for (let i = 0; i < data.length; i++) {
            const window = [];
            
            for (let j = Math.max(0, i - halfWindow); j <= Math.min(data.length - 1, i + halfWindow); j++) {
                window.push(data[j]);
            }
            
            window.sort((a, b) => a - b);
            filtered.push(window[Math.floor(window.length / 2)]);
        }
        
        return filtered;
    }
    
    // 高斯平滑
    static gaussianSmooth(data, sigma = 1.0) {
        const windowSize = Math.ceil(6 * sigma);
        const kernel = [];
        
        // 生成高斯核
        for (let i = -windowSize; i <= windowSize; i++) {
            kernel.push(Math.exp(-(i * i) / (2 * sigma * sigma)));
        }
        
        // 归一化
        const sum = kernel.reduce((a, b) => a + b, 0);
        kernel.forEach((v, i) => kernel[i] = v / sum);
        
        const smoothed = [];
        
        for (let i = 0; i < data.length; i++) {
            let value = 0;
            let weightSum = 0;
            
            for (let j = 0; j < kernel.length; j++) {
                const dataIndex = i + j - windowSize;
                if (dataIndex >= 0 && dataIndex < data.length) {
                    value += data[dataIndex] * kernel[j];
                    weightSum += kernel[j];
                }
            }
            
            smoothed.push(value / weightSum);
        }
        
        return smoothed;
    }
    
    // Savitzky-Golay滤波器（保持峰值形状的平滑）
    static savitzkyGolayFilter(data, windowSize = 7, polynomialOrder = 3) {
        const halfWindow = Math.floor(windowSize / 2);
        const filtered = [];
        
        // 简化的Savitzky-Golay实现
        for (let i = 0; i < data.length; i++) {
            let sum = 0;
            let count = 0;
            
            for (let j = Math.max(0, i - halfWindow); j <= Math.min(data.length - 1, i + halfWindow); j++) {
                const weight = 1 - Math.abs(j - i) / (halfWindow + 1);
                sum += data[j] * weight;
                count += weight;
            }
            
            filtered.push(sum / count);
        }
        
        return filtered;
    }
    
    // 信号质量评估
    static assessSignalQuality(originalData, filteredData) {
        const noise = originalData.map((val, i) => Math.abs(val - filteredData[i]));
        const avgNoise = noise.reduce((a, b) => a + b, 0) / noise.length;
        const avgSignal = filteredData.reduce((a, b) => a + b, 0) / filteredData.length;
        const snr = avgSignal / avgNoise;
        
        let smoothness = 0;
        for (let i = 1; i < filteredData.length; i++) {
            smoothness += Math.abs(filteredData[i] - filteredData[i - 1]);
        }
        smoothness /= filteredData.length - 1;
        
        const dynamicRange = Math.max(...filteredData) - Math.min(...filteredData);
        
        return {
            snr: snr,
            avgNoise: avgNoise,
            smoothness: smoothness,
            dynamicRange: dynamicRange,
            quality: snr > 10 ? 'excellent' : snr > 5 ? 'good' : snr > 2 ? 'fair' : 'poor'
        };
    }

    // 综合滤波处理
    static processSignal(data, strength = 'medium') {
        let processed = [...data];
        const steps = [];
        let medianWindow, gaussianSigma, movingWindow;
        
        switch (strength) {
            case 'light':
                medianWindow = 3; gaussianSigma = 0.8; movingWindow = 3;
                break;
            case 'strong':
                medianWindow = 7; gaussianSigma = 2.0; movingWindow = 9;
                break;
            default: // medium
                medianWindow = 5; gaussianSigma = 1.2; movingWindow = 5;
        }
        
        // 中值滤波
        processed = this.medianFilter(processed, medianWindow);
        steps.push({ name: '中值滤波', data: [...processed] });
        
        // 高斯平滑
        processed = this.gaussianSmooth(processed, gaussianSigma);
        steps.push({ name: '高斯平滑', data: [...processed] });
        
        // Savitzky-Golay
        if (strength !== 'light') {
            processed = this.savitzkyGolayFilter(processed, Math.min(7, Math.floor(data.length / 10)));
            steps.push({ name: 'Savitzky-Golay', data: [...processed] });
        }
        
        // 移动平均
        processed = this.movingAverage(processed, movingWindow);
        steps.push({ name: '移动平均', data: [...processed] });
        
        return {
            processed: processed,
            steps: steps,
            quality: this.assessSignalQuality(data, processed)
        };
    }
}

// 智能峰值检测器 (修复版 - 兼容 app.js)
class PeakDetector {
    static findPeaks(data, options = {}) {
        const N = data.length;
        if (N < 3) return [];

        // 根据 sensitivity 参数调整阈值
        let thresholdFactor;
        switch (options.sensitivity) {
            case 'low':
                thresholdFactor = 1.5;  // 高阈值，少峰值
                break;
            case 'high':
                thresholdFactor = 0.3;  // 低阈值，多峰值
                break;
            default: // medium
                thresholdFactor = 0.8;  // 中等阈值
        }

        // 一阶导数
        const firstDeriv = new Array(N).fill(0);
        for (let i = 1; i < N - 1; i++) {
            firstDeriv[i] = (data[i + 1] - data[i - 1]) / 2;
        }
        
        // 二阶导数
        const secondDeriv = new Array(N).fill(0);
        for (let i = 1; i < N - 1; i++) {
            secondDeriv[i] = data[i + 1] - 2 * data[i] + data[i - 1];
        }

        // 动态高度阈值
        const mean = data.reduce((a, b) => a + b, 0) / N;
        const variance = data.reduce((a, b) => a + (b - mean) ** 2, 0) / N;
        const stdDev = Math.sqrt(variance);
        const heightThresh = mean + thresholdFactor * stdDev;

        // 最小峰间距
        const minDist = options.minDistance || Math.max(1, Math.floor(N / 20));

        console.log(`峰值检测参数: 阈值=${heightThresh.toFixed(2)}, 最小距离=${minDist}, 敏感度=${options.sensitivity}`);

        // 候选峰值检测
        const candidates = [];
        for (let i = 1; i < N - 1; i++) {
            if (data[i] < heightThresh) continue;
            
            // 检查是否为局部最大值（使用导数方法）
            if (firstDeriv[i - 1] > 0 && firstDeriv[i + 1] < 0 && secondDeriv[i] < 0) {
                // 计算峰值突出度
                const prominence = this.calculateProminence(data, i);
                const significance = (data[i] - mean) / stdDev;
                
                candidates.push({
                    index: i,
                    value: data[i],
                    prominence: prominence,
                    significance: significance
                });
            }
        }

        console.log(`找到${candidates.length}个候选峰值`);

        // 距离过滤和选择最佳峰值
        const peaks = [];
        candidates.sort((a, b) => b.significance - a.significance); // 按显著性排序
        
        for (const candidate of candidates) {
            let tooClose = false;
            for (const existing of peaks) {
                if (Math.abs(candidate.index - existing.index) < minDist) {
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose) {
                peaks.push(candidate);
            }
            
            // 限制峰值数量
            if (peaks.length >= (options.maxPeaks || 20)) break;
        }

        // 按索引重新排序
        peaks.sort((a, b) => a.index - b.index);
        
        console.log(`最终选择${peaks.length}个峰值`);
        return peaks;
    }

    // 计算峰值突出度
    static calculateProminence(data, peakIndex) {
        const peakValue = data[peakIndex];
        let leftMin = peakValue;
        let rightMin = peakValue;
        
        // 向左搜索最低点
        for (let i = peakIndex - 1; i >= 0; i--) {
            if (data[i] < leftMin) {
                leftMin = data[i];
            }
            if (data[i] > peakValue) break; // 遇到更高峰值停止
        }
        
        // 向右搜索最低点
        for (let i = peakIndex + 1; i < data.length; i++) {
            if (data[i] < rightMin) {
                rightMin = data[i];
            }
            if (data[i] > peakValue) break; // 遇到更高峰值停止
        }
        
        return {
            value: peakValue - Math.max(leftMin, rightMin),
            leftBase: leftMin,
            rightBase: rightMin
        };
    }
}

// 导出到全局
window.SignalProcessor = SignalProcessor;
window.PeakDetector = PeakDetector;
