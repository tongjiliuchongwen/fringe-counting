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
let brightnessRect = null; // { x, y, width, height }
let ocrRect = null;
let isDrawing = false;
let currentDrawingRect = {}; // For visual feedback while drawing
let brightnessData = []; // [{ frameTime: number, avgBrightness: number }]
let analysisResults = []; // [{ frameTimeAtMaxBrightness: number, ocrValue: number, occurrenceIndex: number }]
let currentMode = 'brightness'; // 'brightness' or 'ocr'
let localMaximaFrames = []; // Stores { time: number, value: number }
let currentMaximaIndex = 0;
let chartInstance = null;

// --- Tesseract Worker ---
let ocrWorker = null;
async function initializeOCR() {
    statusMessage.textContent = '正在初始化 OCR 服务... 请稍候。';
    try {
        ocrWorker = await Tesseract.createWorker('eng', 1, {
             logger: m => {
                if (m.status === 'recognizing text') {
                    statusMessage.textContent = `OCR 识别中: ${Math.round(m.progress * 100)}%`;
                }
             }
        });
        await ocrWorker.loadLanguage('eng'); // Ensure language is loaded
        await ocrWorker.initialize('eng');   // Ensure language is initialized
        statusMessage.textContent = videoFile ? 'OCR 服务已就绪。请在视频上绘制亮度分析区域。' : 'OCR 服务已就绪。请上传视频。';
        console.log("OCR Worker initialized");
    } catch (error) {
        console.error("OCR Initialization Error:", error);
        statusMessage.textContent = 'OCR 服务初始化失败。请检查网络或刷新页面。';
        alert(`OCR 初始化失败: ${error.message}`);
    }
}
initializeOCR(); // Initialize OCR on page load

// --- Event Listeners ---
videoUpload.addEventListener('change', (event) => {
    videoFile = event.target.files[0];
    if (videoFile) {
        const objectURL = URL.createObjectURL(videoFile);
        videoPlayer.src = objectURL;
        // videoPlayer.onloadedmetadata might not fire if src is set again to the same object URL
        // So, we handle metadata loading directly here or ensure it's reset
        videoPlayer.load(); // Explicitly load the new source

        statusMessage.textContent = '视频加载中...';
        brightnessRect = null;
        ocrRect = null;
        analysisResults = [];
        brightnessData = [];
        localMaximaFrames = [];
        startAnalysisBtn.disabled = true;
        currentMode = 'brightness';
        if (chartInstance) chartInstance.destroy();
        resultsTableContainer.innerHTML = "";
        drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    }
});

videoPlayer.addEventListener('loadedmetadata', () => {
    console.log("Video metadata loaded:", videoPlayer.videoWidth, videoPlayer.videoHeight);
    drawingCanvas.width = videoPlayer.videoWidth;
    drawingCanvas.height = videoPlayer.videoHeight;
    processingCanvas.width = videoPlayer.videoWidth;
    processingCanvas.height = videoPlayer.videoHeight;
    statusMessage.textContent = '视频已加载。请在视频上绘制亮度分析区域。';
});

videoPlayer.addEventListener('error', (e) => {
    console.error("Video Error:", e);
    statusMessage.textContent = '视频加载失败。请检查文件格式或选择其他文件。';
    alert('视频加载错误。');
});


drawingCanvas.addEventListener('mousedown', (e) => {
    if (!videoFile || (currentMode === 'ocr' && currentMaximaIndex >= localMaximaFrames.length)) return;
    isDrawing = true;
    const rect = drawingCanvas.getBoundingClientRect();
    currentDrawingRect.startX = e.clientX - rect.left;
    currentDrawingRect.startY = e.clientY - rect.top;
    // Don't clear immediately, allow multiple drawings if needed or clear on new draw
});

drawingCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || !videoFile) return;
    const rect = drawingCanvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height); // Clear for new preview
    drawingCtx.strokeStyle = currentMode === 'brightness' ? 'red' : 'blue';
    drawingCtx.lineWidth = 2;
    drawingCtx.strokeRect(currentDrawingRect.startX, currentDrawingRect.startY, currentX - currentDrawingRect.startX, currentY - currentDrawingRect.startY);
});

drawingCanvas.addEventListener('mouseup', (e) => {
    if (!isDrawing || !videoFile) return;
    isDrawing = false;
    const rect = drawingCanvas.getBoundingClientRect();
    const endX = e.clientX - rect.left;
    const endY = e.clientY - rect.top;

    const drawnRect = {
        x: Math.min(currentDrawingRect.startX, endX),
        y: Math.min(currentDrawingRect.startY, endY),
        width: Math.abs(endX - currentDrawingRect.startX),
        height: Math.abs(endY - currentDrawingRect.startY)
    };

    // Ensure rect has some area
    if (drawnRect.width < 5 || drawnRect.height < 5) {
        drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height); // Clear small/accidental rect
        console.log("Drawn rectangle too small.");
        return;
    }

    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height); // Clear preview
    drawingCtx.strokeStyle = currentMode === 'brightness' ? 'rgba(255,0,0,0.7)' : 'rgba(0,0,255,0.7)';
    drawingCtx.strokeRect(drawnRect.x, drawnRect.y, drawnRect.width, drawnRect.height); // Draw final rect

    if (currentMode === 'brightness') {
        brightnessRect = drawnRect;
        statusMessage.textContent = `亮度区域已选择。点击 "开始分析亮度区域"。`;
        startAnalysisBtn.disabled = false;
        console.log("Brightness Rect:", brightnessRect);
    } else if (currentMode === 'ocr') {
        if (currentMaximaIndex < localMaximaFrames.length) {
            ocrRect = drawnRect;
            statusMessage.textContent = `数字区域已选择。正在进行 OCR...`;
            console.log("OCR Rect:", ocrRect);
            performOCR(localMaximaFrames[currentMaximaIndex].time);
        }
    }
});

startAnalysisBtn.addEventListener('click', async () => {
    if (!brightnessRect || !videoFile) {
        alert('请先上传视频并选择亮度分析区域。');
        return;
    }
    startAnalysisBtn.disabled = true;
    videoPlayer.pause(); // Pause video for analysis
    statusMessage.textContent = '正在分析视频帧亮度... 请稍候。';
    if (chartInstance) chartInstance.destroy();
    resultsTableContainer.innerHTML = "";
    analysisResults = [];
    brightnessData = [];
    localMaximaFrames = [];

    await analyzeVideoBrightness();
});


// --- Core Logic ---
async function analyzeVideoBrightness() {
    brightnessData = [];
    videoPlayer.pause();
    videoPlayer.currentTime = 0;

    const duration = videoPlayer.duration;
    if (isNaN(duration) || duration === 0) {
        statusMessage.textContent = "视频时长无效，无法分析。";
        startAnalysisBtn.disabled = false;
        return;
    }
    // Estimate frame rate or use a fixed step. A common web video frame rate.
    const frameRate = 25; 
    const interval = 1 / frameRate;
    let currentTime = 0;

    statusMessage.textContent = `准备分析，总时长: ${duration.toFixed(2)}s`;

    let processedFrames = 0;
    while (currentTime <= duration) {
        const timeAtCapture = currentTime;
        
        // Seek to the frame
        await new Promise(resolve => {
            const onSeeked = () => {
                videoPlayer.removeEventListener('seeked', onSeeked);
                resolve();
            };
            videoPlayer.addEventListener('seeked', onSeeked);
            videoPlayer.currentTime = timeAtCapture;
        });

        // Process the frame
        processingCtx.drawImage(videoPlayer, 0, 0, processingCanvas.width, processingCanvas.height);
        const imageData = processingCtx.getImageData(brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height);
        const data = imageData.data;
        let totalBrightness = 0;
        let pixelCount = 0;

        for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            totalBrightness += (0.299 * r + 0.587 * g + 0.114 * b); // Standard luminance calculation
            pixelCount++;
        }
        const avgBrightness = pixelCount > 0 ? totalBrightness / pixelCount : 0;
        brightnessData.push({ frameTime: timeAtCapture, avgBrightness });
        
        processedFrames++;
        statusMessage.textContent = `分析亮度中... ${((timeAtCapture / duration) * 100).toFixed(1)}% (帧: ${processedFrames})`;

        currentTime += interval;
        if (currentTime > duration && timeAtCapture < duration) { // ensure last frame is processed
             currentTime = duration;
        } else if (currentTime > duration) {
            break;
        }
    }
    
    console.log("Brightness Data collected:", brightnessData.length, "points");
    findLocalMaxima();
    if (localMaximaFrames.length > 0) {
        currentMaximaIndex = 0;
        promptForOCRRegion();
    } else {
        statusMessage.textContent = '未找到亮度局部最大值。请尝试调整亮度区域或使用不同视频。';
        startAnalysisBtn.disabled = false;
    }
}

function findLocalMaxima() {
    localMaximaFrames = [];
    if (brightnessData.length < 3) return;

    for (let i = 1; i < brightnessData.length - 1; i++) {
        if (brightnessData[i].avgBrightness > brightnessData[i - 1].avgBrightness &&
            brightnessData[i].avgBrightness > brightnessData[i + 1].avgBrightness) {
            // Consider a threshold for significance if needed
            // e.g., brightnessData[i].avgBrightness > some_threshold
            localMaximaFrames.push({time: brightnessData[i].frameTime, value: brightnessData[i].avgBrightness});
        }
    }
    console.log("Local Maxima Frames (timestamps & values):", localMaximaFrames);
}

async function promptForOCRRegion() {
    if (currentMaximaIndex >= localMaximaFrames.length) {
        statusMessage.textContent = '所有亮度最大值帧处理完毕。正在生成结果...';
        displayResults();
        startAnalysisBtn.disabled = false; // Allow re-analysis
        currentMode = 'brightness'; 
        drawingCtx.clearRect(0,0,drawingCanvas.width,drawingCanvas.height);
        statusMessage.textContent = `分析完成。共处理 ${localMaximaFrames.length} 个亮度峰值。请查看下方结果。`;
        return;
    }

    const frameTime = localMaximaFrames[currentMaximaIndex].time;
    
    await new Promise(resolve => {
        const onSeekedOCR = () => {
            videoPlayer.removeEventListener('seeked', onSeekedOCR);
            videoPlayer.pause(); // Ensure video is paused at the frame
            currentMode = 'ocr';
            ocrRect = null; 
            drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height); 
            statusMessage.textContent = `已跳转到亮度最大值帧 ${currentMaximaIndex + 1}/${localMaximaFrames.length} (时间: ${frameTime.toFixed(2)}s)。请绘制数字识别区域。`;
            resolve();
        };
        videoPlayer.addEventListener('seeked', onSeekedOCR);
        videoPlayer.currentTime = frameTime;
    });
}

async function performOCR(frameTimeAtMaxBrightness) {
    if (!ocrRect || !ocrWorker) {
        statusMessage.textContent = 'OCR 准备失败或未选择区域。';
        // Potentially skip or ask user to redraw
        currentMaximaIndex++;
        promptForOCRRegion();
        return;
    }
    if (Math.abs(videoPlayer.currentTime - frameTimeAtMaxBrightness) > 0.15) { // Allow small tolerance, 0.15s for safety
      console.warn(`Video not at correct time for OCR. Current: ${videoPlayer.currentTime}, Target: ${frameTimeAtMaxBrightness}. Seeking...`);
      await new Promise(resolve => {
        const onSeekedForOCR = () => {
            videoPlayer.removeEventListener('seeked', onSeekedForOCR);
            videoPlayer.pause();
            resolve();
        };
        videoPlayer.addEventListener('seeked', onSeekedForOCR);
        videoPlayer.currentTime = frameTimeAtMaxBrightness;
      });
    }
    
    processingCtx.drawImage(videoPlayer, 0, 0, processingCanvas.width, processingCanvas.height);
    
    // Create a temporary canvas for Tesseract.js to process the specific region
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = ocrRect.width;
    tempCanvas.height = ocrRect.height;
    const tempCtx = tempCanvas.getContext('2d');
    // Draw the selected portion of the processing canvas onto the temp canvas
    tempCtx.drawImage(processingCanvas, ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height, 0, 0, ocrRect.width, ocrRect.height);

    statusMessage.textContent = `正在识别数字 (帧 ${currentMaximaIndex + 1}/${localMaximaFrames.length})...`;
    try {
        // It's good practice to set parameters that might help OCR for numbers
        await ocrWorker.setParameters({
            tessedit_char_whitelist: '0123456789.', // Whitelist characters for numbers and decimal point
        });
        const { data: { text } } = await ocrWorker.recognize(tempCanvas);
        console.log(`OCR Result for frame at ${frameTimeAtMaxBrightness.toFixed(2)}s: "${text.trim()}"`);
        
        const numberMatch = text.trim().match(/(\d+(\.\d{1,2})?)/);
        let ocrValue = NaN;
        if (numberMatch && numberMatch[0]) {
            ocrValue = parseFloat(numberMatch[0]);
        } else {
            console.warn("OCR did not find a valid number in:", text.trim());
        }

        analysisResults.push({
            occurrenceIndex: currentMaximaIndex + 1,
            frameTime: frameTimeAtMaxBrightness,
            value: ocrValue
        });
        
    } catch (error) {
        console.error("OCR Error:", error);
        statusMessage.textContent = `OCR 失败: ${error.message}. 跳过此帧。`;
        analysisResults.push({
            occurrenceIndex: currentMaximaIndex + 1,
            frameTime: frameTimeAtMaxBrightness,
            value: NaN 
        });
    } finally {
        currentMaximaIndex++;
        promptForOCRRegion(); // Move to the next maxima or finish
    }
}


function displayResults() {
    // 1. Table
    let tableHTML = '<table border="1"><thead><tr><th>亮度最大值序号</th><th>帧时间 (s)</th><th>识别的数字</th></tr></thead><tbody>';
    if (analysisResults.length === 0) {
        tableHTML += '<tr><td colspan="3">没有可显示的结果。</td></tr>';
    } else {
        analysisResults.forEach(result => {
            tableHTML += `<tr><td>${result.occurrenceIndex}</td><td>${result.frameTime.toFixed(2)}</td><td>${isNaN(result.value) ? 'N/A (识别失败)' : result.value.toFixed(2)}</td></tr>`;
        });
    }
    tableHTML += '</tbody></table>';
    resultsTableContainer.innerHTML = tableHTML;

    // 2. Chart
    const labels = analysisResults.map(r => r.occurrenceIndex); // X-axis: occurrence number
    const dataValues = analysisResults.map(r => isNaN(r.value) ? null : r.value);

    if (chartInstance) {
        chartInstance.destroy(); 
    }
    chartInstance = new Chart(resultsChartCtx, {
        type: 'scatter', 
        data: {
            // labels: labels, // For scatter, labels are often derived from data points themselves
            datasets: [{
                label: '识别的数字 vs. 亮度最大值序号',
                data: analysisResults.map(r => ({ x: r.occurrenceIndex, y: isNaN(r.value) ? null : r.value })),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.5)', // Fill color for points
                tension: 0.1,
                showLine: true, // Optionally draw a line connecting the scatter points
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear', 
                    title: {
                        display: true,
                        text: '亮度最大值出现次数 (序号)'
                    },
                    ticks: {
                        stepSize: 1 // Ensure integer ticks for occurrence index
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: '识别的数字'
                    },
                    beginAtZero: false 
                }
            },
            plugins: {
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            const pointData = analysisResults[context.dataIndex];
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
    // Curve fitting logic would go here.
    // Example:
    // if (analysisResults.filter(r => !isNaN(r.value)).length > 1) {
    //    const pointsForRegression = analysisResults
    //                              .filter(r => !isNaN(r.value))
    //                              .map(r => [r.occurrenceIndex, r.value]);
    //    const resultRegression = regression.linear(pointsForRegression); // Using a hypothetical regression library
    //    const fittedLinePoints = labels.map(x => ({x: x, y: resultRegression.predict(x)[1]}));
    //
    //    chartInstance.data.datasets.push({
    //        label: '拟合曲线 (线性)',
    //        data: fittedLinePoints,
    //        borderColor: 'rgb(255, 99, 132)',
    //        type: 'line', // Draw this as a line
    //        fill: false,
    //        tension: 0.1
    //    });
    //    chartInstance.update();
    // }
}

// --- Initial Setup ---
if (!ocrWorker) { // If OCR worker failed to initialize earlier
    statusMessage.textContent = 'OCR 服务不可用。请检查控制台错误并刷新。';
} else {
    statusMessage.textContent = '请上传视频。';
}
