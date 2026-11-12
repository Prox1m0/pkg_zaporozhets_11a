/**
 * СЛОЙ 2: Memory & Pixel Access Layer
 */
class PixelBuffer {
    constructor(width, height, sourceImageData = null) {
        this.width = width;
        this.height = height;
        this.length = width * height;
        this.data = new Float32Array(this.length);

        if (sourceImageData) {
            const raw = sourceImageData.data;
            for (let i = 0; i < this.length; i++) {
                const r = raw[i * 4];
                const g = raw[i * 4 + 1];
                const b = raw[i * 4 + 2];
                this.data[i] = 0.299 * r + 0.587 * g + 0.114 * b;
            }
        }
    }

    getPixel(x, y, padMode = 'clamp') {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            return this.data[y * this.width + x];
        }

        if (padMode === 'clamp') {
            x = Math.max(0, Math.min(x, this.width - 1));
            y = Math.max(0, Math.min(y, this.height - 1));
        } else {
            if (x < 0) x = -x - 1; else if (x >= this.width) x = 2 * this.width - x - 1;
            if (y < 0) y = -y - 1; else if (y >= this.height) y = 2 * this.height - y - 1;
            x = Math.max(0, Math.min(x, this.width - 1));
            y = Math.max(0, Math.min(y, this.height - 1));
        }
        return this.data[y * this.width + x];
    }

    setPixel(x, y, value) {
        this.data[y * this.width + x] = value;
    }

    toImageData() {
        const img = new ImageData(this.width, this.height);
        for (let i = 0; i < this.length; i++) {
            let val = Math.max(0, Math.min(255, this.data[i]));
            img.data[i * 4] = val;
            img.data[i * 4 + 1] = val;
            img.data[i * 4 + 2] = val;
            img.data[i * 4 + 3] = 255;
        }
        return img;
    }

    getHistogram() {
        let hist = new Array(256).fill(0);
        for (let i = 0; i < this.length; i++) {
            let val = Math.round(this.data[i]);
            if (val >= 0 && val <= 255) hist[val]++;
        }
        return hist;
    }
}
