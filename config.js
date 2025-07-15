// 配置管理系统 - 支持多种OCR API提供商
class APIConfig {
    constructor() {
        this.config = {
            // 默认API提供商优先级顺序
            providers: [
                'volcano',     // 火山引擎 (优先)
                'tesseract',   // Tesseract.js (备用)
                'paddle'       // PaddleOCR (最后备用)
            ],
            
            // 火山引擎OCR配置
            volcano: {
                enabled: true,
                apiKey: '', // 用户需要在UI中设置
                apiSecret: '',
                region: 'cn-north-1',
                baseUrl: 'https://open.volcengineapi.com/',
                timeout: 30000,
                maxRetries: 3,
                // 针对数字识别的优化配置
                ocrParams: {
                    scene: 'general',
                    language: 'zh_cn',
                    format: 'json',
                    probability: true,
                    char_info: true,
                    paragraph: false,
                    line: false,
                    word: false
                }
            },
            
            // Tesseract.js配置
            tesseract: {
                enabled: true,
                language: 'eng',
                timeout: 60000,
                maxRetries: 2,
                // 针对数字识别的优化配置
                ocrParams: {
                    tessedit_char_whitelist: '0123456789.',
                    tessedit_pageseg_mode: '8',
                    tessedit_ocr_engine_mode: '2'
                }
            },
            
            // PaddleOCR配置
            paddle: {
                enabled: false, // 默认关闭，需要额外部署
                timeout: 45000,
                maxRetries: 2,
                modelPath: 'https://paddlejs.bj.bcebos.com/models/ocr/',
                ocrParams: {
                    det: true,
                    rec: true,
                    cls: false,
                    textScore: 0.5,
                    textNmsThresh: 0.4
                }
            },
            
            // 图像预处理配置
            imageProcessing: {
                // 多策略预处理
                strategies: [
                    'volcano_optimized',    // 火山引擎优化
                    'digital_enhanced',     // 数字增强
                    'basic_threshold',      // 基础阈值
                    'adaptive_threshold',   // 自适应阈值
                    'contrast_enhanced'     // 对比度增强
                ],
                
                // 图像质量检查
                qualityCheck: {
                    minWidth: 10,
                    minHeight: 10,
                    maxWidth: 500,
                    maxHeight: 500,
                    minContrast: 0.1
                },
                
                // 小数点保护参数
                decimalProtection: {
                    enabled: true,
                    dotSize: 3,
                    enhanceRadius: 2,
                    contrastBoost: 1.2
                }
            },
            
            // 结果评分权重
            scoring: {
                confidenceWeight: 0.3,
                validNumberWeight: 0.25,
                decimalFormatWeight: 0.25,
                reasonableRangeWeight: 0.15,
                lengthWeight: 0.05
            }
        };
        
        // 从localStorage加载保存的配置
        this.loadFromStorage();
    }
    
    // 获取配置
    get(path) {
        return this.getNestedValue(this.config, path);
    }
    
    // 设置配置
    set(path, value) {
        this.setNestedValue(this.config, path, value);
        this.saveToStorage();
    }
    
    // 获取可用的API提供商列表
    getAvailableProviders() {
        return this.config.providers.filter(provider => 
            this.config[provider] && this.config[provider].enabled
        );
    }
    
    // 获取特定提供商的配置
    getProviderConfig(provider) {
        return this.config[provider] || {};
    }
    
    // 验证火山引擎API密钥
    validateVolcanoCredentials() {
        const volcano = this.config.volcano;
        return volcano.apiKey && volcano.apiSecret && volcano.apiKey.length > 0;
    }
    
    // 设置火山引擎API密钥
    setVolcanoCredentials(apiKey, apiSecret) {
        this.set('volcano.apiKey', apiKey);
        this.set('volcano.apiSecret', apiSecret);
        this.set('volcano.enabled', true);
    }
    
    // 获取图像处理策略配置
    getImageProcessingStrategies() {
        return this.config.imageProcessing.strategies;
    }
    
    // 从localStorage加载配置
    loadFromStorage() {
        try {
            const stored = localStorage.getItem('fringe-counting-config');
            if (stored) {
                const storedConfig = JSON.parse(stored);
                this.config = this.mergeDeep(this.config, storedConfig);
            }
        } catch (error) {
            console.warn('无法从localStorage加载配置:', error);
        }
    }
    
    // 保存配置到localStorage
    saveToStorage() {
        try {
            localStorage.setItem('fringe-counting-config', JSON.stringify(this.config));
        } catch (error) {
            console.warn('无法保存配置到localStorage:', error);
        }
    }
    
    // 重置配置到默认值
    reset() {
        localStorage.removeItem('fringe-counting-config');
        this.loadFromStorage();
    }
    
    // 获取嵌套值的辅助函数
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => 
            current && current[key] !== undefined ? current[key] : undefined, obj
        );
    }
    
    // 设置嵌套值的辅助函数
    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key]) current[key] = {};
            return current[key];
        }, obj);
        target[lastKey] = value;
    }
    
    // 深度合并对象
    mergeDeep(target, source) {
        const result = { ...target };
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.mergeDeep(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        return result;
    }
    
    // 导出配置（用于备份）
    exportConfig() {
        return JSON.stringify(this.config, null, 2);
    }
    
    // 导入配置（用于恢复）
    importConfig(configString) {
        try {
            const importedConfig = JSON.parse(configString);
            this.config = this.mergeDeep(this.config, importedConfig);
            this.saveToStorage();
            return true;
        } catch (error) {
            console.error('配置导入失败:', error);
            return false;
        }
    }
}

// 全局配置实例
window.APIConfig = APIConfig;
window.apiConfig = new APIConfig();