// 统一OCR管理器 - 支持多种OCR提供商和智能降级
class UnifiedOCRManager {
    constructor() {
        this.apiConfig = window.apiConfig;
        this.providers = new Map();
        this.currentProvider = null;
        this.fallbackQueue = [];
        this.isInitialized = false;
        this.debugMode = true;
        this.lastResults = [];
        this.providerStats = new Map();
    }
    
    // 初始化OCR管理器
    async initialize() {
        try {
            console.log('正在初始化统一OCR管理器...');
            
            // 初始化所有可用的OCR提供商
            await this.initializeProviders();
            
            // 设置降级队列
            this.setupFallbackQueue();
            
            // 选择最佳提供商
            await this.selectBestProvider();
            
            this.isInitialized = true;
            console.log('统一OCR管理器初始化完成，当前提供商:', this.currentProvider?.name || 'none');
            
            return true;
        } catch (error) {
            console.error('统一OCR管理器初始化失败:', error);
            throw error;
        }
    }
    
    // 初始化所有OCR提供商
    async initializeProviders() {
        const availableProviders = this.apiConfig.getAvailableProviders();
        
        for (const providerName of availableProviders) {
            try {
                let provider = null;
                
                switch (providerName) {
                    case 'volcano':
                        if (this.apiConfig.validateVolcanoCredentials()) {
                            provider = new VolcanoOCR(this.apiConfig);
                            await provider.initialize();
                        }
                        break;
                        
                    case 'tesseract':
                        if (window.Tesseract) {
                            provider = new EnhancedOCR(null);
                            // 延迟初始化Tesseract worker
                            provider.needsWorkerInit = true;
                        }
                        break;
                        
                    case 'paddle':
                        if (window.PaddleOCRWrapper) {
                            provider = new PaddleOCRWrapper();
                            await provider.initialize();
                        }
                        break;
                }
                
                if (provider) {
                    this.providers.set(providerName, {
                        name: providerName,
                        instance: provider,
                        isHealthy: true,
                        lastError: null,
                        successCount: 0,
                        failureCount: 0
                    });
                    
                    this.providerStats.set(providerName, {
                        totalRequests: 0,
                        successfulRequests: 0,
                        averageResponseTime: 0,
                        lastUsed: null
                    });
                    
                    console.log(`OCR提供商 ${providerName} 初始化成功`);
                }
            } catch (error) {
                console.error(`OCR提供商 ${providerName} 初始化失败:`, error);
                this.providers.set(providerName, {
                    name: providerName,
                    instance: null,
                    isHealthy: false,
                    lastError: error.message,
                    successCount: 0,
                    failureCount: 1
                });
            }
        }
    }
    
    // 设置降级队列
    setupFallbackQueue() {
        const configuredOrder = this.apiConfig.get('providers');
        this.fallbackQueue = configuredOrder.filter(provider => 
            this.providers.has(provider) && this.providers.get(provider).isHealthy
        );
        
        console.log('OCR降级队列:', this.fallbackQueue);
    }
    
    // 选择最佳提供商
    async selectBestProvider() {
        if (this.fallbackQueue.length === 0) {
            throw new Error('没有可用的OCR提供商');
        }
        
        // 按优先级和健康状态选择
        for (const providerName of this.fallbackQueue) {
            const provider = this.providers.get(providerName);
            if (provider && provider.isHealthy) {
                this.currentProvider = provider;
                console.log(`选择OCR提供商: ${providerName}`);
                return;
            }
        }
        
        throw new Error('没有健康的OCR提供商可用');
    }
    
    // 主要OCR识别接口
    async processImageWithMultipleStrategies(canvas, ctx) {
        if (!this.isInitialized) {
            throw new Error('OCR管理器未初始化');
        }
        
        const startTime = Date.now();
        let result = null;
        let lastError = null;
        
        // 尝试每个提供商，直到成功或全部失败
        for (const providerName of this.fallbackQueue) {
            const provider = this.providers.get(providerName);
            
            if (!provider || !provider.isHealthy) {
                continue;
            }
            
            try {
                console.log(`尝试使用OCR提供商: ${providerName}`);
                
                // 特殊处理Tesseract需要延迟初始化
                if (providerName === 'tesseract' && provider.instance.needsWorkerInit) {
                    await this.initializeTesseract(provider.instance);
                }
                
                // 执行OCR识别
                const providerResult = await provider.instance.processImageWithMultipleStrategies(canvas, ctx);
                
                // 记录统计信息
                this.updateProviderStats(providerName, Date.now() - startTime, true);
                
                // 标记结果来源
                result = {
                    ...providerResult,
                    provider: providerName,
                    processingTime: Date.now() - startTime
                };
                
                console.log(`OCR识别成功，提供商: ${providerName}`, result);
                break;
                
            } catch (error) {
                console.error(`OCR提供商 ${providerName} 识别失败:`, error);
                lastError = error;
                
                // 记录失败统计
                this.updateProviderStats(providerName, Date.now() - startTime, false);
                
                // 标记提供商为不健康
                provider.isHealthy = false;
                provider.lastError = error.message;
                provider.failureCount++;
                
                // 如果是配置问题，不再尝试该提供商
                if (error.message.includes('API密钥') || error.message.includes('配置')) {
                    console.log(`OCR提供商 ${providerName} 因配置问题被禁用`);
                    continue;
                }
                
                // 继续尝试下一个提供商
                continue;
            }
        }
        
        if (!result) {
            throw new Error(`所有OCR提供商均失败，最后错误: ${lastError?.message || '未知错误'}`);
        }
        
        this.lastResults = result;
        return result;
    }
    
    // 延迟初始化Tesseract
    async initializeTesseract(enhancedOCR) {
        try {
            console.log('正在初始化Tesseract worker...');
            
            const worker = await Tesseract.createWorker('eng', 1, {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`Tesseract识别进度: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            
            await worker.loadLanguage('eng');
            await worker.initialize('eng');
            
            enhancedOCR.ocrWorker = worker;
            enhancedOCR.needsWorkerInit = false;
            
            console.log('Tesseract初始化完成');
        } catch (error) {
            console.error('Tesseract初始化失败:', error);
            throw error;
        }
    }
    
    // 更新提供商统计信息
    updateProviderStats(providerName, responseTime, success) {
        const stats = this.providerStats.get(providerName);
        if (!stats) return;
        
        stats.totalRequests++;
        stats.lastUsed = new Date();
        
        if (success) {
            stats.successfulRequests++;
            // 更新平均响应时间
            stats.averageResponseTime = (stats.averageResponseTime * (stats.successfulRequests - 1) + responseTime) / stats.successfulRequests;
            
            // 标记提供商为健康
            const provider = this.providers.get(providerName);
            if (provider) {
                provider.isHealthy = true;
                provider.successCount++;
            }
        }
    }
    
    // 获取提供商状态
    getProviderStatus() {
        const status = {};
        
        for (const [name, provider] of this.providers) {
            const stats = this.providerStats.get(name);
            status[name] = {
                name: name,
                isHealthy: provider.isHealthy,
                lastError: provider.lastError,
                successCount: provider.successCount,
                failureCount: provider.failureCount,
                totalRequests: stats?.totalRequests || 0,
                successRate: stats?.totalRequests > 0 ? (stats.successfulRequests / stats.totalRequests * 100).toFixed(1) : 'N/A',
                averageResponseTime: stats?.averageResponseTime ? Math.round(stats.averageResponseTime) : 'N/A',
                lastUsed: stats?.lastUsed ? stats.lastUsed.toISOString() : 'N/A'
            };
        }
        
        return status;
    }
    
    // 获取当前最佳提供商
    getCurrentProvider() {
        return this.currentProvider?.name || 'none';
    }
    
    // 手动切换提供商
    async switchProvider(providerName) {
        if (!this.providers.has(providerName)) {
            throw new Error(`未知的OCR提供商: ${providerName}`);
        }
        
        const provider = this.providers.get(providerName);
        
        if (!provider.isHealthy) {
            // 尝试重新初始化
            try {
                await this.reinitializeProvider(providerName);
            } catch (error) {
                throw new Error(`无法切换到OCR提供商 ${providerName}: ${error.message}`);
            }
        }
        
        this.currentProvider = provider;
        console.log(`手动切换到OCR提供商: ${providerName}`);
    }
    
    // 重新初始化提供商
    async reinitializeProvider(providerName) {
        console.log(`正在重新初始化OCR提供商: ${providerName}`);
        
        const provider = this.providers.get(providerName);
        if (!provider) {
            throw new Error(`OCR提供商 ${providerName} 不存在`);
        }
        
        try {
            switch (providerName) {
                case 'volcano':
                    if (this.apiConfig.validateVolcanoCredentials()) {
                        await provider.instance.initialize();
                    } else {
                        throw new Error('火山引擎API密钥未配置');
                    }
                    break;
                    
                case 'tesseract':
                    if (provider.instance.needsWorkerInit) {
                        await this.initializeTesseract(provider.instance);
                    }
                    break;
                    
                case 'paddle':
                    await provider.instance.initialize();
                    break;
            }
            
            provider.isHealthy = true;
            provider.lastError = null;
            console.log(`OCR提供商 ${providerName} 重新初始化成功`);
            
        } catch (error) {
            provider.isHealthy = false;
            provider.lastError = error.message;
            provider.failureCount++;
            throw error;
        }
    }
    
    // 测试所有提供商
    async testAllProviders() {
        console.log('正在测试所有OCR提供商...');
        
        // 创建测试图像
        const testCanvas = document.createElement('canvas');
        testCanvas.width = 100;
        testCanvas.height = 50;
        const ctx = testCanvas.getContext('2d');
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, 100, 50);
        ctx.fillStyle = '#000000';
        ctx.font = '20px Arial';
        ctx.fillText('12.34', 10, 30);
        
        const testResults = {};
        
        for (const [providerName, provider] of this.providers) {
            try {
                const startTime = Date.now();
                
                if (providerName === 'tesseract' && provider.instance?.needsWorkerInit) {
                    await this.initializeTesseract(provider.instance);
                }
                
                const result = await provider.instance.processImageWithMultipleStrategies(testCanvas, ctx);
                const responseTime = Date.now() - startTime;
                
                testResults[providerName] = {
                    success: true,
                    responseTime: responseTime,
                    result: result,
                    error: null
                };
                
                console.log(`OCR提供商 ${providerName} 测试成功:`, result);
                
            } catch (error) {
                testResults[providerName] = {
                    success: false,
                    responseTime: null,
                    result: null,
                    error: error.message
                };
                
                console.error(`OCR提供商 ${providerName} 测试失败:`, error);
            }
        }
        
        return testResults;
    }
    
    // 获取策略预览画布（从当前提供商）
    getStrategyCanvases() {
        if (!this.currentProvider || !this.currentProvider.instance) {
            return [];
        }
        
        return this.currentProvider.instance.getStrategyCanvases ? 
               this.currentProvider.instance.getStrategyCanvases() : [];
    }
    
    // 获取最后的识别结果
    getLastResults() {
        return this.lastResults;
    }
    
    // 恢复提供商健康状态
    restoreProviderHealth(providerName) {
        const provider = this.providers.get(providerName);
        if (provider) {
            provider.isHealthy = true;
            provider.lastError = null;
            console.log(`OCR提供商 ${providerName} 健康状态已恢复`);
        }
    }
    
    // 获取性能统计报告
    getPerformanceReport() {
        const report = {
            totalProviders: this.providers.size,
            healthyProviders: 0,
            currentProvider: this.currentProvider?.name || 'none',
            providers: {}
        };
        
        for (const [name, provider] of this.providers) {
            if (provider.isHealthy) {
                report.healthyProviders++;
            }
            
            const stats = this.providerStats.get(name);
            report.providers[name] = {
                isHealthy: provider.isHealthy,
                successCount: provider.successCount,
                failureCount: provider.failureCount,
                successRate: stats?.totalRequests > 0 ? 
                           (stats.successfulRequests / stats.totalRequests * 100).toFixed(1) + '%' : 'N/A',
                averageResponseTime: stats?.averageResponseTime ? 
                                   Math.round(stats.averageResponseTime) + 'ms' : 'N/A',
                lastUsed: stats?.lastUsed?.toLocaleString() || 'N/A'
            };
        }
        
        return report;
    }
    
    // 清理所有资源
    async cleanup() {
        console.log('正在清理OCR管理器资源...');
        
        for (const [name, provider] of this.providers) {
            try {
                if (provider.instance && provider.instance.cleanup) {
                    await provider.instance.cleanup();
                }
                
                // 特殊处理Tesseract worker
                if (name === 'tesseract' && provider.instance?.ocrWorker) {
                    await provider.instance.ocrWorker.terminate();
                }
                
            } catch (error) {
                console.warn(`清理OCR提供商 ${name} 时出错:`, error);
            }
        }
        
        this.providers.clear();
        this.providerStats.clear();
        this.currentProvider = null;
        this.isInitialized = false;
        
        console.log('OCR管理器资源清理完成');
    }
    
    // 配置更新处理
    async onConfigUpdate() {
        console.log('检测到配置更新，重新初始化OCR管理器...');
        
        // 清理现有资源
        await this.cleanup();
        
        // 重新初始化
        await this.initialize();
    }
}

// 全局OCR管理器实例
window.UnifiedOCRManager = UnifiedOCRManager;
window.ocrManager = new UnifiedOCRManager();