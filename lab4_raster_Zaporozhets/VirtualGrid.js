
/**
 * Класс VirtualGrid (Шаг 1. Изоляция рендеринга).
 * Хранит двумерную матрицу пикселей.
 */
class VirtualGrid {
    constructor(width, height) {
        this.width = width;
        this.height = height;
        this.pixels = new Float32Array(width * height);
    }
    
    clear() {
        this.pixels.fill(0);
    }
    
    // Интерфейс IRasterTarget: метод установки пикселя с интенсивностью
    setPixel(x, y, intensity = 1.0) {
        x = Math.round(x);
        y = Math.round(y);
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            const idx = y * this.width + x;
            this.pixels[idx] = Math.max(this.pixels[idx], intensity);
        }
    }
    
    getPixel(x, y) {
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
            return this.pixels[y * this.width + x];
        }
        return 0;
    }
}
