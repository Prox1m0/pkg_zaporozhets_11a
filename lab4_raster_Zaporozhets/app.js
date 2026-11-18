
const canvas = document.getElementById('gridCanvas');
const chartCanvas = document.getElementById('chartCanvas');
const algoSelect = document.getElementById('algoSelect');

// Виртуальная сетка 50x50 логических пикселей
const GRID_WIDTH = 61;
const GRID_HEIGHT = 61;
const vGrid = new VirtualGrid(GRID_WIDTH, GRID_HEIGHT);

// Центр экрана для перевода координат
const CX = Math.floor(GRID_WIDTH / 2);
const CY = Math.floor(GRID_HEIGHT / 2);

let cellSize = parseInt(document.getElementById('scaleRange').value);
const painter = new GridPainter(canvas, vGrid, cellSize);

// Обновление масштаба
document.getElementById('scaleRange').addEventListener('input', (e) => {
    cellSize = parseInt(e.target.value);
    document.getElementById('scaleVal').innerText = cellSize;
    painter.updateCellSize(cellSize);
});

// Управление отображением полей ввода
algoSelect.addEventListener('change', () => {
    const v = algoSelect.value;
    document.getElementById('lineInputs').style.display = (v === 'bresenhamCircle' || v === 'castle') ? 'none' : 'block';
    document.getElementById('circleInputs').style.display = (v === 'bresenhamCircle') ? 'block' : 'none';
    document.getElementById('ellipseInputs').style.display = (v === 'castle') ? 'block' : 'none';
});

// Функция установки пикселя с преобразованием логических координат в экранные
const setPixelWrapper = (x, y, intensity) => {
    // x и y - математические координаты
    // vGrid требует индекс массива (0..Width). 
    // Математический Y растет вверх, экранный - вниз.
    const screenX = CX + x;
    const screenY = CY - y;
    vGrid.setPixel(screenX, screenY, intensity);
};

// Отрисовка
document.getElementById('drawBtn').addEventListener('click', () => {
    const algo = algoSelect.value;
    
    if (algo === 'bresenhamCircle') {
        const xc = parseInt(document.getElementById('xc').value);
        const yc = parseInt(document.getElementById('yc').value);
        const r = parseInt(document.getElementById('r').value);
        RasterEngine.BresenhamCircle(xc, yc, r, setPixelWrapper);
    } else if (algo === 'castle') {
        const xc = parseInt(document.getElementById('exc').value);
        const yc = parseInt(document.getElementById('eyc').value);
        const rx = parseInt(document.getElementById('rx').value);
        const ry = parseInt(document.getElementById('ry').value);
        RasterEngine.CastlePitewayEllipse(xc, yc, rx, ry, setPixelWrapper);
    } else {
        const x0 = parseInt(document.getElementById('x0').value);
        const y0 = parseInt(document.getElementById('y0').value);
        const x1 = parseInt(document.getElementById('x1').value);
        const y1 = parseInt(document.getElementById('y1').value);
        
        switch (algo) {
            case 'step': RasterEngine.StepByStepLine(x0, y0, x1, y1, setPixelWrapper); break;
            case 'dda': RasterEngine.DDALine(x0, y0, x1, y1, setPixelWrapper); break;
            case 'bresenhamLine': RasterEngine.BresenhamLine(x0, y0, x1, y1, setPixelWrapper); break;
            case 'wu': RasterEngine.WuLine(x0, y0, x1, y1, setPixelWrapper); break;
        }
    }
    painter.draw();
});

document.getElementById('clearBtn').addEventListener('click', () => {
    vGrid.clear();
    painter.draw();
    chartCanvas.style.display = 'none';
});

// Инициализация при загрузке
painter.draw();

// ---------------------------------------------------------
// БЕНЧМАРК (СТРЕСС-ТЕСТ)
// ---------------------------------------------------------
document.getElementById('benchBtn').addEventListener('click', () => {
    const linesCount = 100000;
    const circlesCount = 50000;
    const resultsDiv = document.getElementById('benchResults');
    resultsDiv.innerHTML = "Выполнение стресс-теста, подождите...";
    
    // Запускаем через setTimeout, чтобы UI успел обновиться
    setTimeout(() => {
        // Подготовка виртуального полигона больших размеров, чтобы не засорять экран
        const bigGrid = new VirtualGrid(1000, 1000);
        const mockSetPixel = (x, y, i) => bigGrid.setPixel(x, y, i);
        
        // 1. Тест ЦДА
        let ddaStart = performance.now();
        for (let i = 0; i < linesCount; i++) {
            let x0 = Math.floor(Math.random() * 800) + 100;
            let y0 = Math.floor(Math.random() * 800) + 100;
            let x1 = Math.floor(Math.random() * 800) + 100;
            let y1 = Math.floor(Math.random() * 800) + 100;
            RasterEngine.DDALine(x0, y0, x1, y1, mockSetPixel);
        }
        let ddaTime = performance.now() - ddaStart;

        bigGrid.clear(); // очистка

        // 2. Тест Брезенхем (Линия)
        let bresStart = performance.now();
        for (let i = 0; i < linesCount; i++) {
            let x0 = Math.floor(Math.random() * 800) + 100;
            let y0 = Math.floor(Math.random() * 800) + 100;
            let x1 = Math.floor(Math.random() * 800) + 100;
            let y1 = Math.floor(Math.random() * 800) + 100;
            RasterEngine.BresenhamLine(x0, y0, x1, y1, mockSetPixel);
        }
        let bresTime = performance.now() - bresStart;

        bigGrid.clear();

        // 3. Тест Брезенхем (Окружность)
        let circStart = performance.now();
        for (let i = 0; i < circlesCount; i++) {
            let xc = Math.floor(Math.random() * 800) + 100;
            let yc = Math.floor(Math.random() * 800) + 100;
            let r = Math.floor(Math.random() * 50) + 5;
            RasterEngine.BresenhamCircle(xc, yc, r, mockSetPixel);
        }
        let circTime = performance.now() - circStart;
        
        resultsDiv.innerHTML = `
            <b>Результаты (${linesCount} отрезков, ${circlesCount} окружностей):</b><br>
            ЦДА: ${ddaTime.toFixed(2)} мс<br>
            Брезенхем (Линия): ${bresTime.toFixed(2)} мс<br>
            Брезенхем (Окр.): ${circTime.toFixed(2)} мс<br><br>
            <i>Брезенхем оказался на ${(((ddaTime - bresTime)/ddaTime)*100).toFixed(1)}% быстрее ЦДА.</i>
        `;

        // Отрисовка простого графика
        chartCanvas.style.display = 'block';
        const ctx = chartCanvas.getContext('2d');
        ctx.clearRect(0,0, chartCanvas.width, chartCanvas.height);
        
        const maxTime = Math.max(ddaTime, bresTime, circTime) * 1.2;
        const barWidth = 80;
        const gap = 40;
        const startX = 50;

        const drawBar = (x, val, label, color) => {
            const h = (val / maxTime) * 150;
            ctx.fillStyle = color;
            ctx.fillRect(x, 180 - h, barWidth, h);
            ctx.fillStyle = '#333';
            ctx.fillText(val.toFixed(1) + ' мс', x + 15, 175 - h);
            ctx.fillText(label, x + 5, 195);
        };

        drawBar(startX, ddaTime, "ЦДА", "#ff7675");
        drawBar(startX + barWidth + gap, bresTime, "Брезенхем (Л)", "#74b9ff");
        drawBar(startX + (barWidth + gap)*2, circTime, "Брезенхем (О)", "#55efc4");

        // Рисуем оси
        ctx.strokeStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(30, 20); ctx.lineTo(30, 180); ctx.lineTo(380, 180);
        ctx.stroke();

    }, 50); // задержка
});
