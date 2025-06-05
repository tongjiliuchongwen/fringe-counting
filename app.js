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
let currentMode = 'brightness';
let localMaximaFrames = [];
let currentMaximaProcessingIndex = 0;
let chartInstance = null;

// --- 全屏区域选择相关 ---
let fullscreenContainer = null;
let fullscreenVideo = null;
let isInFullscreenMode = false;
let originalVideoCurrentTime = 0;
let fullscreenDebugInfo = null;

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

// --- 全新的全屏区域选择功能 ---
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
        overflow: hidden;
    `;

    // **关键改变：不使用canvas覆盖，直接在video元素上监听鼠标事件**
    fullscreenVideo = document.createElement('video');
    fullscreenVideo.src = videoPlayer.src;
    fullscreenVideo.currentTime = videoPlayer.currentTime;
    fullscreenVideo.muted = true;
    fullscreenVideo.style.cssText = `
        max-width: 85vw;
        max-height: 75vh;
        object-fit: contain;
        border: 2px solid white;
        cursor: crosshair;
    `;
    
    // 创建用于绘制选择框的canvas（仅用于显示，不处理鼠标事件）
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'overlayCanvas';
    overlayCanvas.style.cssText = `
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: 1;
    `;
    const overlayCtx = overlayCanvas.getContext('2d');

    // 创建视频容器
    const videoContainer = document.createElement('div');
    videoContainer.id = 'videoContainer';
    videoContainer.style.cssText = `
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
    `;

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

    // 创建调试信息显示
    fullscreenDebugInfo = document.createElement('div');
    fullscreenDebugInfo.id = 'fullscreenDebugInfo';
    fullscreenDebugInfo.style.cssText = `
        position: absolute;
        top: 80px;
        left: 20px;
        background: rgba(0,0,0,0.8);
        color: lime;
        padding: 10px;
        font-family: monospace;
        font-size: 12px;
        border-radius: 5px;
        z-index: 51000;
        max-width: 400px;
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
    helpDiv.innerHTML = '直接在视频上拖拽选择区域 | ESC键退出全屏';

    videoContainer.appendChild(fullscreenVideo);
    videoContainer.appendChild(overlayCanvas);

    fullscreenContainer.appendChild(statusDiv);
    fullscreenContainer.appendChild(fullscreenDebugInfo);
    fullscreenContainer.appendChild(videoContainer);
    fullscreenContainer.appendChild(helpDiv);

    document.body.appendChild(fullscreenContainer);

    return { statusDiv, overlayCanvas, overlayCtx };
}

function enterFullscreenMode() {
    if (isInFullscreenMode) return;

    originalVideoCurrentTime = videoPlayer.currentTime;
    isInFullscreenMode = true;

    const { statusDiv, overlayCanvas, overlayCtx } = createFullscreenInterface();

    // 等待视频加载
    fullscreenVideo.addEventListener('loadedmetadata', () => {
        console.log('全屏视频元数据加载完成');
        setTimeout(() => {
            updateFullscreenLayout(overlayCanvas);
            setupDirectVideoEventListeners(statusDiv, overlayCanvas, overlayCtx);
            updateFullscreenStatus(statusDiv);
        }, 200);
    });

    // 如果已经加载，直接设置
    if (fullscreenVideo.readyState >= 1) {
        setTimeout(() => {
            updateFullscreenLayout(overlayCanvas);
            setupDirectVideoEventListeners(statusDiv, overlayCanvas, overlayCtx);
            updateFullscreenStatus(statusDiv);
        }, 200);
    }

    fullscreenVideo.load();
}

function updateFullscreenLayout(overlayCanvas) {
    requestAnimationFrame(() => {
        const videoRect = fullscreenVideo.getBoundingClientRect();
        
        // 更新overlay canvas以匹配视频显示区域
        overlayCanvas.style.left = '0px';
        overlayCanvas.style.top = '0px';
        overlayCanvas.style.width = `${videoRect.width}px`;
        overlayCanvas.style.height = `${videoRect.height}px`;
        overlayCanvas.width = videoRect.width;
        overlayCanvas.height = videoRect.height;

        console.log('全屏布局更新:', {
            视频显示尺寸: `${videoRect.width}x${videoRect.height}`,
            视频原始尺寸: `${videoNaturalWidth}x${videoNaturalHeight}`,
            位置: `${videoRect.left}, ${videoRect.top}`
        });

        updateFullscreenDebugInfo(videoRect);
    });
}

function updateFullscreenDebugInfo(videoRect, mouseInfo = null) {
    if (!fullscreenDebugInfo) return;
    
    let debugText = `
<strong>全屏调试信息 - 直接读取offsetX/Y</strong><br>
视频原始: ${videoNaturalWidth}×${videoNaturalHeight}<br>
视频显示: ${videoRect.width.toFixed(0)}×${videoRect.height.toFixed(0)}<br>
缩放比例: X=${(videoNaturalWidth/videoRect.width).toFixed(3)} Y=${(videoNaturalHeight/videoRect.height).toFixed(3)}<br>
    `;
    
    if (mouseInfo) {
        debugText += `<br><strong>鼠标信息</strong><br>
offsetX/Y: (${mouseInfo.offsetX}, ${mouseInfo.offsetY})<br>
视频坐标: (${mouseInfo.videoX.toFixed(1)}, ${mouseInfo.videoY.toFixed(1)})<br>
相对位置: ${(mouseInfo.videoX/videoNaturalWidth*100).toFixed(1)}%, ${(mouseInfo.videoY/videoNaturalHeight*100).toFixed(1)}%<br>
边界检查: ${mouseInfo.inBounds ? '✓' : '✗'}
        `;
    }
    
    fullscreenDebugInfo.innerHTML = debugText;
}

// **核心改进：直接使用video元素的offsetX/Y**
function setupDirectVideoEventListeners(statusDiv, overlayCanvas, overlayCtx) {
    let isDrawing = false;
    let startCoords = {};

    // **关键函数：直接从video的offsetX/Y获取准确坐标**
    function getVideoCoords(event) {
        // 使用offsetX/Y，这是相对于video元素内容区域的坐标
        const offsetX = event.offsetX;
        const offsetY = event.offsetY;
        
        // 获取video的实际显示尺寸
        const videoRect = fullscreenVideo.getBoundingClientRect();
        
        // 计算视频原始坐标
        const scaleX = videoNaturalWidth / videoRect.width;
        const scaleY = videoNaturalHeight / videoRect.height;
        
        const videoX = Math.max(0, Math.min(offsetX * scaleX, videoNaturalWidth - 1));
        const videoY = Math.max(0, Math.min(offsetY * scaleY, videoNaturalHeight - 1));

        // 检查是否在有效范围内
        const inBounds = offsetX >= 0 && offsetX <= videoRect.width && offsetY >= 0 && offsetY <= videoRect.height;
        
        // 更新调试信息
        updateFullscreenDebugInfo(videoRect, {
            offsetX: offsetX,
            offsetY: offsetY,
            videoX: videoX,
            videoY: videoY,
            inBounds: inBounds
        });
        
        return { x: videoX, y: videoY, inBounds: inBounds };
    }

    function clearOverlay() {
        overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
        
        // 重绘已有的矩形（需要转换到显示坐标）
        const videoRect = fullscreenVideo.getBoundingClientRect();
        const scaleX = videoRect.width / videoNaturalWidth;
        const scaleY = videoRect.height / videoNaturalHeight;
        
        if (brightnessRect) {
            drawOverlayRect(brightnessRect, 'rgba(255,0,0,0.8)', 3, '亮度区域', scaleX, scaleY);
        }
        if (ocrRect) {
            drawOverlayRect(ocrRect, 'rgba(0,0,255,0.8)', 3, '数字区域', scaleX, scaleY);
        }
    }

    function drawOverlayRect(videoRect, color, lineWidth, label, scaleX, scaleY) {
        // 将视频坐标转换为显示坐标
        const displayX = videoRect.x * scaleX;
        const displayY = videoRect.y * scaleY;
        const displayWidth = videoRect.width * scaleX;
        const displayHeight = videoRect.height * scaleY;
        
        overlayCtx.strokeStyle = color;
        overlayCtx.lineWidth = lineWidth;
        overlayCtx.strokeRect(displayX, displayY, displayWidth, displayHeight);
        
        if (label) {
            overlayCtx.fillStyle = color;
            overlayCtx.font = '20px Arial';
            overlayCtx.fillText(label, displayX, Math.max(displayY - 10, 25));
            
            // 添加坐标信息
            overlayCtx.font = '14px Arial';
            const coordText = `(${videoRect.x.toFixed(0)}, ${videoRect.y.toFixed(0)}) ${videoRect.width.toFixed(0)}×${videoRect.height.toFixed(0)}`;
            overlayCtx.fillText(coordText, displayX, displayY + displayHeight + 20);
        }
    }

    function updateFullscreenStatus(statusDiv) {
        let statusText = '';
        if (currentMode === 'brightness') {
            statusText = '步骤 1/2: 请选择亮度分析区域（在视频上拖拽绘制红色框）';
        } else if (currentMode === 'ocr_define') {
            statusText = '步骤 2/2: 请选择数字识别区域（在视频上拖拽绘制蓝色框）';
        }
        statusDiv.textContent = statusText;
    }

    // **直接在video元素上监听鼠标事件**
    
    // 鼠标移动 - 更新调试信息
    fullscreenVideo.addEventListener('mousemove', (e) => {
        const coords = getVideoCoords(e);
        
        if (!isDrawing || currentMode === 'analyzing') return;
        
        clearOverlay();
        
        // 绘制当前拖拽的矩形
        const videoRect = fullscreenVideo.getBoundingClientRect();
        const scaleX = videoRect.width / videoNaturalWidth;
        const scaleY = videoRect.height / videoNaturalHeight;
        
        const tempRect = {
            x: Math.min(startCoords.x, coords.x),
            y: Math.min(startCoords.y, coords.y),
            width: Math.abs(coords.x - startCoords.x),
            height: Math.abs(coords.y - startCoords.y)
        };
        
        const color = currentMode === 'brightness' ? 'rgba(255,0,0,0.5)' : 'rgba(0,0,255,0.5)';
        drawOverlayRect(tempRect, color, 2, '', scaleX, scaleY);
    });

    // 鼠标按下
    fullscreenVideo.addEventListener('mousedown', (e) => {
        if (currentMode === 'analyzing') return;
        
        e.preventDefault();
        const coords = getVideoCoords(e);
        
        if (!coords.inBounds) {
            console.log('鼠标不在有效区域内');
            return;
        }
        
        isDrawing = true;
        startCoords = coords;
        clearOverlay();
        
        console.log('开始绘制，起始坐标:', startCoords);
    });

    // 鼠标松开
    fullscreenVideo.addEventListener('mouseup', (e) => {
        if (!isDrawing || currentMode === 'analyzing') return;
        
        e.preventDefault();
        isDrawing = false;
        const endCoords = getVideoCoords(e);
        
        if (!endCoords.inBounds) {
            console.log('结束坐标不在有效区域内');
            clearOverlay();
            return;
        }
        
        const finalRect = {
            x: Math.min(startCoords.x, endCoords.x),
            y: Math.min(startCoords.y, endCoords.y),
            width: Math.abs(endCoords.x - startCoords.x),
            height: Math.abs(endCoords.y - startCoords.y)
        };

        console.log(`全屏模式选择完成:`, finalRect);

        // 检查区域大小
        if (finalRect.width < 20 || finalRect.height < 20) {
            alert('选择的区域太小，请重新选择');
            clearOverlay();
            return;
        }

        if (currentMode === 'brightness') {
            brightnessRect = finalRect;
            currentMode = 'ocr_define';
            updateFullscreenStatus(statusDiv);
            clearOverlay();
        } else if (currentMode === 'ocr_define') {
            ocrRect = finalRect;
            exitFullscreenMode();
        }
    });

    // 防止右键菜单
    fullscreenVideo.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    // 键盘事件
    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            exitFullscreenMode();
        }
    }

    document.addEventListener('keydown', handleKeyDown);

    // 保存清理函数
    fullscreenContainer._cleanup = () => {
        document.removeEventListener('keydown', handleKeyDown);
    };

    // 窗口大小变化时更新布局
    const resizeHandler = () => {
        console.log('窗口大小改变，更新全屏布局');
        setTimeout(() => updateFullscreenLayout(overlayCanvas), 100);
    };
    window.addEventListener('resize', resizeHandler);
    
    fullscreenContainer._resizeCleanup = () => {
        window.removeEventListener('resize', resizeHandler);
    };

    updateFullscreenStatus(statusDiv);
    clearOverlay();
}

function exitFullscreenMode() {
    if (!isInFullscreenMode) return;

    isInFullscreenMode = false;

    // 清理事件监听器
    if (fullscreenContainer._cleanup) {
        fullscreenContainer._cleanup();
    }
    if (fullscreenContainer._resizeCleanup) {
        fullscreenContainer._resizeCleanup();
    }

    // 移除全屏界面
    if (fullscreenContainer) {
        fullscreenContainer.remove();
        fullscreenContainer = null;
        fullscreenDebugInfo = null;
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

    // 重绘和生成预览
    clearAndRedrawRects();
    updateDebugPanel();
    
    if (brightnessRect) {
        createPreviewCanvas('brightnessPrev', '亮度区域预览', brightnessRect);
    }
    if (ocrRect) {
        createPreviewCanvas('ocrPrev', 'OCR区域预览', ocrRect);
    }
}

// --- 预览功能 ---
function createPreviewCanvas(id, title, videoRect) {
    if (!videoRect) return;
    
    // 移除旧预览
    let oldPreview = document.getElementById(id);
    if (oldPreview) oldPreview.remove();
    let oldLabel = document.querySelector(`[data-preview="${id}"]`);
    if (oldLabel) oldLabel.remove();
    
    let previewCanvas = document.createElement('canvas');
    previewCanvas.id = id;
    previewCanvas.style.cssText = `
        position: fixed;
        top: 10px;
        right: ${id === 'brightnessPrev' ? '10px' : '220px'};
        z-index: 10000;
        border: 3px solid red;
        background: #eee;
    `;
    document.body.appendChild(previewCanvas);
    
    const label = document.createElement('div');
    label.setAttribute('data-preview', id);
    label.textContent = title;
    label.style.cssText = `
        position: fixed;
        top: ${Math.max(150, videoRect.height * 0.5 + 40)}px;
        right: ${id === 'brightnessPrev' ? '10px' : '220px'};
        z-index: 10001;
        background: yellow;
        padding: 2px 5px;
        font-size: 12px;
        border: 1px solid black;
    `;
    document.body.appendChild(label);
    
    const maxSize = 150;
    const scale = Math.min(maxSize / videoRect.width, maxSize / videoRect.height, 1);
    previewCanvas.width = Math.max(videoRect.width * scale, 50);
    previewCanvas.height = Math.max(videoRect.height * scale, 20);
    
    if (videoPlayer.readyState >= 2) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = videoNaturalWidth;
        tempCanvas.height = videoNaturalHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        const previewCtx = previewCanvas.getContext('2d');
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.drawImage(
            tempCanvas,
            videoRect.x, videoRect.y, videoRect.width, videoRect.height,
            0, 0, previewCanvas.width, previewCanvas.height
        );
    }
}

// --- 普通模式的绘制函数 ---
function drawVideoCoordinateRect(videoRect, strokeStyle, lineWidth = 2, label = '') {
    if (!videoRect) return;
    
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
        坐标读取方式: 直接使用offsetX/Y<br>
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

// --- 添加选择按钮 ---
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
    
    ['debugPanel', 'brightnessPrev', 'ocrPrev'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
    document.querySelectorAll('[data-preview]').forEach(el => el.remove());
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

// --- 分析函数（保持不变）---
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
