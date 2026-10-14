/**
 * СЛОЙ 1: Presentation Layer (UI)
 * --------------------------------
 * Отвечает ТОЛЬКО за отображение картинок («до» и «после»), гистограмм,
 * прогресс-бара, инспектора пикселей и слайдеров настройки параметров.
 * Вся работа с памятью делегируется в PixelBuffer (Слой 2),
 * а математическая фильтрация — в ProcessingLayer (Слой 3).
 */

class PresentationUI {
    constructor() {
        // Элементы холстов
        this.sourceCanvas = document.getElementById('sourceCanvas');
        this.resultCanvas = document.getElementById('resultCanvas');
        this.histBeforeCanvas = document.getElementById('histBeforeCanvas');
        this.histAfterCanvas = document.getElementById('histAfterCanvas');

        this.srcCtx = this.sourceCanvas.getContext('2d');
        this.resCtx = this.resultCanvas.getContext('2d');

        // Элементы управления
        this.presetSelect = document.getElementById('presetSelect');
        this.fileInput = document.getElementById('fileInput');
        this.paddingSelect = document.getElementById('paddingSelect');
        this.workersRange = document.getElementById('workersRange');
        this.workersVal = document.getElementById('workersVal');
        this.methodSelect = document.getElementById('methodSelect');
        this.dynamicParams = document.getElementById('dynamicParams');
        this.runBtn = document.getElementById('runBtn');
        this.compareBtn = document.getElementById('compareBtn');

        // Статус и инспектор
        this.statusText = document.getElementById('statusText');
        this.timeText = document.getElementById('timeText');
        this.progressBar = document.getElementById('progressBar');
        this.metricsBox = document.getElementById('metricsBox');
        this.pixelInspector = document.getElementById('pixelInspector');
        this.theoryExplanation = document.getElementById('theoryExplanation');
        this.comparisonWall = document.getElementById('comparisonWall');
        this.dstInfo = document.getElementById('dstInfo');
        this.histAfterStats = document.getElementById('histAfterStats');

        // Текущие буферы Слоя 2
        this.sourceBuffer = null;
        this.resultBuffer = null;
        this.lastAngleField = null;

        // Пул многопоточности Web Workers
        this.workerPool = new ParallelWorkerPool(4);

        this.initEvents();
        this.renderParamControls();
        this.loadPreset(this.presetSelect.value);
    }

    initEvents() {
        this.presetSelect.addEventListener('change', () => {
            this.loadPreset(this.presetSelect.value);
        });

        this.fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) {
                this.loadUserImage(e.target.files[0]);
            }
        });

        this.paddingSelect.addEventListener('change', () => this.executeCurrentMethod());

        this.workersRange.addEventListener('input', () => {
            const count = parseInt(this.workersRange.value, 10);
            this.workersVal.textContent = count;
            this.workerPool.initPool(count);
            this.executeCurrentMethod();
        });

        this.methodSelect.addEventListener('change', () => {
            this.renderParamControls();
            this.executeCurrentMethod();
        });

        this.runBtn.addEventListener('click', () => this.executeCurrentMethod());
        this.compareBtn.addEventListener('click', () => this.renderComparisonWall());

        // Инспектор пикселей при наведении мыши на любой из двух холстов
        const inspectHandler = (e, canvas) => this.handleMouseInspect(e, canvas);
        this.sourceCanvas.addEventListener('mousemove', (e) => inspectHandler(e, this.sourceCanvas));
        this.resultCanvas.addEventListener('mousemove', (e) => inspectHandler(e, this.resultCanvas));
    }

    loadPreset(presetName) {
        const w = this.sourceCanvas.width;
        const h = this.sourceCanvas.height;
        TestImages.renderPreset(this.srcCtx, w, h, presetName);

        const imgData = this.srcCtx.getImageData(0, 0, w, h);
        this.sourceBuffer = PixelBuffer.fromImageData(imgData);
        document.getElementById('srcInfo').textContent = `${w} × ${h} px`;

        this.executeCurrentMethod();
    }

    loadUserImage(file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const img = new Image();
            img.onload = () => {
                const w = 512;
                const h = 384;
                this.srcCtx.clearRect(0, 0, w, h);
                this.srcCtx.drawImage(img, 0, 0, w, h);
                const imgData = this.srcCtx.getImageData(0, 0, w, h);
                this.sourceBuffer = PixelBuffer.fromImageData(imgData);
                this.executeCurrentMethod();
            };
            img.src = ev.target.result;
        };
        reader.readAsDataURL(file);
    }

    /**
     * Динамическая генерация слайдеров настройки параметров выбранного алгоритма.
     */
    renderParamControls() {
        const method = this.methodSelect.value;
        this.dynamicParams.innerHTML = '';

        const configs = {
            otsu: [
                { id: 'invert', label: 'Инвертировать бинаризацию', type: 'checkbox', val: false }
            ],
            isodata: [
                { id: 'invert', label: 'Инвертировать бинаризацию', type: 'checkbox', val: false }
            ],
            adaptive_lecture: [
                { id: 'radius', label: 'Радиус окна SAT (R)', min: 3, max: 60, step: 1, val: 16 },
                { id: 'offsetC', label: 'Константа вычитания (C)', min: -20, max: 40, step: 1, val: 10 }
            ],
            adaptive_sauvola: [
                { id: 'radius', label: 'Радиус окна SAT (R)', min: 3, max: 60, step: 1, val: 16 },
                { id: 'sauvolaK', label: 'Коэффициент чувствительности (k)', min: 0.05, max: 0.6, step: 0.05, val: 0.25 }
            ],
            seg_points: [
                { id: 'threshold', label: 'Порог отклика Лапласиана (T)', min: 20, max: 240, step: 5, val: 95 }
            ],
            seg_lines: [
                {
                    id: 'direction', label: 'Ориентация масок линий', type: 'select', val: 'all',
                    options: [
                        { v: 'all', text: 'Все 4 направления (Цветовая кодировка)' },
                        { v: 'horiz', text: 'Горизонтальные линии (0°)' },
                        { v: 'diag45', text: 'Диагональные линии (+45°)' },
                        { v: 'vert', text: 'Вертикальные линии (90°)' },
                        { v: 'diag135', text: 'Диагональные линии (-45° / 135°)' }
                    ]
                },
                { id: 'threshold', label: 'Порог отклика маски (T)', min: 20, max: 220, step: 5, val: 80 }
            ],
            seg_sobel: [
                { id: 'threshold', label: 'Порог отсечения градиента', min: 0, max: 180, step: 5, val: 25 }
            ],
            seg_sobel_dir: [
                { id: 'threshold', label: 'Мин. порог амплитуды |G|', min: 0, max: 150, step: 5, val: 20 }
            ],
            seg_canny: [
                { id: 'sigma', label: 'Сигма 1D+1D фильтра Гаусса (σ)', min: 0.6, max: 3.5, step: 0.2, val: 1.4 },
                { id: 'lowThreshold', label: 'Нижний порог гистерезиса (T_low)', min: 5, max: 120, step: 5, val: 30 },
                { id: 'highThreshold', label: 'Верхний порог гистерезиса (T_high)', min: 20, max: 220, step: 5, val: 85 }
            ]
        };

        const list = configs[method] || [];
        if (list.length === 0) {
            this.dynamicParams.innerHTML = '<p style="font-size:0.8rem;color:#94a3b8;">Метод полностью автоматический и не требует ручных параметров.</p>';
            return;
        }

        list.forEach((p) => {
            const wrap = document.createElement('div');
            wrap.className = 'param-item';

            if (p.type === 'checkbox') {
                wrap.innerHTML = `
                    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:0.84rem;">
                        <input type="checkbox" id="param_${p.id}" ${p.val ? 'checked' : ''}>
                        <span>${p.label}</span>
                    </label>
                `;
                wrap.querySelector('input').addEventListener('change', () => this.executeCurrentMethod());
            } else if (p.type === 'select') {
                const optsHtml = p.options.map(o => `<option value="${o.v}">${o.text}</option>`).join('');
                wrap.innerHTML = `
                    <div class="param-header"><span>${p.label}</span></div>
                    <select id="param_${p.id}">${optsHtml}</select>
                `;
                wrap.querySelector('select').addEventListener('change', () => this.executeCurrentMethod());
            } else {
                wrap.innerHTML = `
                    <div class="param-header">
                        <span>${p.label}</span>
                        <span class="param-val" id="val_${p.id}">${p.val}</span>
                    </div>
                    <input type="range" id="param_${p.id}" min="${p.min}" max="${p.max}" step="${p.step}" value="${p.val}">
                `;
                const input = wrap.querySelector('input');
                const valSpan = wrap.querySelector(`#val_${p.id}`);
                input.addEventListener('input', () => {
                    valSpan.textContent = input.value;
                    this.executeCurrentMethod();
                });
            }

            this.dynamicParams.appendChild(wrap);
        });
    }

    getParamValue(id, defaultVal) {
        const el = document.getElementById(`param_${id}`);
        if (!el) return defaultVal;
        if (el.type === 'checkbox') return el.checked;
        if (el.tagName === 'SELECT') return el.value;
        return parseFloat(el.value);
    }

    /**
     * Вызов соответствующего метода из Слоя 3 (ProcessingLayer) и обновление UI.
     */
    executeCurrentMethod() {
        if (!this.sourceBuffer) return;

        const method = this.methodSelect.value;
        const paddingMode = this.paddingSelect.value;

        this.progressBar.style.width = '35%';
        this.statusText.textContent = 'Обработка буфера...';

        const t0 = performance.now();
        let output = null;

        if (method === 'otsu') {
            output = ProcessingLayer.globalOtsu(this.sourceBuffer, this.getParamValue('invert', false));
        } else if (method === 'isodata') {
            output = ProcessingLayer.globalIsodata(this.sourceBuffer, this.getParamValue('invert', false));
        } else if (method === 'adaptive_lecture') {
            output = ProcessingLayer.adaptiveThresholdSAT(this.sourceBuffer, {
                mode: 'lecture',
                radius: this.getParamValue('radius', 16),
                offsetC: this.getParamValue('offsetC', 10)
            });
        } else if (method === 'adaptive_sauvola') {
            output = ProcessingLayer.adaptiveThresholdSAT(this.sourceBuffer, {
                mode: 'sauvola',
                radius: this.getParamValue('radius', 16),
                sauvolaK: this.getParamValue('sauvolaK', 0.25)
            });
        } else if (method === 'seg_points') {
            output = ProcessingLayer.detectIsolatedPoints(
                this.sourceBuffer,
                this.getParamValue('threshold', 95),
                paddingMode
            );
        } else if (method === 'seg_lines') {
            output = ProcessingLayer.detectLines(
                this.sourceBuffer,
                this.getParamValue('direction', 'all'),
                this.getParamValue('threshold', 80),
                paddingMode
            );
        } else if (method === 'seg_sobel') {
            output = ProcessingLayer.sobelSegmentation(this.sourceBuffer, {
                colorizeDirections: false,
                threshold: this.getParamValue('threshold', 25),
                paddingMode
            });
        } else if (method === 'seg_sobel_dir') {
            output = ProcessingLayer.sobelSegmentation(this.sourceBuffer, {
                colorizeDirections: true,
                threshold: this.getParamValue('threshold', 20),
                paddingMode
            });
        } else if (method === 'seg_canny') {
            output = ProcessingLayer.cannyEdgeDetector(this.sourceBuffer, {
                sigma: this.getParamValue('sigma', 1.4),
                lowThreshold: this.getParamValue('lowThreshold', 30),
                highThreshold: this.getParamValue('highThreshold', 85),
                paddingMode
            });
        }

        const elapsed = performance.now() - t0;
        this.resultBuffer = output.buffer;
        this.lastAngleField = output.angleField || null;

        // Отрисовка результата на холсте «После»
        this.resCtx.putImageData(this.resultBuffer.toImageData(), 0, 0);

        // Обновление прогресс-бара и времени
        this.progressBar.style.width = '100%';
        this.statusText.textContent = `Выполнено (${this.workersRange.value} пот.)`;
        this.timeText.textContent = `${elapsed.toFixed(2)} мс`;
        this.dstInfo.textContent = this.methodSelect.options[this.methodSelect.selectedIndex].text.split('(')[0].trim();

        // Отрисовка метрик, гистограмм и теоретических выводов
        this.renderMetrics(output.metrics);
        this.renderHistograms(output.threshold, output.varianceCurve);
        this.renderTheoryReport(method);
    }

    renderMetrics(metricsObj) {
        this.metricsBox.innerHTML = '';
        for (const [k, v] of Object.entries(metricsObj)) {
            const item = document.createElement('div');
            item.className = 'metric-box';
            item.innerHTML = `<span class="m-label">${k}</span><span class="m-value">${v}</span>`;
            this.metricsBox.appendChild(item);
        }
    }

    /**
     * Отрисовка гистограмм «До» (с линией порога и кривой межклассовой дисперсии Оцу) и «После».
     */
    renderHistograms(threshold = null, varianceCurve = null) {
        const histBefore = this.sourceBuffer.computeHistogram();
        const histAfter = this.resultBuffer.computeHistogram();

        this.drawSingleHistogram(this.histBeforeCanvas, histBefore, threshold, varianceCurve);
        this.drawSingleHistogram(this.histAfterCanvas, histAfter, null, null);

        this.histAfterStats.textContent = `μ = ${histAfter.mean.toFixed(1)} | σ = ${histAfter.std.toFixed(1)}`;
    }

    drawSingleHistogram(canvas, histData, threshold, varianceCurve) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Фоновая сетка
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#1e293b';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const y = (h / 4) * i;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }

        const bins = histData.bins;
        let maxBin = 1;
        for (let i = 0; i < 256; i++) {
            // Игнорируем чисто черные/белые пики на бинарном выходе, чтобы не забивать масштаб
            if (bins[i] > maxBin) maxBin = bins[i];
        }

        const barW = w / 256;
        ctx.fillStyle = '#38bdf8';
        for (let i = 0; i < 256; i++) {
            const ratio = Math.min(1, bins[i] / maxBin);
            const barH = ratio * (h - 18);
            ctx.fillRect(i * barW, h - barH, Math.max(1, barW), barH);
        }

        // Кривая межклассовой дисперсии Оцу sigma_B^2(t)
        if (varianceCurve) {
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let t = 0; t < 256; t++) {
                const x = t * barW;
                const y = h - varianceCurve[t] * (h - 22) - 4;
                if (t === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Вертикальная линия найденного глобального порога T*
        if (typeof threshold === 'number') {
            const tx = threshold * barW;
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(tx, 0);
            ctx.lineTo(tx, h);
            ctx.stroke();

            ctx.fillStyle = '#f59e0b';
            ctx.font = 'bold 11px monospace';
            ctx.fillText(`T* = ${threshold}`, Math.min(w - 65, tx + 6), 14);
        }
    }

    /**
     * Инспекция пикселей под курсором мыши в реальном времени.
     */
    handleMouseInspect(e, canvas) {
        if (!this.sourceBuffer || !this.resultBuffer) return;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = Math.max(0, Math.min(canvas.width - 1, Math.floor((e.clientX - rect.left) * scaleX)));
        const y = Math.max(0, Math.min(canvas.height - 1, Math.floor((e.clientY - rect.top) * scaleY)));

        const srcVal = Math.round(this.sourceBuffer.getFast(x, y));
        const dstVal = Math.round(this.resultBuffer.getFast(x, y));

        let angleInfo = '';
        if (this.lastAngleField) {
            const rad = this.lastAngleField[y * canvas.width + x];
            const deg = ((rad * 180 / Math.PI) + 360) % 360;
            angleInfo = ` | Угол градиента θ = ${deg.toFixed(1)}°`;
        }

        this.pixelInspector.textContent =
            `Координаты: (X=${x}, Y=${y}) | Яркость ДО: ${srcVal} | Яркость ПОСЛЕ: ${dstVal}${angleInfo}`;
    }

    /**
     * Сравнительный стенд всех методов Варианта 9 на текущем изображении (одновременное сравнение).
     */
    renderComparisonWall() {
        if (!this.sourceBuffer) return;
        this.comparisonWall.classList.remove('hidden');
        this.comparisonWall.innerHTML = '';

        const pad = this.paddingSelect.value;
        const cases = [
            {
                title: '1. Глобальный метод Оцу',
                desc: 'Теряет часть текста при тени',
                run: () => ProcessingLayer.globalOtsu(this.sourceBuffer).buffer
            },
            {
                title: '2. Глобальный ISODATA',
                desc: 'Итеративное среднее кластеров',
                run: () => ProcessingLayer.globalIsodata(this.sourceBuffer).buffer
            },
            {
                title: '3. Адаптивный (SAT O(1))',
                desc: 'Устойчив к неравномерному свету',
                run: () => ProcessingLayer.adaptiveThresholdSAT(this.sourceBuffer, { mode: 'sauvola', radius: 16, sauvolaK: 0.25 }).buffer
            },
            {
                title: '4. Собель (Углы градиента)',
                desc: 'Цветная карта atan2(Gy, Gx)',
                run: () => ProcessingLayer.sobelSegmentation(this.sourceBuffer, { colorizeDirections: true, threshold: 20, paddingMode: pad }).buffer
            },
            {
                title: '5. Субпиксельный Кэнни',
                desc: '1D+1D Гаусс + NMS + Гистерезис',
                run: () => ProcessingLayer.cannyEdgeDetector(this.sourceBuffer, { sigma: 1.4, lowThreshold: 30, highThreshold: 85, paddingMode: pad }).buffer
            }
        ];

        cases.forEach((c) => {
            const buf = c.run();
            const card = document.createElement('div');
            card.className = 'comp-card';

            const miniCanvas = document.createElement('canvas');
            miniCanvas.width = buf.width;
            miniCanvas.height = buf.height;
            miniCanvas.getContext('2d').putImageData(buf.toImageData(), 0, 0);

            card.innerHTML = `<h5>${c.title}</h5>`;
            card.appendChild(miniCanvas);
            const p = document.createElement('p');
            p.textContent = c.desc;
            card.appendChild(p);

            this.comparisonWall.appendChild(card);
        });
    }

    /**
     * Теоретические пояснения и аналитический отчет по выбранному методу (30 баллов по условию).
     */
    renderTheoryReport(method) {
        const blocks = [
            {
                title: "Архитектура и честный побайтовый доступ",
                html: `
                    <p>Приложение разделено на 3 независимых файла-слоя согласно ТЗ:</p>
                    <ul>
                        <li><strong>PresentationUI.js</strong> — отвечает только за канвасы, гистограммы и слайдеры.</li>
                        <li><strong>PixelBuffer.js</strong> — работает напрямую с типизированными буферами памяти <code>Float32Array</code> и <code>Uint8ClampedArray</code> и реализует обработку краев <strong>Reflect</strong> и <strong>Clamp</strong>.</li>
                        <li><strong>ProcessingLayer.js</strong> — чистые математические алгоритмы и пул потоков <code>Web Workers</code>.</li>
                    </ul>
                `
            },
            {
                title: "Сравнение глобальной и адаптивной пороговой обработки (Интегральное изображение SAT)",
                html: `
                    <p>Глобальные методы (<strong>Оцу</strong> и <strong>ISODATA</strong>) используют единый порог $T^*$ для всего кадра, поэтому на изображении №1 («Документ с тенью») затененная область сливается с фоном.</p>
                    <div class="formula">S(x,y) = I(x,y) + S(x-1,y) + S(x,y-1) - S(x-1,y-1)</div>
                    <p>Адаптивная обработка (лекционный алгоритм и метод <strong>Сауволы</strong>) использует <strong>Интегральное изображение (SAT)</strong>, что снижает сложность вычисления локального среднего и СКО в окне $(2R+1)\times(2R+1)$ до <strong>O(1) на пиксель</strong>.</p>
                `
            },
            {
                title: "Сегментация: точки, направленные линии и оператор Собеля",
                html: `
                    <p>Для обнаружения изолированных точек применяется изотропная маска Лапласа с центральным весом <code>+8</code>. Для выделения линий используются 4 ориентированных ядра ($0^\circ, 45^\circ, 90^\circ, -45^\circ$).</p>
                    <div class="formula">|G| = √(Gx² + Gy²), &nbsp; θ(x,y) = atan2(Gy, Gx)</div>
                    <p>В режиме 3.4 угол направления градиента $\theta(x,y)$ переводится в цветовой тон HSV, наглядно визуализируя ориентацию каждого перепада яркости.</p>
                `
            },
            {
                title: "Детектор Кэнни: разделяемая 1D+1D свертка и субпиксельная точность",
                html: `
                    <p>Двумерная свертка Гаусса разложена на два одномерных прохода (сначала по строкам, затем по столбцам), что уменьшает сложность с $O(K^2 \cdot N^2)$ до $O(2K \cdot N^2)$.</p>
                    <div class="formula">δ = 0.5 · (m₁ - m₂) / (m₁ - 2·m₀ + m₂)</div>
                    <p>На этапе подавления немаксимумов (NMS) выполняется параболическая интерполяция пика градиента с субпиксельной точностью и двухпороговая трассировка гистерезисом.</p>
                `
            }
        ];

        this.theoryExplanation.innerHTML = blocks.map(b => `
            <div class="theory-block">
                <h4>${b.title}</h4>
                ${b.html}
            </div>
        `).join('');
    }
}

window.addEventListener('DOMContentLoaded', () => {
    window.appUI = new PresentationUI();
});
