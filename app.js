// --- DOM Elements ---
const videoUpload = document.getElementById('videoUpload');
const videoPlayer = document.getElementById('videoPlayer');
const drawingCanvas = document.getElementById('drawingCanvas');
const drawingCtx = drawingCanvas.getContext('2d');
const processingCanvas = document.getElementById('processingCanvas');
const processingCtx = processingCanvas.getContext('2d');
const startAnalysisBtn = document.getElementById('startAnalysisBtn');
const statusMessage = document.getElementById('statusMessage');
const resultsTableContainer = document.getElementById('resultsTableContainer');
const resultsChartCtx = document.getElementById('resultsChart').getContext('2d');

// --- State Variables ---
let videoFile = null;
let brightnessRect = null; // 视频原始像素坐标
let ocrRect = null;        // 视频原始像素坐标
let isDrawing = false;
let currentDrawingStart = {};
let videoNaturalWidth = 0;
let videoNaturalHeight = 0;

let brightnessData = [];
let analysisResults = [];
let currentMode = 'brightness'; // 'brightness', 'ocr_define', 'ready_to_analyze', 'analyzing'
let localMaximaFrames = [];
let currentMaximaProcessingIndex = 0;
let chartInstance = null;

// --- 全屏区域选择相关 ---
let fullscreenContainer = null;
let fullscreenCanvas = null;
let fullscreenCtx = null;
let fullscreenVideo = null;
let isInFullscreenMode = false;
let originalVideoCurrentTime = 0;

// --- Tesseract Worker ---
let ocrWorker = null;

async function initializeOCR() {
    statusMessage.textContent = '正在初始化 OCR 服务... 请稍候。';
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
        statusMessage.textContent = videoFile ? 'OCR 服务已就绪。点击下方按钮进入全屏模式选择区域。' : 'OCR 服务已就绪。请上传视频。';
        console.log("OCR Worker initialized");
    } catch (error) {
        console.error("OCR Initialization Error:", error);
        statusMessage.textContent = 'OCR 服务初始化失败。请检查网络或刷新页面。';
        alert(`OCR 初始化失败: ${error.message}`);
    }
}

initializeOCR();

// --- 全屏区域选择功能 ---
function createFullscreenInterface() {
    fullscreenContainer = document.createElement('div');
    fullscreenContainer.id = 'fullscreenContainer';
    fullscreenContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: black;
        z-index: 50000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
    `;

    // 创建视频元素（克隆原视频的设置）
    fullscreenVideo = document.createElement('video');
    fullscreenVideo.src = videoPlayer.src;
    fullscreenVideo.currentTime = videoPlayer.currentTime;
    fullscreenVideo.style.cssText = `
        max-width: 90vw;
        max-height: 80vh;
        object-fit: contain;
    `;

    // 创建覆盖在视频上的canvas
    fullscreenCanvas = document.createElement('canvas');
    fullscreenCanvas.style.cssText = `
        position: absolute;
        cursor: crosshair;
        pointer-events: all;
    `;
    fullscreenCtx = fullscreenCanvas.getContext('2d');

    // 创建状态显示
    const statusDiv = document.createElement('div');
    statusDiv.id = 'fullscreenStatus';
    statusDiv.style.cssText = `
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 15px 30px;
        border-radius: 10px;
        font-size: 18px;
        font-family: Arial, sans-serif;
        text-align: center;
        z-index: 51000;
    `;

    // 创建帮助信息
    const helpDiv = document.createElement('div');
    helpDiv.style.cssText = `
        position: absolute;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 10px 20px;
        border-radius: 5px;
        font-size: 14px;
        font-family: Arial, sans-serif;
        text-align: center;
    `;
    helpDiv.innerHTML = '拖拽鼠标选择区域 | ESC键退出全屏';

    // 创建容器包装视频和canvas
    const videoContainer = document.createElement('div');
    videoContainer.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

    videoContainer.appendChild(fullscreenVideo);
    videoContainer.appendChild(fullscreenCanvas);

    fullscreenContainer.appendChild(statusDiv);
    fullscreenContainer.appendChild(videoContainer);
    fullscreenContainer.appendChild(helpDiv);

    document.body.appendChild(fullscreenContainer);

    return { statusDiv, videoContainer };
}

function enterFullscreenMode() {
    if (isInFullscreenMode) return;

    originalVideoCurrentTime = videoPlayer.currentTime;
    isInFullscreenMode = true;

    const { statusDiv } = createFullscreenInterface();

    // 等待视频加载
    fullscreenVideo.addEventListener('loadedmetadata', () => {
        updateFullscreenLayout();
        setupFullscreenEventListeners(statusDiv);
        updateFullscreenStatus(statusDiv);
    });

    fullscreenVideo.load();
}

function updateFullscreenLayout() {
    // 计算视频在屏幕上的实际显示尺寸
    const videoRect = fullscreenVideo.getBoundingClientRect();
    
    // 设置canvas覆盖整个视频显示区域
    fullscreenCanvas.style.left = `${videoRect.left}px`;
    fullscreenCanvas.style.top = `${videoRect.top}px`;
    fullscreenCanvas.style.width = `${videoRect.width}px`;
    fullscreenCanvas.style.height = `${videoRect.height}px`;
    
    // 设置canvas内部分辨率等于视频原始分辨率
    fullscreenCanvas.width = videoNaturalWidth;
    fullscreenCanvas.height = videoNaturalHeight;

    console.log('全屏布局更新:', {
        视频显示尺寸: `${videoRect.width}x${videoRect.height}`,
        Canvas内部尺寸: `${fullscreenCanvas.width}x${fullscreenCanvas.height}`,
        缩放比例: `${videoNaturalWidth/videoRect.width} x ${videoNaturalHeight/videoRect.height}`
    });
}

function setupFullscreenEventListeners(statusDiv) {
    let isDrawing = false;
    let startCoords = {};

    // 获取准确的视频坐标
    function getVideoCoords(event) {
        const videoRect = fullscreenVideo.getBoundingClientRect();
        const canvasRect = fullscreenCanvas.getBoundingClientRect();
        
        const relativeX = (event.clientX - canvasRect.left) / canvasRect.width;
        const relativeY = (event.clientY - canvasRect.top) / canvasRect.height;
        
        return {
            x: relativeX * videoNaturalWidth,
            y: relativeY * videoNaturalHeight
        };
    }

    function clearCanvas() {
        fullscreenCtx.clearRect(0, 0, fullscreenCanvas.width, fullscreenCanvas.height);
        
        // 重绘已有的矩形
        if (brightnessRect) {
            drawRect(brightnessRect, 'rgba(255,0,0,0.8)', 3, '亮度区域');
        }
        if (ocrRect) {
            drawRect(ocrRect, 'rgba(0,0,255,0.8)', 3, '数字区域');
        }
    }

    function drawRect(rect, color, lineWidth, label) {
        fullscreenCtx.strokeStyle = color;
        fullscreenCtx.lineWidth = lineWidth;
        fullscreenCtx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        
        if (label) {
            fullscreenCtx.fillStyle = color;
            fullscreenCtx.font = '24px Arial';
            fullscreenCtx.fillText(label, rect.x, Math.max(rect.y - 10, 30));
        }
    }

    function updateFullscreenStatus(statusDiv) {
        let statusText = '';
        if (currentMode === 'brightness') {
            statusText = '步骤 1/2: 请选择亮度分析区域（红色框）';
        } else if (currentMode === 'ocr_define') {
            statusText = '步骤 2/2: 请选择数字识别区域（蓝色框）';
        }
        statusDiv.textContent = statusText;
    }

    // 鼠标事件
    fullscreenCanvas.addEventListener('mousedown', (e) => {
        if (currentMode === 'analyzing') return;
        
        isDrawing = true;
        startCoords = getVideoCoords(e);
        clearCanvas();
    });

    fullscreenCanvas.addEventListener('mousemove', (e) => {
        if (!isDrawing || currentMode === 'analyzing') return;
        
        const currentCoords = getVideoCoords(e);
        clearCanvas();
        
        // 绘制当前拖拽的矩形
        const tempRect = {
            x: Math.min(startCoords.x, currentCoords.x),
            y: Math.min(startCoords.y, currentCoords.y),
            width: Math.abs(currentCoords.x - startCoords.x),
            height: Math.abs(currentCoords.y - startCoords.y)
        };
        
        const color = currentMode === 'brightness' ? 'rgba(255,0,0,0.5)' : 'rgba(0,0,255,0.5)';
        drawRect(tempRect, color, 2);
    });

    fullscreenCanvas.addEventListener('mouseup', (e) => {
        if (!isDrawing || currentMode === 'analyzing') return;
        
        isDrawing = false;
        const endCoords = getVideoCoords(e);
        
        const finalRect = {
            x: Math.min(startCoords.x, endCoords.x),
            y: Math.min(startCoords.y, endCoords.y),
            width: Math.abs(endCoords.x - startCoords.x),
            height: Math.abs(endCoords.y - startCoords.y)
        };

        // 检查区域大小
        if (finalRect.width < 20 || finalRect.height < 20) {
            alert('选择的区域太小，请重新选择');
            clearCanvas();
            return;
        }

        console.log(`全屏模式选择完成:`, finalRect);

        if (currentMode === 'brightness') {
            brightnessRect = finalRect;
            currentMode = 'ocr_define';
            updateFullscreenStatus(statusDiv);
            clearCanvas();
        } else if (currentMode === 'ocr_define') {
            ocrRect = finalRect;
            exitFullscreenMode();
        }
    });

    // 键盘事件
    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            exitFullscreenMode();
        }
    }

    document.addEventListener('keydown', handleKeyDown);

    // 保存事件处理器引用以便清理
    fullscreenContainer._cleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
    };

    // 窗口大小变化时更新布局
    window.addEventListener('resize', updateFullscreenLayout);

    updateFullscreenStatus(statusDiv);
    clearCanvas();
}

function exitFullscreenMode() {
    if (!isInFullscreenMode) return;

    isInFullscreenMode = false;

    // 清理事件监听器
    if (fullscreenContainer._cleanup) {
        fullscreenContainer._cleanup();
    }

    // 移除全屏界面
    if (fullscreenContainer) {
        fullscreenContainer.remove();
        fullscreenContainer = null;
    }

    // 恢复原视频时间
    videoPlayer.currentTime = originalVideoCurrentTime;

    // 更新状态
    if (brightnessRect && ocrRect) {
        currentMode = 'ready_to_analyze';
        statusMessage.textContent = '区域选择完成！点击"开始完整分析"按钮。';
        startAnalysisBtn.disabled = false;
    } else if (brightnessRect) {
        currentMode = 'ocr_define';
        statusMessage.textContent = '亮度区域已选择，请继续选择数字识别区域。';
    } else {
        currentMode = 'brightness';
        statusMessage.textContent = '请点击"选择分析区域"按钮重新开始。';
    }

    // 重绘普通canvas
    clearAndRedrawRects();
    updateDebugPanel();
}

// --- 普通模式的绘制函数 ---
function drawVideoCoordinateRect(videoRect, strokeStyle, lineWidth = 2, label = '') {
    if (!videoRect) return;
    
    // 将视频坐标转换为canvas显示坐标
    const displayX = (videoRect.x / videoNaturalWidth) * drawingCanvas.width;
    const displayY = (videoRect.y / videoNaturalHeight) * drawingCanvas.height;
    const displayWidth = (videoRect.width / videoNaturalWidth) * drawingCanvas.width;
    const displayHeight = (videoRect.height / videoNaturalHeight) * drawingCanvas.height;
    
    drawingCtx.strokeStyle = strokeStyle;
    drawingCtx.lineWidth = lineWidth;
    drawingCtx.strokeRect(displayX, displayY, displayWidth, displayHeight);
    
    if (label) {
        drawingCtx.fillStyle = strokeStyle;
        drawingCtx.font = '14px Arial';
        drawingCtx.fillText(label, displayX, Math.max(displayY - 5, 15));
    }
}

function clearAndRedrawRects() {
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    
    if (brightnessRect) {
        drawVideoCoordinateRect(brightnessRect, 'rgba(255,0,0,0.7)', 2, '亮度区域');
    }
    if (ocrRect) {
        drawVideoCoordinateRect(ocrRect, 'rgba(0,0,255,0.7)', 2, '数字区域');
    }
}

// --- 调试面板 ---
function updateDebugPanel() {
    let debugPanel = document.getElementById('debugPanel');
    if (!debugPanel) {
        debugPanel = document.createElement('div');
        debugPanel.id = 'debugPanel';
        debugPanel.style.cssText = `
            position: fixed;
            top: 10px;
            left: 10px;
            z-index: 10001;
            background: rgba(255,255,0,0.9);
            padding: 10px;
            font-size: 12px;
            border: 2px solid black;
            border-radius: 5px;
            max-width: 350px;
            font-family: monospace;
        `;
        document.body.appendChild(debugPanel);
    }
    
    let info = `
        <strong>调试信息</strong><br>
        视频原始分辨率: ${videoNaturalWidth}×${videoNaturalHeight}<br>
        当前模式: ${currentMode}<br>
        选择模式: 全屏精确选择<br>
    `;
    
    if (brightnessRect) {
        info += `<br><strong>亮度区域:</strong><br>
                 位置: (${brightnessRect.x.toFixed(0)}, ${brightnessRect.y.toFixed(0)})<br>
                 尺寸: ${brightnessRect.width.toFixed(0)}×${brightnessRect.height.toFixed(0)}<br>`;
    }
    
    if (ocrRect) {
        info += `<br><strong>OCR区域:</strong><br>
                 位置: (${ocrRect.x.toFixed(0)}, ${ocrRect.y.toFixed(0)})<br>
                 尺寸: ${ocrRect.width.toFixed(0)}×${ocrRect.height.toFixed(0)}<br>`;
    }
    
    debugPanel.innerHTML = info;
}

// --- 添加全屏选择按钮 ---
function createRegionSelectionButton() {
    let button = document.getElementById('regionSelectionBtn');
    if (button) return button;
    
    button = document.createElement('button');
    button.id = 'regionSelectionBtn';
    button.textContent = '选择分析区域（全屏模式）';
    button.style.cssText = `
        background: #007bff;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 16px;
        margin: 10px 5px;
    `;
    
    button.addEventListener('click', () => {
        if (!videoFile) {
            alert('请先上传视频');
            return;
        }
        enterFullscreenMode();
    });
    
    // 插入到开始分析按钮前面
    startAnalysisBtn.parentNode.insertBefore(button, startAnalysisBtn);
    return button;
}

// --- 事件处理 ---
videoUpload.addEventListener('change', (event) => {
    videoFile = event.target.files[0];
    if (!videoFile) return;

    const objectURL = URL.createObjectURL(videoFile);
    videoPlayer.src = objectURL;
    videoPlayer.load();

    // 重置状态
    statusMessage.textContent = '视频加载中...';
    brightnessRect = null;
    ocrRect = null;
    analysisResults = [];
    brightnessData = [];
    localMaximaFrames = [];
    currentMode = 'brightness';
    startAnalysisBtn.disabled = true;
    
    if (chartInstance) chartInstance.destroy();
    resultsTableContainer.innerHTML = "";
    clearAndRedrawRects();
    
    // 清除调试元素
    ['debugPanel'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
});

videoPlayer.addEventListener('loadedmetadata', () => {
    videoNaturalWidth = videoPlayer.videoWidth;
    videoNaturalHeight = videoPlayer.videoHeight;
    
    drawingCanvas.width = videoNaturalWidth;
    drawingCanvas.height = videoNaturalHeight;
    processingCanvas.width = videoNaturalWidth;
    processingCanvas.height = videoNaturalHeight;
    
    console.log(`视频加载完成: ${videoNaturalWidth}×${videoNaturalHeight}`);
    
    statusMessage.textContent = '视频已加载。请点击"选择分析区域"按钮进入全屏选择模式。';
    currentMode = 'brightness';
    startAnalysisBtn.disabled = true;
    
    clearAndRedrawRects();
    updateDebugPanel();
    createRegionSelectionButton();
});

videoPlayer.addEventListener('error', (e) => {
    console.error("Video Error:", e);
    statusMessage.textContent = '视频加载失败。请检查文件格式或选择其他文件。';
});

startAnalysisBtn.addEventListener('click', async () => {
    if (!brightnessRect || !ocrRect || !videoFile) {
        alert('请先选择分析区域');
        return;
    }
    
    currentMode = 'analyzing';
    startAnalysisBtn.disabled = true;
    videoPlayer.pause();
    
    if (chartInstance) chartInstance.destroy();
    resultsTableContainer.innerHTML = "";
    analysisResults = [];
    brightnessData = [];
    localMaximaFrames = [];
    
    await analyzeVideoBrightnessAndOCR();
});

// --- 主分析函数和其他辅助函数保持不变 ---
async function analyzeVideoBrightnessAndOCR() {
    const duration = videoPlayer.duration;
    if (isNaN(duration) || duration === 0) {
        statusMessage.textContent = "视频时长无效，无法分析。";
        resetAnalysisState();
        return;
    }
    
    const frameRate = 25;
    const interval = 1 / frameRate;
    let currentTime = 0;
    let processedFrames = 0;
    
    statusMessage.textContent = `开始亮度分析，总时长: ${duration.toFixed(2)}s`;
    
    // 亮度分析阶段
    while (currentTime <= duration) {
        await seekToTime(currentTime);
        
        processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        const safeRect = getSafeRect(brightnessRect);
        const imageData = processingCtx.getImageData(safeRect.x, safeRect.y, safeRect.width, safeRect.height);
        const avgBrightness = calculateAverageBrightness(imageData);
        
        brightnessData.push({ frameTime: currentTime, avgBrightness });
        
        processedFrames++;
        statusMessage.textContent = `分析亮度中... ${((currentTime / duration) * 100).toFixed(1)}% (帧: ${processedFrames})`;
        
        currentTime += interval;
        if (currentTime > duration && currentTime - interval < duration) {
            currentTime = duration;
        } else if (currentTime > duration) {
            break;
        }
    }
    
    console.log("亮度数据收集完成:", brightnessData.length, "个数据点");
    findLocalMaxima();
    
    // OCR分析阶段
    if (localMaximaFrames.length > 0) {
        statusMessage.textContent = `找到 ${localMaximaFrames.length} 个亮度峰值。开始OCR处理...`;
        
        for (let i = 0; i < localMaximaFrames.length; i++) {
            currentMaximaProcessingIndex = i;
            const frameData = localMaximaFrames[i];
            
            statusMessage.textContent = `处理峰值 ${i + 1}/${localMaximaFrames.length} (时间: ${frameData.time.toFixed(2)}s)`;
            
            await seekToTime(frameData.time);
            await performOCR(frameData.time, i);
        }
        
        statusMessage.textContent = '分析完成，正在生成结果...';
        displayResults();
    } else {
        statusMessage.textContent = '未找到亮度局部最大值。请尝试调整亮度区域。';
    }
    
    resetAnalysisState();
}

// 其他辅助函数保持不变...
async function seekToTime(time) {
    return new Promise(resolve => {
        const onSeeked = () => {
            videoPlayer.removeEventListener('seeked', onSeeked);
            resolve();
        };
        videoPlayer.addEventListener('seeked', onSeeked);
        videoPlayer.currentTime = time;
    });
}

function getSafeRect(rect) {
    return {
        x: Math.max(0, Math.min(rect.x, videoNaturalWidth - 1)),
        y: Math.max(0, Math.min(rect.y, videoNaturalHeight - 1)),
        width: Math.min(rect.width, videoNaturalWidth - rect.x),
        height: Math.min(rect.height, videoNaturalHeight - rect.y)
    };
}

function calculateAverageBrightness(imageData) {
    const data = imageData.data;
    let totalBrightness = 0;
    let pixelCount = 0;
    
    for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
        pixelCount++;
    }
    
    return pixelCount > 0 ? totalBrightness / pixelCount : 0;
}

function findLocalMaxima() {
    localMaximaFrames = [];
    if (brightnessData.length < 3) return;
    
    for (let i = 1; i < brightnessData.length - 1; i++) {
        if (brightnessData[i].avgBrightness > brightnessData[i - 1].avgBrightness &&
            brightnessData[i].avgBrightness > brightnessData[i + 1].avgBrightness) {
            localMaximaFrames.push({
                time: brightnessData[i].frameTime,
                value: brightnessData[i].avgBrightness
            });
        }
    }
    
    console.log("找到局部最大值:", localMaximaFrames.length, "个");
}

async function performOCR(frameTime, occurrenceIdx) {
    if (!ocrRect || !ocrWorker) {
        analysisResults.push({
            occurrenceIndex: occurrenceIdx + 1,
            frameTime: frameTime,
            value: NaN,
            confidence: 0
        });
        return;
    }
    
    try {
        processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        const safeOcrRect = getSafeRect(ocrRect);
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = safeOcrRect.width;
        tempCanvas.height = safeOcrRect.height;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.drawImage(
            processingCanvas,
            safeOcrRect.x, safeOcrRect.y, safeOcrRect.width, safeOcrRect.height,
            0, 0, safeOcrRect.width, safeOcrRect.height
        );
        
        const processedCanvas = preprocessImageForOCR(tempCanvas);
        
        await ocrWorker.setParameters({
            tessedit_char_whitelist: '0123456789.',
            tessedit_pageseg_mode: '7',
            tessedit_ocr_engine_mode: '1'
        });
        
        const { data: { text, confidence } } = await ocrWorker.recognize(processedCanvas);
        console.log(`OCR @ ${frameTime.toFixed(2)}s: "${text.trim()}" (置信度: ${confidence.toFixed(1)}%)`);
        
        const numberMatch = text.trim().match(/(\d+(\.\d{1,2})?)/);
        let ocrValue = NaN;
        
        if (numberMatch && numberMatch[0] && confidence > 30) {
            ocrValue = parseFloat(numberMatch[0]);
        } else {
            console.warn(`OCR结果被拒绝 - 置信度: ${confidence.toFixed(1)}%, 文本: "${text.trim()}"`);
        }
        
        analysisResults.push({
            occurrenceIndex: occurrenceIdx + 1,
            frameTime: frameTime,
            value: ocrValue,
            confidence: confidence
        });
        
    } catch (error) {
        console.error("OCR Error:", error);
        analysisResults.push({
            occurrenceIndex: occurrenceIdx + 1,
            frameTime: frameTime,
            value: NaN,
            confidence: 0
        });
    }
}

function preprocessImageForOCR(canvas) {
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / (data.length / 4);
    const threshold = Math.max(120, Math.min(200, avgBrightness + 30));
    
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const color = avg >= threshold ? 255 : 0;
        data[i] = color;
        data[i + 1] = color;
        data[i + 2] = color;
        data[i + 3] = 255;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    const scaleFactor = 3;
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = canvas.width * scaleFactor;
    scaledCanvas.height = canvas.height * scaleFactor;
    const scaledCtx = scaledCanvas.getContext('2d');
    scaledCtx.imageSmoothingEnabled = false;
    scaledCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, scaledCanvas.width, scaledCanvas.height);
    
    return scaledCanvas;
}

function displayResults() {
    let tableHTML = '<table><thead><tr><th>序号</th><th>帧时间 (s)</th><th>识别数字</th><th>置信度</th></tr></thead><tbody>';
    
    if (analysisResults.length === 0) {
        tableHTML += '<tr><td colspan="4">无结果数据</td></tr>';
    } else {
        analysisResults.sort((a, b) => a.occurrenceIndex - b.occurrenceIndex).forEach(result => {
            const confidenceText = result.confidence ? `${result.confidence.toFixed(1)}%` : 'N/A';
            tableHTML += `<tr>
                <td>${result.occurrenceIndex}</td>
                <td>${result.frameTime.toFixed(2)}</td>
                <td>${isNaN(result.value) ? 'N/A' : result.value.toFixed(2)}</td>
                <td>${confidenceText}</td>
            </tr>`;
        });
    }
    
    tableHTML += '</tbody></table>';
    resultsTableContainer.innerHTML = tableHTML;
    
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(resultsChartCtx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: '识别的数字',
                data: analysisResults.map(r => ({ 
                    x: r.occurrenceIndex, 
                    y: isNaN(r.value) ? null : r.value 
                })),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                showLine: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: '亮度峰值序号' },
                    ticks: { stepSize: 1 }
                },
                y: {
                    title: { display: true, text: '识别的数字' },
                    beginAtZero: false
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const pointData = analysisResults.find(r => r.occurrenceIndex === context.parsed.x);
                            if (pointData && context.parsed.y !== null) {
                                const confText = pointData.confidence ? ` (置信度: ${pointData.confidence.toFixed(1)}%)` : '';
                                return `数字: ${context.parsed.y.toFixed(2)} (时间: ${pointData.frameTime.toFixed(2)}s)${confText}`;
                            } else if (pointData) {
                                return `识别失败 (时间: ${pointData.frameTime.toFixed(2)}s)`;
                            }
                            return '';
                        }
                    }
                }
            }
        }
    });
}

function resetAnalysisState() {
    startAnalysisBtn.disabled = false;
    currentMode = 'brightness';
    updateDebugPanel();
}

// --- 初始化 ---
statusMessage.textContent = '请上传视频文件开始分析。';
startAnalysisBtn.disabled = true;
