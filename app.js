// app.js - 带预览功能的完整版本

// --- DOM 元素获取 ---
const videoUpload = document.getElementById('videoUpload');
const videoPlayer = document.getElementById('videoPlayer');
const drawingCanvas = document.getElementById('drawingCanvas');
const drawingCtx = drawingCanvas.getContext('2d');
const processingCanvas = document.getElementById('processingCanvas');
const processingCtx = processingCanvas.getContext('2d');
const startAnalysisBtn = document.getElementById('startAnalysisBtn');
const refreshPreviewBtn = document.getElementById('refreshPreviewBtn');
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

// --- 全局状态变量 ---
let videoFile = null;
let brightnessRect = null;    // 亮度分析区域
let ocrRect = null;           // OCR识别区域
let isDrawing = false;
let currentDrawingStart = {};
let currentMode = 'brightness'; // 'brightness' -> 'ocr_define' -> 'ready_to_analyze' -> 'analyzing'

// 视频和画布尺寸信息
let videoNaturalWidth = 0;    // 视频原始宽度
let videoNaturalHeight = 0;   // 视频原始高度
let videoDisplayWidth = 0;    // 视频在页面中的显示宽度
let videoDisplayHeight = 0;   // 视频在页面中的显示高度

// 分析结果
let brightnessData = [];
let analysisResults = [];
let localMaximaFrames = [];
let chartInstance = null;

// OCR 相关
let ocrWorker = null;
let currentMaximaProcessingIndex = 0;

// --- 调试信息更新函数 ---
function updateDebugInfo() {
    debugInfo.innerHTML = `
        视频原始尺寸: ${videoNaturalWidth} × ${videoNaturalHeight}<br>
        视频显示尺寸: ${videoDisplayWidth} × ${videoDisplayHeight}<br>
        画布内部尺寸: ${drawingCanvas.width} × ${drawingCanvas.height}<br>
        画布显示尺寸: ${drawingCanvas.style.width} × ${drawingCanvas.style.height}<br>
        当前模式: ${currentMode}<br>
        亮度区域: ${brightnessRect ? `${Math.round(brightnessRect.x)},${Math.round(brightnessRect.y)},${Math.round(brightnessRect.width)},${Math.round(brightnessRect.height)}` : '未定义'}<br>
        OCR区域: ${ocrRect ? `${Math.round(ocrRect.x)},${Math.round(ocrRect.y)},${Math.round(ocrRect.width)},${Math.round(ocrRect.height)}` : '未定义'}
    `;
}

// --- 预览更新函数 ---
function updatePreviews() {
    if (!videoFile) return;
    
    // 确保视频当前帧已绘制到处理画布
    processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
    
    // 更新亮度区域预览
    updateBrightnessPreview();
    
    // 更新OCR区域预览
    updateOcrPreview();
}

function updateBrightnessPreview() {
    if (!brightnessRect) {
        brightnessPreviewCtx.clearRect(0, 0, brightnessPreviewCanvas.width, brightnessPreviewCanvas.height);
        brightnessPreviewCtx.fillStyle = '#f0f0f0';
        brightnessPreviewCtx.fillRect(0, 0, brightnessPreviewCanvas.width, brightnessPreviewCanvas.height);
        brightnessPreviewCtx.fillStyle = '#999';
        brightnessPreviewCtx.font = '12px Arial';
        brightnessPreviewCtx.textAlign = 'center';
        brightnessPreviewCtx.fillText('未定义', brightnessPreviewCanvas.width/2, brightnessPreviewCanvas.height/2);
        brightnessPreviewInfo.textContent = '未定义区域';
        return;
    }
    
    // 绘制亮度区域到预览画布
    const scale = Math.min(
        brightnessPreviewCanvas.width / brightnessRect.width,
        brightnessPreviewCanvas.height / brightnessRect.height
    );
    
    const previewWidth = brightnessRect.width * scale;
    const previewHeight = brightnessRect.height * scale;
    const offsetX = (brightnessPreviewCanvas.width - previewWidth) / 2;
    const offsetY = (brightnessPreviewCanvas.height - previewHeight) / 2;
    
    brightnessPreviewCtx.clearRect(0, 0, brightnessPreviewCanvas.width, brightnessPreviewCanvas.height);
    brightnessPreviewCtx.drawImage(
        processingCanvas,
        brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height,
        offsetX, offsetY, previewWidth, previewHeight
    );
    
    // 计算当前区域的平均亮度
    const imageData = processingCtx.getImageData(
        brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height
    );
    const avgBrightness = calculateAverageBrightness(imageData);
    
    brightnessPreviewInfo.innerHTML = `
        区域: ${Math.round(brightnessRect.width)}×${Math.round(brightnessRect.height)}px<br>
        当前亮度: ${avgBrightness.toFixed(1)}
    `;
}

function updateOcrPreview() {
    if (!ocrRect) {
        ocrPreviewCtx.clearRect(0, 0, ocrPreviewCanvas.width, ocrPreviewCanvas.height);
        ocrPreviewCtx.fillStyle = '#f0f0f0';
        ocrPreviewCtx.fillRect(0, 0, ocrPreviewCanvas.width, ocrPreviewCanvas.height);
        ocrPreviewCtx.fillStyle = '#999';
        ocrPreviewCtx.font = '12px Arial';
        ocrPreviewCtx.textAlign = 'center';
        ocrPreviewCtx.fillText('未定义', ocrPreviewCanvas.width/2, ocrPreviewCanvas.height/2);
        ocrPreviewInfo.textContent = '未定义区域';
        
        // 清空处理结果预览
        ocrProcessedPreviewCtx.clearRect(0, 0, ocrProcessedPreviewCanvas.width, ocrProcessedPreviewCanvas.height);
        ocrProcessedPreviewCtx.fillStyle = '#f0f0f0';
        ocrProcessedPreviewCtx.fillRect(0, 0, ocrProcessedPreviewCanvas.width, ocrProcessedPreviewCanvas.height);
        ocrProcessedPreviewCtx.fillStyle = '#999';
        ocrProcessedPreviewCtx.font = '12px Arial';
        ocrProcessedPreviewCtx.textAlign = 'center';
        ocrProcessedPreviewCtx.fillText('未处理', ocrProcessedPreviewCanvas.width/2, ocrProcessedPreviewCanvas.height/2);
        ocrProcessedPreviewInfo.textContent = '未处理';
        return;
    }
    
    // 绘制OCR区域到预览画布
    const scale = Math.min(
        ocrPreviewCanvas.width / ocrRect.width,
        ocrPreviewCanvas.height / ocrRect.height
    );
    
    const previewWidth = ocrRect.width * scale;
    const previewHeight = ocrRect.height * scale;
    const offsetX = (ocrPreviewCanvas.width - previewWidth) / 2;
    const offsetY = (ocrPreviewCanvas.height - previewHeight) / 2;
    
    ocrPreviewCtx.clearRect(0, 0, ocrPreviewCanvas.width, ocrPreviewCanvas.height);
    ocrPreviewCtx.drawImage(
        processingCanvas,
        ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height,
        offsetX, offsetY, previewWidth, previewHeight
    );
    
    ocrPreviewInfo.innerHTML = `
        区域: ${Math.round(ocrRect.width)}×${Math.round(ocrRect.height)}px<br>
        位置: (${Math.round(ocrRect.x)}, ${Math.round(ocrRect.y)})
    `;
    
    // 生成预处理结果预览
    updateOcrProcessedPreview();
}

function updateOcrProcessedPreview() {
    if (!ocrRect) return;
    
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
    preprocessImageForOCR(tempCtx, tempCanvas);
    
    // 将预处理结果绘制到预览画布
    const scale = Math.min(
        ocrProcessedPreviewCanvas.width / ocrRect.width,
        ocrProcessedPreviewCanvas.height / ocrRect.height
    );
    
    const previewWidth = ocrRect.width * scale;
    const previewHeight = ocrRect.height * scale;
    const offsetX = (ocrProcessedPreviewCanvas.width - previewWidth) / 2;
    const offsetY = (ocrProcessedPreviewCanvas.height - previewHeight) / 2;
    
    ocrProcessedPreviewCtx.clearRect(0, 0, ocrProcessedPreviewCanvas.width, ocrProcessedPreviewCanvas.height);
    ocrProcessedPreviewCtx.drawImage(
        tempCanvas,
        0, 0, ocrRect.width, ocrRect.height,
        offsetX, offsetY, previewWidth, previewHeight
    );
    
    ocrProcessedPreviewInfo.innerHTML = `
        二值化处理完成<br>
        白色=数字，黑色=背景
    `;
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
    // 获取视频在页面中的实际显示尺寸
    const videoRect = videoPlayer.getBoundingClientRect();
    videoDisplayWidth = videoRect.width;
    videoDisplayHeight = videoRect.height;
    
    // 设置画布的内部分辨率为视频原始分辨率
    drawingCanvas.width = videoNaturalWidth;
    drawingCanvas.height = videoNaturalHeight;
    
    // 设置画布的CSS显示尺寸与视频显示尺寸完全一致
    drawingCanvas.style.width = videoDisplayWidth + 'px';
    drawingCanvas.style.height = videoDisplayHeight + 'px';
    
    // 同步处理画布
    processingCanvas.width = videoNaturalWidth;
    processingCanvas.height = videoNaturalHeight;
    
    console.log(`画布同步完成: 内部${videoNaturalWidth}×${videoNaturalHeight}, 显示${videoDisplayWidth}×${videoDisplayHeight}`);
    updateDebugInfo();
    
    // 如果视频已加载，更新预览
    if (videoFile && !videoPlayer.paused) {
        setTimeout(updatePreviews, 100);
    }
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
    
    // 绘制亮度区域（红色）
    if (brightnessRect) {
        drawingCtx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        drawingCtx.lineWidth = 3;
        drawingCtx.strokeRect(brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height);
        
        // 添加标签
        drawingCtx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        drawingCtx.font = '16px Arial';
        drawingCtx.fillText('亮度区域', brightnessRect.x, brightnessRect.y - 5);
    }
    
    // 绘制OCR区域（蓝色）
    if (ocrRect) {
        drawingCtx.strokeStyle = 'rgba(0, 0, 255, 0.8)';
        drawingCtx.lineWidth = 3;
        drawingCtx.strokeRect(ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height);
        
        // 添加标签
        drawingCtx.fillStyle = 'rgba(0, 0, 255, 0.8)';
        drawingCtx.font = '16px Arial';
        drawingCtx.fillText('OCR区域', ocrRect.x, ocrRect.y - 5);
    }
}

// --- 事件监听器 ---

// 1. 视频上传
videoUpload.addEventListener('change', (event) => {
    videoFile = event.target.files[0];
    if (!videoFile) return;
    
    const objectURL = URL.createObjectURL(videoFile);
    videoPlayer.src = objectURL;
    videoPlayer.load();
    
    // 重置状态
    resetAnalysisState();
    statusMessage.textContent = '视频加载中...';
});

// 2. 视频元数据加载完成
videoPlayer.addEventListener('loadedmetadata', () => {
    videoNaturalWidth = videoPlayer.videoWidth;
    videoNaturalHeight = videoPlayer.videoHeight;
    
    console.log(`视频原始尺寸: ${videoNaturalWidth} × ${videoNaturalHeight}`);
    
    // 等待视频在DOM中渲染完成后同步画布
    setTimeout(() => {
        syncCanvasWithVideo();
        statusMessage.textContent = '视频已加载。请在视频上绘制亮度分析区域（红色框）。';
        currentMode = 'brightness';
        updateDebugInfo();
        updatePreviews(); // 初始化预览
    }, 100);
});

// 3. 视频播放状态变化时更新预览
videoPlayer.addEventListener('timeupdate', () => {
    if (videoFile && (brightnessRect || ocrRect)) {
        updatePreviews();
    }
});

videoPlayer.addEventListener('seeked', () => {
    if (videoFile && (brightnessRect || ocrRect)) {
        setTimeout(updatePreviews, 50); // 稍微延迟确保帧已渲染
    }
});

// 4. 视频尺寸变化时重新同步
videoPlayer.addEventListener('resize', syncCanvasWithVideo);
window.addEventListener('resize', syncCanvasWithVideo);

// 5. 刷新预览按钮
refreshPreviewBtn.addEventListener('click', () => {
    if (videoFile) {
        updatePreviews();
        statusMessage.textContent = '预览已刷新。';
    } else {
        statusMessage.textContent = '请先上传视频。';
    }
});

// 6. 鼠标按下开始绘制
drawingCanvas.addEventListener('mousedown', (e) => {
    if (!videoFile || currentMode === 'analyzing') return;
    
    isDrawing = true;
    const coords = getCanvasCoordinates(e);
    currentDrawingStart = coords;
    
    console.log(`开始绘制，起点: ${coords.x}, ${coords.y}`);
    clearAndRedrawRects();
});

// 7. 鼠标移动时预览矩形
drawingCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || !videoFile || currentMode === 'analyzing') return;
    
    const coords = getCanvasCoordinates(e);
    clearAndRedrawRects();
    
    // 绘制预览矩形
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

// 8. 鼠标松开完成绘制
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
        statusMessage.textContent = '亮度区域已定义。现在请绘制数字识别区域（蓝色框）。';
        console.log('亮度区域已定义:', brightnessRect);
    } else if (currentMode === 'ocr_define') {
        ocrRect = rect;
        currentMode = 'ready_to_analyze';
        statusMessage.textContent = '所有区域已定义完成。点击"开始完整分析"按钮开始处理。';
        startAnalysisBtn.disabled = false;
        console.log('OCR区域已定义:', ocrRect);
    }
    
    clearAndRedrawRects();
    updateDebugInfo();
    updatePreviews(); // 更新预览
});

// 9. 开始分析按钮
startAnalysisBtn.addEventListener('click', async () => {
    if (!brightnessRect || !ocrRect || !videoFile) {
        alert('请先完整定义所有分析区域。');
        return;
    }
    
    currentMode = 'analyzing';
    startAnalysisBtn.disabled = true;
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
    
    if (chartInstance) {
        chartInstance.destroy();
        chartInstance = null;
    }
    
    resultsTableContainer.innerHTML = "";
    clearAndRedrawRects();
    updateDebugInfo();
    updatePreviews(); // 重置预览
}

// --- 完整分析流程 ---
async function performCompleteAnalysis() {
    try {
        statusMessage.textContent = '开始分析视频亮度...';
        
        // 第一步：亮度分析
        await analyzeBrightness();
        
        // 第二步：寻找局部最大值
        findLocalMaxima();
        
        if (localMaximaFrames.length === 0) {
            statusMessage.textContent = '未找到亮度峰值，请调整亮度区域或检查视频内容。';
            return;
        }
        
        statusMessage.textContent = `找到 ${localMaximaFrames.length} 个亮度峰值，开始OCR识别...`;
        
        // 第三步：OCR处理
        await performOCRAnalysis();
        
        // 第四步：显示结果
        displayResults();
        
        statusMessage.textContent = '分析完成！';
        
    } catch (error) {
        console.error('分析过程出错:', error);
        statusMessage.textContent = `分析失败: ${error.message}`;
    } finally {
        startAnalysisBtn.disabled = false;
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
        // 跳转到指定时间
        await seekToTime(currentTime);
        
        // 绘制当前帧到处理画布
        processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        // 获取亮度区域的图像数据
        const imageData = processingCtx.getImageData(
            brightnessRect.x, 
            brightnessRect.y, 
            brightnessRect.width, 
            brightnessRect.height
        );
        
        // 计算平均亮度
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
        // 使用标准亮度计算公式
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
        
        // 跳转到峰值帧
        await seekToTime(frameData.time);
        
        // 执行OCR
        const ocrResult = await performSingleOCR(frameData.time, i);
        analysisResults.push(ocrResult);
    }
}

// --- 单帧OCR处理 ---
async function performSingleOCR(frameTime, occurrenceIndex) {
    try {
        // 绘制当前帧到处理画布
        processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        // 创建临时画布用于OCR区域
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
        
        // 图像预处理（二值化）
        preprocessImageForOCR(tempCtx, tempCanvas);
        
        // 执行OCR识别
        await ocrWorker.setParameters({
            tessedit_char_whitelist: '0123456789.',
            tessedit_pageseg_mode: '7',
        });
        
        const { data: { text } } = await ocrWorker.recognize(tempCanvas);
        console.log(`OCR结果 (时间${frameTime.toFixed(2)}s): "${text.trim()}"`);
        
        // 提取数字
        const numberMatch = text.trim().match(/(\d+(?:\.\d{1,2})?)/);
        const ocrValue = numberMatch ? parseFloat(numberMatch[0]) : NaN;
        
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

// --- 图像预处理 ---
function preprocessImageForOCR(ctx, canvas) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const threshold = 180; // 二值化阈值
    
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        
        if (brightness > threshold) {
            // 白色（数字）
            data[i] = data[i + 1] = data[i + 2] = 255;
        } else {
            // 黑色（背景）
            data[i] = data[i + 1] = data[i + 2] = 0;
        }
        data[i + 3] = 255; // Alpha通道
    }
    
    ctx.putImageData(imageData, 0, 0);
}

// --- 显示结果 ---
function displayResults() {
    // 生成结果表格
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
                    <td>${isNaN(result.value) ? 'N/A' : result.value.toFixed(2)}</td>
                    <td>${result.rawText || 'N/A'}</td>
                </tr>
            `;
        });
    }
    
    tableHTML += '</tbody></table>';
    resultsTableContainer.innerHTML = tableHTML;
    
    // 生成图表
    createResultChart();
}

// --- 创建结果图表 ---
function createResultChart() {
    if (chartInstance) chartInstance.destroy();
    
    const validResults = analysisResults.filter(r => !isNaN(r.value));
    
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
                            const pointData = analysisResults[context.dataIndex];
                            return `数字: ${context.parsed.y.toFixed(2)} (时间: ${pointData.frameTime.toFixed(2)}s)`;
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
