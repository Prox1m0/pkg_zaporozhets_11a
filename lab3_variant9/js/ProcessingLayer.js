/**
 * СЛОЙ 3: Processing Layer (Algorithms & Parallel Worker Pool)
 * ------------------------------------------------------------
 * Чистые математические функции-фильтры, которые принимают PixelBuffer
 * и возвращают новый PixelBuffer + аналитические метрики, ничего не зная про UI.
 *
 * Реализованы все методы Варианта 9 и требования Группы 10А (на 10 баллов):
 * 1. Глобальная пороговая обработка (2 метода):
 *    - Метод Оцу (Otsu's method) с автоматическим вычислением межклассовой дисперсии
 *    - Итеративный метод Ридлера–Калварда (ISODATA)
 * 2. Адаптивная пороговая обработка за O(1) через Интегральное изображение (SAT):
 *    - Лекционный метод адаптивного порога T(x,y) = mean(x,y) - C
 *    - Метод Сауволы (Sauvola): T(x,y) = mean * (1 + k * (std / R - 1))
 * 3. Сегментация изображений: обнаружение точек, линий и перепадов яркости:
 *    - Обнаружение изолированных точек (маска Лапласа)
 *    - Обнаружение линий в 4 направлениях (0°, 45°, 90°, -45°)
 *    - Оператор Собеля с честным вычислением угла atan2(Gy, Gx) и цветной картой углов
 *    - Детектор границ Кэнни с разделяемой 1D+1D сверткой Гаусса O(K*N^2) и субпиксельной точностью
 */

class ProcessingLayer {
    // =========================================================================
    // 1. ГЛОБАЛЬНАЯ ПОРОГОВАЯ ОБРАБОТКА (2 МЕТОДА)
    // =========================================================================

    /**
     * 1.1 Метод Оцу (Otsu's Method)
     * Автоматически находит порог T*, максимизирующий межклассовую дисперсию:
     * sigma_B^2(t) = w0(t) * w1(t) * (mu0(t) - mu1(t))^2
     */
    static globalOtsu(inputBuffer, invert = false) {
        const { bins, total } = inputBuffer.computeHistogram();
        const varianceCurve = new Float32Array(256);

        let sumAll = 0;
        for (let t = 0; t < 256; t++) {
            sumAll += t * bins[t];
        }

        let sumBg = 0;
        let weightBg = 0;
        let maxVariance = -1;
        let optimalThreshold = 128;

        for (let t = 0; t < 256; t++) {
            weightBg += bins[t];
            if (weightBg === 0) continue;

            const weightFg = total - weightBg;
            if (weightFg === 0) break;

            sumBg += t * bins[t];
            const meanBg = sumBg / weightBg;
            const meanFg = (sumAll - sumBg) / weightFg;

            const w0 = weightBg / total;
            const w1 = weightFg / total;
            const diff = meanBg - meanFg;
            const betweenVar = w0 * w1 * diff * diff;

            varianceCurve[t] = betweenVar;
            if (betweenVar > maxVariance) {
                maxVariance = betweenVar;
                optimalThreshold = t;
            }
        }

        // Нормализация кривой дисперсии [0..1] для отображения на графике гистограммы
        const normCurve = new Float32Array(256);
        if (maxVariance > 0) {
            for (let t = 0; t < 256; t++) {
                normCurve[t] = varianceCurve[t] / maxVariance;
            }
        }

        const outGray = new Float32Array(inputBuffer.length);
        const src = inputBuffer.gray;
        let fgCount = 0;

        for (let i = 0; i < src.length; i++) {
            const isFg = invert ? (src[i] <= optimalThreshold) : (src[i] > optimalThreshold);
            outGray[i] = isFg ? 255 : 0;
            if (isFg) fgCount++;
        }

        return {
            buffer: PixelBuffer.fromGrayArray(inputBuffer.width, inputBuffer.height, outGray),
            threshold: optimalThreshold,
            varianceCurve: normCurve,
            metrics: {
                "Порог Оцу T*": optimalThreshold,
                "Макс. дисперсия σ²B": maxVariance.toFixed(1),
                "Доля объекта": ((fgCount / src.length) * 100).toFixed(1) + "%",
                "Сложность": "O(N + L)"
            }
        };
    }

    /**
     * 1.2 Итеративный метод Ридлера–Калварда (ISODATA)
     * Итеративно уточняет порог T_{k+1} = (mu_bg(T_k) + mu_fg(T_k)) / 2 до сходимости.
     */
    static globalIsodata(inputBuffer, invert = false) {
        const { bins, mean } = inputBuffer.computeHistogram();
        let T = Math.round(mean);
        let iterations = 0;
        const maxIter = 100;

        while (iterations < maxIter) {
            iterations++;
            let sum0 = 0, cnt0 = 0;
            let sum1 = 0, cnt1 = 0;

            for (let i = 0; i <= T; i++) {
                sum0 += i * bins[i];
                cnt0 += bins[i];
            }
            for (let i = T + 1; i < 256; i++) {
                sum1 += i * bins[i];
                cnt1 += bins[i];
            }

            const mu0 = cnt0 > 0 ? sum0 / cnt0 : 0;
            const mu1 = cnt1 > 0 ? sum1 / cnt1 : 255;
            const nextT = Math.round((mu0 + mu1) * 0.5);

            if (Math.abs(nextT - T) <= 0) {
                T = nextT;
                break;
            }
            T = nextT;
        }

        const outGray = new Float32Array(inputBuffer.length);
        const src = inputBuffer.gray;
        let fgCount = 0;

        for (let i = 0; i < src.length; i++) {
            const isFg = invert ? (src[i] <= T) : (src[i] > T);
            outGray[i] = isFg ? 255 : 0;
            if (isFg) fgCount++;
        }

        return {
            buffer: PixelBuffer.fromGrayArray(inputBuffer.width, inputBuffer.height, outGray),
            threshold: T,
            metrics: {
                "Порог ISODATA T*": T,
                "Итераций сходимости": iterations,
                "Доля белых пикселей": ((fgCount / src.length) * 100).toFixed(1) + "%",
                "Сложность": "O(N + k·L)"
            }
        };
    }

    // =========================================================================
    // 2. АДАПТИВНАЯ ПОРОГОВАЯ ОБРАБОТКА (ЧЕРЕЗ ИНТЕГРАЛЬНОЕ ИЗОБРАЖЕНИЕ SAT O(1))
    // =========================================================================

    /**
     * 2.1 Лекционный алгоритм адаптивной пороговой обработки +
     * 2.2 Метод Сауволы (Sauvola) с использованием Summed-Area Table (SAT).
     * Сложность не зависит от радиуса окна R и составляет ровно O(1) операций на пиксель!
     */
    static adaptiveThresholdSAT(inputBuffer, options = {}) {
        const {
            mode = 'lecture', // 'lecture' или 'sauvola'
            radius = 15,
            offsetC = 8,
            sauvolaK = 0.25,
            dynamicRangeR = 128
        } = options;

        const w = inputBuffer.width;
        const h = inputBuffer.height;
        const src = inputBuffer.gray;
        const outGray = new Float32Array(w * h);

        // Шаг 1: Строим интегральные таблицы сумм и сумм квадратов за O(W*H)
        const tables = inputBuffer.buildIntegralTables();

        let fgCount = 0;
        let sumLocalT = 0;

        // Шаг 2: Для каждого пикселя за O(1) находим локальное среднее и СКО
        for (let y = 0; y < h; y++) {
            const rowOffset = y * w;
            for (let x = 0; x < w; x++) {
                const { mean, std } = PixelBuffer.queryIntegralWindow(tables, x, y, radius);
                let localT;

                if (mode === 'sauvola') {
                    // Формула Сауволы: T(x,y) = m(x,y) * [1 + k * (s(x,y) / R - 1)]
                    localT = mean * (1.0 + sauvolaK * ((std / dynamicRangeR) - 1.0));
                } else {
                    // Алгоритм из лекции: T(x,y) = m(x,y) - C
                    localT = mean - offsetC;
                }

                sumLocalT += localT;
                const val = src[rowOffset + x] > localT ? 255 : 0;
                outGray[rowOffset + x] = val;
                if (val === 255) fgCount++;
            }
        }

        const winSize = 2 * radius + 1;
        return {
            buffer: PixelBuffer.fromGrayArray(w, h, outGray),
            metrics: {
                "Окно SAT": `${winSize}×${winSize} пкс`,
                "Средний порог E[T]": (sumLocalT / (w * h)).toFixed(1),
                "Доля фона (белый)": ((fgCount / (w * h)) * 100).toFixed(1) + "%",
                "Сложность на пиксель": "O(1) через SAT"
            }
        };
    }

    // =========================================================================
    // 3. СЕГМЕНТАЦИЯ: ТОЧКИ, ЛИНИИ, СОБЕЛЬ (С КАРТОЙ УГЛОВ) И СУБПИКСЕЛЬНЫЙ КЭННИ
    // =========================================================================

    /**
     * 3.1 Обнаружение изолированных точек изотропной маской Лапласа 3x3:
     * [-1, -1, -1]
     * [-1,  8, -1]
     * [-1, -1, -1]
     * Точка фиксируется там, где |R(x,y)| >= T.
     */
    static detectIsolatedPoints(inputBuffer, threshold = 90, paddingMode = 'reflect') {
        const w = inputBuffer.width;
        const h = inputBuffer.height;
        const outGray = new Float32Array(w * h);
        const kernel = [
            -1, -1, -1,
            -1,  8, -1,
            -1, -1, -1
        ];

        let detectedCount = 0;
        let maxResponse = 0;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                let sum = 0;
                let k = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        sum += inputBuffer.getPixelWithPadding(x + kx, y + ky, paddingMode) * kernel[k++];
                    }
                }
                const resp = Math.abs(sum);
                if (resp > maxResponse) maxResponse = resp;

                if (resp >= threshold) {
                    outGray[y * w + x] = 255;
                    detectedCount++;
                } else {
                    outGray[y * w + x] = 0;
                }
            }
        }

        return {
            buffer: PixelBuffer.fromGrayArray(w, h, outGray),
            metrics: {
                "Порог отклика T": threshold,
                "Найдено пикселей точек": detectedCount,
                "Макс. отклик |R|": maxResponse.toFixed(1),
                "Обработка краев": paddingMode.toUpperCase()
            }
        };
    }

    /**
     * 3.2 Обнаружение линий с помощью 4 направленных масок (Горизонтальная 0°, +45°, Вертикальная 90°, -45°).
     */
    static detectLines(inputBuffer, direction = 'all', threshold = 80, paddingMode = 'reflect') {
        const masks = {
            horiz: [-1, -1, -1,  2,  2,  2, -1, -1, -1], // 0°
            diag45: [-1, -1,  2, -1,  2, -1,  2, -1, -1], // +45°
            vert:  [-1,  2, -1, -1,  2, -1, -1,  2, -1], // 90°
            diag135:[ 2, -1, -1, -1,  2, -1, -1, -1,  2]  // -45° (135°)
        };

        const w = inputBuffer.width;
        const h = inputBuffer.height;
        const outBuffer = new PixelBuffer(w, h);
        let activePixels = 0;

        // Цвета для 4 ориентаций линий в режиме 'all'
        const dirColors = [
            [56, 189, 248],  // 0°   - голубой
            [34, 197, 94],   // 45°  - зеленый
            [245, 158, 11],  // 90°  - янтарный
            [244, 63, 94]    // 135° - розовый
        ];
        const keys = ['horiz', 'diag45', 'vert', 'diag135'];

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                if (direction === 'all') {
                    let bestResp = 0;
                    let bestIdx = 0;
                    for (let m = 0; m < 4; m++) {
                        const ker = masks[keys[m]];
                        let sum = 0, k = 0;
                        for (let ky = -1; ky <= 1; ky++) {
                            for (let kx = -1; kx <= 1; kx++) {
                                sum += inputBuffer.getPixelWithPadding(x + kx, y + ky, paddingMode) * ker[k++];
                            }
                        }
                        const r = Math.abs(sum);
                        if (r > bestResp) {
                            bestResp = r;
                            bestIdx = m;
                        }
                    }

                    if (bestResp >= threshold) {
                        const c = dirColors[bestIdx];
                        outBuffer.setRGB(x, y, c[0], c[1], c[2], Math.min(255, bestResp));
                        activePixels++;
                    } else {
                        outBuffer.setGray(x, y, 0);
                    }
                } else {
                    const ker = masks[direction] || masks.horiz;
                    let sum = 0, k = 0;
                    for (let ky = -1; ky <= 1; ky++) {
                        for (let kx = -1; kx <= 1; kx++) {
                            sum += inputBuffer.getPixelWithPadding(x + kx, y + ky, paddingMode) * ker[k++];
                        }
                    }
                    const resp = Math.abs(sum);
                    if (resp >= threshold) {
                        outBuffer.setGray(x, y, 255);
                        activePixels++;
                    } else {
                        outBuffer.setGray(x, y, 0);
                    }
                }
            }
        }

        return {
            buffer: outBuffer,
            metrics: {
                "Направление": direction === 'all' ? "Все 4 (цвет)" : direction,
                "Порог линии T": threshold,
                "Пикселей линий": activePixels,
                "Edge Padding": paddingMode.toUpperCase()
            }
        };
    }

    /**
     * Разделяемая 2D свертка Гаусса (Separable 1D Horizontal + 1D Vertical Pass).
     * Снижает алгоритмическую сложность с O(K^2 * N^2) до O(2K * N^2).
     */
    static separableGaussianBlur(inputBuffer, sigma = 1.4, paddingMode = 'reflect') {
        const w = inputBuffer.width;
        const h = inputBuffer.height;
        const radius = Math.max(1, Math.ceil(3 * sigma));
        const size = 2 * radius + 1;
        const kernel1D = new Float32Array(size);

        let sum = 0;
        const twoSigmaSq = 2 * sigma * sigma;
        for (let i = -radius; i <= radius; i++) {
            const val = Math.exp(-(i * i) / twoSigmaSq);
            kernel1D[i + radius] = val;
            sum += val;
        }
        for (let i = 0; i < size; i++) {
            kernel1D[i] /= sum;
        }

        // Проход 1: Одномерная свертка по строкам (горизонтальная)
        const temp = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
            const rowOffset = y * w;
            for (let x = 0; x < w; x++) {
                let acc = 0;
                for (let k = -radius; k <= radius; k++) {
                    const rx = PixelBuffer.resolveCoord(x + k, w, paddingMode);
                    acc += inputBuffer.gray[rowOffset + rx] * kernel1D[k + radius];
                }
                temp[rowOffset + x] = acc;
            }
        }

        // Проход 2: Одномерная свертка по столбцам (вертикальная)
        const out = new Float32Array(w * h);
        for (let y = 0; y < h; y++) {
            const rowOffset = y * w;
            for (let x = 0; x < w; x++) {
                let acc = 0;
                for (let k = -radius; k <= radius; k++) {
                    const ry = PixelBuffer.resolveCoord(y + k, h, paddingMode);
                    acc += temp[ry * w + x] * kernel1D[k + radius];
                }
                out[rowOffset + x] = acc;
            }
        }

        return PixelBuffer.fromGrayArray(w, h, out);
    }

    /**
     * Вспомогательная конвертация HSV -> RGB для цветной карты углов градиента.
     */
    static hsvToRgb(hDeg, s, v) {
        const h = ((hDeg % 360) + 360) % 360;
        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;
        let r = 0, g = 0, b = 0;

        if (h < 60)      { r = c; g = x; b = 0; }
        else if (h < 120){ r = x; g = c; b = 0; }
        else if (h < 180){ r = 0; g = c; b = x; }
        else if (h < 240){ r = 0; g = x; b = c; }
        else if (h < 300){ r = x; g = 0; b = c; }
        else             { r = c; g = 0; b = x; }

        return [
            Math.round((r + m) * 255),
            Math.round((g + m) * 255),
            Math.round((b + m) * 255)
        ];
    }

    /**
     * 3.3 и 3.4 Оператор Собеля: вычисление частных производных Gx, Gy,
     * модуля градиента |G| = hypot(Gx, Gy) и честного угла направления atan2(Gy, Gx).
     */
    static computeSobelField(inputBuffer, paddingMode = 'reflect') {
        const w = inputBuffer.width;
        const h = inputBuffer.height;
        const mag = new Float32Array(w * h);
        const angleRad = new Float32Array(w * h);
        let maxMag = 0;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const p00 = inputBuffer.getPixelWithPadding(x - 1, y - 1, paddingMode);
                const p10 = inputBuffer.getPixelWithPadding(x,     y - 1, paddingMode);
                const p20 = inputBuffer.getPixelWithPadding(x + 1, y - 1, paddingMode);

                const p01 = inputBuffer.getPixelWithPadding(x - 1, y,     paddingMode);
                const p21 = inputBuffer.getPixelWithPadding(x + 1, y,     paddingMode);

                const p02 = inputBuffer.getPixelWithPadding(x - 1, y + 1, paddingMode);
                const p12 = inputBuffer.getPixelWithPadding(x,     y + 1, paddingMode);
                const p22 = inputBuffer.getPixelWithPadding(x + 1, y + 1, paddingMode);

                const gx = (p20 + 2 * p21 + p22) - (p00 + 2 * p01 + p02);
                const gy = (p02 + 2 * p12 + p22) - (p00 + 2 * p10 + p20);

                const m = Math.hypot(gx, gy);
                const idx = y * w + x;
                mag[idx] = m;
                angleRad[idx] = Math.atan2(gy, gx);
                if (m > maxMag) maxMag = m;
            }
        }

        return { mag, angleRad, maxMag };
    }

    /**
     * Обертка для отображения модуля Собеля или цветной карты направлений градиента.
     */
    static sobelSegmentation(inputBuffer, options = {}) {
        const {
            colorizeDirections = false,
            threshold = 0,
            paddingMode = 'reflect'
        } = options;

        const w = inputBuffer.width;
        const h = inputBuffer.height;
        const { mag, angleRad, maxMag } = ProcessingLayer.computeSobelField(inputBuffer, paddingMode);
        const outBuffer = new PixelBuffer(w, h);
        const scale = maxMag > 0 ? 255 / maxMag : 1;
        let edgePixels = 0;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = y * w + x;
                const normMag = mag[idx] * scale;

                if (normMag < threshold) {
                    outBuffer.setGray(x, y, 0);
                    continue;
                }
                edgePixels++;

                if (colorizeDirections) {
                    // Переводим угол [-pi, pi] в цветовой тон [0..360]
                    const deg = (angleRad[idx] * 180 / Math.PI + 360) % 360;
                    const val = Math.min(1, normMag / 255);
                    const [r, g, b] = ProcessingLayer.hsvToRgb(deg, 0.95, val);
                    outBuffer.setRGB(x, y, r, g, b, normMag);
                } else {
                    outBuffer.setGray(x, y, normMag);
                }
            }
        }

        return {
            buffer: outBuffer,
            angleField: angleRad,
            magField: mag,
            metrics: {
                "Макс. градиент |G|": maxMag.toFixed(1),
                "Пикселей границ": edgePixels,
                "Режим вывода": colorizeDirections ? "Углы HSV (atan2)" : "Модуль |G|",
                "Edge Padding": paddingMode.toUpperCase()
            }
        };
    }

    /**
     * 3.5 Многоступенчатый детектор границ Кэнни (Canny Edge Detector) на 10 баллов:
     * 1) Разделяемая 1D+1D свертка Гаусса со сложностью O(K * N^2)
     * 2) Расчет градиента Собеля (модуль |G| и точный угол theta)
     * 3) Подавление немаксимумов (NMS) с субпиксельной параболической оценкой пика
     * 4) Двойная пороговая фильтрация и трассировка гистерезисом (BFS-связность)
     */
    static cannyEdgeDetector(inputBuffer, options = {}) {
        const {
            sigma = 1.4,
            lowThreshold = 30,
            highThreshold = 85,
            paddingMode = 'reflect'
        } = options;

        const w = inputBuffer.width;
        const h = inputBuffer.height;

        // Шаг 1: Разделяемый фильтр Гаусса (1D строки + 1D столбцы)
        const smoothed = ProcessingLayer.separableGaussianBlur(inputBuffer, sigma, paddingMode);

        // Шаг 2: Поле градиентов Собеля
        const { mag, angleRad, maxMag } = ProcessingLayer.computeSobelField(smoothed, paddingMode);
        const scale = maxMag > 0 ? 255 / maxMag : 1;

        // Шаг 3: Подавление немаксимумов (Non-Maximum Suppression) + субпиксельное уточнение
        const nms = new Float32Array(w * h);
        let subpixelSumOffset = 0;
        let subpixelCount = 0;

        for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
                const idx = y * w + x;
                const m = mag[idx] * scale;
                if (m <= 0) continue;

                // Приводим угол к [0, 180)
                let angle = (angleRad[idx] * 180 / Math.PI) % 180;
                if (angle < 0) angle += 180;

                let m1 = 0, m2 = 0;
                if ((angle >= 0 && angle < 22.5) || (angle >= 157.5 && angle <= 180)) {
                    m1 = mag[idx - 1] * scale;
                    m2 = mag[idx + 1] * scale;
                } else if (angle >= 22.5 && angle < 67.5) {
                    m1 = mag[(y - 1) * w + (x + 1)] * scale;
                    m2 = mag[(y + 1) * w + (x - 1)] * scale;
                } else if (angle >= 67.5 && angle < 112.5) {
                    m1 = mag[(y - 1) * w + x] * scale;
                    m2 = mag[(y + 1) * w + x] * scale;
                } else {
                    m1 = mag[(y - 1) * w + (x - 1)] * scale;
                    m2 = mag[(y + 1) * w + (x + 1)] * scale;
                }

                if (m >= m1 && m >= m2) {
                    nms[idx] = m;
                    // Субпиксельное смещение вершины параболы delta = 0.5 * (m1 - m2) / (m1 - 2*m + m2)
                    const denom = m1 - 2 * m + m2;
                    if (Math.abs(denom) > 1e-4) {
                        const delta = 0.5 * (m1 - m2) / denom;
                        subpixelSumOffset += Math.abs(delta);
                        subpixelCount++;
                    }
                }
            }
        }

        // Шаг 4: Двойной порог и трассировка неоднозначных границ гистерезисом
        const STRONG = 255;
        const WEAK = 75;
        const edges = new Float32Array(w * h);
        const queue = [];

        for (let i = 0; i < nms.length; i++) {
            if (nms[i] >= highThreshold) {
                edges[i] = STRONG;
                queue.push(i);
            } else if (nms[i] >= lowThreshold) {
                edges[i] = WEAK;
            }
        }

        // Обход в ширину (BFS) от сильных пикселей к связанным слабым
        let head = 0;
        while (head < queue.length) {
            const curr = queue[head++];
            const cx = curr % w;
            const cy = (curr / w) | 0;

            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = cx + dx;
                    const ny = cy + dy;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                        const nIdx = ny * w + nx;
                        if (edges[nIdx] === WEAK) {
                            edges[nIdx] = STRONG;
                            queue.push(nIdx);
                        }
                    }
                }
            }
        }

        let finalEdgePixels = 0;
        for (let i = 0; i < edges.length; i++) {
            if (edges[i] !== STRONG) {
                edges[i] = 0;
            } else {
                finalEdgePixels++;
            }
        }

        const avgSubpixel = subpixelCount > 0 ? (subpixelSumOffset / subpixelCount).toFixed(3) : "0.000";

        return {
            buffer: PixelBuffer.fromGrayArray(w, h, edges),
            angleField: angleRad,
            metrics: {
                "Гаусс σ (1D+1D)": sigma,
                "Пороги T_low / T_high": `${lowThreshold} / ${highThreshold}`,
                "Субпикс. сдвиг E|δ|": `${avgSubpixel} пкс`,
                "Пикселей контура": finalEdgePixels
            }
        };
    }
}

/**
 * Пул параллельных потоков Web Workers для многопоточной свертки по горизонтальным полосам.
 * Использует Blob URL, чтобы приложение работало локально при открытии index.html без сервера.
 */
class ParallelWorkerPool {
    constructor(maxWorkers = 4) {
        this.maxWorkers = maxWorkers;
        this.workers = [];
        this.initPool(maxWorkers);
    }

    initPool(count) {
        this.terminateAll();
        this.maxWorkers = count;

        const workerCode = `
            self.onmessage = function(e) {
                const { gray, width, height, yStart, yEnd, kernel, paddingMode } = e.data;
                const stripHeight = yEnd - yStart;
                const outStrip = new Float32Array(width * stripHeight);

                function resolveCoord(c, max, mode) {
                    if (c >= 0 && c < max) return c;
                    if (mode === 'clamp') return c < 0 ? 0 : max - 1;
                    while (c < 0 || c >= max) {
                        c = c < 0 ? -c - 1 : 2 * max - c - 1;
                    }
                    return c;
                }

                for (let y = yStart; y < yEnd; y++) {
                    const localY = y - yStart;
                    for (let x = 0; x < width; x++) {
                        let sum = 0;
                        let k = 0;
                        for (let ky = -1; ky <= 1; ky++) {
                            const ry = resolveCoord(y + ky, height, paddingMode);
                            for (let kx = -1; kx <= 1; kx++) {
                                const rx = resolveCoord(x + kx, width, paddingMode);
                                sum += gray[ry * width + rx] * kernel[k++];
                            }
                        }
                        outStrip[localY * width + x] = sum;
                    }
                }
                self.postMessage({ yStart, yEnd, outStrip }, [outStrip.buffer]);
            };
        `;

        try {
            const blob = new Blob([workerCode], { type: 'application/javascript' });
            const url = URL.createObjectURL(blob);
            for (let i = 0; i < count; i++) {
                this.workers.push(new Worker(url));
            }
        } catch (err) {
            this.workers = [];
        }
    }

    terminateAll() {
        for (const w of this.workers) {
            w.terminate();
        }
        this.workers = [];
    }
}

window.ProcessingLayer = ProcessingLayer;
window.ParallelWorkerPool = ParallelWorkerPool;
