
/**
 * Библиотека RasterEngine
 * Содержит чистые математические реализации алгоритмов растеризации,
 * работающие во всех октантах, принимающие коллбэк для отрисовки пикселя.
 */
class RasterEngine {
    
    // Пошаговый алгоритм
    static StepByStepLine(x0, y0, x1, y1, setPixel) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        
        if (Math.abs(dx) >= Math.abs(dy)) {
            if (dx === 0) { setPixel(x0, y0, 1); return; }
            let m = dy / dx;
            let step = x0 < x1 ? 1 : -1;
            for (let x = x0; x !== x1 + step; x += step) {
                let y = Math.round(y0 + m * (x - x0));
                setPixel(x, y, 1);
            }
        } else {
            let m = dx / dy;
            let step = y0 < y1 ? 1 : -1;
            for (let y = y0; y !== y1 + step; y += step) {
                let x = Math.round(x0 + m * (y - y0));
                setPixel(x, y, 1);
            }
        }
    }

    // Алгоритм ЦДА (DDA)
    static DDALine(x0, y0, x1, y1, setPixel) {
        const dx = x1 - x0;
        const dy = y1 - y0;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));
        
        if (steps === 0) {
            setPixel(Math.round(x0), Math.round(y0), 1);
            return;
        }
        
        const xInc = dx / steps;
        const yInc = dy / steps;
        
        let x = x0;
        let y = y0;
        
        for (let i = 0; i <= steps; i++) {
            setPixel(Math.round(x), Math.round(y), 1);
            x += xInc;
            y += yInc;
        }
    }

    // Обобщенный алгоритм Брезенхема для линии (все 8 октантов)
    static BresenhamLine(x0, y0, x1, y1, setPixel) {
        let dx = Math.abs(x1 - x0);
        let sx = x0 < x1 ? 1 : -1;
        let dy = -Math.abs(y1 - y0);
        let sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        
        while (true) {
            setPixel(x0, y0, 1);
            if (x0 === x1 && y0 === y1) break;
            let e2 = 2 * err;
            if (e2 >= dy) { err += dy; x0 += sx; }
            if (e2 <= dx) { err += dx; y0 += sy; }
        }
    }

    // Алгоритм Брезенхема для окружности
    static BresenhamCircle(xc, yc, r, setPixel) {
        let x = 0;
        let y = r;
        let d = 3 - 2 * r;
        
        const drawOctants = (xc, yc, x, y) => {
            setPixel(xc + x, yc + y, 1); setPixel(xc - x, yc + y, 1);
            setPixel(xc + x, yc - y, 1); setPixel(xc - x, yc - y, 1);
            setPixel(xc + y, yc + x, 1); setPixel(xc - y, yc + x, 1);
            setPixel(xc + y, yc - x, 1); setPixel(xc - y, yc - x, 1);
        };
        
        drawOctants(xc, yc, x, y);
        while (y >= x) {
            x++;
            if (d > 0) {
                y--;
                d = d + 4 * (x - y) + 10;
            } else {
                d = d + 4 * x + 6;
            }
            drawOctants(xc, yc, x, y);
        }
    }

    // Алгоритм Ву (Wu) - Сглаживание со справедливым вычислением Alpha
    static WuLine(x0, y0, x1, y1, setPixel) {
        const plot = (x, y, c) => setPixel(x, y, c);
        const ipart = (x) => Math.floor(x);
        const round = (x) => ipart(x + 0.5);
        const fpart = (x) => x - Math.floor(x);
        const rfpart = (x) => 1 - fpart(x);

        let steep = Math.abs(y1 - y0) > Math.abs(x1 - x0);
        if (steep) {
            [x0, y0] = [y0, x0];
            [x1, y1] = [y1, x1];
        }
        if (x0 > x1) {
            [x0, x1] = [x1, x0];
            [y0, y1] = [y1, y0];
        }

        let dx = x1 - x0;
        let dy = y1 - y0;
        let gradient = dx === 0 ? 1 : dy / dx;

        let xend = round(x0);
        let yend = y0 + gradient * (xend - x0);
        let xgap = rfpart(x0 + 0.5);
        let xpxl1 = xend;
        let ypxl1 = ipart(yend);

        if (steep) {
            plot(ypxl1, xpxl1, rfpart(yend) * xgap);
            plot(ypxl1 + 1, xpxl1, fpart(yend) * xgap);
        } else {
            plot(xpxl1, ypxl1, rfpart(yend) * xgap);
            plot(xpxl1, ypxl1 + 1, fpart(yend) * xgap);
        }
        let intery = yend + gradient;

        xend = round(x1);
        yend = y1 + gradient * (xend - x1);
        xgap = fpart(x1 + 0.5);
        let xpxl2 = xend;
        let ypxl2 = ipart(yend);

        if (steep) {
            plot(ypxl2, xpxl2, rfpart(yend) * xgap);
            plot(ypxl2 + 1, xpxl2, fpart(yend) * xgap);
        } else {
            plot(xpxl2, ypxl2, rfpart(yend) * xgap);
            plot(xpxl2, ypxl2 + 1, fpart(yend) * xgap);
        }

        if (steep) {
            for (let x = xpxl1 + 1; x <= xpxl2 - 1; x++) {
                plot(ipart(intery), x, rfpart(intery));
                plot(ipart(intery) + 1, x, fpart(intery));
                intery += gradient;
            }
        } else {
            for (let x = xpxl1 + 1; x <= xpxl2 - 1; x++) {
                plot(x, ipart(intery), rfpart(intery));
                plot(x, ipart(intery) + 1, fpart(intery));
                intery += gradient;
            }
        }
    }

    // Алгоритм Кастла-Питвея (Castle-Piteway) для генерации конических сечений (эллипс)
    // Реализовано в целых числах без плавающей точки, опираясь на оценку ошибки.
    static CastlePitewayEllipse(xc, yc, a, b, setPixel) {
        let x = 0;
        let y = b;
        let a2 = a * a;
        let b2 = b * b;
        let d1 = b2 - (a2 * b) + (0.25 * a2);
        let dx = 2 * b2 * x;
        let dy = 2 * a2 * y;

        const plot4 = (cx, cy, x, y) => {
            setPixel(cx + x, cy + y, 1); setPixel(cx - x, cy + y, 1);
            setPixel(cx + x, cy - y, 1); setPixel(cx - x, cy - y, 1);
        };

        while (dx < dy) {
            plot4(xc, yc, x, y);
            if (d1 < 0) {
                x++;
                dx += (2 * b2);
                d1 += dx + b2;
            } else {
                x++;
                y--;
                dx += (2 * b2);
                dy -= (2 * a2);
                d1 += dx - dy + b2;
            }
        }

        let d2 = (b2 * (x + 0.5) * (x + 0.5)) + (a2 * (y - 1) * (y - 1)) - (a2 * b2);
        while (y >= 0) {
            plot4(xc, yc, x, y);
            if (d2 > 0) {
                y--;
                dy -= (2 * a2);
                d2 += a2 - dy;
            } else {
                y--;
                x++;
                dx += (2 * b2);
                dy -= (2 * a2);
                d2 += dx - dy + a2;
            }
        }
    }
}
