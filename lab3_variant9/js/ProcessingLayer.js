/**
 * СЛОЙ 3: Processing Layer
 */
class ProcessingLayer {
    static runOtsu(buffer) {
        const hist = buffer.getHistogram();
        let sumAll = 0, total = buffer.length;
        for (let i = 0; i < 256; i++) sumAll += i * hist[i];

        let sumB = 0, weightB = 0, maxVar = 0, bestT = 0;
        let varCurve = new Float32Array(256);

        for (let t = 0; t < 256; t++) {
            weightB += hist[t];
            if (weightB === 0) continue;
            let weightF = total - weightB;
            if (weightF === 0) break;

            sumB += t * hist[t];
            let meanB = sumB / weightB;
            let meanF = (sumAll - sumB) / weightF;

            let varBetween = weightB * weightF * Math.pow(meanB - meanF, 2);
            varCurve[t] = varBetween;
            
            if (varBetween > maxVar) {
                maxVar = varBetween;
                bestT = t;
            }
        }

        if (maxVar > 0) {
            for (let i = 0; i < 256; i++) varCurve[i] /= maxVar;
        }

        const out = new PixelBuffer(buffer.width, buffer.height);
        for (let i = 0; i < buffer.length; i++) {
            out.data[i] = buffer.data[i] > bestT ? 255 : 0;
        }
        return { result: out, threshold: bestT, curve: varCurve };
    }

    static runIsodata(buffer) {
        let T = 128, nextT = 0;
        for (let iter = 0; iter < 50; iter++) {
            let sumBg = 0, cntBg = 0, sumFg = 0, cntFg = 0;
            for (let i = 0; i < buffer.length; i++) {
                let p = buffer.data[i];
                if (p <= T) { sumBg += p; cntBg++; }
                else        { sumFg += p; cntFg++; }
            }
            let meanBg = cntBg === 0 ? 0 : sumBg / cntBg;
            let meanFg = cntFg === 0 ? 255 : sumFg / cntFg;
            nextT = Math.round((meanBg + meanFg) / 2);
            if (T === nextT) break;
            T = nextT;
        }

        const out = new PixelBuffer(buffer.width, buffer.height);
        for (let i = 0; i < buffer.length; i++) {
            out.data[i] = buffer.data[i] > T ? 255 : 0;
        }
        return { result: out, threshold: T, curve: null };
    }

    static convolute(buffer, mask, padMode, threshold) {
        const out = new PixelBuffer(buffer.width, buffer.height);
        for (let y = 0; y < buffer.height; y++) {
            for (let x = 0; x < buffer.width; x++) {
                let sum = 0, k = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        sum += buffer.getPixel(x + kx, y + ky, padMode) * mask[k++];
                    }
                }
                out.setPixel(x, y, Math.abs(sum) >= threshold ? 255 : 0);
            }
        }
        return out;
    }

    static runLaplace(buffer, padMode) {
        const mask = [-1,-1,-1, -1,8,-1, -1,-1,-1];
        return this.convolute(buffer, mask, padMode, 150);
    }

    static runLines(buffer, padMode) {
        const mask = [-1,-1,-1, 2,2,2, -1,-1,-1];
        return this.convolute(buffer, mask, padMode, 100);
    }

    static runSobel(buffer, padMode) {
        const Gx = [-1,0,1, -2,0,2, -1,0,1];
        const Gy = [-1,-2,-1, 0,0,0, 1,2,1];
        const out = new PixelBuffer(buffer.width, buffer.height);
        for (let y = 0; y < buffer.height; y++) {
            for (let x = 0; x < buffer.width; x++) {
                let sx = 0, sy = 0, k = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        let p = buffer.getPixel(x + kx, y + ky, padMode);
                        sx += p * Gx[k]; sy += p * Gy[k]; k++;
                    }
                }
                out.setPixel(x, y, Math.sqrt(sx*sx + sy*sy) > 80 ? 255 : 0);
            }
        }
        return out;
    }

    static runCanny(buffer, padMode) {
        const Gx = [-1,0,1, -2,0,2, -1,0,1];
        const Gy = [-1,-2,-1, 0,0,0, 1,2,1];
        const mag = new Float32Array(buffer.length);
        const dir = new Int32Array(buffer.length);
        
        for (let y = 0; y < buffer.height; y++) {
            for (let x = 0; x < buffer.width; x++) {
                let sx = 0, sy = 0, k = 0;
                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        let p = buffer.getPixel(x + kx, y + ky, padMode);
                        sx += p * Gx[k]; sy += p * Gy[k]; k++;
                    }
                }
                let m = Math.sqrt(sx*sx + sy*sy);
                let angle = Math.atan2(sy, sx) * (180 / Math.PI);
                if (angle < 0) angle += 180;
                
                let d = 0;
                if ((angle >= 0 && angle < 22.5) || (angle >= 157.5 && angle <= 180)) d = 0;
                else if (angle >= 22.5 && angle < 67.5) d = 45;
                else if (angle >= 67.5 && angle < 112.5) d = 90;
                else d = 135;
                
                let idx = y * buffer.width + x;
                mag[idx] = m;
                dir[idx] = d;
            }
        }
        
        const out = new PixelBuffer(buffer.width, buffer.height);
        for (let y = 1; y < buffer.height - 1; y++) {
            for (let x = 1; x < buffer.width - 1; x++) {
                let idx = y * buffer.width + x;
                let m = mag[idx];
                let d = dir[idx];
                let m1 = 0, m2 = 0;
                
                if (d === 0)      { m1 = mag[idx - 1]; m2 = mag[idx + 1]; }
                else if (d === 90) { m1 = mag[idx - buffer.width]; m2 = mag[idx + buffer.width]; }
                else if (d === 45) { m1 = mag[idx - buffer.width + 1]; m2 = mag[idx + buffer.width - 1]; }
                else if (d === 135){ m1 = mag[idx - buffer.width - 1]; m2 = mag[idx + buffer.width + 1]; }
                
                if (m >= m1 && m >= m2 && m > 40) {
                    out.setPixel(x, y, 255);
                } else {
                    out.setPixel(x, y, 0);
                }
            }
        }
        return out;
    }
}
