// 火山引擎OCR API集成模块
class VolcanoOCR {
    constructor(apiConfig) {
        this.apiConfig = apiConfig;
        this.isInitialized = false;
        this.debugMode = true;
        this.strategyCanvases = [];
        this.lastResults = [];
    }
    
    // 初始化火山引擎OCR
    async initialize() {
        try {
            console.log('正在初始化火山引擎OCR...');
            
            // 检查API密钥配置
            if (!this.apiConfig.validateVolcanoCredentials()) {
                throw new Error('火山引擎API密钥未配置，请在设置中配置API密钥');
            }
            
            // 测试API连接
            await this.testConnection();
            
            this.isInitialized = true;
            console.log('火山引擎OCR初始化完成');
            return true;
        } catch (error) {
            console.error('火山引擎OCR初始化失败:', error);
            throw new Error(`火山引擎OCR初始化失败: ${error.message}`);
        }
    }
    
    // 测试API连接
    async testConnection() {
        try {
            // 创建一个简单的测试图像
            const testCanvas = document.createElement('canvas');
            testCanvas.width = 100;
            testCanvas.height = 50;
            const ctx = testCanvas.getContext('2d');
            
            // 绘制测试数字
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 100, 50);
            ctx.fillStyle = '#000000';
            ctx.font = '20px Arial';
            ctx.fillText('123', 20, 30);
            
            // 测试OCR识别
            const result = await this.recognizeImage(testCanvas);
            console.log('火山引擎API连接测试成功:', result);
            
            return true;
        } catch (error) {
            console.error('火山引擎API连接测试失败:', error);
            throw error;
        }
    }
    
    // 多策略图像处理，兼容原有接口
    async processImageWithMultipleStrategies(canvas, ctx) {
        if (!this.isInitialized) {
            throw new Error('火山引擎OCR未初始化');
        }
        
        const strategies = [
            { name: '火山引擎优化', func: this.strategyVolcanoOptimized.bind(this) },
            { name: '数字增强', func: this.strategyDigitalEnhanced.bind(this) },
            { name: '高对比度', func: this.strategyHighContrast.bind(this) },
            { name: '自适应阈值', func: this.strategyAdaptiveThreshold.bind(this) },
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
                
                // 使用火山引擎OCR执行识别
                const ocrResult = await this.recognizeImage(strategyCanvas);
                
                results.push({
                    strategy: i + 1,
                    strategyName: strategies[i].name,
                    processedData,
                    ocrResult,
                    canvas: strategyCanvas
                });
                
                console.log(`火山引擎策略${i + 1}(${strategies[i].name})结果:`, ocrResult);
                
            } catch (error) {
                console.error(`火山引擎策略${i + 1}失败:`, error);
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
    
    // 火山引擎优化策略
    async strategyVolcanoOptimized(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 1. 针对火山引擎的预处理优化
        this.enhanceForVolcano(data, canvas.width, canvas.height);
        
        // 2. 数字识别专用的对比度增强
        this.enhanceDigitalContrast(data);
        
        // 3. 小数点保护
        this.protectDecimalPoints(data, canvas.width, canvas.height);
        
        ctx.putImageData(imageData, 0, 0);
        
        return {
            strategy: '火山引擎优化',
            enhanced: true,
            contrast: 'high',
            decimalProtected: true
        };
    }
    
    // 数字增强策略
    async strategyDigitalEnhanced(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 1. 数字字符优化
        this.optimizeForDigits(data, canvas.width, canvas.height);
        
        // 2. 边缘锐化
        this.sharpenEdges(data, canvas.width, canvas.height);
        
        // 3. 二值化
        const threshold = this.calculateOptimalThreshold(data);
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
            strategy: '数字增强',
            threshold,
            whitePixels,
            blackPixels,
            sharpened: true
        };
    }
    
    // 高对比度策略
    async strategyHighContrast(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        // 1. 对比度拉伸
        let min = 255, max = 0;
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            min = Math.min(min, gray);
            max = Math.max(max, gray);
        }
        
        const range = max - min;
        if (range > 0) {
            for (let i = 0; i < data.length; i += 4) {
                const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                const stretched = ((gray - min) / range) * 255;
                data[i] = data[i + 1] = data[i + 2] = stretched;
            }
        }
        
        // 2. 伽马校正
        const gamma = 0.8;
        for (let i = 0; i < data.length; i += 4) {
            const normalized = data[i] / 255;
            const corrected = Math.pow(normalized, gamma) * 255;
            data[i] = data[i + 1] = data[i + 2] = corrected;
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        return {
            strategy: '高对比度',
            originalRange: `${min.toFixed(1)}-${max.toFixed(1)}`,
            gamma,
            stretched: true
        };
    }
    
    // 自适应阈值策略
    async strategyAdaptiveThreshold(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        // 使用积分图加速计算
        const integralImage = this.computeIntegralImage(data, width, height);
        const windowSize = Math.max(width, height) * 0.1;
        
        let whitePixels = 0, blackPixels = 0;
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                
                // 使用积分图快速计算局部均值
                const localMean = this.getLocalMean(integralImage, x, y, windowSize, width, height);
                const threshold = localMean * 0.95; // 稍微降低阈值
                
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
            windowSize: Math.round(windowSize),
            whitePixels,
            blackPixels
        };
    }
    
    // 小数点保护策略
    async strategyDecimalProtected(ctx, canvas) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        // 1. 基础二值化
        const threshold = this.calculateOptimalThreshold(data);
        for (let i = 0; i < data.length; i += 4) {
            const brightness = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const value = brightness > threshold ? 255 : 0;
            data[i] = data[i + 1] = data[i + 2] = value;
            data[i + 3] = 255;
        }
        
        // 2. 检测并保护小数点
        const dotCandidates = this.detectPotentialDecimalDots(data, width, height);
        dotCandidates.forEach(dot => {
            this.enhanceDecimalDot(data, width, height, dot.x, dot.y);
        });
        
        ctx.putImageData(imageData, 0, 0);
        
        return {
            strategy: '小数点保护',
            threshold,
            dotCandidates: dotCandidates.length,
            protected: true
        };
    }
    
    // 使用火山引擎API进行图像识别
    async recognizeImage(canvas) {
        try {
            // 将canvas转换为base64
            const base64Image = canvas.toDataURL('image/png').split(',')[1];
            
            // 构建请求参数
            const params = {
                image_base64: base64Image,
                ...this.apiConfig.getProviderConfig('volcano').ocrParams
            };
            
            // 发送请求到火山引擎
            const response = await this.makeVolcanoRequest('/api/v1/ocr/general', params);
            
            // 解析响应
            return this.parseVolcanoResponse(response);
            
        } catch (error) {
            console.error('火山引擎OCR识别失败:', error);
            throw error;
        }
    }
    
    // 发送请求到火山引擎API
    async makeVolcanoRequest(endpoint, params) {
        const config = this.apiConfig.getProviderConfig('volcano');
        const timestamp = Math.floor(Date.now() / 1000);
        const nonce = this.generateNonce();
        
        // 构建签名
        const signature = this.generateSignature(endpoint, params, timestamp, nonce);
        
        const requestBody = {
            ...params,
            timestamp,
            nonce,
            signature
        };
        
        const response = await fetch(config.baseUrl + endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`
            },
            body: JSON.stringify(requestBody)
        });
        
        if (!response.ok) {
            throw new Error(`火山引擎API请求失败: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    // 解析火山引擎响应
    parseVolcanoResponse(response) {
        try {
            if (response.code !== 0) {
                throw new Error(`火山引擎API错误: ${response.message}`);
            }
            
            const data = response.data;
            if (!data || !data.text_list) {
                return { text: '', confidence: 0 };
            }
            
            // 提取数字相关的文本
            const digitalTexts = data.text_list
                .filter(item => item.text && /[\d.]/.test(item.text))
                .sort((a, b) => a.position.left - b.position.left);
            
            if (digitalTexts.length === 0) {
                return { text: '', confidence: 0 };
            }
            
            // 合并数字文本
            const combinedText = digitalTexts
                .map(item => item.text.replace(/[^\d.]/g, ''))
                .join('');
            
            // 计算平均置信度
            const avgConfidence = digitalTexts.reduce((sum, item) => 
                sum + (item.probability || 0), 0) / digitalTexts.length;
            
            return {
                text: combinedText,
                confidence: avgConfidence * 100,
                rawResponse: response
            };
            
        } catch (error) {
            console.error('火山引擎响应解析失败:', error);
            return { text: '', confidence: 0, error: error.message };
        }
    }
    
    // 生成签名
    generateSignature(endpoint, params, timestamp, nonce) {
        const config = this.apiConfig.getProviderConfig('volcano');
        const sortedParams = Object.keys(params).sort().map(key => 
            `${key}=${params[key]}`
        ).join('&');
        
        const stringToSign = `${endpoint}?${sortedParams}&timestamp=${timestamp}&nonce=${nonce}`;
        
        // 使用API密钥进行签名（简化版，实际应使用HMAC-SHA256）
        return this.simpleHash(stringToSign + config.apiSecret);
    }
    
    // 生成随机nonce
    generateNonce() {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }
    
    // 简单哈希函数（实际应使用crypto库）
    simpleHash(str) {
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 转换为32位整数
        }
        return Math.abs(hash).toString(16);
    }
    
    // 辅助方法：针对火山引擎的图像增强
    enhanceForVolcano(data, width, height) {
        // 针对火山引擎OCR的特定优化
        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            
            // 增强数字区域的对比度
            const gray = 0.299 * r + 0.587 * g + 0.114 * b;
            const enhanced = gray < 128 ? Math.max(0, gray - 30) : Math.min(255, gray + 30);
            
            data[i] = data[i + 1] = data[i + 2] = enhanced;
        }
    }
    
    // 辅助方法：数字对比度增强
    enhanceDigitalContrast(data) {
        for (let i = 0; i < data.length; i += 4) {
            const gray = data[i];
            const enhanced = gray < 128 ? 0 : 255;
            data[i] = data[i + 1] = data[i + 2] = enhanced;
        }
    }
    
    // 辅助方法：小数点保护
    protectDecimalPoints(data, width, height) {
        const candidates = this.detectPotentialDecimalDots(data, width, height);
        candidates.forEach(dot => {
            this.enhanceDecimalDot(data, width, height, dot.x, dot.y);
        });
    }
    
    // 辅助方法：检测潜在的小数点
    detectPotentialDecimalDots(data, width, height) {
        const candidates = [];
        const dotRadius = Math.max(2, Math.min(width, height) / 20);
        
        for (let y = dotRadius; y < height - dotRadius; y++) {
            for (let x = dotRadius; x < width - dotRadius; x++) {
                if (this.isLikelyDecimalDot(data, width, x, y, dotRadius)) {
                    candidates.push({ x, y, radius: dotRadius });
                }
            }
        }
        
        return candidates;
    }
    
    // 辅助方法：判断是否像小数点
    isLikelyDecimalDot(data, width, x, y, radius) {
        let darkPixels = 0;
        let totalPixels = 0;
        
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < width && ny >= 0 && ny < width) {
                    const idx = (ny * width + nx) * 4;
                    const brightness = data[idx];
                    
                    if (brightness < 128) darkPixels++;
                    totalPixels++;
                }
            }
        }
        
        const ratio = darkPixels / totalPixels;
        return ratio > 0.2 && ratio < 0.8;
    }
    
    // 辅助方法：增强小数点
    enhanceDecimalDot(data, width, height, x, y) {
        const radius = 2;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const nx = x + dx;
                const ny = y + dy;
                
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const idx = (ny * width + nx) * 4;
                    data[idx] = data[idx + 1] = data[idx + 2] = 0; // 加深
                }
            }
        }
    }
    
    // 其他辅助方法（从enhanced-ocr.js中复用）
    optimizeForDigits(data, width, height) {
        // 数字字符优化处理
        for (let i = 0; i < data.length; i += 4) {
            const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            const optimized = gray < 160 ? 0 : 255;
            data[i] = data[i + 1] = data[i + 2] = optimized;
        }
    }
    
    sharpenEdges(data, width, height) {
        // 边缘锐化
        const kernel = [-1, -1, -1, -1, 9, -1, -1, -1, -1];
        const output = new Uint8ClampedArray(data.length);
        
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                let sum = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const idx = ((y + ky) * width + (x + kx)) * 4;
                        sum += data[idx] * kernel[(ky + 1) * 3 + (kx + 1)];
                    }
                }
                const idx = (y * width + x) * 4;
                output[idx] = output[idx + 1] = output[idx + 2] = Math.max(0, Math.min(255, sum));
                output[idx + 3] = 255;
            }
        }
        
        data.set(output);
    }
    
    calculateOptimalThreshold(data) {
        // 计算最优阈值
        const histogram = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
            const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            histogram[gray]++;
        }
        
        // 使用OTSU方法
        const total = data.length / 4;
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
        
        return threshold;
    }
    
    computeIntegralImage(data, width, height) {
        const integral = new Array(height).fill(null).map(() => new Array(width).fill(0));
        
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
                
                integral[y][x] = gray;
                if (x > 0) integral[y][x] += integral[y][x - 1];
                if (y > 0) integral[y][x] += integral[y - 1][x];
                if (x > 0 && y > 0) integral[y][x] -= integral[y - 1][x - 1];
            }
        }
        
        return integral;
    }
    
    getLocalMean(integral, x, y, windowSize, width, height) {
        const halfWindow = Math.floor(windowSize / 2);
        const x1 = Math.max(0, x - halfWindow);
        const y1 = Math.max(0, y - halfWindow);
        const x2 = Math.min(width - 1, x + halfWindow);
        const y2 = Math.min(height - 1, y + halfWindow);
        
        const area = (x2 - x1 + 1) * (y2 - y1 + 1);
        let sum = integral[y2][x2];
        
        if (x1 > 0) sum -= integral[y2][x1 - 1];
        if (y1 > 0) sum -= integral[y1 - 1][x2];
        if (x1 > 0 && y1 > 0) sum += integral[y1 - 1][x1 - 1];
        
        return sum / area;
    }
    
    // 结果选择逻辑（复用enhanced-ocr.js的逻辑）
    selectBestResult(results) {
        const validResults = results.filter(r => r.ocrResult && r.ocrResult.text);
        
        if (validResults.length === 0) {
            return {
                value: NaN,
                rawText: '',
                confidence: 0,
                strategy: 'none',
                engine: 'volcano',
                allResults: results
            };
        }
        
        const analyzedResults = validResults.map(result => {
            const analysis = this.analyzeOCRResult(result.ocrResult.text);
            return {
                ...result,
                analysis,
                score: this.calculateResultScore(analysis, result.ocrResult.confidence)
            };
        });
        
        analyzedResults.sort((a, b) => b.score - a.score);
        
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
    
    // 分析OCR结果
    analyzeOCRResult(text) {
        const cleanText = text.replace(/[^\d.\s]/g, '').replace(/\s+/g, '');
        const hasDecimalPoint = cleanText.includes('.');
        const decimalCount = (cleanText.match(/\./g) || []).length;
        
        let parsedNumber = NaN;
        let isValidNumber = false;
        
        if (cleanText.length > 0) {
            let numberText = cleanText;
            
            if (decimalCount > 1) {
                const firstDotIndex = cleanText.indexOf('.');
                const beforeDot = cleanText.substring(0, firstDotIndex + 1);
                const afterDot = cleanText.substring(firstDotIndex + 1).replace(/\./g, '');
                numberText = beforeDot + afterDot;
            }
            
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
    
    // 计算结果评分
    calculateResultScore(analysis, confidence) {
        const weights = this.apiConfig.get('scoring');
        let score = 0;
        
        score += (confidence || 0) / 100 * weights.confidenceWeight;
        if (analysis.isValidNumber) score += weights.validNumberWeight;
        if (analysis.isReasonableRange) score += weights.reasonableRangeWeight;
        if (analysis.isDecimalFormat) score += weights.decimalFormatWeight;
        else if (analysis.hasDecimalPoint && analysis.decimalCount === 1) score += weights.decimalFormatWeight * 0.6;
        if (analysis.length >= 1 && analysis.length <= 8) score += weights.lengthWeight;
        
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
            engine: 'volcano',
            allResults: allResults.map(r => ({
                strategy: r.strategy,
                strategyName: r.strategyName,
                text: r.ocrResult?.text || '',
                confidence: r.ocrResult?.confidence || 0,
                error: r.error
            }))
        };
    }
    
    // 获取策略预览画布
    getStrategyCanvases() {
        return this.strategyCanvases;
    }
    
    // 调试输出
    debugResults(results) {
        if (!this.debugMode) return;
        
        console.log('=== 火山引擎OCR多策略分析结果 ===');
        results.forEach((result) => {
            console.log(`策略${result.strategy}(${result.strategyName}):`, {
                原始文本: result.ocrResult?.text || 'N/A',
                置信度: result.ocrResult?.confidence || 0,
                错误: result.error || '无'
            });
        });
    }
    
    // 清理资源
    cleanup() {
        this.strategyCanvases = [];
        this.lastResults = [];
        this.isInitialized = false;
    }
}

// 导出火山引擎OCR类
window.VolcanoOCR = VolcanoOCR;