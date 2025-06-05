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
    
    // 自适应阈值计算
    static calculateAdaptiveThreshold(data, method = 'otsu') {
        if (method === 'otsu') {
            return this.otsuThreshold(data);
        } else if (method === 'statistical') {
            const mean = data.reduce((a, b) => a + b) / data.length;
            const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
            const stdDev = Math.sqrt(variance);
            return mean + 1.5 * stdDev;
        } else if (method === 'percentile') {
            const sorted = [...data].sort((a, b) => a - b);
            return sorted[Math.floor(sorted.length * 0.85)]; // 85th percentile
        }
    }
    
    // OTSU自动阈值
    static otsuThreshold(data) {
        const min = Math.min(...data);
        const max = Math.max(...data);
        const range = max - min;
        const step = range / 256;
        
        let bestThreshold = min;
        let maxVariance = 0;
        
        for (let t = min; t <= max; t += step) {
            const group1 = data.filter(v => v <= t);
            const group2 = data.filter(v => v > t);
            
            if (group1.length === 0 || group2.length === 0) continue;
            
            const w1 = group1.length / data.length;
            const w2 = group2.length / data.length;
            
            const mean1 = group1.reduce((a, b) => a + b) / group1.length;
            const mean2 = group2.reduce((a, b) => a + b) / group2.length;
            
            const betweenVariance = w1 * w2 * Math.pow(mean1 - mean2, 2);
            
            if (betweenVariance > maxVariance) {
                maxVariance = betweenVariance;
                bestThreshold = t;
            }
        }
        
        return bestThreshold;
    }
    
    // 信号质量评估
    static assessSignalQuality(originalData, filteredData) {
        // 计算信噪比
        const noise = originalData.map((val, i) => Math.abs(val - filteredData[i]));
        const avgNoise = noise.reduce((a, b) => a + b) / noise.length;
        const avgSignal = filteredData.reduce((a, b) => a + b) / filteredData.length;
        const snr = avgSignal / avgNoise;
        
        // 计算平滑度
        let smoothness = 0;
        for (let i = 1; i < filteredData.length; i++) {
            smoothness += Math.abs(filteredData[i] - filteredData[i-1]);
        }
        smoothness /= filteredData.length - 1;
        
        // 计算动态范围
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
        
        // 根据强度选择参数
        let medianWindow, gaussianSigma, movingWindow;
        
        switch (strength) {
            case 'light':
                medianWindow = 3;
                gaussianSigma = 0.8;
                movingWindow = 3;
                break;
            case 'strong':
                medianWindow = 7;
                gaussianSigma = 2.0;
                movingWindow = 9;
                break;
            default: // medium
                medianWindow = 5;
                gaussianSigma = 1.2;
                movingWindow = 5;
        }
        
        // 第一步：中值滤波去除脉冲噪声
        processed = this.medianFilter(processed, medianWindow);
        steps.push({ name: '中值滤波', data: [...processed] });
        
        // 第二步：高斯平滑去除高频噪声
        processed = this.gaussianSmooth(processed, gaussianSigma);
        steps.push({ name: '高斯平滑', data: [...processed] });
        
        // 第三步：Savitzky-Golay滤波保持峰值形状
        if (strength !== 'light') {
            processed = this.savitzkyGolayFilter(processed, Math.min(7, Math.floor(data.length / 10)));
            steps.push({ name: 'Savitzky-Golay', data: [...processed] });
        }
        
        // 第四步：轻度移动平均最终平滑
        processed = this.movingAverage(processed, movingWindow);
        steps.push({ name: '移动平均', data: [...processed] });
        
        return {
            processed: processed,
            steps: steps,
            quality: this.assessSignalQuality(data, processed)
        };
    }
}

// 智能峰值检测器
class PeakDetector {
    static findPeaks(data, options = {}) {
        const {
            minHeight = null,
            minProminence = null,
            minDistance = 1,
            sensitivity = 'medium'
        } = options;
        
        // 计算基本统计量
        const mean = data.reduce((a, b) => a + b) / data.length;
        const variance = data.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / data.length;
        const stdDev = Math.sqrt(variance);
        const minVal = Math.min(...data);
        const maxVal = Math.max(...data);
        const dynamicRange = maxVal - minVal;
        
        // 根据敏感度设置参数
        let heightThreshold, prominenceThreshold, distanceThreshold;
        
        switch (sensitivity) {
            case 'low':
                heightThreshold = minHeight || (mean + 1.5 * stdDev);
                prominenceThreshold = minProminence || (stdDev * 0.8);
                distanceThreshold = Math.max(minDistance, Math.floor(data.length / 15));
                break;
            case 'high':
                heightThreshold = minHeight || (mean + 0.5 * stdDev);
                prominenceThreshold = minProminence || (stdDev * 0.3);
                distanceThreshold = Math.max(minDistance, Math.floor(data.length / 30));
                break;
            default: // medium
                heightThreshold = minHeight || (mean + stdDev);
                prominenceThreshold = minProminence || (stdDev * 0.5);
                distanceThreshold = Math.max(minDistance, Math.floor(data.length / 20));
        }
        
        console.log(`峰值检测参数: 高度阈值=${heightThreshold.toFixed(2)}, 突出度阈值=${prominenceThreshold.toFixed(2)}, 距离阈值=${distanceThreshold}`);
        
        // 候选峰值检测
        const candidates = [];
        
        for (let i = distanceThreshold; i < data.length - distanceThreshold; i++) {
            const current = data[i];
            
            // 高度过滤
            if (current < heightThreshold) continue;
            
            // 局部最大值检测
            let isLocalMax = true;
            for (let j = i - distanceThreshold; j <= i + distanceThreshold; j++) {
                if (j !== i && data[j] >= current) {
                    isLocalMax = false;
                    break;
                }
            }
            
            if (!isLocalMax) continue;
            
            // 计算峰值突出度
            const prominence = this.calculateProminence(data, i);
            
            if (prominence >= prominenceThreshold) {
                candidates.push({
                    index: i,
                    value: current,
                    prominence: prominence,
                    significance: (current - mean) / stdDev,
                    leftBase: prominence.leftBase,
                    rightBase: prominence.rightBase
                });
            }
        }
        
        // 峰值后处理
        return this.postProcessPeaks(candidates, distanceThreshold);
    }
    
    static calculateProminence(data, peakIndex) {
        const peakValue = data[peakIndex];
        let leftMin = peakValue;
        let rightMin = peakValue;
        let leftBase = peakIndex;
        let rightBase = peakIndex;
        
        // 向左搜索最低点
        for (let i = peakIndex - 1; i >= 0; i--) {
            if (data[i] < leftMin) {
                leftMin = data[i];
                leftBase = i;
            }
            // 如果遇到更高的峰值，停止搜索
            if (data[i] > peakValue) break;
        }
        
        // 向右搜索最低点
        for (let i = peakIndex + 1; i < data.length; i++) {
            if (data[i] < rightMin) {
                rightMin = data[i];
                rightBase = i;
            }
            // 如果遇到更高的峰值，停止搜索
            if (data[i] > peakValue) break;
        }
        
        const prominence = peakValue - Math.max(leftMin, rightMin);
        return {
            value: prominence,
            leftBase: leftBase,
            rightBase: rightBase
        };
    }
    
    static postProcessPeaks(candidates, minDistance) {
        // 按显著性排序
        candidates.sort((a, b) => b.significance - a.significance);
        
        // 应用距离约束
        const finalPeaks = [];
        for (const candidate of candidates) {
            let tooClose = false;
            for (const existing of finalPeaks) {
                if (Math.abs(candidate.index - existing.index) < minDistance) {
                    tooClose = true;
                    break;
                }
            }
            
            if (!tooClose) {
                finalPeaks.push(candidate);
            }
            
            // 限制峰值数量
            if (finalPeaks.length >= 30) break;
        }
        
        // 按索引重新排序
        return finalPeaks.sort((a, b) => a.index - b.index);
    }
}

// 导出类
window.SignalProcessor = SignalProcessor;
window.PeakDetector = PeakDetector;
