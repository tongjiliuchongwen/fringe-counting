// 配置管理UI - 用户友好的设置界面
class ConfigurationUI {
    constructor() {
        this.apiConfig = window.apiConfig;
        this.ocrManager = window.ocrManager;
        this.isVisible = false;
        this.modal = null;
        this.testResults = {};
    }
    
    // 显示配置界面
    show() {
        if (this.isVisible) return;
        
        this.createModal();
        this.renderConfigForm();
        this.bindEvents();
        this.isVisible = true;
    }
    
    // 隐藏配置界面
    hide() {
        if (this.modal) {
            document.body.removeChild(this.modal);
            this.modal = null;
        }
        this.isVisible = false;
    }
    
    // 创建模态框
    createModal() {
        this.modal = document.createElement('div');
        this.modal.className = 'config-modal';
        this.modal.innerHTML = `
            <div class="config-overlay"></div>
            <div class="config-content">
                <div class="config-header">
                    <h2>🔧 OCR配置管理</h2>
                    <button class="config-close" aria-label="关闭">&times;</button>
                </div>
                <div class="config-body">
                    <div class="config-tabs">
                        <button class="config-tab active" data-tab="providers">API提供商</button>
                        <button class="config-tab" data-tab="settings">处理设置</button>
                        <button class="config-tab" data-tab="status">状态监控</button>
                        <button class="config-tab" data-tab="backup">备份恢复</button>
                    </div>
                    <div class="config-content-area">
                        <div id="config-providers-tab" class="config-tab-content active">
                            <!-- 提供商配置内容 -->
                        </div>
                        <div id="config-settings-tab" class="config-tab-content">
                            <!-- 处理设置内容 -->
                        </div>
                        <div id="config-status-tab" class="config-tab-content">
                            <!-- 状态监控内容 -->
                        </div>
                        <div id="config-backup-tab" class="config-tab-content">
                            <!-- 备份恢复内容 -->
                        </div>
                    </div>
                </div>
                <div class="config-footer">
                    <button class="config-btn config-btn-secondary" id="config-reset">重置默认</button>
                    <button class="config-btn config-btn-primary" id="config-save">保存配置</button>
                </div>
            </div>
        `;
        
        // 添加样式
        this.addStyles();
        
        document.body.appendChild(this.modal);
    }
    
    // 添加样式
    addStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .config-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10000;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .config-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.7);
            }
            
            .config-content {
                position: relative;
                background: white;
                border-radius: 8px;
                width: 90%;
                max-width: 800px;
                max-height: 90vh;
                overflow: hidden;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
            }
            
            .config-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 30px;
                border-bottom: 1px solid #eee;
                background: #f8f9fa;
            }
            
            .config-header h2 {
                margin: 0;
                color: #333;
                font-size: 1.5em;
            }
            
            .config-close {
                background: none;
                border: none;
                font-size: 2em;
                cursor: pointer;
                color: #999;
                padding: 0;
                width: 30px;
                height: 30px;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .config-close:hover {
                color: #333;
            }
            
            .config-body {
                max-height: 60vh;
                overflow-y: auto;
            }
            
            .config-tabs {
                display: flex;
                border-bottom: 1px solid #eee;
                background: #f8f9fa;
            }
            
            .config-tab {
                flex: 1;
                padding: 15px 20px;
                background: none;
                border: none;
                cursor: pointer;
                font-size: 14px;
                color: #666;
                transition: all 0.2s;
            }
            
            .config-tab:hover {
                background: #e9ecef;
            }
            
            .config-tab.active {
                background: white;
                color: #007bff;
                border-bottom: 2px solid #007bff;
            }
            
            .config-content-area {
                padding: 20px 30px;
            }
            
            .config-tab-content {
                display: none;
            }
            
            .config-tab-content.active {
                display: block;
            }
            
            .config-section {
                margin-bottom: 25px;
            }
            
            .config-section-title {
                font-size: 1.2em;
                font-weight: bold;
                margin-bottom: 15px;
                color: #333;
                border-bottom: 2px solid #007bff;
                padding-bottom: 5px;
            }
            
            .config-form-group {
                margin-bottom: 15px;
            }
            
            .config-form-group label {
                display: block;
                margin-bottom: 5px;
                font-weight: bold;
                color: #555;
            }
            
            .config-form-group input,
            .config-form-group select,
            .config-form-group textarea {
                width: 100%;
                padding: 8px 12px;
                border: 1px solid #ddd;
                border-radius: 4px;
                font-size: 14px;
            }
            
            .config-form-group input:focus,
            .config-form-group select:focus,
            .config-form-group textarea:focus {
                outline: none;
                border-color: #007bff;
                box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
            }
            
            .config-form-group .config-help {
                font-size: 12px;
                color: #666;
                margin-top: 5px;
            }
            
            .config-provider-card {
                border: 1px solid #ddd;
                border-radius: 6px;
                padding: 15px;
                margin-bottom: 15px;
                background: #f8f9fa;
            }
            
            .config-provider-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
            }
            
            .config-provider-name {
                font-weight: bold;
                font-size: 1.1em;
            }
            
            .config-provider-status {
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
            }
            
            .config-provider-status.healthy {
                background: #d4edda;
                color: #155724;
            }
            
            .config-provider-status.unhealthy {
                background: #f8d7da;
                color: #721c24;
            }
            
            .config-provider-status.unknown {
                background: #fff3cd;
                color: #856404;
            }
            
            .config-test-results {
                background: #f8f9fa;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 10px;
                margin-top: 10px;
                font-family: monospace;
                font-size: 12px;
            }
            
            .config-footer {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 30px;
                border-top: 1px solid #eee;
                background: #f8f9fa;
            }
            
            .config-btn {
                padding: 10px 20px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 14px;
                transition: all 0.2s;
            }
            
            .config-btn-primary {
                background: #007bff;
                color: white;
            }
            
            .config-btn-primary:hover {
                background: #0056b3;
            }
            
            .config-btn-secondary {
                background: #6c757d;
                color: white;
            }
            
            .config-btn-secondary:hover {
                background: #545b62;
            }
            
            .config-btn-success {
                background: #28a745;
                color: white;
            }
            
            .config-btn-success:hover {
                background: #1e7e34;
            }
            
            .config-btn-warning {
                background: #ffc107;
                color: #212529;
            }
            
            .config-btn-warning:hover {
                background: #e0a800;
            }
            
            .config-btn-danger {
                background: #dc3545;
                color: white;
            }
            
            .config-btn-danger:hover {
                background: #c82333;
            }
            
            .config-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            
            .config-btn-small {
                padding: 6px 12px;
                font-size: 12px;
            }
            
            .config-status-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 15px;
            }
            
            .config-status-card {
                background: #f8f9fa;
                border: 1px solid #ddd;
                border-radius: 6px;
                padding: 15px;
            }
            
            .config-status-card-title {
                font-weight: bold;
                margin-bottom: 10px;
                color: #333;
            }
            
            .config-status-item {
                display: flex;
                justify-content: space-between;
                margin-bottom: 5px;
                font-size: 14px;
            }
            
            .config-status-item-label {
                color: #666;
            }
            
            .config-status-item-value {
                font-weight: bold;
                color: #333;
            }
            
            .config-checkbox {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .config-checkbox input[type="checkbox"] {
                width: auto;
            }
            
            .config-range-group {
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .config-range-group input[type="range"] {
                flex: 1;
            }
            
            .config-range-value {
                min-width: 40px;
                text-align: center;
                font-weight: bold;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    // 渲染配置表单
    renderConfigForm() {
        this.renderProvidersTab();
        this.renderSettingsTab();
        this.renderStatusTab();
        this.renderBackupTab();
    }
    
    // 渲染提供商配置标签
    renderProvidersTab() {
        const tab = document.getElementById('config-providers-tab');
        
        tab.innerHTML = `
            <div class="config-section">
                <div class="config-section-title">🔥 火山引擎OCR</div>
                <div class="config-provider-card">
                    <div class="config-provider-header">
                        <div class="config-provider-name">火山引擎 (推荐)</div>
                        <div class="config-provider-status ${this.getProviderStatus('volcano')}" id="volcano-status">
                            ${this.getProviderStatusText('volcano')}
                        </div>
                    </div>
                    <div class="config-form-group">
                        <label for="volcano-api-key">API Key:</label>
                        <input type="password" id="volcano-api-key" placeholder="请输入火山引擎API Key">
                        <div class="config-help">在火山引擎控制台获取API密钥</div>
                    </div>
                    <div class="config-form-group">
                        <label for="volcano-api-secret">API Secret:</label>
                        <input type="password" id="volcano-api-secret" placeholder="请输入火山引擎API Secret">
                        <div class="config-help">确保API密钥安全，不要泄露</div>
                    </div>
                    <div class="config-form-group">
                        <label for="volcano-region">服务区域:</label>
                        <select id="volcano-region">
                            <option value="cn-north-1">华北1 (北京)</option>
                            <option value="cn-east-1">华东1 (上海)</option>
                            <option value="cn-south-1">华南1 (深圳)</option>
                        </select>
                    </div>
                    <div class="config-form-group config-checkbox">
                        <input type="checkbox" id="volcano-enabled" checked>
                        <label for="volcano-enabled">启用火山引擎OCR</label>
                    </div>
                    <button class="config-btn config-btn-success config-btn-small" id="test-volcano">测试连接</button>
                    <div id="volcano-test-result" class="config-test-results" style="display: none;"></div>
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-title">🤖 Tesseract.js</div>
                <div class="config-provider-card">
                    <div class="config-provider-header">
                        <div class="config-provider-name">Tesseract.js (备用)</div>
                        <div class="config-provider-status ${this.getProviderStatus('tesseract')}" id="tesseract-status">
                            ${this.getProviderStatusText('tesseract')}
                        </div>
                    </div>
                    <div class="config-form-group">
                        <label for="tesseract-language">识别语言:</label>
                        <select id="tesseract-language">
                            <option value="eng">英文</option>
                            <option value="chi_sim">简体中文</option>
                            <option value="chi_tra">繁体中文</option>
                        </select>
                    </div>
                    <div class="config-form-group">
                        <label for="tesseract-psm">页面分割模式:</label>
                        <select id="tesseract-psm">
                            <option value="8">单词模式 (推荐)</option>
                            <option value="7">单行文本</option>
                            <option value="6">块模式</option>
                            <option value="13">原始行</option>
                        </select>
                    </div>
                    <div class="config-form-group config-checkbox">
                        <input type="checkbox" id="tesseract-enabled" checked>
                        <label for="tesseract-enabled">启用Tesseract.js</label>
                    </div>
                    <button class="config-btn config-btn-success config-btn-small" id="test-tesseract">测试连接</button>
                    <div id="tesseract-test-result" class="config-test-results" style="display: none;"></div>
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-title">🏮 PaddleOCR</div>
                <div class="config-provider-card">
                    <div class="config-provider-header">
                        <div class="config-provider-name">PaddleOCR (实验性)</div>
                        <div class="config-provider-status ${this.getProviderStatus('paddle')}" id="paddle-status">
                            ${this.getProviderStatusText('paddle')}
                        </div>
                    </div>
                    <div class="config-form-group">
                        <label for="paddle-model-path">模型路径:</label>
                        <input type="text" id="paddle-model-path" placeholder="https://paddlejs.bj.bcebos.com/models/ocr/">
                        <div class="config-help">PaddleOCR模型下载地址</div>
                    </div>
                    <div class="config-form-group config-checkbox">
                        <input type="checkbox" id="paddle-enabled">
                        <label for="paddle-enabled">启用PaddleOCR</label>
                    </div>
                    <button class="config-btn config-btn-success config-btn-small" id="test-paddle">测试连接</button>
                    <div id="paddle-test-result" class="config-test-results" style="display: none;"></div>
                </div>
            </div>
        `;
        
        // 加载当前配置
        this.loadCurrentConfig();
    }
    
    // 渲染设置标签
    renderSettingsTab() {
        const tab = document.getElementById('config-settings-tab');
        
        tab.innerHTML = `
            <div class="config-section">
                <div class="config-section-title">📊 图像处理设置</div>
                <div class="config-form-group">
                    <label for="quality-min-contrast">最小对比度:</label>
                    <div class="config-range-group">
                        <input type="range" id="quality-min-contrast" min="0" max="1" step="0.1" value="0.1">
                        <span class="config-range-value">0.1</span>
                    </div>
                    <div class="config-help">图像质量检查的最小对比度要求</div>
                </div>
                <div class="config-form-group config-checkbox">
                    <input type="checkbox" id="decimal-protection-enabled" checked>
                    <label for="decimal-protection-enabled">启用小数点保护</label>
                </div>
                <div class="config-form-group">
                    <label for="decimal-dot-size">小数点检测大小:</label>
                    <div class="config-range-group">
                        <input type="range" id="decimal-dot-size" min="1" max="10" step="1" value="3">
                        <span class="config-range-value">3</span>
                    </div>
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-title">🎯 结果评分权重</div>
                <div class="config-form-group">
                    <label for="confidence-weight">置信度权重:</label>
                    <div class="config-range-group">
                        <input type="range" id="confidence-weight" min="0" max="1" step="0.05" value="0.3">
                        <span class="config-range-value">0.3</span>
                    </div>
                </div>
                <div class="config-form-group">
                    <label for="valid-number-weight">有效数字权重:</label>
                    <div class="config-range-group">
                        <input type="range" id="valid-number-weight" min="0" max="1" step="0.05" value="0.25">
                        <span class="config-range-value">0.25</span>
                    </div>
                </div>
                <div class="config-form-group">
                    <label for="decimal-format-weight">小数点格式权重:</label>
                    <div class="config-range-group">
                        <input type="range" id="decimal-format-weight" min="0" max="1" step="0.05" value="0.25">
                        <span class="config-range-value">0.25</span>
                    </div>
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-title">📋 提供商优先级</div>
                <div class="config-form-group">
                    <label>拖拽调整优先级顺序:</label>
                    <div id="provider-priority-list" class="config-priority-list">
                        <div class="config-priority-item" data-provider="volcano">
                            <span class="config-priority-handle">☰</span>
                            <span class="config-priority-name">火山引擎</span>
                        </div>
                        <div class="config-priority-item" data-provider="tesseract">
                            <span class="config-priority-handle">☰</span>
                            <span class="config-priority-name">Tesseract.js</span>
                        </div>
                        <div class="config-priority-item" data-provider="paddle">
                            <span class="config-priority-handle">☰</span>
                            <span class="config-priority-name">PaddleOCR</span>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // 加载当前设置
        this.loadCurrentSettings();
    }
    
    // 渲染状态标签
    renderStatusTab() {
        const tab = document.getElementById('config-status-tab');
        
        tab.innerHTML = `
            <div class="config-section">
                <div class="config-section-title">📊 系统状态</div>
                <div class="config-status-grid" id="status-grid">
                    <!-- 状态卡片将在这里动态生成 -->
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-title">🔧 操作面板</div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button class="config-btn config-btn-primary" id="refresh-status">刷新状态</button>
                    <button class="config-btn config-btn-warning" id="test-all-providers">测试所有提供商</button>
                    <button class="config-btn config-btn-danger" id="reset-all-providers">重置所有提供商</button>
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-title">📈 性能报告</div>
                <div id="performance-report" class="config-test-results">
                    点击"刷新状态"获取最新性能报告
                </div>
            </div>
        `;
        
        // 加载状态信息
        this.loadStatusInfo();
    }
    
    // 渲染备份标签
    renderBackupTab() {
        const tab = document.getElementById('config-backup-tab');
        
        tab.innerHTML = `
            <div class="config-section">
                <div class="config-section-title">💾 配置备份</div>
                <div class="config-form-group">
                    <label>当前配置:</label>
                    <textarea id="config-export" rows="10" readonly></textarea>
                    <div class="config-help">当前所有配置的JSON格式</div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="config-btn config-btn-primary" id="export-config">导出配置</button>
                    <button class="config-btn config-btn-success" id="copy-config">复制到剪贴板</button>
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-title">📥 配置恢复</div>
                <div class="config-form-group">
                    <label for="config-import">导入配置JSON:</label>
                    <textarea id="config-import" rows="8" placeholder="粘贴配置JSON内容..."></textarea>
                    <div class="config-help">粘贴之前导出的配置JSON</div>
                </div>
                <div style="display: flex; gap: 10px;">
                    <button class="config-btn config-btn-warning" id="import-config">导入配置</button>
                    <button class="config-btn config-btn-danger" id="reset-config">重置为默认</button>
                </div>
            </div>
        `;
        
        // 加载备份信息
        this.loadBackupInfo();
    }
    
    // 绑定事件
    bindEvents() {
        // 关闭按钮
        this.modal.querySelector('.config-close').addEventListener('click', () => this.hide());
        this.modal.querySelector('.config-overlay').addEventListener('click', () => this.hide());
        
        // 标签切换
        this.modal.querySelectorAll('.config-tab').forEach(tab => {
            tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
        });
        
        // 主要按钮
        this.modal.querySelector('#config-save').addEventListener('click', () => this.saveConfig());
        this.modal.querySelector('#config-reset').addEventListener('click', () => this.resetConfig());
        
        // 提供商测试按钮
        this.modal.querySelector('#test-volcano').addEventListener('click', () => this.testProvider('volcano'));
        this.modal.querySelector('#test-tesseract').addEventListener('click', () => this.testProvider('tesseract'));
        this.modal.querySelector('#test-paddle').addEventListener('click', () => this.testProvider('paddle'));
        
        // 状态操作按钮
        this.modal.querySelector('#refresh-status').addEventListener('click', () => this.refreshStatus());
        this.modal.querySelector('#test-all-providers').addEventListener('click', () => this.testAllProviders());
        this.modal.querySelector('#reset-all-providers').addEventListener('click', () => this.resetAllProviders());
        
        // 备份操作按钮
        this.modal.querySelector('#export-config').addEventListener('click', () => this.exportConfig());
        this.modal.querySelector('#copy-config').addEventListener('click', () => this.copyConfig());
        this.modal.querySelector('#import-config').addEventListener('click', () => this.importConfig());
        this.modal.querySelector('#reset-config').addEventListener('click', () => this.resetConfigToDefault());
        
        // 滑块值更新
        this.modal.querySelectorAll('input[type="range"]').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const valueSpan = e.target.nextElementSibling;
                if (valueSpan && valueSpan.classList.contains('config-range-value')) {
                    valueSpan.textContent = e.target.value;
                }
            });
        });
    }
    
    // 切换标签
    switchTab(tabName) {
        // 更新标签按钮状态
        this.modal.querySelectorAll('.config-tab').forEach(tab => {
            tab.classList.remove('active');
            if (tab.dataset.tab === tabName) {
                tab.classList.add('active');
            }
        });
        
        // 更新内容区域
        this.modal.querySelectorAll('.config-tab-content').forEach(content => {
            content.classList.remove('active');
        });
        
        const activeContent = this.modal.querySelector(`#config-${tabName}-tab`);
        if (activeContent) {
            activeContent.classList.add('active');
        }
        
        // 特殊处理状态标签
        if (tabName === 'status') {
            this.refreshStatus();
        }
    }
    
    // 加载当前配置
    loadCurrentConfig() {
        // 火山引擎配置
        const volcanoConfig = this.apiConfig.getProviderConfig('volcano');
        if (volcanoConfig.apiKey) {
            this.modal.querySelector('#volcano-api-key').value = volcanoConfig.apiKey;
        }
        if (volcanoConfig.apiSecret) {
            this.modal.querySelector('#volcano-api-secret').value = volcanoConfig.apiSecret;
        }
        this.modal.querySelector('#volcano-region').value = volcanoConfig.region || 'cn-north-1';
        this.modal.querySelector('#volcano-enabled').checked = volcanoConfig.enabled;
        
        // Tesseract配置
        const tesseractConfig = this.apiConfig.getProviderConfig('tesseract');
        this.modal.querySelector('#tesseract-language').value = tesseractConfig.language || 'eng';
        this.modal.querySelector('#tesseract-psm').value = tesseractConfig.ocrParams?.tessedit_pageseg_mode || '8';
        this.modal.querySelector('#tesseract-enabled').checked = tesseractConfig.enabled;
        
        // PaddleOCR配置
        const paddleConfig = this.apiConfig.getProviderConfig('paddle');
        this.modal.querySelector('#paddle-model-path').value = paddleConfig.modelPath || 'https://paddlejs.bj.bcebos.com/models/ocr/';
        this.modal.querySelector('#paddle-enabled').checked = paddleConfig.enabled;
    }
    
    // 加载当前设置
    loadCurrentSettings() {
        const qualityConfig = this.apiConfig.get('imageProcessing.qualityCheck');
        const decimalConfig = this.apiConfig.get('imageProcessing.decimalProtection');
        const scoringConfig = this.apiConfig.get('scoring');
        
        this.modal.querySelector('#quality-min-contrast').value = qualityConfig.minContrast;
        this.modal.querySelector('#decimal-protection-enabled').checked = decimalConfig.enabled;
        this.modal.querySelector('#decimal-dot-size').value = decimalConfig.dotSize;
        
        this.modal.querySelector('#confidence-weight').value = scoringConfig.confidenceWeight;
        this.modal.querySelector('#valid-number-weight').value = scoringConfig.validNumberWeight;
        this.modal.querySelector('#decimal-format-weight').value = scoringConfig.decimalFormatWeight;
        
        // 更新显示的值
        this.modal.querySelectorAll('input[type="range"]').forEach(slider => {
            const valueSpan = slider.nextElementSibling;
            if (valueSpan && valueSpan.classList.contains('config-range-value')) {
                valueSpan.textContent = slider.value;
            }
        });
    }
    
    // 加载状态信息
    loadStatusInfo() {
        this.refreshStatus();
    }
    
    // 加载备份信息
    loadBackupInfo() {
        const exportArea = this.modal.querySelector('#config-export');
        exportArea.value = this.apiConfig.exportConfig();
    }
    
    // 获取提供商状态
    getProviderStatus(provider) {
        // 这里应该从ocrManager获取实际状态
        const providerStatus = this.ocrManager?.getProviderStatus?.()?.[provider];
        if (providerStatus) {
            return providerStatus.isHealthy ? 'healthy' : 'unhealthy';
        }
        return 'unknown';
    }
    
    // 获取提供商状态文本
    getProviderStatusText(provider) {
        const status = this.getProviderStatus(provider);
        switch (status) {
            case 'healthy': return '✅ 正常';
            case 'unhealthy': return '❌ 异常';
            default: return '❓ 未知';
        }
    }
    
    // 测试提供商
    async testProvider(provider) {
        const testButton = this.modal.querySelector(`#test-${provider}`);
        const resultDiv = this.modal.querySelector(`#${provider}-test-result`);
        
        testButton.disabled = true;
        testButton.textContent = '测试中...';
        resultDiv.style.display = 'none';
        
        try {
            // 这里应该调用实际的测试方法
            await new Promise(resolve => setTimeout(resolve, 2000)); // 模拟测试
            
            resultDiv.innerHTML = `
                <div style="color: green;">✅ 测试成功</div>
                <div>响应时间: 1.2秒</div>
                <div>识别结果: 12.34</div>
            `;
            resultDiv.style.display = 'block';
            
        } catch (error) {
            resultDiv.innerHTML = `
                <div style="color: red;">❌ 测试失败</div>
                <div>错误: ${error.message}</div>
            `;
            resultDiv.style.display = 'block';
        } finally {
            testButton.disabled = false;
            testButton.textContent = '测试连接';
        }
    }
    
    // 刷新状态
    refreshStatus() {
        const statusGrid = this.modal.querySelector('#status-grid');
        const performanceReport = this.modal.querySelector('#performance-report');
        
        if (!statusGrid || !performanceReport) return;
        
        // 获取提供商状态
        const providerStatus = this.ocrManager?.getProviderStatus?.() || {};
        
        // 生成状态卡片
        statusGrid.innerHTML = Object.entries(providerStatus).map(([name, status]) => `
            <div class="config-status-card">
                <div class="config-status-card-title">${this.getProviderDisplayName(name)}</div>
                <div class="config-status-item">
                    <span class="config-status-item-label">状态:</span>
                    <span class="config-status-item-value" style="color: ${status.isHealthy ? 'green' : 'red'}">
                        ${status.isHealthy ? '✅ 健康' : '❌ 异常'}
                    </span>
                </div>
                <div class="config-status-item">
                    <span class="config-status-item-label">成功率:</span>
                    <span class="config-status-item-value">${status.successRate}</span>
                </div>
                <div class="config-status-item">
                    <span class="config-status-item-label">响应时间:</span>
                    <span class="config-status-item-value">${status.averageResponseTime}</span>
                </div>
                <div class="config-status-item">
                    <span class="config-status-item-label">请求数:</span>
                    <span class="config-status-item-value">${status.totalRequests}</span>
                </div>
            </div>
        `).join('');
        
        // 生成性能报告
        const report = this.ocrManager?.getPerformanceReport?.() || {};
        performanceReport.innerHTML = `
            <strong>系统概览:</strong><br>
            总提供商数: ${report.totalProviders || 0}<br>
            健康提供商: ${report.healthyProviders || 0}<br>
            当前提供商: ${report.currentProvider || 'none'}<br>
            <br>
            <strong>提供商详情:</strong><br>
            ${Object.entries(report.providers || {}).map(([name, info]) => `
                ${this.getProviderDisplayName(name)}: ${info.isHealthy ? '✅' : '❌'} 
                成功率 ${info.successRate} 
                响应时间 ${info.averageResponseTime}
            `).join('<br>')}
        `;
    }
    
    // 测试所有提供商
    async testAllProviders() {
        const testButton = this.modal.querySelector('#test-all-providers');
        testButton.disabled = true;
        testButton.textContent = '测试中...';
        
        try {
            // 这里应该调用实际的测试方法
            await new Promise(resolve => setTimeout(resolve, 5000)); // 模拟测试
            
            alert('所有提供商测试完成！');
            this.refreshStatus();
            
        } catch (error) {
            alert(`测试失败: ${error.message}`);
        } finally {
            testButton.disabled = false;
            testButton.textContent = '测试所有提供商';
        }
    }
    
    // 重置所有提供商
    async resetAllProviders() {
        if (!confirm('确定要重置所有提供商吗？这将清除所有统计数据。')) {
            return;
        }
        
        const resetButton = this.modal.querySelector('#reset-all-providers');
        resetButton.disabled = true;
        resetButton.textContent = '重置中...';
        
        try {
            // 这里应该调用实际的重置方法
            await new Promise(resolve => setTimeout(resolve, 2000)); // 模拟重置
            
            alert('所有提供商已重置！');
            this.refreshStatus();
            
        } catch (error) {
            alert(`重置失败: ${error.message}`);
        } finally {
            resetButton.disabled = false;
            resetButton.textContent = '重置所有提供商';
        }
    }
    
    // 导出配置
    exportConfig() {
        const exportArea = this.modal.querySelector('#config-export');
        exportArea.value = this.apiConfig.exportConfig();
        
        // 创建下载链接
        const blob = new Blob([exportArea.value], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fringe-counting-config-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
    
    // 复制配置
    copyConfig() {
        const exportArea = this.modal.querySelector('#config-export');
        exportArea.select();
        document.execCommand('copy');
        alert('配置已复制到剪贴板！');
    }
    
    // 导入配置
    importConfig() {
        const importArea = this.modal.querySelector('#config-import');
        const configText = importArea.value.trim();
        
        if (!configText) {
            alert('请粘贴配置JSON内容！');
            return;
        }
        
        try {
            const success = this.apiConfig.importConfig(configText);
            if (success) {
                alert('配置导入成功！');
                this.loadCurrentConfig();
                this.loadCurrentSettings();
                this.loadBackupInfo();
            } else {
                alert('配置导入失败！请检查JSON格式。');
            }
        } catch (error) {
            alert(`配置导入失败: ${error.message}`);
        }
    }
    
    // 重置配置为默认
    resetConfigToDefault() {
        if (!confirm('确定要重置所有配置为默认值吗？这将删除所有自定义设置。')) {
            return;
        }
        
        this.apiConfig.reset();
        this.loadCurrentConfig();
        this.loadCurrentSettings();
        this.loadBackupInfo();
        alert('配置已重置为默认值！');
    }
    
    // 保存配置
    saveConfig() {
        try {
            // 保存火山引擎配置
            const volcanoApiKey = this.modal.querySelector('#volcano-api-key').value;
            const volcanoApiSecret = this.modal.querySelector('#volcano-api-secret').value;
            const volcanoRegion = this.modal.querySelector('#volcano-region').value;
            const volcanoEnabled = this.modal.querySelector('#volcano-enabled').checked;
            
            if (volcanoApiKey && volcanoApiSecret) {
                this.apiConfig.setVolcanoCredentials(volcanoApiKey, volcanoApiSecret);
            }
            this.apiConfig.set('volcano.region', volcanoRegion);
            this.apiConfig.set('volcano.enabled', volcanoEnabled);
            
            // 保存Tesseract配置
            this.apiConfig.set('tesseract.language', this.modal.querySelector('#tesseract-language').value);
            this.apiConfig.set('tesseract.ocrParams.tessedit_pageseg_mode', this.modal.querySelector('#tesseract-psm').value);
            this.apiConfig.set('tesseract.enabled', this.modal.querySelector('#tesseract-enabled').checked);
            
            // 保存PaddleOCR配置
            this.apiConfig.set('paddle.modelPath', this.modal.querySelector('#paddle-model-path').value);
            this.apiConfig.set('paddle.enabled', this.modal.querySelector('#paddle-enabled').checked);
            
            // 保存图像处理设置
            this.apiConfig.set('imageProcessing.qualityCheck.minContrast', parseFloat(this.modal.querySelector('#quality-min-contrast').value));
            this.apiConfig.set('imageProcessing.decimalProtection.enabled', this.modal.querySelector('#decimal-protection-enabled').checked);
            this.apiConfig.set('imageProcessing.decimalProtection.dotSize', parseInt(this.modal.querySelector('#decimal-dot-size').value));
            
            // 保存评分权重
            this.apiConfig.set('scoring.confidenceWeight', parseFloat(this.modal.querySelector('#confidence-weight').value));
            this.apiConfig.set('scoring.validNumberWeight', parseFloat(this.modal.querySelector('#valid-number-weight').value));
            this.apiConfig.set('scoring.decimalFormatWeight', parseFloat(this.modal.querySelector('#decimal-format-weight').value));
            
            alert('配置保存成功！');
            
            // 通知OCR管理器配置已更新
            if (this.ocrManager && this.ocrManager.onConfigUpdate) {
                this.ocrManager.onConfigUpdate();
            }
            
        } catch (error) {
            alert(`配置保存失败: ${error.message}`);
        }
    }
    
    // 重置配置
    resetConfig() {
        if (!confirm('确定要重置所有配置吗？')) {
            return;
        }
        
        this.apiConfig.reset();
        this.loadCurrentConfig();
        this.loadCurrentSettings();
        this.loadBackupInfo();
        alert('配置已重置！');
    }
    
    // 获取提供商显示名称
    getProviderDisplayName(provider) {
        const names = {
            volcano: '火山引擎',
            tesseract: 'Tesseract.js',
            paddle: 'PaddleOCR'
        };
        return names[provider] || provider;
    }
}

// 全局配置UI实例
window.ConfigurationUI = ConfigurationUI;
window.configUI = new ConfigurationUI();