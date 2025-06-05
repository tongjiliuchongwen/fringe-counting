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
let videoNaturalWidth = 0;  // 视频原始宽度
let videoNaturalHeight = 0; // 视频原始高度

let brightnessData = [];
let analysisResults = [];
let currentMode = 'brightness'; // 'brightness', 'ocr_define', 'ready_to_analyze', 'analyzing'
let localMaximaFrames = [];
let currentMaximaProcessingIndex = 0;
let chartInstance = null;

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
        statusMessage.textContent = videoFile ? 'OCR 服务已就绪。请在视频上绘制亮度分析区域。' : 'OCR 服务已就绪。请上传视频。';
        console.log("OCR Worker initialized");
    } catch (error) {
        console.error("OCR Initialization Error:", error);
        statusMessage.textContent = 'OCR 服务初始化失败。请检查网络或刷新页面。';
        alert(`OCR 初始化失败: ${error.message}`);
    }
}

initializeOCR();

// --- 核心坐标转换函数 ---
function getVideoCoordinatesFromMouse(event) {
    const rect = drawingCanvas.getBoundingClientRect();
    
    // 获取鼠标在canvas显示区域的相对位置 (0-1)
    const relativeX = (event.clientX - rect.left) / rect.width;
    const relativeY = (event.clientY - rect.top) / rect.height;
    
    // 转换为视频原始像素坐标
    const videoX = relativeX * videoNaturalWidth;
    const videoY = relativeY * videoNaturalHeight;
    
    return { x: videoX, y: videoY };
}

function drawVideoCoordinateRect(videoRect, strokeStyle, lineWidth = 2, label = '') {
    if (!videoRect) return;
    
    const rect = drawingCanvas.getBoundingClientRect();
    
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
        drawingCtx.fillText(label, displayX, displayY - 5);
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
function createOrUpdateDebugPanel() {
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
    
    const rect = drawingCanvas.getBoundingClientRect();
    let info = `
        <strong>调试信息</strong><br>
        视频原始分辨率: ${videoNaturalWidth}×${videoNaturalHeight}<br>
        Canvas显示尺寸: ${rect.width.toFixed(0)}×${rect.height.toFixed(0)}<br>
        Canvas内部尺寸: ${drawingCanvas.width}×${drawingCanvas.height}<br>
        当前模式: ${currentMode}<br>
    `;
    
    if (brightnessRect) {
        info += `<br><strong>亮度区域 (视频像素):</strong><br>
                 位置: (${brightnessRect.x.toFixed(1)}, ${brightnessRect.y.toFixed(1)})<br>
                 尺寸: ${brightnessRect.width.toFixed(1)}×${brightnessRect.height.toFixed(1)}<br>`;
    }
    
    if (ocrRect) {
        info += `<br><strong>OCR区域 (视频像素):</strong><br>
                 位置: (${ocrRect.x.toFixed(1)}, ${ocrRect.y.toFixed(1)})<br>
                 尺寸: ${ocrRect.width.toFixed(1)}×${ocrRect.height.toFixed(1)}<br>`;
    }
    
    debugPanel.innerHTML = info;
}

function createPreviewCanvas(id, title, videoRect) {
    if (!videoRect) return;
    
    let previewCanvas = document.getElementById(id);
    if (!previewCanvas) {
        previewCanvas = document.createElement('canvas');
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
        
        // 添加标题
        const label = document.createElement('div');
        label.textContent = title;
        label.style.cssText = `
            position: fixed;
            top: ${Math.max(150, videoRect.height + 20)}px;
            right: ${id === 'brightnessPrev' ? '10px' : '220px'};
            z-index: 10001;
            background: yellow;
            padding: 2px 5px;
            font-size: 12px;
            border: 1px solid black;
        `;
        document.body.appendChild(label);
    }
    
    // 设置预览canvas尺寸
    const maxSize = 150;
    const scale = Math.min(maxSize / videoRect.width, maxSize / videoRect.height, 1);
    previewCanvas.width = Math.max(videoRect.width * scale, 50);
    previewCanvas.height = Math.max(videoRect.height * scale, 20);
    
    // 绘制当前视频帧的对应区域
    if (videoPlayer.readyState >= 2) {
        // 创建临时canvas以获取视频帧
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = videoNaturalWidth;
        tempCanvas.height = videoNaturalHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        // 截取并绘制到预览canvas
        const previewCtx = previewCanvas.getContext('2d');
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
        previewCtx.drawImage(
            tempCanvas,
            videoRect.x, videoRect.y, videoRect.width, videoRect.height,
            0, 0, previewCanvas.width, previewCanvas.height
        );
    }
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
    ['debugPanel', 'brightnessPrev', 'ocrPrev'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.remove();
    });
});

videoPlayer.addEventListener('loadedmetadata', () => {
    // 获取视频原始尺寸
    videoNaturalWidth = videoPlayer.videoWidth;
    videoNaturalHeight = videoPlayer.videoHeight;
    
    // 设置canvas内部尺寸等于视频尺寸
    drawingCanvas.width = videoNaturalWidth;
    drawingCanvas.height = videoNaturalHeight;
    processingCanvas.width = videoNaturalWidth;
    processingCanvas.height = videoNaturalHeight;
    
    console.log(`视频加载完成: ${videoNaturalWidth}×${videoNaturalHeight}`);
    
    statusMessage.textContent = '视频已加载。请在视频上绘制亮度分析区域。';
    currentMode = 'brightness';
    startAnalysisBtn.disabled = true;
    clearAndRedrawRects();
    createOrUpdateDebugPanel();
});

videoPlayer.addEventListener('error', (e) => {
    console.error("Video Error:", e);
    statusMessage.textContent = '视频加载失败。请检查文件格式或选择其他文件。';
});

// 鼠标事件
drawingCanvas.addEventListener('mousedown', (e) => {
    if (!videoFile || currentMode === 'analyzing') return;
    
    isDrawing = true;
    const coords = getVideoCoordinatesFromMouse(e);
    currentDrawingStart = coords;
    
    console.log(`鼠标按下: 视频坐标 (${coords.x.toFixed(1)}, ${coords.y.toFixed(1)})`);
    clearAndRedrawRects();
});

drawingCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || !videoFile || currentMode === 'analyzing') return;
    
    const coords = getVideoCoordinatesFromMouse(e);
    clearAndRedrawRects();
    
    // 绘制当前拖拽的矩形
    const tempRect = {
        x: Math.min(currentDrawingStart.x, coords.x),
        y: Math.min(currentDrawingStart.y, coords.y),
        width: Math.abs(coords.x - currentDrawingStart.x),
        height: Math.abs(coords.y - currentDrawingStart.y)
    };
    
    const strokeStyle = (currentMode === 'brightness') ? 'rgba(255,0,0,0.5)' : 'rgba(0,0,255,0.5)';
    drawVideoCoordinateRect(tempRect, strokeStyle, 1);
});

drawingCanvas.addEventListener('mouseup', (e) => {
    if (!isDrawing || !videoFile || currentMode === 'analyzing') return;
    
    isDrawing = false;
    const coords = getVideoCoordinatesFromMouse(e);
    
    const drawnRect = {
        x: Math.min(currentDrawingStart.x, coords.x),
        y: Math.min(currentDrawingStart.y, coords.y),
        width: Math.abs(coords.x - currentDrawingStart.x),
        height: Math.abs(coords.y - currentDrawingStart.y)
    };
    
    console.log(`绘制完成: 视频坐标`, drawnRect);
    
    if (drawnRect.width < 10 || drawnRect.height < 10) {
        console.log("区域太小，已忽略");
        clearAndRedrawRects();
        return;
    }
    
    if (currentMode === 'brightness') {
        brightnessRect = drawnRect;
        currentMode = 'ocr_define';
        statusMessage.textContent = '亮度区域已定义。现在请绘制数字识别区域。';
        createPreviewCanvas('brightnessPrev', '亮度区域预览', brightnessRect);
    } else if (currentMode === 'ocr_define') {
        ocrRect = drawnRect;
        currentMode = 'ready_to_analyze';
        statusMessage.textContent = '数字识别区域已定义。点击"开始完整分析"按钮。';
        startAnalysisBtn.disabled = false;
        createPreviewCanvas('ocrPrev', 'OCR区域预览', ocrRect);
    }
    
    clearAndRedrawRects();
    createOrUpdateDebugPanel();
});

startAnalysisBtn.addEventListener('click', async () => {
    if (!brightnessRect || !ocrRect || !videoFile) {
        alert('请先上传视频，并完整定义亮度和数字识别区域。');
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

// --- 主分析函数 ---
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
        
        // 将视频帧绘制到processing canvas
        processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        // 安全截取亮度区域
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

// --- 辅助函数 ---
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
        // 绘制当前帧到processing canvas
        processingCtx.drawImage(videoPlayer, 0, 0, videoNaturalWidth, videoNaturalHeight);
        
        // 安全截取OCR区域
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
        
        // 图像预处理
        const processedCanvas = preprocessImageForOCR(tempCanvas);
        
        // 更新调试预览
        updateOCRPreview(processedCanvas);
        
        // OCR识别
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
    
    // 自适应阈值处理
    let totalBrightness = 0;
    for (let i = 0; i < data.length; i += 4) {
        totalBrightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    const avgBrightness = totalBrightness / (data.length / 4);
    const threshold = Math.max(120, Math.min(200, avgBrightness + 30));
    
    // 二值化处理
    for (let i = 0; i < data.length; i += 4) {
        const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const color = avg >= threshold ? 255 : 0;
        data[i] = color;
        data[i + 1] = color;
        data[i + 2] = color;
        data[i + 3] = 255;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // 放大图像提高OCR精度
    const scaleFactor = 3;
    const scaledCanvas = document.createElement('canvas');
    scaledCanvas.width = canvas.width * scaleFactor;
    scaledCanvas.height = canvas.height * scaleFactor;
    const scaledCtx = scaledCanvas.getContext('2d');
    scaledCtx.imageSmoothingEnabled = false;
    scaledCtx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, scaledCanvas.width, scaledCanvas.height);
    
    return scaledCanvas;
}

function updateOCRPreview(processedCanvas) {
    const debugCanvas = document.getElementById('ocrPrev');
    if (debugCanvas && processedCanvas) {
        const debugCtx = debugCanvas.getContext('2d');
        debugCtx.clearRect(0, 0, debugCanvas.width, debugCanvas.height);
        debugCtx.drawImage(processedCanvas, 0, 0, debugCanvas.width, debugCanvas.height);
    }
}

function displayResults() {
    // 生成表格
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
    
    // 生成图表
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
    createOrUpdateDebugPanel();
}

// --- 初始化 ---
statusMessage.textContent = '请上传视频文件开始分析。';
startAnalysisBtn.disabled = true;
