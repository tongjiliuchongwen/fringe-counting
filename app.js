// --- DOM Elements ---
const videoUpload = document.getElementById('videoUpload');
const videoPlayer = document.getElementById('videoPlayer');
const drawingCanvas = document.getElementById('drawingCanvas');
const drawingCtx = drawingCanvas.getContext('2d');
const processingCanvas = document.getElementById('processingCanvas'); // Hidden canvas
const processingCtx = processingCanvas.getContext('2d');
const startAnalysisBtn = document.getElementById('startAnalysisBtn');
const statusMessage = document.getElementById('statusMessage');
const resultsTableContainer = document.getElementById('resultsTableContainer');
const resultsChartCtx = document.getElementById('resultsChart').getContext('2d');

// --- State Variables ---
let videoFile = null;
let brightnessRect = null; // { x, y, width, height } - Scaled coordinates for processing
let ocrRect = null;        // { x, y, width, height } - Scaled coordinates for processing
let isDrawing = false;
let currentDrawingStart = {}; // {x, y} - Scaled coordinates
let scaleX = 1;
let scaleY = 1;

let brightnessData = []; // [{ frameTime: number, avgBrightness: number }]
let analysisResults = []; // [{ occurrenceIndex: number, frameTime: number, ocrValue: number }]
let currentMode = 'brightness'; // 'brightness', 'ocr_define', 'analyzing'
let localMaximaFrames = []; // Stores { time: number, value: number }
let currentMaximaProcessingIndex = 0; // For tracking progress through maxima during OCR
let chartInstance = null;

// --- Tesseract Worker ---
let ocrWorker = null;
async function initializeOCR() {
    statusMessage.textContent = '正在初始化 OCR 服务... 请稍候。';
    try {
        ocrWorker = await Tesseract.createWorker('eng', 1, {
             logger: m => {
                if (m.status === 'recognizing text') {
                    // Update status for the specific frame being processed
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

// --- Helper: Clear and Redraw Defined Rectangles ---
function clearAndRedrawRects() {
    // Clear with unscaled dimensions as it clears the canvas buffer
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    
    if (brightnessRect) {
        drawingCtx.strokeStyle = 'rgba(255,0,0,0.7)';
        drawingCtx.lineWidth = 2;
        // brightnessRect stores scaled coords, draw them directly
        drawingCtx.strokeRect(brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height);
    }
    if (ocrRect) {
        drawingCtx.strokeStyle = 'rgba(0,0,255,0.7)';
        drawingCtx.lineWidth = 2;
        // ocrRect stores scaled coords, draw them directly
        drawingCtx.strokeRect(ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height);
    }
}

// --- Event Listeners ---
videoUpload.addEventListener('change', (event) => {
    videoFile = event.target.files[0];
    if (videoFile) {
        const objectURL = URL.createObjectURL(videoFile);
        videoPlayer.src = objectURL;
        videoPlayer.load();

        statusMessage.textContent = '视频加载中...';
        brightnessRect = null;
        ocrRect = null;
        analysisResults = [];
        brightnessData = [];
        localMaximaFrames = [];
        currentMode = 'brightness'; // Reset mode
        startAnalysisBtn.disabled = true;
        startAnalysisBtn.textContent = '开始完整分析'; // Reset button text
        
        if (chartInstance) chartInstance.destroy();
        resultsTableContainer.innerHTML = "";
        clearAndRedrawRects(); // Clear any previous drawings
    }
});

videoPlayer.addEventListener('loadedmetadata', () => {
    console.log("Video metadata loaded:", videoPlayer.videoWidth, videoPlayer.videoHeight);
    // Set canvas buffer size to actual video dimensions
    drawingCanvas.width = videoPlayer.videoWidth;
    drawingCanvas.height = videoPlayer.videoHeight;
    // Processing canvas also
    processingCanvas.width = videoPlayer.videoWidth;
    processingCanvas.height = videoPlayer.videoHeight;

    // Calculate scaling factors based on displayed size vs internal buffer size
    // clientWidth/Height are the displayed dimensions on the page (CSS size)
    scaleX = drawingCanvas.width / drawingCanvas.clientWidth;
    scaleY = drawingCanvas.height / drawingCanvas.clientHeight;

    console.log(`Canvas scaling factors: scaleX=${scaleX}, scaleY=${scaleY}`);

    statusMessage.textContent = '视频已加载。请在视频上绘制亮度分析区域。';
    currentMode = 'brightness';
    brightnessRect = null;
    ocrRect = null;
    startAnalysisBtn.disabled = true;
    clearAndRedrawRects();
});

videoPlayer.addEventListener('error', (e) => {
    console.error("Video Error:", e);
    statusMessage.textContent = '视频加载失败。请检查文件格式或选择其他文件。';
    alert('视频加载错误。');
});

drawingCanvas.addEventListener('mousedown', (e) => {
    if (!videoFile || currentMode === 'analyzing') return;
    isDrawing = true;
    const rect = drawingCanvas.getBoundingClientRect();
    // Store starting point, scaled to canvas buffer coordinates
    currentDrawingStart.x = (e.clientX - rect.left) * scaleX;
    currentDrawingStart.y = (e.clientY - rect.top) * scaleY;
    
    // Clear previous temporary drawing for live feedback, but keep defined rects
    clearAndRedrawRects();
});

drawingCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || !videoFile || currentMode === 'analyzing') return;
    const rect = drawingCanvas.getBoundingClientRect();
    // Current mouse position, scaled
    const currentX = (e.clientX - rect.left) * scaleX;
    const currentY = (e.clientY - rect.top) * scaleY;

    clearAndRedrawRects(); // Redraw defined rects first

    // Draw live feedback rectangle (scaled coordinates)
    drawingCtx.strokeStyle = (currentMode === 'brightness') ? 'rgba(255,0,0,0.5)' : 'rgba(0,0,255,0.5)';
    drawingCtx.lineWidth = 1;
    drawingCtx.strokeRect(currentDrawingStart.x, currentDrawingStart.y, currentX - currentDrawingStart.x, currentY - currentDrawingStart.y);
});

drawingCanvas.addEventListener('mouseup', (e) => {
    if (!isDrawing || !videoFile || currentMode === 'analyzing') return;
    isDrawing = false;
    const rect = drawingCanvas.getBoundingClientRect();
    const endX = (e.clientX - rect.left) * scaleX;
    const endY = (e.clientY - rect.top) * scaleY;

    const drawnRect = { // Coordinates are already scaled for canvas buffer
        x: Math.min(currentDrawingStart.x, endX),
        y: Math.min(currentDrawingStart.y, endY),
        width: Math.abs(endX - currentDrawingStart.x),
        height: Math.abs(endY - currentDrawingStart.y)
    };

    if (drawnRect.width < 5 || drawnRect.height < 5) {
        console.log("Drawn rectangle too small.");
        clearAndRedrawRects(); // Clear the small attempt and redraw existing
        return;
    }

    if (currentMode === 'brightness') {
        brightnessRect = drawnRect;
        console.log("Brightness Rect (scaled for processing):", brightnessRect);
        currentMode = 'ocr_define';
        statusMessage.textContent = `亮度区域已定义。现在请绘制数字识别区域 (此区域将用于所有峰值帧)。`;
        startAnalysisBtn.disabled = true; // Keep disabled until OCR rect is also defined
    } else if (currentMode === 'ocr_define') {
        ocrRect = drawnRect;
        console.log("OCR Rect (scaled for processing):", ocrRect);
        currentMode = 'ready_to_analyze'; // Both rects are now defined
        statusMessage.textContent = `数字识别区域已定义。点击 "开始完整分析" 按钮。`;
        startAnalysisBtn.disabled = false; // Enable analysis button
    }
    clearAndRedrawRects(); // Redraw with the newly defined rect
});

startAnalysisBtn.addEventListener('click', async () => {
    if (!brightnessRect || !ocrRect || !videoFile) {
        alert('请先上传视频，并完整定义亮度和数字识别区域。');
        return;
    }
    currentMode = 'analyzing';
    startAnalysisBtn.disabled = true;
    videoPlayer.pause();
    statusMessage.textContent = '正在分析视频帧亮度... 请稍候。';

    if (chartInstance) chartInstance.destroy();
    resultsTableContainer.innerHTML = "";
    analysisResults = [];
    brightnessData = [];
    localMaximaFrames = [];

    await analyzeVideoBrightnessAndOCR(); // New main analysis function
});

async function analyzeVideoBrightnessAndOCR() {
    // 1. Analyze Brightness
    brightnessData = [];
    videoPlayer.currentTime = 0;
    const duration = videoPlayer.duration;
    if (isNaN(duration) || duration === 0) {
        statusMessage.textContent = "视频时长无效，无法分析。";
        startAnalysisBtn.disabled = false; currentMode = 'brightness'; return;
    }
    const frameRate = 25; 
    const interval = 1 / frameRate;
    let currentTime = 0;
    let processedFrames = 0;

    statusMessage.textContent = `准备分析亮度，总时长: ${duration.toFixed(2)}s`;

    while (currentTime <= duration) {
        const timeAtCapture = currentTime;
        await new Promise(resolve => {
            const onSeeked = () => { videoPlayer.removeEventListener('seeked', onSeeked); resolve(); };
            videoPlayer.addEventListener('seeked', onSeeked);
            videoPlayer.currentTime = timeAtCapture;
        });

        processingCtx.drawImage(videoPlayer, 0, 0, processingCanvas.width, processingCanvas.height);
        // Use brightnessRect (already scaled) for getImageData
        const imageData = processingCtx.getImageData(brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height);
        const data = imageData.data;
        let totalBrightness = 0;
        let pixelCount = 0;
        for (let i = 0; i < data.length; i += 4) {
            totalBrightness += (0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
            pixelCount++;
        }
        brightnessData.push({ frameTime: timeAtCapture, avgBrightness: pixelCount > 0 ? totalBrightness / pixelCount : 0 });
        
        processedFrames++;
        statusMessage.textContent = `分析亮度中... ${((timeAtCapture / duration) * 100).toFixed(1)}% (帧: ${processedFrames})`;
        currentTime += interval;
        if (currentTime > duration && timeAtCapture < duration) currentTime = duration;
        else if (currentTime > duration) break;
    }
    
    console.log("Brightness Data collected:", brightnessData.length, "points");
    findLocalMaxima();

    // 2. Process OCR for each local maximum using the single defined ocrRect
    if (localMaximaFrames.length > 0) {
        statusMessage.textContent = `找到 ${localMaximaFrames.length} 个亮度峰值。开始OCR处理...`;
        for (let i = 0; i < localMaximaFrames.length; i++) {
            currentMaximaProcessingIndex = i; // For status updates in OCR logger
            const frameData = localMaximaFrames[i];
            statusMessage.textContent = `处理峰值 ${i + 1}/${localMaximaFrames.length} (时间: ${frameData.time.toFixed(2)}s)。跳转并准备OCR...`;
            
            await new Promise(resolve => { // Seek to frame
                const onSeekedOCR = () => { videoPlayer.removeEventListener('seeked', onSeekedOCR); videoPlayer.pause(); resolve(); };
                videoPlayer.addEventListener('seeked', onSeekedOCR);
                videoPlayer.currentTime = frameData.time;
            });
            
            await performOCR(frameData.time, i); // Pass index for results array
        }
        statusMessage.textContent = '所有亮度最大值帧处理完毕。正在生成结果...';
        displayResults();
    } else {
        statusMessage.textContent = '未找到亮度局部最大值。请尝试调整亮度区域或使用不同视频。';
    }

    // Reset for next run
    startAnalysisBtn.disabled = false;
    startAnalysisBtn.textContent = '开始完整分析';
    currentMode = 'brightness'; // Reset to allow new brightness rect definition
    // Keep brightnessRect and ocrRect defined for convenience if user wants to re-run on same regions,
    // or clear them if a full reset is desired:
    // brightnessRect = null; ocrRect = null; clearAndRedrawRects();
    // For now, let's keep them. User can redraw if needed.
}

function findLocalMaxima() {
    localMaximaFrames = [];
    if (brightnessData.length < 3) return;
    for (let i = 1; i < brightnessData.length - 1; i++) {
        if (brightnessData[i].avgBrightness > brightnessData[i - 1].avgBrightness &&
            brightnessData[i].avgBrightness > brightnessData[i + 1].avgBrightness) {
            localMaximaFrames.push({time: brightnessData[i].frameTime, value: brightnessData[i].avgBrightness});
        }
    }
    console.log("Local Maxima Frames (timestamps & values):", localMaximaFrames);
}

async function performOCR(frameTimeAtMaxBrightness, occurrenceIdx) {
    if (!ocrRect || !ocrWorker) { // ocrRect is now global
        statusMessage.textContent = 'OCR 区域未定义或 OCR 服务未就绪。';
        analysisResults.push({
            occurrenceIndex: occurrenceIdx + 1,
            frameTime: frameTimeAtMaxBrightness,
            value: NaN 
        });
        return;
    }
    
    // Ensure video is at the correct frame (already done before calling performOCR in new flow)
    // processingCtx is already updated with the correct frame image
    processingCtx.drawImage(videoPlayer, 0, 0, processingCanvas.width, processingCanvas.height);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = ocrRect.width;   // Use scaled width/height from global ocrRect
    tempCanvas.height = ocrRect.height;
    const tempCtx = tempCanvas.getContext('2d');
    // Draw the selected portion (using scaled ocrRect coordinates) from processingCanvas to tempCanvas
    tempCtx.drawImage(processingCanvas, ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height, 0, 0, ocrRect.width, ocrRect.height);

    // Status update is now handled by Tesseract logger or before calling performOCR
    try {
        await ocrWorker.setParameters({ tessedit_char_whitelist: '0123456789.' });
        const { data: { text } } = await ocrWorker.recognize(tempCanvas);
        console.log(`OCR Result for frame at ${frameTimeAtMaxBrightness.toFixed(2)}s (Occurrence ${occurrenceIdx+1}): "${text.trim()}"`);
        
        const numberMatch = text.trim().match(/(\d+(\.\d{1,2})?)/);
        let ocrValue = NaN;
        if (numberMatch && numberMatch[0]) ocrValue = parseFloat(numberMatch[0]);
        else console.warn("OCR did not find a valid number in:", text.trim());

        analysisResults.push({
            occurrenceIndex: occurrenceIdx + 1,
            frameTime: frameTimeAtMaxBrightness,
            value: ocrValue
        });
        
    } catch (error) {
        console.error("OCR Error:", error);
        statusMessage.textContent = `OCR 失败 (峰值 ${occurrenceIdx+1}): ${error.message}.`;
        analysisResults.push({
            occurrenceIndex: occurrenceIdx + 1,
            frameTime: frameTimeAtMaxBrightness,
            value: NaN 
        });
    }
}

function displayResults() {
    let tableHTML = '<table border="1"><thead><tr><th>亮度最大值序号</th><th>帧时间 (s)</th><th>识别的数字</th></tr></thead><tbody>';
    if (analysisResults.length === 0) {
        tableHTML += '<tr><td colspan="3">没有可显示的结果。</td></tr>';
    } else {
        analysisResults.sort((a,b) => a.occurrenceIndex - b.occurrenceIndex).forEach(result => { // Ensure sorted by occurrence
            tableHTML += `<tr><td>${result.occurrenceIndex}</td><td>${result.frameTime.toFixed(2)}</td><td>${isNaN(result.value) ? 'N/A (识别失败)' : result.value.toFixed(2)}</td></tr>`;
        });
    }
    tableHTML += '</tbody></table>';
    resultsTableContainer.innerHTML = tableHTML;

    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(resultsChartCtx, {
        type: 'scatter', 
        data: {
            datasets: [{
                label: '识别的数字 vs. 亮度最大值序号',
                data: analysisResults.map(r => ({ x: r.occurrenceIndex, y: isNaN(r.value) ? null : r.value })),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                showLine: true,
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false,
            scales: {
                x: { type: 'linear', title: { display: true, text: '亮度最大值出现次数 (序号)' }, ticks: { stepSize: 1 } },
                y: { title: { display: true, text: '识别的数字' }, beginAtZero: false }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            const pointData = analysisResults.find(r => r.occurrenceIndex === context.parsed.x); // Find by occurrence index
                            if (pointData && context.parsed.y !== null) {
                                label += `数字: ${context.parsed.y.toFixed(2)} (帧时间: ${pointData.frameTime.toFixed(2)}s)`;
                            } else if (pointData) {
                                label += `识别失败 (帧时间: ${pointData.frameTime.toFixed(2)}s)`;
                            }
                            return label;
                        }
                    }
                }
            }
        }
    });
}

// --- Initial Setup ---
if (!ocrWorker) {
    statusMessage.textContent = 'OCR 服务不可用。请检查控制台错误并刷新。';
} else {
    statusMessage.textContent = '请上传视频。';
}
startAnalysisBtn.disabled = true;
startAnalysisBtn.textContent = '开始完整分析';
