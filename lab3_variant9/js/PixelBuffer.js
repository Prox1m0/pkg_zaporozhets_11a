/**
 * СЛОЙ 2: Memory & Pixel Access Layer (Buffer Wrapper)
 * ----------------------------------------------------
 * Обертка над «сырыми» байтами изображения (Uint8ClampedArray / Float32Array).
 * Берет на себя всю адресную арифметику (y * width + x) и честную обработку краев:
 * - 'reflect' (зеркальное отражение граничных пикселей)
 * - 'clamp'   (дублирование граничных пикселей)
 * Полностью изолирует алгоритмы фильтрации от работы с DOM и Canvas API.
 */

class PixelBuffer {
    /**
     * @param {number} width - Ширина изображения
     * @param {number} height - Высота изображения
     * @param {Float32Array|Uint8ClampedArray|null} grayData - Буфер яркости (1 канал)
     * @param {Uint8ClampedArray|null} rgbaData - Сырой RGBA буфер (4 канала на пиксель)
     */
    constructor(width, height, grayData = null, rgbaData = null) {
        this.width = width | 0;
        this.height = height | 0;
        this.length = this.width * this.height;

        // Одноканальный буфер интенсивности I(x,y) в диапазоне [0..255]
        this.gray = grayData ? new Float32Array(grayData) : new Float32Array(this.length);

        // Четырехканальный буфер RGBA (4 байта на пиксель) для прямого побайтового доступа
        this.rgba = rgbaData ? new Uint8ClampedArray(rgbaData) : new Uint8ClampedArray(this.length * 4);
    }

    /**
     * Создает PixelBuffer из стандартного объекта ImageData (прямое чтение байтового массива).
     * Интенсивность вычисляется по стандарту ITU-R BT.601: Y = 0.299*R + 0.587*G + 0.114*B
     */
    static fromImageData(imageData) {
        const w = imageData.width;
        const h = imageData.height;
        const raw = imageData.data; // Uint8ClampedArray
        const len = w * h;
        const gray = new Float32Array(len);

        for (let i = 0, p = 0; i < len; i++, p += 4) {
            gray[i] = 0.299 * raw[p] + 0.587 * raw[p + 1] + 0.114 * raw[p + 2];
        }
        return new PixelBuffer(w, h, gray, raw);
    }

    /**
     * Создает новый PixelBuffer из одноканального массива яркости (0..255).
     */
    static fromGrayArray(width, height, grayArray) {
        const len = width * height;
        const rgba = new Uint8ClampedArray(len * 4);
        for (let i = 0, p = 0; i < len; i++, p += 4) {
            const v = grayArray[i] < 0 ? 0 : (grayArray[i] > 255 ? 255 : grayArray[i]);
            rgba[p] = v;
            rgba[p + 1] = v;
            rgba[p + 2] = v;
            rgba[p + 3] = 255;
        }
        return new PixelBuffer(width, height, grayArray, rgba);
    }

    /**
     * Обработка выхода координаты за границы диапазона [0, max - 1]
     * Поддерживает 2 требуемые стратегии Edge Padding: 'reflect' и 'clamp'.
     */
    static resolveCoord(coord, max, paddingMode) {
        if (coord >= 0 && coord < max) {
            return coord;
        }
        if (paddingMode === 'clamp') {
            return coord < 0 ? 0 : max - 1;
        }
        // Стратегия по умолчанию: 'reflect' (зеркальное отражение относительно границы)
        while (coord < 0 || coord >= max) {
            if (coord < 0) {
                coord = -coord - 1;
            } else {
                coord = 2 * max - coord - 1;
            }
        }
        return coord < 0 ? 0 : (coord >= max ? max - 1 : coord);
    }

    /**
     * Безопасное чтение интенсивности пикселя (x, y) с учетом выбранной стратегии обработки краев.
     */
    getPixelWithPadding(x, y, paddingMode = 'reflect') {
        const rx = PixelBuffer.resolveCoord(x, this.width, paddingMode);
        const ry = PixelBuffer.resolveCoord(y, this.height, paddingMode);
        return this.gray[ry * this.width + rx];
    }

    /**
     * Быстрое чтение пикселя без проверки границ (для внутренних циклов).
     */
    getFast(x, y) {
        return this.gray[y * this.width + x];
    }

    /**
     * Быстрая запись пикселя в буфер яркости и RGBA.
     */
    setGray(x, y, value) {
        const idx = y * this.width + x;
        const v = value < 0 ? 0 : (value > 255 ? 255 : value);
        this.gray[idx] = v;
        const p = idx << 2;
        this.rgba[p] = v;
        this.rgba[p + 1] = v;
        this.rgba[p + 2] = v;
        this.rgba[p + 3] = 255;
    }

    /**
     * Запись цветного пикселя (например, для визуализации углов градиента цветом HSV -> RGB).
     */
    setRGB(x, y, r, g, b, intensityForHist = null) {
        const idx = y * this.width + x;
        const p = idx << 2;
        this.rgba[p] = r;
        this.rgba[p + 1] = g;
        this.rgba[p + 2] = b;
        this.rgba[p + 3] = 255;
        this.gray[idx] = intensityForHist !== null
            ? intensityForHist
            : (0.299 * r + 0.587 * g + 0.114 * b);
    }

    /**
     * Построение Интегрального изображения (Summed-Area Table, SAT) за один проход O(W*H).
     * Возвращает две таблицы размера (W + 1) * (H + 1):
     * - sat: сумма яркостей I(x,y)
     * - satSq: сумма квадратов яркостей I^2(x,y) (для мгновенного расчета СКО Сауволы за O(1))
     */
    buildIntegralTables() {
        const w = this.width;
        const h = this.height;
        const stride = w + 1;
        const sat = new Float64Array((w + 1) * (h + 1));
        const satSq = new Float64Array((w + 1) * (h + 1));
        const src = this.gray;

        for (let y = 1; y <= h; y++) {
            let rowSum = 0;
            let rowSumSq = 0;
            const srcRowOffset = (y - 1) * w;
            const currRowOffset = y * stride;
            const prevRowOffset = (y - 1) * stride;

            for (let x = 1; x <= w; x++) {
                const val = src[srcRowOffset + (x - 1)];
                rowSum += val;
                rowSumSq += val * val;
                sat[currRowOffset + x] = sat[prevRowOffset + x] + rowSum;
                satSq[currRowOffset + x] = satSq[prevRowOffset + x] + rowSumSq;
            }
        }

        return { sat, satSq, stride, width: w, height: h };
    }

    /**
     * Вычисление локального среднего и среднеквадратичного отклонения (СКО)
     * в произвольном окне [x - r .. x + r, y - r .. y + r] за константное время O(1)
     * с помощью предвычисленного Интегрального изображения (SAT).
     */
    static queryIntegralWindow(tables, centerX, centerY, radius) {
        const { sat, satSq, stride, width, height } = tables;
        const x0 = Math.max(0, centerX - radius);
        const y0 = Math.max(0, centerY - radius);
        const x1 = Math.min(width - 1, centerX + radius);
        const y1 = Math.min(height - 1, centerY + radius);

        const count = (x1 - x0 + 1) * (y1 - y0 + 1);
        const r0 = y0 * stride;
        const r1 = (y1 + 1) * stride;

        const sum = sat[r1 + (x1 + 1)] - sat[r0 + (x1 + 1)] - sat[r1 + x0] + sat[r0 + x0];
        const sumSq = satSq[r1 + (x1 + 1)] - satSq[r0 + (x1 + 1)] - satSq[r1 + x0] + satSq[r0 + x0];

        const mean = sum / count;
        const variance = Math.max(0, (sumSq / count) - (mean * mean));
        const std = Math.sqrt(variance);

        return { mean, std, count };
    }

    /**
     * Расчет гистограммы яркости (256 уровней) и базовой статистики по буферу.
     */
    computeHistogram() {
        const bins = new Uint32Array(256);
        const data = this.gray;
        const n = this.length;
        let sum = 0;
        let sumSq = 0;

        for (let i = 0; i < n; i++) {
            const v = Math.max(0, Math.min(255, Math.round(data[i])));
            bins[v]++;
            sum += v;
            sumSq += v * v;
        }

        const mean = sum / n;
        const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
        return { bins, mean, std, total: n };
    }

    /**
     * Экспорт буфера в стандартный объект ImageData для отрисовки в Presentation Layer.
     */
    toImageData() {
        return new ImageData(new Uint8ClampedArray(this.rgba), this.width, this.height);
    }
}

window.PixelBuffer = PixelBuffer;
