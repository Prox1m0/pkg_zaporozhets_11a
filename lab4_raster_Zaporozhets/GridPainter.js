
/**
 * Класс GridPainter
 * Отрисовывает интерфейс: сетку, оси, подписи и виртуальные пиксели.
 */
class GridPainter {
    constructor(canvas, virtualGrid, cellSize) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.grid = virtualGrid;
        this.cellSize = cellSize;
        
        this.canvas.width = this.grid.width * this.cellSize;
        this.canvas.height = this.grid.height * this.cellSize;
    }
    
    updateCellSize(newSize) {
        this.cellSize = newSize;
        this.canvas.width = this.grid.width * this.cellSize;
        this.canvas.height = this.grid.height * this.cellSize;
        this.draw();
    }
    
    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        const w = this.grid.width;
        const h = this.grid.height;
        const cs = this.cellSize;
        
        // Математический центр сетки (соответствует точке 0,0)
        const cx = Math.floor(w / 2);
        const cy = Math.floor(h / 2);

        // 1. Отрисовка пикселей из VirtualGrid
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const intensity = this.grid.getPixel(x, y);
                if (intensity > 0) {
                    this.ctx.fillStyle = `rgba(30, 100, 200, ${intensity})`;
                    this.ctx.fillRect(x * cs, y * cs, cs, cs);
                }
            }
        }
        
        // 2. Отрисовка линий сетки
        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        for (let x = 0; x <= w; x++) {
            this.ctx.moveTo(x * cs, 0);
            this.ctx.lineTo(x * cs, h * cs);
        }
        for (let y = 0; y <= h; y++) {
            this.ctx.moveTo(0, y * cs);
            this.ctx.lineTo(w * cs, y * cs);
        }
        this.ctx.stroke();

        // 3. Отрисовка осей координат (толстые линии)
        this.ctx.strokeStyle = '#ff5555';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        // Вертикальная ось Y
        this.ctx.moveTo(cx * cs, 0);
        this.ctx.lineTo(cx * cs, h * cs);
        // Горизонтальная ось X
        this.ctx.moveTo(0, cy * cs);
        this.ctx.lineTo(w * cs, cy * cs);
        this.ctx.stroke();
        
        // 4. Подписи координат
        this.ctx.fillStyle = '#333';
        this.ctx.font = '10px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Подписи X
        for (let x = 0; x < w; x++) {
            if (Math.abs(x - cx) % 5 === 0 && x !== cx) { // Каждые 5 клеток
                this.ctx.fillText((x - cx).toString(), x * cs + cs/2, cy * cs + 10);
            }
        }
        // Подписи Y
        for (let y = 0; y < h; y++) {
            if (Math.abs(y - cy) % 5 === 0 && y !== cy) {
                // В экранных координатах Y идет вниз, математически - вверх
                this.ctx.fillText((cy - y).toString(), cx * cs + 15, y * cs + cs/2);
            }
        }
        
        // Подпись начала координат
        this.ctx.fillText("0", cx * cs - 8, cy * cs + 10);
    }
}
