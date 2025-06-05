// app.js - 修复预览和OCR的完整版本

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
let currentMaximaProcessingIndex = 0;

// 预览更新防抖
let previewUpdateTimeout = null;

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
    }, 100); // 100ms防抖
}

function updatePreviews() {
    if (!videoFile || videoPlayer.readyState < 2) {
        console.log('视频未准备好，跳过预览更新');
        return;
    }
    
    try {
        // 首先更新处理画布
        processingCtx.clearRect(0, 0, processingCanvas.width, processingCanvas.height);
        processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        // 更新各个预览
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
        // 计算预览缩放比例
        const maxWidth = brightnessPreviewCanvas.width - 20; // 留边距
        const maxHeight = brightnessPreviewCanvas.height - 20;
        const scale = Math.min(maxWidth / brightnessRect.width, maxHeight / brightnessRect.height, 3); // 最大放大3倍
        
        const previewWidth = brightnessRect.width * scale;
        const previewHeight = brightnessRect.height * scale;
        const offsetX = (brightnessPreviewCanvas.width - previewWidth) / 2;
        const offsetY = (brightnessPreviewCanvas.height - previewHeight) / 2;
        
        // 绘制背景
        brightnessPreviewCtx.fillStyle = '#f8f9fa';
        brightnessPreviewCtx.fillRect(0, 0, brightnessPreviewCanvas.width, brightnessPreviewCanvas.height);
        
        // 绘制区域内容
        brightnessPreviewCtx.drawImage(
            processingCanvas,
            brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height,
            offsetX, offsetY, previewWidth, previewHeight
        );
        
        // 绘制边框
        brightnessPreviewCtx.strokeStyle = '#dc3545';
        brightnessPreviewCtx.lineWidth = 2;
        brightnessPreviewCtx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
        
        // 计算当前区域的平均亮度
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
        ocrTestResult.style.display = 'none';
        return;
    }
    
    try {
        // 原始OCR区域预览
        const maxWidth = ocrPreviewCanvas.width - 20;
        const maxHeight = ocrPreviewCanvas.height - 20;
        const scale = Math.min(maxWidth / ocrRect.width, maxHeight / ocrRect.height, 5); // OCR区域可以放大更多
        
        const previewWidth = ocrRect.width * scale;
        const previewHeight = ocrRect.height * scale;
        const offsetX = (ocrPreviewCanvas.width - previewWidth) / 2;
        const offsetY = (ocrPreviewCanvas.height - previewHeight) / 2;
        
        // 绘制原始区域背景
        ocrPreviewCtx.fillStyle = '#f8f9fa';
        ocrPreviewCtx.fillRect(0, 0, ocrPreviewCanvas.width, ocrPreviewCanvas.height);
        
        // 绘制原始OCR区域
        ocrPreviewCtx.drawImage(
            processingCanvas,
            ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height,
            offsetX, offsetY, previewWidth, previewHeight
        );
        
        // 绘制边框
        ocrPreviewCtx.strokeStyle = '#007bff';
        ocrPreviewCtx.lineWidth = 2;
        ocrPreviewCtx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
        
        ocrPreviewInfo.innerHTML = `
            区域大小: ${Math.round(ocrRect.width)}×${Math.round(ocrRect.height)}px<br>
            位置: (${Math.round(ocrRect.x)}, ${Math.round(ocrRect.y)})<br>
            缩放比例: ${scale.toFixed(2)}x
        `;
        
        // 预处理结果预览
        updateOcrProcessedPreview(scale);
        
    } catch (error) {
        console.error('OCR预览更新失败:', error);
        showEmptyPreview(ocrPreviewCtx, ocrPreviewCanvas, '预览失败');
        showEmptyPreview(ocrProcessedPreviewCtx, ocrProcessedPreviewCanvas, '预览失败');
        ocrPreviewInfo.innerHTML = 'OCR预览更新失败';
        ocrProcessedPreviewInfo.innerHTML = 'OCR预处理失败';
    }
}

function updateOcrProcessedPreview(scale) {
    if (!ocrRect) return;
    
    try {
        // 创建临时画布用于预处理
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = ocrRect.width;
        tempCanvas.height = ocrRect.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        // 复制OCR区域到临时画布
        tempCtx.drawImage(
            processingCanvas,
            ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height,
            0, 0, ocrRect.width, ocrRect.height
        );
        
        // 进行预处理
        const processedData = preprocessImageForOCR(tempCtx, tempCanvas);
        
        // 绘制预处理结果
        const previewWidth = ocrRect.width * scale;
        const previewHeight = ocrRect.height * scale;
        const offsetX = (ocrProcessedPreviewCanvas.width - previewWidth) / 2;
        const offsetY = (ocrProcessedPreviewCanvas.height - previewHeight) / 2;
        
        // 绘制背景
        ocrProcessedPreviewCtx.fillStyle = '#f8f9fa';
        ocrProcessedPreviewCtx.fillRect(0, 0, ocrProcessedPreviewCanvas.width, ocrProcessedPreviewCanvas.height);
        
        // 绘制预处理结果
        ocrProcessedPreviewCtx.drawImage(
            tempCanvas,
            0, 0, ocrRect.width, ocrRect.height,
            offsetX, offsetY, previewWidth, previewHeight
        );
        
        // 绘制边框
        ocrProcessedPreviewCtx.strokeStyle = '#6f42c1';
        ocrProcessedPreviewCtx.lineWidth = 2;
        ocrProcessedPreviewCtx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
        
        ocrProcessedPreviewInfo.innerHTML = `
            预处理完成<br>
            白色像素: ${processedData.whitePixels}<br>
            黑色像素: ${processedData.blackPixels}<br>
            白色比例: ${processedData.whiteRatio.toFixed(2)}%
        `;
        
    } catch (error) {
        console.error('OCR预处理预览失败:', error);
        showEmptyPreview(ocrProcessedPreviewCtx, ocrProcessedPreviewCanvas, '预处理失败');
        ocrProcessedPreviewInfo.innerHTML = 'OCR预处理失败';
    }
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
    statusMessage.textContent = '正在初始化 OCR 服务...';
    try {
        ocrWorker = await Tesseract.createWorker('eng', 1, {
            logger: m => {
                if (m.status === 'recognizing text') {
                    const progressMsg = `OCR 识别中 (峰值 ${currentMaximaProcessingIndex + 1}/${localMaximaFrames.length}): ${Math.round(m.progress * 100)}%`;
                    statusMessage.textContent = progressMsg;
                }
            }
        });
        await ocrWorker.loadLanguage('eng');
        await ocrWorker.initialize('eng');
        statusMessage.textContent = 'OCR 服务已就绪。请上传视频。';
        console.log("OCR 初始化完成");
    } catch (error) {
        console.error("OCR 初始化失败:", error);
        statusMessage.textContent = 'OCR 服务初始化失败。';
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
    statusMessage.textContent = '视频加载中...';
});

// 视频元数据加载完成
videoPlayer.addEventListener('loadedmetadata', () => {
    videoNaturalWidth = videoPlayer.videoWidth;
    videoNaturalHeight = videoPlayer.videoHeight;
    
    console.log(`视频原始尺寸: ${videoNaturalWidth} × ${videoNaturalHeight}`);
    
    setTimeout(() => {
        syncCanvasWithVideo();
        statusMessage.textContent = '视频已加载。请在视频上绘制亮度分析区域（红色框）。';
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
    if (!ocrRect || !ocrWorker) {
        alert('请先定义OCR区域且确保OCR服务已初始化。');
        return;
    }
    
    statusMessage.textContent = '正在测试当前帧OCR...';
    testOcrBtn.disabled = true;
    
    try {
        const result = await performSingleOCR(videoPlayer.currentTime, 0, true);
        ocrTestResult.style.display = 'block';
        ocrTestResult.innerHTML = `
            <strong>OCR测试结果:</strong><br>
            原始文本: "${result.rawText}"<br>
            识别数字: ${isNaN(result.value) ? 'N/A' : result.value}<br>
            帧时间: ${result.frameTime.toFixed(2)}s
        `;
        statusMessage.textContent = 'OCR测试完成。';
    } catch (error) {
        ocrTestResult.style.display = 'block';
        ocrTestResult.innerHTML = `<strong>OCR测试失败:</strong><br>${error.message}`;
        statusMessage.textContent = 'OCR测试失败。';
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
    
    const color = currentMode === 'brightness' ? 'rgba(255, 0, 0, 0.5)' : 'rgba(0, 0, 255, 0.5)';
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
    
    const rect = {
        x: Math.min(currentDrawingStart.x, coords.x),
        y: Math.min(currentDrawingStart.y, coords.y),
        width: Math.abs(coords.x - currentDrawingStart.x),
        height: Math.abs(coords.y - currentDrawingStart.y)
    };
    
    if (rect.width < 10 || rect.height < 10) {
        statusMessage.textContent = '绘制的区域太小，请重新绘制。';
        clearAndRedrawRects();
        return;
    }
    
    if (currentMode === 'brightness') {
        brightnessRect = rect;
        currentMode = 'ocr_define';
        statusMessage.textContent = '亮度区域已定义。现在请绘制数字识别区域（蓝色框）。';
        console.log('亮度区域已定义:', brightnessRect);
    } else if (currentMode === 'ocr_define') {
        ocrRect = rect;
        currentMode = 'ready_to_analyze';
        statusMessage.textContent = '所有区域已定义完成。可以测试OCR或开始完整分析。';
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
    
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    
    resultsTableContainer.innerHTML = "";
    ocrTestResult.style.display = 'none';
    clearAndRedrawRects();
    updateDebugInfo();
    schedulePreviewUpdate();
}

// --- 完整分析流程 ---
async function performCompleteAnalysis() {
    try {
        statusMessage.textContent = '开始分析视频亮度...';
        
        await analyzeBrightness();
        findLocalMaxima();
        
        if (localMaximaFrames.length === 0) {
            statusMessage.textContent = '未找到亮度峰值，请调整亮度区域或检查视频内容。';
            return;
        }
        
        statusMessage.textContent = `找到 ${localMaximaFrames.length} 个亮度峰值，开始OCR识别...`;
        
        await performOCRAnalysis();
        displayResults();
        
        statusMessage.textContent = '分析完成！';
        
    } catch (error) {
        console.error('分析过程出错:', error);
        statusMessage.textContent = `分析失败: ${error.message}`;
    } finally {
        startAnalysisBtn.disabled = false;
        testOcrBtn.disabled = false;
        currentMode = 'ready_to_analyze';
    }
}

// --- 亮度分析 ---
async function analyzeBrightness() {
    brightnessData = [];
    const duration = videoPlayer.duration;
    const frameRate = 25;
    const interval = 1 / frameRate;
    let currentTime = 0;
    let frameCount = 0;
    
    while (currentTime <= duration) {
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
            frameTime: currentTime,
            avgBrightness: avgBrightness
        });
        
        frameCount++;
        const progress = (currentTime / duration * 100).toFixed(1);
        statusMessage.textContent = `分析亮度进度: ${progress}% (帧: ${frameCount})`;
        
        currentTime += interval;
        if (currentTime > duration) {
            currentTime = duration;
        }
        if (currentTime === duration) break;
    }
    
    console.log(`亮度分析完成，共处理 ${brightnessData.length} 帧`);
}

// --- 辅助函数：跳转到指定时间 ---
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

// --- 辅助函数：计算平均亮度 ---
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

// --- 寻找局部最大值 ---
function findLocalMaxima() {
    localMaximaFrames = [];
    
    if (brightnessData.length < 3) return;
    
    for (let i = 1; i < brightnessData.length - 1; i++) {
        const current = brightnessData[i].avgBrightness;
        const prev = brightnessData[i - 1].avgBrightness;
        const next = brightnessData[i + 1].avgBrightness;
        
        if (current > prev && current > next) {
            localMaximaFrames.push({
                time: brightnessData[i].frameTime,
                value: current
            });
        }
    }
    
    console.log(`找到 ${localMaximaFrames.length} 个局部最大值:`, localMaximaFrames);
}

// --- OCR分析 ---
async function performOCRAnalysis() {
    analysisResults = [];
    
    for (let i = 0; i < localMaximaFrames.length; i++) {
        currentMaximaProcessingIndex = i;
        const frameData = localMaximaFrames[i];
        
        statusMessage.textContent = `OCR处理进度: ${i + 1}/${localMaximaFrames.length} (时间: ${frameData.time.toFixed(2)}s)`;
        
        await seekToTime(frameData.time);
        
        const ocrResult = await performSingleOCR(frameData.time, i);
        analysisResults.push(ocrResult);
    }
}

// --- 单帧OCR处理（改进版） ---
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
        
        // 改进的预处理
        preprocessImageForOCR(tempCtx, tempCanvas);
        
        // 优化的OCR参数
        await ocrWorker.setParameters({
            tessedit_char_whitelist: '0123456789.',
            tessedit_pageseg_mode: '8', // 改为单词模式，对小数点更友好
            tessedit_ocr_engine_mode: '2', // 使用LSTM引擎
        });
        
        const { data: { text } } = await ocrWorker.recognize(tempCanvas);
        console.log(`OCR结果 (时间${frameTime.toFixed(2)}s): "${text.trim()}"`);
        
        // 改进的数字提取正则
        const cleanText = text.trim().replace(/[^\d.]/g, ''); // 只保留数字和小数点
        const numberMatch = cleanText.match(/^\d*\.?\d+$/); // 匹配完整的数字（可能包含小数点）
        let ocrValue = NaN;
        
        if (numberMatch) {
            ocrValue = parseFloat(numberMatch[0]);
        } else {
            // 尝试更宽松的匹配
            const fallbackMatch = text.trim().match(/(\d+\.?\d*)/);
            if (fallbackMatch) {
                ocrValue = parseFloat(fallbackMatch[0]);
            }
        }
        
        return {
            occurrenceIndex: occurrenceIndex + 1,
            frameTime: frameTime,
            value: ocrValue,
            rawText: text.trim()
        };
        
    } catch (error) {
        console.error(`OCR处理失败 (时间${frameTime.toFixed(2)}s):`, error);
        return {
            occurrenceIndex: occurrenceIndex + 1,
            frameTime: frameTime,
            value: NaN,
            rawText: ''
        };
    }
}

// --- 改进的图像预处理 ---
function preprocessImageForOCR(ctx, canvas) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    // 统计像素信息
    let whitePixels = 0;
    let blackPixels = 0;
    
    // 第一步：自适应阈值计算
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        totalBrightness += brightness;
    }
    
    const avgBrightness = totalBrightness / (data.length / 4);
    const threshold = Math.max(120, Math.min(200, avgBrightness + 20)); // 自适应阈值
    
    // 第二步：二值化处理
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        
        if (brightness > threshold) {
            // 白色（数字）
            data[i] = data[i + 1] = data[i + 2] = 255;
            whitePixels++;
        } else {
            // 黑色（背景）
            data[i] = data[i + 1] = data[i + 2] = 0;
            blackPixels++;
        }
        data[i + 3] = 255; // Alpha通道
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // 返回统计信息
    const totalPixels = whitePixels + blackPixels;
    return {
        whitePixels,
        blackPixels,
        whiteRatio: totalPixels > 0 ? (whitePixels / totalPixels) * 100 : 0,
        threshold
    };
}

// --- 显示结果 ---
function displayResults() {
    let tableHTML = `
        <table>
            <thead>
                <tr>
                    <th>序号</th>
                    <th>帧时间(s)</th>
                    <th>识别数字</th>
                    <th>原始文本</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    if (analysisResults.length === 0) {
        tableHTML += '<tr><td colspan="4">无分析结果</td></tr>';
    } else {
        analysisResults.forEach(result => {
            tableHTML += `
                <tr>
                    <td>${result.occurrenceIndex}</td>
                    <td>${result.frameTime.toFixed(2)}</td>
                    <td>${isNaN(result.value) ? 'N/A' : result.value}</td>
                    <td>${result.rawText || 'N/A'}</td>
                </tr>
            `;
        });
    }
    
    tableHTML += '</tbody></table>';
    resultsTableContainer.innerHTML = tableHTML;
    
    createResultChart();
}

// --- 创建结果图表 ---
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
                label: '识别数字',
                data: validResults.map(r => ({ x: r.occurrenceIndex, y: r.value })),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                showLine: true,
                pointRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: '出现次序' },
                    ticks: { stepSize: 1 }
                },
                y: {
                    title: { display: true, text: '识别数字' }
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const pointData = validResults[context.dataIndex];
                            return `数字: ${context.parsed.y} (时间: ${pointData.frameTime.toFixed(2)}s)`;
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
