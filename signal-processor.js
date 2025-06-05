// 信号处理模块 - 简化版本，专门处理亮度信号

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
    
    // 信号质量评估
    static assessSignalQuality(originalData, filteredData) {
        const noise = originalData.map((val, i) => Math.abs(val - filteredData[i]));
        const avgNoise = noise.reduce((a, b) => a + b) / noise.length;
        const avgSignal = filteredData.reduce((a, b) => a + b) / filteredData.length;
        const snr = avgSignal / avgNoise;
        
        let smoothness = 0;
        for (let i = 1; i < filteredData.length; i++) {
            smoothness += Math.abs(filteredData[i] - filteredData[i-1]);
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
        
        // 第三步：轻度移动平均最终平滑
        processed = this.movingAverage(processed, movingWindow);
        steps.push({ name: '移动平均', data: [...processed] });
        
        return {
            processed: processed,
            steps: steps,
            quality: this.assessSignalQuality(data, processed)
        };
    }
}

// 导出类
window.SignalProcessor = SignalProcessor;
