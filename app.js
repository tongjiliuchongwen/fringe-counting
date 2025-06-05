// app.js - 智能增强版视频分析工具 (PaddleOCR集成版) - 第一部分

// --- DOM 元素获取 ---
const videoUpload = document.getElementById('videoUpload');
const videoPlayer = document.getElementById('videoPlayer');
const drawingCanvas = document.getElementById('drawingCanvas');
const drawingCtx = drawingCanvas.getContext('2d');
const processingCanvas = document.getElementById('processingCanvas');
const processingCtx = processingCanvas.getContext('2d');
const startAnalysisBtn = document.getElementById('startAnalysisBtn');
const refreshPreviewBtn = document.getElementById('refreshPreviewBtn');
const testOcrBtn = document.getElementById('testOcrBtn');
const statusMessage = document.getElementById('statusMessage');
const debugInfo = document.getElementById('debugInfo');
const analysisStats = document.getElementById('analysisStats');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const resultsTableContainer = document.getElementById('resultsTableContainer');
const resultsChartCtx = document.getElementById('resultsChart').getContext('2d');
const brightnessChartCtx = document.getElementById('brightnessChart').getContext('2d');

// 设置控件
const samplingStrategy = document.getElementById('samplingStrategy');
const filterStrength = document.getElementById('filterStrength');
const peakSensitivity = document.getElementById('peakSensitivity');
const analysisSettings = document.getElementById('analysisSettings');

// 预览相关元素
const brightnessPreviewCanvas = document.getElementById('brightnessPreviewCanvas');
const brightnessPreviewCtx = brightnessPreviewCanvas.getContext('2d');
const brightnessPreviewInfo = document.getElementById('brightnessPreviewInfo');

const ocrPreviewCanvas = document.getElementById('ocrPreviewCanvas');
const ocrPreviewCtx = ocrPreviewCanvas.getContext('2d');
const ocrPreviewInfo = document.getElementById('ocrPreviewInfo');

const ocrProcessedPreviewCanvas = document.getElementById('ocrProcessedPreviewCanvas');
const ocrProcessedPreviewCtx = ocrProcessedPreviewCanvas.getContext('2d');
const ocrProcessedPreviewInfo = document.getElementById('ocrProcessedPreviewInfo');
const strategyPreviews = document.getElementById('strategyPreviews');
const ocrTestResult = document.getElementById('ocrTestResult');

// PaddleOCR相关元素
const ocrEngineSelect = document.getElementById('ocrEngine');
const ocrEngineStatus = document.getElementById('ocrEngineStatus');

// --- 全局状态变量 ---
let videoFile = null;
let brightnessRect = null;
let ocrRect = null;
let isDrawing = false;
let currentDrawingStart = {};
let currentMode = 'brightness';

// 视频和画布尺寸信息
let videoNaturalWidth = 0;
let videoNaturalHeight = 0;
let videoDisplayWidth = 0;
let videoDisplayHeight = 0;

// 分析结果
let brightnessData = [];
let analysisResults = [];
let localMaximaFrames = [];
let chartInstance = null;
let brightnessChartInstance = null;

// OCR 相关 - 支持双引擎
let ocrWorker = null;
let paddleOCR = null;
let enhancedOCR = null;
let currentMaximaProcessingIndex = 0;
let currentOCREngine = 'paddle'; // 默认使用PaddleOCR
let isOCRSwitching = false;

// 预览更新防抖
let previewUpdateTimeout = null;

// --- 进度条更新 ---
function updateProgress(percentage, text) {
    if (percentage >= 0) {
        progressBar.style.display = 'block';
        progressFill.style.width = percentage + '%';
        progressFill.textContent = Math.round(percentage) + '%';
    } else {
        progressBar.style.display = 'none';
    }
    if (text) {
        statusMessage.textContent = text;
    }
}

// --- 调试信息更新函数 ---
function updateDebugInfo() {
    const engineInfo = currentOCREngine === 'paddle' ? 'PaddleOCR (小数点优化)' : 'Tesseract (备选)';
    debugInfo.innerHTML = `
        视频原始尺寸: ${videoNaturalWidth} × ${videoNaturalHeight}<br>
        视频显示尺寸: ${Math.round(videoDisplayWidth)} × ${Math.round(videoDisplayHeight)}<br>
        画布内部尺寸: ${drawingCanvas.width} × ${drawingCanvas.height}<br>
        当前模式: ${currentMode}<br>
        OCR引擎: ${engineInfo}<br>
        当前时间: ${videoPlayer.currentTime ? videoPlayer.currentTime.toFixed(2) + 's' : 'N/A'}<br>
        亮度区域: ${brightnessRect ? `${Math.round(brightnessRect.x)},${Math.round(brightnessRect.y)},${Math.round(brightnessRect.width)},${Math.round(brightnessRect.height)}` : '未定义'}<br>
        OCR区域: ${ocrRect ? `${Math.round(ocrRect.x)},${Math.round(ocrRect.y)},${Math.round(ocrRect.width)},${Math.round(ocrRect.height)}` : '未定义'}
    `;
}

// --- 分析统计信息更新 ---
function updateAnalysisStats(stats) {
    analysisStats.style.display = 'block';
    analysisStats.innerHTML = `
        <strong>分析统计:</strong><br>
        采样率: ${stats.samplingRate}fps<br>
        总样本: ${stats.totalSamples}<br>
        信号质量: ${stats.quality?.quality || 'N/A'}<br>
        信噪比: ${stats.quality?.snr ? stats.quality.snr.toFixed(2) : 'N/A'}<br>
        动态范围: ${stats.quality?.dynamicRange ? stats.quality.dynamicRange.toFixed(2) : 'N/A'}<br>
        检测峰值: ${localMaximaFrames.length}个<br>
        OCR引擎: ${currentOCREngine === 'paddle' ? 'PaddleOCR' : 'Tesseract'}
    `;
}

// --- OCR 初始化 (双引擎支持) ---
async function initializeOCR() {
    if (!ocrEngineSelect || !ocrEngineStatus) {
        // 如果页面没有OCR引擎选择器，使用默认Tesseract
        await initializeTesseract();
        return;
    }
    
    currentOCREngine = ocrEngineSelect.value;
    isOCRSwitching = true;
    
    try {
        updateProgress(0, '正在初始化 OCR 服务...');
        ocrEngineStatus.textContent = '初始化中...';
        ocrEngineStatus.className = 'status-indicator loading';
        
        if (currentOCREngine === 'paddle') {
            await initializePaddleOCR();
        } else {
            await initializeTesseract();
        }
        
    } catch (error) {
        console.error(`${currentOCREngine} 初始化失败:`, error);
        ocrEngineStatus.textContent = '❌ 初始化失败';
        ocrEngineStatus.className = 'status-indicator error';
        
        // 自动降级逻辑
        if (currentOCREngine === 'paddle') {
            console.log('PaddleOCR初始化失败，尝试降级到Tesseract...');
            ocrEngineSelect.value = 'tesseract';
            currentOCREngine = 'tesseract';
            await initializeOCR(); // 递归重试
        } else {
            updateProgress(-1, `OCR 服务初始化失败: ${error.message}`);
            alert(`OCR 初始化失败，请刷新页面重试。\n错误: ${error.message}`);
        }
    } finally {
        isOCRSwitching = false;
    }
}

// 初始化PaddleOCR
async function initializePaddleOCR() {
    updateProgress(25, '加载PaddleOCR模型...');
    
    // 检查PaddleOCR是否可用
    if (!window.PaddleOCRWrapper) {
        throw new Error('PaddleOCR库未正确加载，请检查网络连接');
    }
    
    paddleOCR = new PaddleOCRWrapper();
    
    updateProgress(50, '初始化PaddleOCR引擎...');
    await paddleOCR.initialize();
    
    updateProgress(75, '配置数字识别优化...');
    enhancedOCR = paddleOCR; // 使用统一接口
    
    if (ocrEngineStatus) {
        ocrEngineStatus.textContent = '✓ PaddleOCR已就绪';
        ocrEngineStatus.className = 'status-indicator ready paddle';
    }
    updateProgress(-1, 'PaddleOCR 服务已就绪 - 小数点识别已优化');
    console.log("PaddleOCR系统初始化完成");
}

// 初始化Tesseract
async function initializeTesseract() {
    updateProgress(25, '加载Tesseract语言包...');
    ocrWorker = await Tesseract.createWorker('eng', 1, {
        logger: m => {
            if (m.status === 'recognizing text') {
                const progressMsg = `OCR 识别中 (峰值 ${currentMaximaProcessingIndex + 1}/${localMaximaFrames.length}): ${Math.round(m.progress * 100)}%`;
                updateProgress(m.progress * 100, progressMsg);
            }
        }
    });
    
    updateProgress(50, '初始化Tesseract引擎...');
    await ocrWorker.loadLanguage('eng');
    await ocrWorker.initialize('eng');
    
    updateProgress(75, '创建增强OCR系统...');
    enhancedOCR = new EnhancedOCR(ocrWorker);
    
    if (ocrEngineStatus) {
        ocrEngineStatus.textContent = '✓ Tesseract已就绪';
        ocrEngineStatus.className = 'status-indicator ready tesseract';
    }
    updateProgress(-1, 'Tesseract 服务已就绪');
    console.log("Tesseract系统初始化完成");
}

// --- 预览更新函数 ---
function schedulePreviewUpdate() {
    if (previewUpdateTimeout) {
        clearTimeout(previewUpdateTimeout);
    }
    previewUpdateTimeout = setTimeout(() => {
        updatePreviews();
    }, 100);
}

function updatePreviews() {
    if (!videoFile || videoPlayer.readyState < 2) {
        console.log('视频未准备好，跳过预览更新');
        return;
    }
    
    try {
        processingCtx.clearRect(0, 0, processingCanvas.width, processingCanvas.height);
        processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        updateBrightnessPreview();
        updateOcrPreview();
        
        console.log('预览更新完成');
    } catch (error) {
        console.error('预览更新失败:', error);
    }
}

function updateBrightnessPreview() {
    brightnessPreviewCtx.clearRect(0, 0, brightnessPreviewCanvas.width, brightnessPreviewCanvas.height);
    
    if (!brightnessRect) {
        showEmptyPreview(brightnessPreviewCtx, brightnessPreviewCanvas, '未定义亮度区域');
        brightnessPreviewInfo.innerHTML = '请先绘制亮度分析区域';
        return;
    }
    
    try {
        const maxWidth = brightnessPreviewCanvas.width - 20;
        const maxHeight = brightnessPreviewCanvas.height - 20;
        const scale = Math.min(maxWidth / brightnessRect.width, maxHeight / brightnessRect.height, 3);
        
        const previewWidth = brightnessRect.width * scale;
        const previewHeight = brightnessRect.height * scale;
        const offsetX = (brightnessPreviewCanvas.width - previewWidth) / 2;
        const offsetY = (brightnessPreviewCanvas.height - previewHeight) / 2;
        
        brightnessPreviewCtx.fillStyle = '#f8f9fa';
        brightnessPreviewCtx.fillRect(0, 0, brightnessPreviewCanvas.width, brightnessPreviewCanvas.height);
        
        brightnessPreviewCtx.drawImage(
            processingCanvas,
            brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height,
            offsetX, offsetY, previewWidth, previewHeight
        );
        
        brightnessPreviewCtx.strokeStyle = '#dc3545';
        brightnessPreviewCtx.lineWidth = 2;
        brightnessPreviewCtx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
        
        const imageData = processingCtx.getImageData(
            brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height
        );
        const avgBrightness = calculateAverageBrightness(imageData);
        
        brightnessPreviewInfo.innerHTML = `
            区域大小: ${Math.round(brightnessRect.width)}×${Math.round(brightnessRect.height)}px<br>
            当前亮度: ${avgBrightness.toFixed(1)}<br>
            缩放比例: ${scale.toFixed(2)}x
        `;
    } catch (error) {
        console.error('亮度预览更新失败:', error);
        showEmptyPreview(brightnessPreviewCtx, brightnessPreviewCanvas, '预览失败');
        brightnessPreviewInfo.innerHTML = '预览更新失败';
    }
}

function updateOcrPreview() {
    ocrPreviewCtx.clearRect(0, 0, ocrPreviewCanvas.width, ocrPreviewCanvas.height);
    ocrProcessedPreviewCtx.clearRect(0, 0, ocrProcessedPreviewCanvas.width, ocrProcessedPreviewCanvas.height);
    
    if (!ocrRect) {
        showEmptyPreview(ocrPreviewCtx, ocrPreviewCanvas, '未定义OCR区域');
        showEmptyPreview(ocrProcessedPreviewCtx, ocrProcessedPreviewCanvas, '未定义OCR区域');
        ocrPreviewInfo.innerHTML = '请先绘制OCR识别区域';
        ocrProcessedPreviewInfo.innerHTML = '请先绘制OCR识别区域';
        strategyPreviews.innerHTML = '';
        return;
    }
    
    try {
        const maxWidth = ocrPreviewCanvas.width - 20;
        const maxHeight = ocrPreviewCanvas.height - 20;
        const scale = Math.min(maxWidth / ocrRect.width, maxHeight / ocrRect.height, 5);
        
        const previewWidth = ocrRect.width * scale;
        const previewHeight = ocrRect.height * scale;
        const offsetX = (ocrPreviewCanvas.width - previewWidth) / 2;
        const offsetY = (ocrPreviewCanvas.height - previewHeight) / 2;
        
        ocrPreviewCtx.fillStyle = '#f8f9fa';
        ocrPreviewCtx.fillRect(0, 0, ocrPreviewCanvas.width, ocrPreviewCanvas.height);
        
        ocrPreviewCtx.drawImage(
            processingCanvas,
            ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height,
            offsetX, offsetY, previewWidth, previewHeight
        );
        
        ocrPreviewCtx.strokeStyle = '#007bff';
        ocrPreviewCtx.lineWidth = 2;
        ocrPreviewCtx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
        
        ocrPreviewInfo.innerHTML = `
            区域大小: ${Math.round(ocrRect.width)}×${Math.round(ocrRect.height)}px<br>
            位置: (${Math.round(ocrRect.x)}, ${Math.round(ocrRect.y)})<br>
            缩放比例: ${scale.toFixed(2)}x<br>
            OCR引擎: ${currentOCREngine === 'paddle' ? 'PaddleOCR' : 'Tesseract'}
        `;
        
        updateOcrProcessedPreview();
        
    } catch (error) {
        console.error('OCR预览更新失败:', error);
        showEmptyPreview(ocrPreviewCtx, ocrPreviewCanvas, '预览失败');
        showEmptyPreview(ocrProcessedPreviewCtx, ocrProcessedPreviewCanvas, '预览失败');
        ocrPreviewInfo.innerHTML = 'OCR预览更新失败';
        ocrProcessedPreviewInfo.innerHTML = 'OCR预处理失败';
    }
}

function updateOcrProcessedPreview() {
    if (!ocrRect || !enhancedOCR) return;
    
    try {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = ocrRect.width;
        tempCanvas.height = ocrRect.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.drawImage(
            processingCanvas,
            ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height,
            0, 0, ocrRect.width, ocrRect.height
        );
        
        // 使用增强OCR的第一个策略进行预览
        let processedData;
        if (currentOCREngine === 'paddle' && enhancedOCR.strategyDigitOptimized) {
            processedData = enhancedOCR.strategyDigitOptimized(tempCtx, tempCanvas);
        } else {
            processedData = enhancedOCR.strategy1_BasicThreshold(tempCtx, tempCanvas);
        }
        
        const scale = Math.min(
            (ocrProcessedPreviewCanvas.width - 20) / ocrRect.width,
            (ocrProcessedPreviewCanvas.height - 20) / ocrRect.height,
            5
        );
        
        const previewWidth = ocrRect.width * scale;
        const previewHeight = ocrRect.height * scale;
        const offsetX = (ocrProcessedPreviewCanvas.width - previewWidth) / 2;
        const offsetY = (ocrProcessedPreviewCanvas.height - previewHeight) / 2;
        
        ocrProcessedPreviewCtx.fillStyle = '#f8f9fa';
        ocrProcessedPreviewCtx.fillRect(0, 0, ocrProcessedPreviewCanvas.width, ocrProcessedPreviewCanvas.height);
        
        ocrProcessedPreviewCtx.drawImage(
            tempCanvas,
            0, 0, ocrRect.width, ocrRect.height,
            offsetX, offsetY, previewWidth, previewHeight
        );
        
        ocrProcessedPreviewCtx.strokeStyle = currentOCREngine === 'paddle' ? '#28a745' : '#6f42c1';
        ocrProcessedPreviewCtx.lineWidth = 2;
        ocrProcessedPreviewCtx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
        
        const whiteRatio = processedData.whitePixels / (processedData.whitePixels + processedData.blackPixels) * 100;
        
        ocrProcessedPreviewInfo.innerHTML = `
            预处理: ${processedData.strategy}<br>
            阈值: ${processedData.threshold}<br>
            白色比例: ${whiteRatio.toFixed(1)}%<br>
            引擎: ${currentOCREngine === 'paddle' ? 'PaddleOCR' : 'Tesseract'}
        `;
        
    } catch (error) {
        console.error('OCR预处理预览失败:', error);
        showEmptyPreview(ocrProcessedPreviewCtx, ocrProcessedPreviewCanvas, '预处理失败');
        ocrProcessedPreviewInfo.innerHTML = 'OCR预处理失败';
    }
}
// app.js - 智能增强版视频分析工具 (PaddleOCR集成版) - 第二部分

function showStrategyPreviews(strategyCanvases) {
    strategyPreviews.innerHTML = '';
    
    strategyCanvases.forEach((strategy, index) => {
        const container = document.createElement('div');
        container.style.textAlign = 'center';
        container.style.margin = '2px';
        
        const canvas = document.createElement('canvas');
        canvas.className = 'strategy-preview';
        canvas.width = 60;
        canvas.height = 40;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(strategy.canvas, 0, 0, 60, 40);
        
        const label = document.createElement('div');
        label.className = 'strategy-info';
        label.textContent = `策略${index + 1}`;
        
        container.appendChild(canvas);
        container.appendChild(label);
        strategyPreviews.appendChild(container);
        
        canvas.addEventListener('click', () => {
            showStrategyDetails(strategy, index + 1);
        });
    });
}

function showStrategyDetails(strategy, strategyNum) {
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 10000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: white;
        padding: 20px;
        border-radius: 8px;
        max-width: 500px;
        text-align: center;
    `;
    
    const canvas = document.createElement('canvas');
    canvas.width = strategy.canvas.width * 3;
    canvas.height = strategy.canvas.height * 3;
    canvas.style.border = '1px solid #ccc';
    
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(strategy.canvas, 0, 0, canvas.width, canvas.height);
    
    content.innerHTML = `
        <h3>策略${strategyNum}: ${strategy.name}</h3>
        <div style="margin: 10px 0;">
            ${Object.entries(strategy.data).map(([key, value]) => 
                `<div>${key}: ${value}</div>`
            ).join('')}
        </div>
    `;
    content.appendChild(canvas);
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.style.marginTop = '10px';
    closeBtn.onclick = () => document.body.removeChild(modal);
    content.appendChild(closeBtn);
    
    modal.appendChild(content);
    modal.onclick = (e) => {
        if (e.target === modal) document.body.removeChild(modal);
    };
    
    document.body.appendChild(modal);
}

function showEmptyPreview(ctx, canvas, text) {
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#999';
    ctx.font = '14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width/2, canvas.height/2);
}

// --- 画布尺寸同步函数 ---
function syncCanvasWithVideo() {
    const videoRect = videoPlayer.getBoundingClientRect();
    videoDisplayWidth = videoRect.width;
    videoDisplayHeight = videoRect.height;
    
    drawingCanvas.width = videoNaturalWidth;
    drawingCanvas.height = videoNaturalHeight;
    
    drawingCanvas.style.width = videoDisplayWidth + 'px';
    drawingCanvas.style.height = videoDisplayHeight + 'px';
    
    processingCanvas.width = videoNaturalWidth;
    processingCanvas.height = videoNaturalHeight;
    
    console.log(`画布同步完成: 内部${videoNaturalWidth}×${videoNaturalHeight}, 显示${Math.round(videoDisplayWidth)}×${Math.round(videoDisplayHeight)}`);
    updateDebugInfo();
    schedulePreviewUpdate();
}

// --- 坐标转换函数 ---
function getCanvasCoordinates(mouseEvent) {
    const rect = drawingCanvas.getBoundingClientRect();
    const scaleX = videoNaturalWidth / rect.width;
    const scaleY = videoNaturalHeight / rect.height;
    
    return {
        x: (mouseEvent.clientX - rect.left) * scaleX,
        y: (mouseEvent.clientY - rect.top) * scaleY
    };
}

// --- 矩形绘制函数 ---
function clearAndRedrawRects() {
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    
    if (brightnessRect) {
        drawingCtx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        drawingCtx.lineWidth = 3;
        drawingCtx.strokeRect(brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height);
        
        drawingCtx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        drawingCtx.font = '16px Arial';
        drawingCtx.fillText('亮度区域', brightnessRect.x, brightnessRect.y - 5);
    }
    
    if (ocrRect) {
        drawingCtx.strokeStyle = currentOCREngine === 'paddle' ? 'rgba(0, 128, 0, 0.8)' : 'rgba(0, 0, 255, 0.8)';
        drawingCtx.lineWidth = 3;
        drawingCtx.strokeRect(ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height);
        
        drawingCtx.fillStyle = currentOCREngine === 'paddle' ? 'rgba(0, 128, 0, 0.8)' : 'rgba(0, 0, 255, 0.8)';
        drawingCtx.font = '16px Arial';
        const label = currentOCREngine === 'paddle' ? 'PaddleOCR区域' : 'OCR区域';
        drawingCtx.fillText(label, ocrRect.x, ocrRect.y - 5);
    }
}

// --- 事件监听器 ---

// 视频上传
videoUpload.addEventListener('change', (event) => {
    videoFile = event.target.files[0];
    if (!videoFile) return;
    
    const objectURL = URL.createObjectURL(videoFile);
    videoPlayer.src = objectURL;
    videoPlayer.load();
    
    resetAnalysisState();
    updateProgress(-1, '视频加载中...');
});

// 视频元数据加载完成
videoPlayer.addEventListener('loadedmetadata', () => {
    videoNaturalWidth = videoPlayer.videoWidth;
    videoNaturalHeight = videoPlayer.videoHeight;
    
    console.log(`视频原始尺寸: ${videoNaturalWidth} × ${videoNaturalHeight}`);
    
    setTimeout(() => {
        syncCanvasWithVideo();
        updateProgress(-1, '视频已加载。请在视频上绘制亮度分析区域（红色框）。');
        currentMode = 'brightness';
        analysisSettings.style.display = 'block';
        updateDebugInfo();
        schedulePreviewUpdate();
    }, 200);
});

// 视频播放相关事件
videoPlayer.addEventListener('loadeddata', () => schedulePreviewUpdate());
videoPlayer.addEventListener('timeupdate', () => {
    updateDebugInfo();
    schedulePreviewUpdate();
});
videoPlayer.addEventListener('seeked', () => {
    updateDebugInfo();
    setTimeout(() => schedulePreviewUpdate(), 100);
});

// 视频尺寸变化
videoPlayer.addEventListener('resize', syncCanvasWithVideo);
window.addEventListener('resize', syncCanvasWithVideo);

// OCR引擎切换事件处理
if (ocrEngineSelect) {
    ocrEngineSelect.addEventListener('change', async () => {
        if (isOCRSwitching) return; // 防止重复切换
        
        const newEngine = ocrEngineSelect.value;
        if (newEngine === currentOCREngine) return;
        
        try {
            // 清理当前OCR实例
            if (paddleOCR && paddleOCR.cleanup) {
                await paddleOCR.cleanup();
                paddleOCR = null;
            }
            if (ocrWorker && ocrWorker.terminate) {
                await ocrWorker.terminate();
                ocrWorker = null;
            }
            
            enhancedOCR = null;
            
            // 重新初始化新引擎
            await initializeOCR();
            
            // 如果有定义的区域，刷新预览
            if (ocrRect) {
                clearAndRedrawRects(); // 更新OCR区域颜色
                schedulePreviewUpdate();
            }
            
            updateDebugInfo();
            
        } catch (error) {
            console.error('OCR引擎切换失败:', error);
            alert(`OCR引擎切换失败: ${error.message}`);
        }
    });
}

// 刷新预览按钮
refreshPreviewBtn.addEventListener('click', () => {
    if (videoFile) {
        updatePreviews();
        statusMessage.textContent = '预览已强制刷新。';
    } else {
        statusMessage.textContent = '请先上传视频。';
    }
});

// 测试OCR按钮
testOcrBtn.addEventListener('click', async () => {
    if (!ocrRect || !enhancedOCR) {
        alert('请先定义OCR区域且确保OCR服务已初始化。');
        return;
    }
    
    const engineName = currentOCREngine === 'paddle' ? 'PaddleOCR' : 'Tesseract';
    updateProgress(0, `正在使用${engineName}测试当前帧...`);
    testOcrBtn.disabled = true;
    
    try {
        const result = await performSingleOCR(videoPlayer.currentTime, 0, true);
        displayOCRTestDetails(result);
        updateProgress(-1, `${engineName}测试完成`);
        
        // 显示策略预览
        if (enhancedOCR && enhancedOCR.getStrategyCanvases) {
            const strategyCanvases = enhancedOCR.getStrategyCanvases();
            showStrategyPreviews(strategyCanvases);
        }
        
    } catch (error) {
        console.error('OCR测试失败:', error);
        ocrTestResult.style.display = 'block';
        ocrTestResult.innerHTML = `<strong>OCR测试失败:</strong><br>${error.message}`;
        updateProgress(-1, 'OCR测试失败');
    } finally {
        testOcrBtn.disabled = false;
    }
});

// 鼠标绘制事件
drawingCanvas.addEventListener('mousedown', (e) => {
    if (!videoFile || currentMode === 'analyzing') return;
    
    isDrawing = true;
    const coords = getCanvasCoordinates(e);
    currentDrawingStart = coords;
    
    console.log(`开始绘制，起点: ${coords.x.toFixed(1)}, ${coords.y.toFixed(1)}`);
    clearAndRedrawRects();
});

drawingCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || !videoFile || currentMode === 'analyzing') return;
    
    const coords = getCanvasCoordinates(e);
    clearAndRedrawRects();
    
    // 绘制预览矩形
    let color;
    if (currentMode === 'brightness') {
        color = 'rgba(255, 0, 0, 0.5)';
    } else {
        color = currentOCREngine === 'paddle' ? 'rgba(0, 128, 0, 0.5)' : 'rgba(0, 0, 255, 0.5)';
    }
    
    drawingCtx.strokeStyle = color;
    drawingCtx.lineWidth = 2;
    drawingCtx.strokeRect(
        currentDrawingStart.x,
        currentDrawingStart.y,
        coords.x - currentDrawingStart.x,
        coords.y - currentDrawingStart.y
    );
});

drawingCanvas.addEventListener('mouseup', (e) => {
    if (!isDrawing || !videoFile || currentMode === 'analyzing') return;
    
    isDrawing = false;
    const coords = getCanvasCoordinates(e);
    
    // 创建标准矩形
    const rect = {
        x: Math.min(currentDrawingStart.x, coords.x),
        y: Math.min(currentDrawingStart.y, coords.y),
        width: Math.abs(coords.x - currentDrawingStart.x),
        height: Math.abs(coords.y - currentDrawingStart.y)
    };
    
    // 检查矩形大小
    if (rect.width < 10 || rect.height < 10) {
        statusMessage.textContent = '绘制的区域太小，请重新绘制。';
        clearAndRedrawRects();
        return;
    }
    
    // 根据当前模式保存矩形
    if (currentMode === 'brightness') {
        brightnessRect = rect;
        currentMode = 'ocr_define';
        const engineName = currentOCREngine === 'paddle' ? 'PaddleOCR数字识别' : '数字识别';
        statusMessage.textContent = `亮度区域已定义。现在请绘制${engineName}区域。`;
        console.log('亮度区域已定义:', brightnessRect);
    } else if (currentMode === 'ocr_define') {
        ocrRect = rect;
        currentMode = 'ready_to_analyze';
        statusMessage.textContent = '所有区域已定义完成。可以测试OCR或开始智能分析。';
        startAnalysisBtn.disabled = false;
        testOcrBtn.disabled = false;
        console.log('OCR区域已定义:', ocrRect);
    }
    
    clearAndRedrawRects();
    updateDebugInfo();
    schedulePreviewUpdate();
});

// 开始分析按钮
startAnalysisBtn.addEventListener('click', async () => {
    if (!brightnessRect || !ocrRect || !videoFile) {
        alert('请先完整定义所有分析区域。');
        return;
    }
    
    currentMode = 'analyzing';
    startAnalysisBtn.disabled = true;
    testOcrBtn.disabled = true;
    if (ocrEngineSelect) ocrEngineSelect.disabled = true;
    videoPlayer.pause();
    
    await performCompleteAnalysis();
});

// --- 重置分析状态 ---
function resetAnalysisState() {
    brightnessRect = null;
    ocrRect = null;
    analysisResults = [];
    brightnessData = [];
    localMaximaFrames = [];
    currentMode = 'brightness';
    startAnalysisBtn.disabled = true;
    testOcrBtn.disabled = true;
    if (ocrEngineSelect) ocrEngineSelect.disabled = false;
    analysisSettings.style.display = 'none';
    analysisStats.style.display = 'none';
    
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    
    if (brightnessChartInstance) {
        brightnessChartInstance.destroy();
        brightnessChartInstance = null;
    }
    
    resultsTableContainer.innerHTML = "";
    ocrTestResult.style.display = 'none';
    strategyPreviews.innerHTML = '';
    clearAndRedrawRects();
    updateDebugInfo();
    schedulePreviewUpdate();
}

// --- 智能亮度分析 ---
async function analyzeBrightness() {
    brightnessData = [];
    const duration = videoPlayer.duration;
    
    updateProgress(10, '初始化智能分析参数...');
    
    let samplingRate;
    const strategy = samplingStrategy.value;
    
    if (strategy === 'auto') {
        if (duration <= 10) {
            samplingRate = 30;
        } else if (duration <= 60) {
            samplingRate = 20;
        } else {
            samplingRate = 15;
        }
    } else {
        const rateMap = { high: 30, medium: 20, low: 15 };
        samplingRate = rateMap[strategy] || 20;
    }
    
    const frameInterval = 1 / samplingRate;
    const totalSamples = Math.floor(duration * samplingRate);
    
    updateProgress(15, `智能采样 (${samplingRate}fps, 总样本: ${totalSamples})...`);
    
    let currentTime = 0;
    let sampleCount = 0;
    const rawBrightnessValues = [];
    
    // 采样阶段
    while (sampleCount < totalSamples && currentTime <= duration) {
        try {
            await seekToTime(currentTime);
            processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
            
            const imageData = processingCtx.getImageData(
                brightnessRect.x, 
                brightnessRect.y, 
                brightnessRect.width, 
                brightnessRect.height
            );
            
            const avgBrightness = calculateAverageBrightness(imageData);
            
            brightnessData.push({
                sampleIndex: sampleCount,
                frameTime: currentTime,
                avgBrightness: avgBrightness
            });
            
            rawBrightnessValues.push(avgBrightness);
            
            sampleCount++;
            const progress = 15 + (sampleCount / totalSamples * 30);
            updateProgress(progress, `采样进度: ${sampleCount}/${totalSamples} (${(sampleCount/totalSamples*100).toFixed(1)}%)`);
            
            currentTime += frameInterval;
            
        } catch (error) {
            console.error(`处理第${sampleCount}个样本时出错:`, error);
            sampleCount++;
            currentTime += frameInterval;
        }
    }
    
    updateProgress(45, '应用智能信号处理...');
    
    const strength = filterStrength.value;
    const processResult = SignalProcessor.processSignal(rawBrightnessValues, strength);
    
    // 更新亮度数据
    for (let i = 0; i < brightnessData.length; i++) {
        brightnessData[i].rawBrightness = brightnessData[i].avgBrightness;
        brightnessData[i].avgBrightness = processResult.processed[i];
        brightnessData[i].smoothnessFactor = Math.abs(rawBrightnessValues[i] - processResult.processed[i]);
    }
    
    console.log(`信号处理完成，质量评估:`, processResult.quality);
    
    return {
        totalSamples: sampleCount,
        samplingRate,
        quality: processResult.quality,
        rawRange: [Math.min(...rawBrightnessValues), Math.max(...rawBrightnessValues)],
        smoothedRange: [Math.min(...processResult.processed), Math.max(...processResult.processed)]
    };
}

// --- 智能峰值检测 ---
function findLocalMaxima() {
    localMaximaFrames = [];
    
    if (brightnessData.length < 10) {
        console.log('数据点太少，无法进行可靠的峰值检测');
        return;
    }
    
    const smoothedValues = brightnessData.map(d => d.avgBrightness);
    const sensitivity = peakSensitivity.value;
    
    console.log('开始简化峰值检测，敏感度:', sensitivity);
    
    // 计算统计量
    const mean = smoothedValues.reduce((a, b) => a + b) / smoothedValues.length;
    const variance = smoothedValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / smoothedValues.length;
    const stdDev = Math.sqrt(variance);
    
    // 根据敏感度设置阈值
    let threshold;
    let minDistance;
    
    switch (sensitivity) {
        case 'low':
            threshold = mean + 1.5 * stdDev;
            minDistance = Math.floor(smoothedValues.length / 10);
            break;
        case 'high':
            threshold = mean + 0.5 * stdDev;
            minDistance = Math.floor(smoothedValues.length / 25);
            break;
        default: // medium
            threshold = mean + stdDev;
            minDistance = Math.floor(smoothedValues.length / 15);
    }
    
    console.log(`峰值检测参数: 阈值=${threshold.toFixed(2)}, 最小距离=${minDistance}`);
    
    // 简单的峰值检测算法
    const candidates = [];
    
    for (let i = minDistance; i < smoothedValues.length - minDistance; i++) {
        const current = smoothedValues[i];
        
        if (current < threshold) continue;
        
        let isLocalMax = true;
        for (let j = i - minDistance; j <= i + minDistance; j++) {
            if (j !== i && smoothedValues[j] >= current) {
                isLocalMax = false;
                break;
            }
        }
        
        if (isLocalMax) {
            candidates.push({
                index: i,
                value: current,
                significance: (current - mean) / stdDev
            });
        }
    }
    
    // 按显著性排序，选择最好的峰值
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
        
        if (finalPeaks.length >= 20) break;
    }
    
    // 按索引重新排序并转换为期望的格式
    finalPeaks.sort((a, b) => a.index - b.index);
    
    localMaximaFrames = finalPeaks.map(peak => ({
        frameNumber: peak.index,
        time: brightnessData[peak.index].frameTime,
        value: peak.value,
        prominence: peak.significance || 1.0,
        significance: peak.significance || 1.0
    }));
    
    console.log(`简化峰值检测完成: 检测到${localMaximaFrames.length}个可靠峰值`);
}

// --- 完整分析流程 ---
async function performCompleteAnalysis() {
    try {
        updateProgress(10, '开始智能亮度分析...');
        
        const analysisResults = await analyzeBrightness();
        
        updateProgress(50, '智能峰值检测...');
        findLocalMaxima();
        
        updateAnalysisStats(analysisResults);
        
        updateProgress(55, '生成亮度分析图表...');
        createBrightnessChart();
        
        if (localMaximaFrames.length === 0) {
            updateProgress(-1, '未找到显著的亮度峰值，请调整参数或检查视频内容。');
            return;
        }
        
        const engineName = currentOCREngine === 'paddle' ? 'PaddleOCR' : 'Tesseract';
        updateProgress(60, `找到 ${localMaximaFrames.length} 个可靠亮度峰值，开始${engineName}识别...`);
        
        await performOCRAnalysis();
        
        updateProgress(95, '生成最终结果...');
        displayResults();
        
        updateProgress(-1, `智能分析完成！使用${engineName}引擎，采样${analysisResults.totalSamples}个点，检测到${localMaximaFrames.length}个可靠峰值。`);
        
    } catch (error) {
        console.error('分析过程出错:', error);
        updateProgress(-1, `分析失败: ${error.message}`);
    } finally {
        startAnalysisBtn.disabled = false;
        testOcrBtn.disabled = false;
        if (ocrEngineSelect) ocrEngineSelect.disabled = false;
        currentMode = 'ready_to_analyze';
    }
}

// --- 辅助函数 ---
function seekToTime(time) {
    return new Promise(resolve => {
        const onSeeked = () => {
            videoPlayer.removeEventListener('seeked', onSeeked);
            resolve();
        };
        videoPlayer.addEventListener('seeked', onSeeked);
        videoPlayer.currentTime = time;
    });
}

function calculateAverageBrightness(imageData) {
    const data = imageData.data;
    let totalBrightness = 0;
    let pixelCount = 0;
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        totalBrightness += (0.299 * r + 0.587 * g + 0.114 * b);
        pixelCount++;
    }
    
    return pixelCount > 0 ? totalBrightness / pixelCount : 0;
}

// --- OCR分析 ---
async function performOCRAnalysis() {
    analysisResults = [];
    
    for (let i = 0; i < localMaximaFrames.length; i++) {
        currentMaximaProcessingIndex = i;
        const frameData = localMaximaFrames[i];
        
        const progress = 60 + (i / localMaximaFrames.length * 35);
        const engineName = currentOCREngine === 'paddle' ? 'PaddleOCR' : 'Tesseract';
        updateProgress(progress, `${engineName}处理进度: ${i + 1}/${localMaximaFrames.length} (时间: ${frameData.time.toFixed(2)}s)`);
        
        await seekToTime(frameData.time);
        
        const ocrResult = await performSingleOCR(frameData.time, i);
        analysisResults.push(ocrResult);
    }
}

// --- 单帧OCR处理 ---
async function performSingleOCR(frameTime, occurrenceIndex, isTest = false) {
    try {
        processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = ocrRect.width;
        tempCanvas.height = ocrRect.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.drawImage(
            processingCanvas,
            ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height,
            0, 0, ocrRect.width, ocrRect.height
        );
        
        const enhancedResult = await enhancedOCR.processImageWithMultipleStrategies(tempCanvas, tempCtx);
        
        console.log(`增强OCR结果 (时间${frameTime.toFixed(2)}s, 引擎${currentOCREngine}):`, enhancedResult);
        
        return {
            occurrenceIndex: occurrenceIndex + 1,
            frameTime: frameTime,
            value: enhancedResult.value,
            rawText: enhancedResult.rawText,
            confidence: enhancedResult.confidence,
            strategy: enhancedResult.strategyName || enhancedResult.strategy,
            hasDecimalPoint: enhancedResult.hasDecimalPoint,
            score: enhancedResult.score,
            engine: currentOCREngine === 'paddle' ? 'PaddleOCR' : 'Tesseract'
        };
        
    } catch (error) {
        console.error(`增强OCR处理失败 (时间${frameTime.toFixed(2)}s, 引擎${currentOCREngine}):`, error);
        return {
            occurrenceIndex: occurrenceIndex + 1,
            frameTime: frameTime,
            value: NaN,
            rawText: '',
            confidence: 0,
            strategy: 'error',
            hasDecimalPoint: false,
            score: 0,
            engine: currentOCREngine === 'paddle' ? 'PaddleOCR' : 'Tesseract'
        };
    }
}

// --- 显示OCR测试详细结果 ---
function displayOCRTestDetails(result) {
    const engineName = result.engine || (currentOCREngine === 'paddle' ? 'PaddleOCR' : 'Tesseract');
    const engineClass = currentOCREngine === 'paddle' ? 'paddle' : 'tesseract';
    
    ocrTestResult.style.display = 'block';
    ocrTestResult.innerHTML = `
        <div class="ocr-result-header ${engineClass}">
            <strong>${engineName} 测试结果</strong>
        </div>
        <div class="ocr-result-details">
            <div class="result-row">
                <span class="label">🔢 识别数字:</span>
                <span class="value ${isNaN(result.value) ? 'error' : 'success'}">${isNaN(result.value) ? 'N/A' : result.value}</span>
            </div>
            <div class="result-row">
                <span class="label">📝 原始文本:</span>
                <span class="value">"${result.rawText}"</span>
            </div>
            <div class="result-row">
                <span class="label">🎯 置信度:</span>
                <span class="value confidence-${getConfidenceLevel(result.confidence)}">${result.confidence.toFixed(1)}%</span>
            </div>
            <div class="result-row">
                <span class="label">⚙️ 使用策略:</span>
                <span class="value">${result.strategy || result.strategyName}</span>
            </div>
            <div class="result-row">
                <span class="label">📊 评分:</span>
                <span class="value">${result.score ? result.score.toFixed(3) : 'N/A'}</span>
            </div>
            <div class="result-row">
                <span class="label">🔘 小数点:</span>
                <span class="value ${result.hasDecimalPoint ? 'success' : 'neutral'}">${result.hasDecimalPoint ? '✓ 检测到' : '✗ 未检测到'}</span>
            </div>
            <div class="engine-badge ${engineClass}">
                ${currentOCREngine === 'paddle' ? '🚀 PaddleOCR 小数点优化' : '🔍 Tesseract 传统识别'}
            </div>
        </div>
        <div class="tip">
            💡 <strong>提示:</strong> 点击下方策略预览查看详细处理过程
            ${currentOCREngine === 'paddle' ? '<br>🎯 PaddleOCR针对小数点识别进行了特别优化' : ''}
        </div>
    `;
}

function getConfidenceLevel(confidence) {
    if (confidence >= 80) return 'high';
    if (confidence >= 60) return 'medium';
    return 'low';
}

// --- 创建图表 ---
function createBrightnessChart() {
    if (brightnessData.length === 0) return;
    
    if (brightnessChartInstance) {
        brightnessChartInstance.destroy();
    }
    
    const chartData = {
        labels: brightnessData.map(d => d.frameTime.toFixed(1)),
        datasets: [
            {
                label: '原始亮度',
                data: brightnessData.map(d => d.rawBrightness || d.avgBrightness),
                borderColor: 'rgba(255, 99, 132, 0.5)',
                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                borderWidth: 1,
                pointRadius: 0
            },
            {
                label: '平滑亮度',
                data: brightnessData.map(d => d.avgBrightness),
                borderColor: 'rgba(54, 162, 235, 0.8)',
                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                borderWidth: 2,
                pointRadius: 0
            },
            {
                label: '检测峰值',
                data: localMaximaFrames.map(p => ({
                    x: p.time.toFixed(1),
                    y: p.value
                })),
                borderColor: 'rgba(255, 206, 86, 1)',
                backgroundColor: 'rgba(255, 206, 86, 0.8)',
                borderWidth: 0,
                pointRadius: 8,
                pointStyle: 'triangle',
                showLine: false
            }
        ]
    };
    
    brightnessChartInstance = new Chart(brightnessChartCtx, {
        type: 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { title: { display: true, text: '时间 (秒)' } },
                y: { title: { display: true, text: '亮度值' } }
            },
            plugins: {
                title: {
                    display: true,
                    text: `智能亮度分析曲线 - ${currentOCREngine === 'paddle' ? 'PaddleOCR引擎' : 'Tesseract引擎'}`
                }
            }
        }
    });
}

function displayResults() {
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>序号</th><th>帧时间(s)</th><th>识别数字</th><th>原始文本</th>
                    <th>置信度</th><th>策略</th><th>小数点</th><th>评分</th><th>引擎</th>
                </tr>
            </thead><tbody>
    `;
    
    if (analysisResults.length === 0) {
        tableHTML += '<tr><td colspan="9">无分析结果</td></tr>';
    } else {
        analysisResults.forEach(result => {
            const engineBadge = result.engine === 'PaddleOCR' ? '🚀' : '🔍';
            tableHTML += `
                <tr>
                    <td>${result.occurrenceIndex}</td>
                    <td>${result.frameTime.toFixed(2)}</td>
                    <td>${isNaN(result.value) ? 'N/A' : result.value}</td>
                    <td>${result.rawText || 'N/A'}</td>
                    <td>${result.confidence ? result.confidence.toFixed(1) + '%' : 'N/A'}</td>
                    <td>${result.strategy || 'N/A'}</td>
                    <td>${result.hasDecimalPoint ? '✓' : '✗'}</td>
                    <td>${result.score ? result.score.toFixed(3) : 'N/A'}</td>
                    <td>${engineBadge} ${result.engine || currentOCREngine}</td>
                </tr>
            `;
        });
    }
    
    tableHTML += '</tbody></table>';
    resultsTableContainer.innerHTML = tableHTML;
    createResultChart();
}

function createResultChart() {
    if (chartInstance) chartInstance.destroy();
    
    const validResults = analysisResults.filter(r => !isNaN(r.value));
    
    if (validResults.length === 0) {
        resultsChartCtx.clearRect(0, 0, resultsChartCtx.canvas.width, resultsChartCtx.canvas.height);
        return;
    }
    
    chartInstance = new Chart(resultsChartCtx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: `识别数字 (${currentOCREngine === 'paddle' ? 'PaddleOCR' : 'Tesseract'})`,
                data: validResults.map(r => ({ x: r.occurrenceIndex, y: r.value })),
                borderColor: currentOCREngine === 'paddle' ? 'rgb(75, 192, 75)' : 'rgb(75, 192, 192)',
                backgroundColor: currentOCREngine === 'paddle' ? 'rgba(75, 192, 75, 0.6)' : 'rgba(75, 192, 192, 0.6)',
                showLine: true,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { type: 'linear', title: { display: true, text: '出现次序' }, ticks: { stepSize: 1 } },
                y: { title: { display: true, text: '识别数字' } }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const pointData = validResults[context.dataIndex];
                            return `数字: ${context.parsed.y} (时间: ${pointData.frameTime.toFixed(2)}s, 策略: ${pointData.strategy})`;
                        }
                    }
                }
            }
        }
    });
}

// --- 初始化 ---
window.addEventListener('load', () => {
    initializeOCR();
    updateDebugInfo();
});
