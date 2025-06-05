// PaddleOCR.js 包装类 - 专为小数点识别优化的完整版
class PaddleOCRWrapper {
    constructor() {
        this.isInitialized = false;
        this.model = null;
        this.debugMode = true;
        this.strategyCanvases = [];
        this.lastResults = [];
    }

    // 初始化PaddleOCR
    async initialize() {
        try {
            console.log('正在初始化PaddleOCR...');
            
            // 检查PaddleJS是否可用
            if (!window.paddle || !window.paddle.ocr) {
                throw new Error('PaddleOCR库未正确加载，请检查网络连接');
            }
            
            // 初始化OCR模型
            this.model = new window.paddle.ocr.OCR();
            await this.model.init({
                // 针对数字识别优化的配置
                modelPath: 'https://paddlejs.bj.bcebos.com/models/ocr/',
                useGPU: true,
                precision: 'fp16'
            });
            
            this.isInitialized = true;
            console.log('PaddleOCR初始化完成');
            return true;
        } catch (error) {
            console.error('PaddleOCR初始化失败:', error);
            throw new Error(`PaddleOCR初始化失败: ${error.message}`);
        }
    }

    // 多策略图像处理 - 兼容原有接口
    async processImageWithMultipleStrategies(canvas, ctx) {
        if (!this.isInitialized) {
            throw new Error('PaddleOCR未初始化');
        }

        const strategies = [
            { name: '高对比度数字', func: this.strategyDigitOptimized.bind(this) },
            { name: '基础阈值', func: this.strategy1_BasicThreshold.bind(this) },
            { name: 'OTSU自动', func: this.strategy2_OTSUThreshold.bind(this) },
            { name: '自适应阈值', func: this.strategy3_AdaptiveThreshold.bind(this) },
            { name: '小数点保护', func: this.strategyDecimalProtected.bind(this) }
        ];

        const results = [];
        this.strategyCanvases = [];
        
        for (let i = 0; i < strategies.length; i++) {
            try {
                const strategyCanvas = document.createElement('canvas');
                strategyCanvas.width = canvas.width;
                strategyCanvas.height = canvas.height;
                const strategyCtx = strategyCanvas.getContext('2d');
                
                // 复制原始图像
                strategyCtx.drawImage(canvas, 0, 0);
                
                // 应用预处理策略
                const processedData = await strategies[i].func(strategyCtx, strategyCanvas);
                
                // 保存策略画布
                this.strategyCanvases.push({
                    name: strategies[i].name,
                    canvas: strategyCanvas,
                    data: processedData
                });
                
                // 使用PaddleOCR执行识别
                const ocrResult = await this.performPaddleOCR(strategyCanvas);
                
                results.push({
                    strategy: i + 1,
                    strategyName: strategies[i].name,
                    processedData,
                    ocrResult,
                    canvas: strategyCanvas
                });
                
                console.log(`PaddleOCR策略${i + 1}(${strategies[i].name})结果:`, ocrResult);
                
            } catch (error) {
                console.error(`PaddleOCR策略${i + 1}失败:`, error);
                results.push({
                    strategy: i + 1,
                    strategyName: strategies[i].name,
                    processedData: null,
                    ocrResult: { text: '', confidence: 0 },
                    error: error.message
                });
            }
        }
        
        this.lastResults = results;
        this.debugResults(results);
        return this.selectBestResult(results);
    }

    // PaddleOCR专用数字识别策略
    async strategyDigitOptimized(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 1. 增强对比度
        this.enhanceContrast(data);
        
        // 2. 数字优化的二值化
        const threshold = this.calculateDigitThreshold(data);
        let whitePixels = 0, blackPixels = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const value = brightness > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
            
            if (value === 255) whitePixels++;
            else blackPixels++;
        }
        
        // 3. 小数点保护处理
        this.protectDecimalPoints(data, canvas.width, canvas.height);
        
        ctx.putImageData(imageData, 0, 0);
        return { 
            strategy: '数字优化', 
            threshold,
            whitePixels,
            blackPixels,
            optimized: true
        };
    }

    // 小数点保护策略
    async strategyDecimalProtected(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        // 先进行基础二值化
        const basicResult = this.strategy1_BasicThreshold(ctx, canvas);
        
        // 检测可能的小数点位置
        const dotCandidates = this.detectDecimalDots(data, width, height);
        
        // 对小数点区域进行特殊处理
        dotCandidates.forEach(dot => {
            this.enhanceDecimalDot(data, width, height, dot.x, dot.y);
        });
        
        ctx.putImageData(imageData, 0, 0);
        return { 
            strategy: '小数点保护',
            threshold: basicResult.threshold,
            dotCandidates: dotCandidates.length,
            whitePixels: basicResult.whitePixels,
            blackPixels: basicResult.blackPixels
        };
    }

    // PaddleOCR识别执行
    async performPaddleOCR(canvas) {
        try {
            // 转换canvas为ImageData
            const ctx = canvas.getContext('2d');
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            
            // PaddleOCR识别
            const result = await this.model.recognize(imageData, {
                // 数字识别优化参数
                det: true,
                rec: true,
                cls: false,
                textScore: 0.5,
                textNmsThresh: 0.4
            });
            
            // 处理结果
            let text = '';
            let confidence = 0;
            
            if (result && result.length > 0) {
                // 筛选数字相关的识别结果
                const digitResults = result.filter(item => 
                    item.text && /[\d.]/.test(item.text)
                );
                
                if (digitResults.length > 0) {
                    // 合并数字文本
                    text = digitResults
                        .sort((a, b) => a.bbox[0][0] - b.bbox[0][0]) // 按x坐标排序
                        .map(item => item.text.replace(/[^\d.]/g, ''))
                        .join('');
                    
                    // 计算置信度
                    const scores = digitResults.map(item => item.score || 0);
                    confidence = scores.reduce((a, b) => a + b, 0) / scores.length * 100;
                }
            }
            
            return {
                text: text.trim(),
                confidence: confidence,
                rawResult: result
            };
            
        } catch (error) {
            console.error('PaddleOCR识别失败:', error);
            return {
                text: '',
                confidence: 0,
                error: error.message
            };
        }
    }

    // 增强对比度
    enhanceContrast(data) {
        let min = 255, max = 0;
        
        // 寻找亮度范围
        for (let i = 0; i < data.length; i += 4) {
            const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            min = Math.min(min, brightness);
            max = Math.max(max, brightness);
        }
        
        const range = max - min;
        if (range > 0) {
            for (let i = 0; i < data.length; i += 4) {
                const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                const enhanced = ((brightness - min) / range) * 255;
                data[i] = data[i + 1] = data[i + 2] = enhanced;
            }
        }
    }

    // 计算数字优化阈值
    calculateDigitThreshold(data) {
        const histogram = new Array(256).fill(0);
        
        // 计算直方图
        for (let i = 0; i < data.length; i += 4) {
            const brightness = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[brightness]++;
        }
        
        // 寻找双峰
        let peak1 = 0, peak2 = 0;
        let maxCount1 = 0, maxCount2 = 0;
        
        // 前半部分寻找第一个峰值（暗色）
        for (let i = 0; i < 128; i++) {
            if (histogram[i] > maxCount1) {
                maxCount1 = histogram[i];
                peak1 = i;
            }
        }
        
        // 后半部分寻找第二个峰值（亮色）
        for (let i = 128; i < 256; i++) {
            if (histogram[i] > maxCount2) {
                maxCount2 = histogram[i];
                peak2 = i;
            }
        }
        
        // 阈值设为两峰之间
        return Math.round((peak1 + peak2) / 2);
    }

    // 检测小数点候选位置
    detectDecimalDots(data, width, height) {
        const candidates = [];
        const dotSize = Math.min(width, height) / 10; // 小数点相对大小
        
        for (let y = 0; y < height - dotSize; y++) {
            for (let x = 0; x < width - dotSize; x++) {
                if (this.isDotLikeRegion(data, width, x, y, dotSize)) {
                    candidates.push({ x, y, size: dotSize });
                }
            }
        }
        
        return candidates;
    }

    // 判断是否为点状区域
    isDotLikeRegion(data, width, x, y, size) {
        let darkPixels = 0;
        let totalPixels = 0;
        
        for (let dy = 0; dy < size; dy++) {
            for (let dx = 0; dx < size; dx++) {
                const idx = ((y + dy) * width + (x + dx)) * 4;
                if (idx < data.length) {
                    const brightness = data[idx]; // 假设已二值化
                    if (brightness < 128) darkPixels++;
                    totalPixels++;
                }
            }
        }
        
        const ratio = darkPixels / totalPixels;
        return ratio > 0.3 && ratio < 0.7; // 点状特征
    }

    // 保护小数点
    protectDecimalPoints(data, width, height) {
        // 简化实现：对可能的小数点区域进行增强
        const dotCandidates = this.detectDecimalDots(data, width, height);
        
        dotCandidates.forEach(dot => {
            this.enhanceDecimalDot(data, width, height, dot.x, dot.y);
        });
    }

    // 增强小数点
    enhanceDecimalDot(data, width, height, x, y) {
        const radius = 3;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const idx = (ny * width + nx) * 4;
                    // 适度增强对比度
                    data[idx] = data[idx + 1] = data[idx + 2] = data[idx] > 128 ? 255 : 0;
                }
            }
        }
    }

    // 复用原有的策略方法（从enhanced-ocr.js）
    strategy1_BasicThreshold(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        let totalBrightness = 0;
        let pixelCount = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            totalBrightness += brightness;
            pixelCount++;
        }
        
        const avgBrightness = totalBrightness / pixelCount;
        const threshold = Math.max(140, Math.min(180, avgBrightness - 10));
        
        let whitePixels = 0, blackPixels = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const value = brightness > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
            
            if (value === 255) whitePixels++;
            else blackPixels++;
        }
        
        ctx.putImageData(imageData, 0, 0);
        return { 
            strategy: '基础阈值', 
            threshold, 
            avgBrightness: avgBrightness.toFixed(1),
            whitePixels,
            blackPixels
        };
    }

    strategy2_OTSUThreshold(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 计算灰度直方图
        const histogram = new Array(256).fill(0);
        const grayData = [];
        
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[gray]++;
            grayData.push(gray);
        }
        
        // OTSU阈值计算
        const total = grayData.length;
        let sum = 0;
        for (let i = 0; i < 256; i++) sum += i * histogram[i];
        
        let sumB = 0;
        let wB = 0;
        let wF = 0;
        let max = 0;
        let threshold = 0;
        
        for (let i = 0; i < 256; i++) {
            wB += histogram[i];
            if (wB === 0) continue;
            wF = total - wB;
            if (wF === 0) break;
            
            sumB += i * histogram[i];
            const mB = sumB / wB;
            const mF = (sum - sumB) / wF;
            const between = wB * wF * (mB - mF) * (mB - mF);
            
            if (between > max) {
                max = between;
                threshold = i;
            }
        }
        
        let whitePixels = 0, blackPixels = 0;
        
        // 应用OTSU阈值
        let idx = 0;
        for (let i = 0; i < data.length; i += 4) {
            const value = grayData[idx++] > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
            
            if (value === 255) whitePixels++;
            else blackPixels++;
        }
        
        ctx.putImageData(imageData, 0, 0);
        return { 
            strategy: 'OTSU自动', 
            threshold,
            variance: max.toFixed(2),
            whitePixels,
            blackPixels
        };
    }

    strategy3_AdaptiveThreshold(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        const windowSize = Math.min(width, height) > 20 ? 11 : 7;
        
        // 创建灰度图像
        const grayImage = new Array(height).fill(null).map(() => new Array(width).fill(0));
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                grayImage[y][x] = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
            }
        }
        
        let whitePixels = 0, blackPixels = 0;
        
        // 自适应阈值处理
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const gray = grayImage[y][x];
                
                // 计算局部平均值
                const x1 = Math.max(0, x - windowSize);
                const y1 = Math.max(0, y - windowSize);
                const x2 = Math.min(width - 1, x + windowSize);
                const y2 = Math.min(height - 1, y + windowSize);
                
                let sum = 0;
                let count = 0;
                for (let ly = y1; ly <= y2; ly++) {
                    for (let lx = x1; lx <= x2; lx++) {
                        sum += grayImage[ly][lx];
                        count++;
                    }
                }
                
                const localMean = sum / count;
                const threshold = localMean - 8; // 可调参数
                
                const value = gray > threshold ? 255 : 0;
                data[idx] = data[idx + 1] = data[idx + 2] = value;
                data[idx + 3] = 255;
                
                if (value === 255) whitePixels++;
                else blackPixels++;
            }
        }
        
        ctx.putImageData(imageData, 0, 0);
        return { 
            strategy: '自适应阈值', 
            windowSize,
            whitePixels,
            blackPixels
        };
    }

    // 获取策略预览画布
    getStrategyCanvases() {
        return this.strategyCanvases;
    }

    // 结果选择和分析（适配PaddleOCR）
    selectBestResult(results) {
        const validResults = results.filter(r => r.ocrResult && r.ocrResult.text);
        
        if (validResults.length === 0) {
            return { 
                value: NaN, 
                rawText: '', 
                confidence: 0, 
                strategy: 'none',
                allResults: results
            };
        }
        
        // 分析结果
        const analyzedResults = validResults.map(result => {
            const analysis = this.analyzeOCRResult(result.ocrResult.text);
            return {
                ...result,
                analysis,
                score: this.calculateResultScore(analysis, result.ocrResult.confidence)
            };
        });
        
        // 排序并选择最佳结果
        analyzedResults.sort((a, b) => b.score - a.score);
        
        // 优先选择包含小数点的结果
        const bestWithDecimal = analyzedResults.find(r => 
            r.analysis.hasDecimalPoint && 
            r.analysis.isValidNumber && 
            r.score > 0.3
        );
        
        if (bestWithDecimal) {
            return this.formatFinalResult(bestWithDecimal, results);
        }
        
        const bestValid = analyzedResults.find(r => r.analysis.isValidNumber && r.score > 0.2);
        return this.formatFinalResult(bestValid || analyzedResults[0], results);
    }

    // 分析OCR结果（增强小数点处理）
    analyzeOCRResult(text) {
        const cleanText = text.replace(/[^\d.\s]/g, '').replace(/\s+/g, '');
        const hasDecimalPoint = cleanText.includes('.');
        const decimalCount = (cleanText.match(/\./g) || []).length;
        
        let parsedNumber = NaN;
        let isValidNumber = false;
        
        if (cleanText.length > 0) {
            let numberText = cleanText;
            
            // 处理多个小数点
            if (decimalCount > 1) {
                const firstDotIndex = cleanText.indexOf('.');
                const beforeDot = cleanText.substring(0, firstDotIndex + 1);
                const afterDot = cleanText.substring(firstDotIndex + 1).replace(/\./g, '');
                numberText = beforeDot + afterDot;
            }
            
            // 清理前导零
            numberText = numberText.replace(/^0+(?!\.)/, '') || '0';
            
            const parsed = parseFloat(numberText);
            if (!isNaN(parsed) && isFinite(parsed)) {
                parsedNumber = parsed;
                isValidNumber = true;
            }
        }
        
        return {
            originalText: text,
            cleanText,
            hasDecimalPoint,
            decimalCount,
            parsedNumber,
            isValidNumber,
            isReasonableRange: !isNaN(parsedNumber) && parsedNumber >= 0 && parsedNumber <= 10000,
            isDecimalFormat: hasDecimalPoint && cleanText.match(/^\d+\.\d{1,3}$/),
            length: cleanText.length
        };
    }

    // 计算结果评分（针对PaddleOCR优化）
    calculateResultScore(analysis, confidence) {
        let score = 0;
        
        // OCR置信度权重更高（PaddleOCR通常更准确）
        score += (confidence || 0) / 100 * 0.35;
        
        // 有效数字
        if (analysis.isValidNumber) score += 0.30;
        
        // 合理范围
        if (analysis.isReasonableRange) score += 0.15;
        
        // 小数点格式奖励（重点优化）
        if (analysis.isDecimalFormat) score += 0.30;
        else if (analysis.hasDecimalPoint && analysis.decimalCount === 1) score += 0.20;
        
        // 长度合理性
        if (analysis.length >= 1 && analysis.length <= 8) score += 0.10;
        
        // 惩罚项
        if (analysis.decimalCount > 1) score -= 0.15;
        if (analysis.length === 0) score -= 0.5;
        
        return Math.max(0, Math.min(1, score));
    }

    // 格式化最终结果
    formatFinalResult(bestResult, allResults) {
        const analysis = bestResult.analysis;
        return {
            value: analysis.isValidNumber ? analysis.parsedNumber : NaN,
            rawText: analysis.originalText,
            cleanText: analysis.cleanText,
            confidence: bestResult.ocrResult.confidence || 0,
            strategy: bestResult.strategy,
            strategyName: bestResult.strategyName,
            score: bestResult.score,
            hasDecimalPoint: analysis.hasDecimalPoint,
            engine: 'PaddleOCR',
            allResults: allResults.map(r => ({
                strategy: r.strategy,
                strategyName: r.strategyName,
                text: r.ocrResult?.text || '',
                confidence: r.ocrResult?.confidence || 0,
                error: r.error
            }))
        };
    }

    // 调试输出
    debugResults(results) {
        if (!this.debugMode) return;
        
        console.log('=== PaddleOCR多策略分析结果 ===');
        results.forEach((result) => {
            console.log(`策略${result.strategy}(${result.strategyName}):`, {
                原始文本: result.ocrResult?.text || 'N/A',
                置信度: result.ocrResult?.confidence || 0,
                错误: result.error || '无'
            });
        });
    }

    // 清理资源
    async cleanup() {
        if (this.model) {
            try {
                await this.model.dispose();
            } catch (error) {
                console.warn('PaddleOCR清理警告:', error);
            }
            this.model = null;
        }
        this.isInitialized = false;
    }
}

// 导出类
window.PaddleOCRWrapper = PaddleOCRWrapper;
