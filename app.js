// app.js - 带增强OCR功能的完整版本

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
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const resultsTableContainer = document.getElementById('resultsTableContainer');
const resultsChartCtx = document.getElementById('resultsChart').getContext('2d');

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

// OCR 相关
let ocrWorker = null;
let enhancedOCR = null;
let currentMaximaProcessingIndex = 0;

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
    debugInfo.innerHTML = `
        视频原始尺寸: ${videoNaturalWidth} × ${videoNaturalHeight}<br>
        视频显示尺寸: ${Math.round(videoDisplayWidth)} × ${Math.round(videoDisplayHeight)}<br>
        画布内部尺寸: ${drawingCanvas.width} × ${drawingCanvas.height}<br>
        当前模式: ${currentMode}<br>
        当前时间: ${videoPlayer.currentTime ? videoPlayer.currentTime.toFixed(2) + 's' : 'N/A'}<br>
        亮度区域: ${brightnessRect ? `${Math.round(brightnessRect.x)},${Math.round(brightnessRect.y)},${Math.round(brightnessRect.width)},${Math.round(brightnessRect.height)}` : '未定义'}<br>
        OCR区域: ${ocrRect ? `${Math.round(ocrRect.x)},${Math.round(ocrRect.y)},${Math.round(ocrRect.width)},${Math.round(ocrRect.height)}` : '未定义'}
    `;
}

// --- 预览更新函数（修复版） ---
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
            缩放比例: ${scale.toFixed(2)}x
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
        const processedData = enhancedOCR.strategy1_BasicThreshold(tempCtx, tempCanvas);
        
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
        
        ocrProcessedPreviewCtx.strokeStyle = '#6f42c1';
        ocrProcessedPreviewCtx.lineWidth = 2;
        ocrProcessedPreviewCtx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
        
        const whiteRatio = processedData.whitePixels / (processedData.whitePixels + processedData.blackPixels) * 100;
        
        ocrProcessedPreviewInfo.innerHTML = `
            预处理: ${processedData.strategy}<br>
            阈值: ${processedData.threshold}<br>
            白色比例: ${whiteRatio.toFixed(1)}%
        `;
        
    } catch (error) {
        console.error('OCR预处理预览失败:', error);
        showEmptyPreview(ocrProcessedPreviewCtx, ocrProcessedPreviewCanvas, '预处理失败');
        ocrProcessedPreviewInfo.innerHTML = 'OCR预处理失败';
    }
}

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

// --- OCR 初始化 ---
async function initializeOCR() {
    updateProgress(0, '正在初始化 OCR 服务...');
    try {
        ocrWorker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const progressMsg = `OCR 识别中 (峰值 ${currentMaximaProcessingIndex + 1}/${localMaximaFrames.length}): ${Math.round(m.progress * 100)}%`;
                    updateProgress(m.progress * 100, progressMsg);
                }
            }
        });
        
        updateProgress(25, '加载OCR语言包...');
        await ocrWorker.loadLanguage('eng');
        
        updateProgress(50, '初始化OCR引擎...');
        await ocrWorker.initialize('eng');
        
        updateProgress(75, '创建增强OCR系统...');
        enhancedOCR = new EnhancedOCR(ocrWorker);
        
        updateProgress(-1, 'OCR 服务已就绪。请上传视频。');
        console.log("增强OCR系统初始化完成");
    } catch (error) {
        console.error("OCR 初始化失败:", error);
        updateProgress(-1, 'OCR 服务初始化失败。');
        alert(`OCR 初始化失败: ${error.message}`);
    }
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
        drawingCtx.strokeStyle = 'rgba(0, 0, 255, 0.8)';
        drawingCtx.lineWidth = 3;
        drawingCtx.strokeRect(ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height);
        
        drawingCtx.fillStyle = 'rgba(0, 0, 255, 0.8)';
        drawingCtx.font = '16px Arial';
        drawingCtx.fillText('OCR区域', ocrRect.x, ocrRect.y - 5);
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
    
    updateProgress(0, '正在测试当前帧OCR...');
    testOcrBtn.disabled = true;
    
    try {
        const result = await performSingleOCR(videoPlayer.currentTime, 0, true);
        displayOCRTestDetails(result);
        updateProgress(-1, 'OCR测试完成。');
        
        // 显示策略预览
        const strategyCanvases = enhancedOCR.getStrategyCanvases();
        showStrategyPreviews(strategyCanvases);
        
    } catch (error) {
        ocrTestResult.style.display = 'block';
        ocrTestResult.innerHTML = `<strong>OCR测试失败:</strong><br>${error.message}`;
        updateProgress(-1, 'OCR测试失败。');
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
    
