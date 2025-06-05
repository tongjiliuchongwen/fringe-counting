// app.js - 智能增强版视频分析工具

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
        检测峰值: ${localMaximaFrames.length}个
    `;
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
            offsetX, offsetY, previewWidth,
