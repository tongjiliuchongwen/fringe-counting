// app.js

// --- DOM Elements ---
const videoUpload = document.getElementById('videoUpload');
const videoPlayer = document.getElementById('videoPlayer');
const drawingCanvas = document.getElementById('drawingCanvas');
const drawingCtx = drawingCanvas.getContext('2d');
const processingCanvas = document.getElementById('processingCanvas'); // 隐藏的Canvas用于像素处理
const processingCtx = processingCanvas.getContext('2d');
const startAnalysisBtn = document.getElementById('startAnalysisBtn');
const statusMessage = document.getElementById('statusMessage');
const resultsTableContainer = document.getElementById('resultsTableContainer');
const resultsChartCtx = document.getElementById('resultsChart').getContext('2d');

// --- State Variables ---
let videoFile = null;
let brightnessRect = null;    // { x, y, width, height } - 内部像素坐标
let ocrRect = null;           // { x, y, width, height } - 内部像素坐标
let isDrawing = false;
let currentDrawingStart = {}; // { x, y } - 内部像素坐标
let canvasInternalWidth = 0;  // 等于 videoVideoWidth
let canvasInternalHeight = 0; // 等于 videoVideoHeight

let brightnessData = [];      // [{ frameTime: number, avgBrightness: number }]
let analysisResults = [];     // [{ occurrenceIndex: number, frameTime: number, value: number }]
let currentMode = 'brightness'; // 'brightness', 'ocr_define', 'ready_to_analyze', 'analyzing'
let localMaximaFrames = [];   // 存储 { time: number, value: number }
let currentMaximaProcessingIndex = 0; // 当前 OCR 进度计数
let chartInstance = null;

// --- Tesseract Worker 初始化 ---
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

// --- Helper: 清除并重画已定义的矩形框 ---
function clearAndRedrawRects() {
    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

    if (brightnessRect) {
        drawingCtx.strokeStyle = 'rgba(255,0,0,0.7)';
        drawingCtx.lineWidth = 2;
        drawingCtx.strokeRect(brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height);
    }
    if (ocrRect) {
        drawingCtx.strokeStyle = 'rgba(0,0,255,0.7)';
        drawingCtx.lineWidth = 2;
        drawingCtx.strokeRect(ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height);
    }
}

// --- 事件绑定 ---
// 1. 用户上传视频时
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
    startAnalysisBtn.textContent = '开始完整分析';

    if (chartInstance) chartInstance.destroy();
    resultsTableContainer.innerHTML = "";
    clearAndRedrawRects();
});

// 2. 视频元数据加载完毕时（知道 videoWidth、videoHeight）
videoPlayer.addEventListener('loadedmetadata', () => {
    // 将 Canvas 的“内部像素”大小设为视频实际分辨率
    canvasInternalWidth = videoPlayer.videoWidth;
    canvasInternalHeight = videoPlayer.videoHeight;
    drawingCanvas.width = canvasInternalWidth;
    drawingCanvas.height = canvasInternalHeight;
    processingCanvas.width = canvasInternalWidth;
    processingCanvas.height = canvasInternalHeight;

    // 这里不用算固定的 scaleX/scaleY，只记录内部像素尺寸即可
    console.log(`视频原始分辨率: ${canvasInternalWidth}×${canvasInternalHeight}`);

    statusMessage.textContent = '视频已加载。请在视频上绘制亮度分析区域。';
    currentMode = 'brightness';
    brightnessRect = null;
    ocrRect = null;
    startAnalysisBtn.disabled = true;
    clearAndRedrawRects();
});

// 3. 视频加载失败
videoPlayer.addEventListener('error', (e) => {
    console.error("Video Error:", e);
    statusMessage.textContent = '视频加载失败。请检查文件格式或选择其他文件。';
    alert('视频加载错误。');
});

// 4. 鼠标按下：开始绘制矩形框
drawingCanvas.addEventListener('mousedown', (e) => {
    if (!videoFile || currentMode === 'analyzing') return;
    isDrawing = true;

    // 获取此刻 Canvas 在视口中占的真实大小
    const rect = drawingCanvas.getBoundingClientRect();
    // clientX/clientY：相对于视口左上角的坐标；减去 rect.left/top 就是“点在 Canvas 里偏移”
    const xInCanvas  = (e.clientX - rect.left) * (canvasInternalWidth  / rect.width);
    const yInCanvas  = (e.clientY - rect.top ) * (canvasInternalHeight / rect.height);

    currentDrawingStart.x = xInCanvas;
    currentDrawingStart.y = yInCanvas;

    clearAndRedrawRects();
});

// 5. 鼠标移动：实时画出当前矩形（辅助预览）
drawingCanvas.addEventListener('mousemove', (e) => {
    if (!isDrawing || !videoFile || currentMode === 'analyzing') return;

    const rect = drawingCanvas.getBoundingClientRect();
    const xInCanvas  = (e.clientX - rect.left) * (canvasInternalWidth  / rect.width);
    const yInCanvas  = (e.clientY - rect.top ) * (canvasInternalHeight / rect.height);

    clearAndRedrawRects();

    drawingCtx.strokeStyle = (currentMode === 'brightness') ? 'rgba(255,0,0,0.5)' : 'rgba(0,0,255,0.5)';
    drawingCtx.lineWidth = 1;
    drawingCtx.strokeRect(
      currentDrawingStart.x,
      currentDrawingStart.y,
      xInCanvas - currentDrawingStart.x,
      yInCanvas - currentDrawingStart.y
    );
});

// 6. 鼠标松开：结束绘制，记录“内部像素坐标”矩形
drawingCanvas.addEventListener('mouseup', (e) => {
    if (!isDrawing || !videoFile || currentMode === 'analyzing') return;
    isDrawing = false;

    const rect = drawingCanvas.getBoundingClientRect();
    const endX = (e.clientX - rect.left) * (canvasInternalWidth  / rect.width);
    const endY = (e.clientY - rect.top ) * (canvasInternalHeight / rect.height);

    // 得到一个标准的矩形（左上 + 宽度 + 高度）
    const drawnRect = {
        x: Math.min(currentDrawingStart.x, endX),
        y: Math.min(currentDrawingStart.y, endY),
        width: Math.abs(endX - currentDrawingStart.x),
        height: Math.abs(endY - currentDrawingStart.y)
    };

    // 防止宽或高过小
    if (drawnRect.width < 5 || drawnRect.height < 5) {
        console.log("Drawn rectangle too small.");
        clearAndRedrawRects();
        return;
    }

    if (currentMode === 'brightness') {
        brightnessRect = drawnRect;
        console.log("Brightness Rect (内部像素坐标):", brightnessRect);
        currentMode = 'ocr_define';
        statusMessage.textContent = `亮度区域已定义。现在请绘制数字识别区域 (此区域将用于所有峰值帧)。`;
        startAnalysisBtn.disabled = true;
    } else if (currentMode === 'ocr_define') {
        ocrRect = drawnRect;
        console.log("OCR Rect (内部像素坐标):", ocrRect);
        currentMode = 'ready_to_analyze';
        statusMessage.textContent = `数字识别区域已定义。点击 "开始完整分析" 按钮。`;
        startAnalysisBtn.disabled = false;
    }

    clearAndRedrawRects();
});

// 7. 点击“开始分析”按钮
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

    await analyzeVideoBrightnessAndOCR();
});


/**
 * 分两步：
 *  1. 先遍历所有帧，在 brightnessRect 区域计算平均灰度，找出 local maxima。
 *  2. 对每个亮度峰值帧，seek 到对应 time，然后截 ocrRect 做 OCR。
 */
async function analyzeVideoBrightnessAndOCR() {
    brightnessData = [];
    videoPlayer.currentTime = 0;
    const duration = videoPlayer.duration;
    if (isNaN(duration) || duration === 0) {
        statusMessage.textContent = "视频时长无效，无法分析。";
        startAnalysisBtn.disabled = false;
        currentMode = 'brightness';
        return;
    }
    const frameRate = 25;      // 假设 25 FPS
    const interval  = 1 / frameRate;
    let currentTime = 0;
    let processedFrames = 0;

    statusMessage.textContent = `准备分析亮度，总时长: ${duration.toFixed(2)}s`;

    // --- 逐帧采样亮度 ---
    while (currentTime <= duration) {
        const timeAtCapture = currentTime;
        await new Promise(resolve => {
            const onSeeked = () => { 
                videoPlayer.removeEventListener('seeked', onSeeked);
                resolve();
            };
            videoPlayer.addEventListener('seeked', onSeeked);
            videoPlayer.currentTime = timeAtCapture;
        });

        // 将整帧画到 processingCanvas
        processingCtx.drawImage(videoPlayer, 0, 0, canvasInternalWidth, canvasInternalHeight);
        // 再裁剪 brightnessRect 区域
        const imageData = processingCtx.getImageData(
            brightnessRect.x, brightnessRect.y, brightnessRect.width, brightnessRect.height
        );
        const data = imageData.data;
        let totalBrightness = 0;
        let pixelCount = 0;
        for (let i = 0; i < data.length; i += 4) {
            totalBrightness += (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
            pixelCount++;
        }
        brightnessData.push({
            frameTime: timeAtCapture,
            avgBrightness: pixelCount > 0 ? totalBrightness / pixelCount : 0
        });

        processedFrames++;
        statusMessage.textContent = `分析亮度中... ${((timeAtCapture / duration) * 100).toFixed(1)}% (帧: ${processedFrames})`;

        currentTime += interval;
        if (currentTime > duration && timeAtCapture < duration) currentTime = duration;
        else if (currentTime > duration) break;
    }

    console.log("Brightness Data collected:", brightnessData.length, "points");
    findLocalMaxima();

    // 如果找到了峰值，就进入 OCR 流程
    if (localMaximaFrames.length > 0) {
        statusMessage.textContent = `找到 ${localMaximaFrames.length} 个亮度峰值。开始OCR处理...`;
        for (let i = 0; i < localMaximaFrames.length; i++) {
            currentMaximaProcessingIndex = i;
            const frameData = localMaximaFrames[i];
            statusMessage.textContent = `处理峰值 ${i + 1}/${localMaximaFrames.length} (时间: ${frameData.time.toFixed(2)}s)。跳转并准备OCR...`;

            await new Promise(resolve => {
                const onSeekedOCR = () => {
                    videoPlayer.removeEventListener('seeked', onSeekedOCR);
                    videoPlayer.pause();
                    resolve();
                };
                videoPlayer.addEventListener('seeked', onSeekedOCR);
                videoPlayer.currentTime = frameData.time;
            });

            await performOCR(frameData.time, i);
        }
        statusMessage.textContent = '所有亮度最大值帧处理完毕。正在生成结果...';
        displayResults();
    } else {
        statusMessage.textContent = '未找到亮度局部最大值。请尝试调整亮度区域或更换视频。';
    }

    startAnalysisBtn.disabled = false;
    startAnalysisBtn.textContent = '开始完整分析';
    currentMode = 'brightness';
}

// 计算局部最大值
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
    console.log("Local Maxima Frames (timestamps & values):", localMaximaFrames);
}

// 真正进行 OCR 的函数
async function performOCR(frameTimeAtMaxBrightness, occurrenceIdx) {
    if (!ocrRect || !ocrWorker) {
        statusMessage.textContent = 'OCR 区域未定义或 OCR 服务未就绪。';
        analysisResults.push({
            occurrenceIndex: occurrenceIdx + 1,
            frameTime: frameTimeAtMaxBrightness,
            value: NaN
        });
        return;
    }

    // 先把这帧画到 processingCanvas
    processingCtx.drawImage(videoPlayer, 0, 0, canvasInternalWidth, canvasInternalHeight);

    // 再从 processingCanvas 上裁剪 ocrRect 区域到一个临时小 Canvas
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width  = ocrRect.width;
    tempCanvas.height = ocrRect.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(
        processingCanvas,
        ocrRect.x, ocrRect.y, ocrRect.width, ocrRect.height,
        0, 0, ocrRect.width, ocrRect.height
    );

    // 现在进行“颜色分割 + 二值化”，假设“白数字” → 白，背景 → 黑
    const w = tempCanvas.width;
    const h = tempCanvas.height;
    const imgData = tempCtx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const WHITE_THRESHOLD = 200; // 你可以根据画面尝试调 180~220 之间

    for (let i = 0; i < data.length; i += 4) {
        const r = data[i + 0];
        const g = data[i + 1];
        const b = data[i + 2];
        if (r >= WHITE_THRESHOLD && g >= WHITE_THRESHOLD && b >= WHITE_THRESHOLD) {
            // 判断为数字 → 置为纯白
            data[i + 0] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
        } else {
            // 背景 → 置为纯黑
            data[i + 0] = 0;
            data[i + 1] = 0;
            data[i + 2] = 0;
        }
        data[i + 3] = 255; // alpha 通道设为不透明
    }
    tempCtx.putImageData(imgData, 0, 0);

    // 可选：把二值化结果画到右上角 debugCanvas，帮助你确认截取区域和处理是否正确
    let debugCanvas = document.getElementById('debugOcrCanvas');
    if (!debugCanvas) {
        debugCanvas = document.createElement('canvas');
        debugCanvas.id = 'debugOcrCanvas';
        document.body.appendChild(debugCanvas);
        debugCanvas.style.border = "3px solid red";
        debugCanvas.style.position = "fixed";
        debugCanvas.style.top = "10px";
        debugCanvas.style.right = "10px";
        debugCanvas.style.zIndex = "10000";
        debugCanvas.style.backgroundColor = "#eee";
    }
    debugCanvas.width  = w;
    debugCanvas.height = h;
    debugCanvas.getContext('2d').drawImage(tempCanvas, 0, 0);

    // 最后，把这张干净的二值图交给 Tesseract 识别
    try {
        const psmValue = '7'; // 你也可以改成 6/8/10 测试不同效果
        await ocrWorker.setParameters({
            tessedit_char_whitelist: '0123456789.',
            tessedit_pageseg_mode: psmValue,
        });
        const { data: { text } } = await ocrWorker.recognize(tempCanvas);
        console.log(`PSM: ${psmValue} | OCR @ ${frameTimeAtMaxBrightness.toFixed(2)}s (Occ ${occurrenceIdx+1}): "${text.trim()}"`);

        const numberMatch = text.trim().match(/(\d+(\.\d{1,2})?)/);
        let ocrValue = NaN;
        if (numberMatch && numberMatch[0]) {
            ocrValue = parseFloat(numberMatch[0]);
        } else {
            console.warn("OCR did not find a valid number in:", text.trim());
        }

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

// 把结果输出到表格和图表
function displayResults() {
    let tableHTML = '<table><thead><tr><th>亮度最大值序号</th><th>帧时间 (s)</th><th>识别的数字</th></tr></thead><tbody>';
    if (analysisResults.length === 0) {
        tableHTML += '<tr><td colspan="3">没有可显示的结果。</td></tr>';
    } else {
        analysisResults.sort((a, b) => a.occurrenceIndex - b.occurrenceIndex).forEach(result => {
            tableHTML += `<tr>
                <td>${result.occurrenceIndex}</td>
                <td>${result.frameTime.toFixed(2)}</td>
                <td>${isNaN(result.value) ? 'N/A (识别失败)' : result.value.toFixed(2)}</td>
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
                label: '识别的数字 vs. 亮度最大值序号',
                data: analysisResults.map(r => ({ x: r.occurrenceIndex, y: isNaN(r.value) ? null : r.value })),
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.5)',
                showLine: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: '亮度最大值出现次数 (序号)' },
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
                            let label = context.dataset.label || '';
                            if (label) label += ': ';
                            const pointData = analysisResults.find(r => r.occurrenceIndex === context.parsed.x);
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
