// 增强版OCR处理模块 - 专门解决小数点识别问题

class EnhancedOCR {
    constructor(ocrWorker) {
        this.ocrWorker = ocrWorker;
        this.debugMode = true;
        this.lastResults = [];
        this.strategyCanvases = [];
    }

    // 多重预处理策略
    async processImageWithMultipleStrategies(canvas, ctx) {
        const strategies = [
            { name: '基础阈值', func: this.strategy1_BasicThreshold.bind(this) },
            { name: 'OTSU自动', func: this.strategy2_OTSUThreshold.bind(this) },
            { name: '自适应阈值', func: this.strategy3_AdaptiveThreshold.bind(this) },
            { name: '形态学增强', func: this.strategy4_MorphologyEnhanced.bind(this) },
            { name: '对比度增强', func: this.strategy5_ContrastEnhanced.bind(this) }
        ];

        const results = [];
        this.strategyCanvases = [];
        
        for (let i = 0; i < strategies.length; i++) {
            try {
                // 为每个策略创建独立的画布
                const strategyCanvas = document.createElement('canvas');
                strategyCanvas.width = canvas.width;
                strategyCanvas.height = canvas.height;
                const strategyCtx = strategyCanvas.getContext('2d');
                
                // 复制原始图像
                strategyCtx.drawImage(canvas, 0, 0);
                
                // 应用预处理策略
                const processedData = await strategies[i].func(strategyCtx, strategyCanvas);
                
                // 保存策略画布用于预览
                this.strategyCanvases.push({
                    name: strategies[i].name,
                    canvas: strategyCanvas,
                    data: processedData
                });
                
                // 执行OCR
                const ocrResult = await this.performOCRWithOptimizedParams(strategyCanvas, i);
                
                results.push({
                    strategy: i + 1,
                    strategyName: strategies[i].name,
                    processedData,
                    ocrResult,
                    canvas: strategyCanvas
                });
                
                console.log(`策略${i + 1}(${strategies[i].name})结果:`, ocrResult);
                
            } catch (error) {
                console.error(`策略${i + 1}失败:`, error);
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
        
        // 分析和选择最佳结果
        return this.selectBestResult(results);
    }

    // 获取策略预览画布
    getStrategyCanvases() {
        return this.strategyCanvases;
    }

    // 策略1: 基础阈值
    strategy1_BasicThreshold(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 计算自适应阈值
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

    // 策略2: OTSU自动阈值
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

    // 策略3: 自适应阈值
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

    // 策略4: 形态学增强（保护小数点）
    strategy4_MorphologyEnhanced(ctx, canvas) {
        // 先应用基础二值化
        const basicResult = this.strategy1_BasicThreshold(ctx, canvas);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        // 创建小的结构元素（保护小数点）
        const structuringElement = [
            [0, 1, 0],
            [1, 1, 1],
            [0, 1, 0]
        ];
        
        // 闭运算（先膨胀后腐蚀）- 连接断开的部分
        const dilated = this.morphologicalOperation(data, width, height, structuringElement, 'dilate');
        const closed = this.morphologicalOperation(dilated, width, height, structuringElement, 'erode');
        
        let whitePixels = 0, blackPixels = 0;
        
        // 将结果写回
        for (let i = 0; i < data.length; i += 4) {
            const value = closed[i / 4];
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
            
            if (value === 255) whitePixels++;
            else blackPixels++;
        }
        
        ctx.putImageData(imageData, 0, 0);
        return { 
            strategy: '形态学增强', 
            operation: '闭运算',
            baseThreshold: basicResult.threshold,
            whitePixels,
            blackPixels
        };
    }

    // 策略5: 对比度增强
    strategy5_ContrastEnhanced(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 第一步：对比度拉伸
        let minVal = 255, maxVal = 0;
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            minVal = Math.min(minVal, gray);
            maxVal = Math.max(maxVal, gray);
        }
        
        const range = maxVal - minVal;
        if (range > 0) {
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                const stretched = ((gray - minVal) / range) * 255;
                data[i] = data[i + 1] = data[i + 2] = stretched;
            }
        }
        
        // 第二步：锐化
        const kernel = [
            [0, -1, 0],
            [-1, 5, -1],
            [0, -1, 0]
        ];
        
        const originalData = new Uint8ClampedArray(data);
        const width = canvas.width;
        const height = canvas.height;
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        sum += originalData[idx] * kernel[ky + 1][kx + 1];
                    }
                }
                const idx = (y * width + x) * 4;
                data[idx] = data[idx + 1] = data[idx + 2] = Math.max(0, Math.min(255, sum));
            }
        }
        
        // 第三步：应用阈值
        const threshold = 128;
        let whitePixels = 0, blackPixels = 0;
        
        for (let i = 0; i < data.length; i += 4) {
            const value = data[i] > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
            
            if (value === 255) whitePixels++;
            else blackPixels++;
        }
        
        ctx.putImageData(imageData, 0, 0);
        return { 
            strategy: '对比度增强',
            originalRange: `${minVal.toFixed(1)}-${maxVal.toFixed(1)}`,
            whitePixels,
            blackPixels
        };
    }

    // 形态学操作辅助函数
    morphologicalOperation(data, width, height, structElement, operation) {
        const result = new Array(width * height);
        const seHeight = structElement.length;
        const seWidth = structElement[0].length;
        const seOffsetY = Math.floor(seHeight / 2);
        const seOffsetX = Math.floor(seWidth / 2);
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                let newValue = operation === 'dilate' ? 0 : 255;
                
                for (let sy = 0; sy < seHeight; sy++) {
                    for (let sx = 0; sx < seWidth; sx++) {
                        if (structElement[sy][sx] === 0) continue;
                        
                        const ny = y + sy - seOffsetY;
                        const nx = x + sx - seOffsetX;
                        
                        if (ny >= 0 && ny < height && nx >= 0 && nx < width) {
                            const pixelIndex = ny * width + nx;
                            const pixelValue = data[pixelIndex * 4]; // R通道值
                            
                            if (operation === 'dilate') {
                                newValue = Math.max(newValue, pixelValue);
                            } else { // erode
                                newValue = Math.min(newValue, pixelValue);
                            }
                        }
                    }
                }
                
                result[y * width + x] = newValue;
            }
        }
        
        return result;
    }

    // 使用优化参数执行OCR
    async performOCRWithOptimizedParams(canvas, strategyIndex) {
        const ocrConfigs = [
            { psm: '8', oem: '2', whitelist: '0123456789.' },      // 单词模式，LSTM
            { psm: '7', oem: '1', whitelist: '0123456789.' },      // 单行文本，传统
            { psm: '6', oem: '2', whitelist: '0123456789.' },      // 块模式，LSTM
            { psm: '13', oem: '2', whitelist: '0123456789.' },     // 原始行，LSTM
            { psm: '10', oem: '1', whitelist: '0123456789.' }      // 字符模式，传统
        ];
        
        const config = ocrConfigs[strategyIndex] || ocrConfigs[0];
        
        try {
            await this.ocrWorker.setParameters({
                tessedit_char_whitelist: config.whitelist,
                tessedit_pageseg_mode: config.psm,
                tessedit_ocr_engine_mode: config.oem,
            });
            
            const { data } = await this.ocrWorker.recognize(canvas);
            return {
                text: data.text.trim(),
                confidence: data.confidence || 0,
                config: config
            };
        } catch (error) {
            console.error('OCR识别失败:', error);
            return {
                text: '',
                confidence: 0,
                config: config,
                error: error.message
            };
        }
    }

    // 选择最佳结果
    selectBestResult(results) {
        // 过滤有效结果
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
        
        // 分析所有结果
        const analyzedResults = validResults.map(result => {
            const analysis = this.analyzeOCRResult(result.ocrResult.text);
            return {
                ...result,
                analysis,
                score: this.calculateResultScore(analysis, result.ocrResult.confidence)
            };
        });
        
        // 按分数排序
        analyzedResults.sort((a, b) => b.score - a.score);
        
        // 优先选择包含小数点且分数合理的结果
        const bestWithDecimal = analyzedResults.find(r => 
            r.analysis.hasDecimalPoint && 
            r.analysis.isValidNumber && 
            r.score > 0.3
        );
        
        if (bestWithDecimal) {
            return this.formatFinalResult(bestWithDecimal, results);
        }
        
        // 否则选择分数最高的有效数字
        const bestValid = analyzedResults.find(r => r.analysis.isValidNumber && r.score > 0.2);
        if (bestValid) {
            return this.formatFinalResult(bestValid, results);
        }
        
        // 最后选择分数最高的
        return this.formatFinalResult(analyzedResults[0], results);
    }

    // 分析OCR结果
    analyzeOCRResult(text) {
        // 清理文本 - 更加宽松的清理
        const cleanText = text.replace(/[^\d.\s]/g, '').replace(/\s+/g, '');
        
        // 检查小数点
        const hasDecimalPoint = cleanText.includes('.');
        const decimalCount = (cleanText.match(/\./g) || []).length;
        
        // 尝试解析数字
        let parsedNumber = NaN;
        let isValidNumber = false;
        
        if (cleanText.length > 0) {
            // 处理多个小数点的情况
            let numberText = cleanText;
            if (decimalCount > 1) {
                // 保留第一个小数点，其他的删除
                const firstDotIndex = cleanText.indexOf('.');
                const beforeDot = cleanText.substring(0, firstDotIndex + 1);
                const afterDot = cleanText.substring(firstDotIndex + 1).replace(/\./g, '');
                numberText = beforeDot + afterDot;
            }
            
            // 移除前导零（除非是0.xxx格式）
            numberText = numberText.replace(/^0+(?!\.)/, '') || '0';
            
            const parsed = parseFloat(numberText);
            if (!isNaN(parsed) && isFinite(parsed)) {
                parsedNumber = parsed;
                isValidNumber = true;
            }
        }
        
        // 数字格式合理性检查
        const isReasonableRange = !isNaN(parsedNumber) && parsedNumber >= 0 && parsedNumber <= 10000;
        const hasLeadingZero = cleanText.match(/^0\d+\.?\d*$/) && !cleanText.startsWith('0.');
        const isDecimalFormat = hasDecimalPoint && cleanText.match(/^\d+\.\d{1,3}$/);
        
        return {
            originalText: text,
            cleanText,
            hasDecimalPoint,
            decimalCount,
            parsedNumber,
            isValidNumber,
            isReasonableRange,
            hasLeadingZero: !!hasLeadingZero,
            isDecimalFormat: !!isDecimalFormat,
            length: cleanText.length
        };
    }

    // 计算结果评分
    calculateResultScore(analysis, confidence) {
        let score = 0;
        
        // 基础分数（OCR置信度）
        score += (confidence || 0) / 100 * 0.25;
        
        // 是否为有效数字
        if (analysis.isValidNumber) score += 0.35;
        
        // 数字范围合理性
        if (analysis.isReasonableRange) score += 0.15;
        
        // 小数点格式奖励
        if (analysis.isDecimalFormat) score += 0.25;
        else if (analysis.hasDecimalPoint && analysis.decimalCount === 1) score += 0.15;
        
        // 长度合理性（1-8位数字较为合理）
        if (analysis.length >= 1 && analysis.length <= 8) score += 0.1;
        
        // 惩罚项
        if (analysis.decimalCount > 1) score -= 0.2; // 多个小数点
        if (analysis.hasLeadingZero) score -= 0.1;   // 不合理的前导零
        if (analysis.length === 0) score -= 0.5;     // 空文本
        
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
        
        console.log('=== OCR多策略分析结果 ===');
        results.forEach((result) => {
            console.log(`策略${result.strategy}(${result.strategyName}):`, {
                原始文本: result.ocrResult?.text || 'N/A',
                置信度: result.ocrResult?.confidence || 0,
                错误: result.error || '无'
            });
        });
    }
}

// 导出增强OCR类
window.EnhancedOCR = EnhancedOCR;
