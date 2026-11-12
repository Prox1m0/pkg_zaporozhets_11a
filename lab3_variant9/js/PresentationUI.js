/**
 * СЛОЙ 1: Presentation Layer
 */
class PresentationUI {
    constructor() {
        this.canBefore = document.getElementById('canvasBefore');
        this.canAfter = document.getElementById('canvasAfter');
        this.ctxB = this.canBefore.getContext('2d');
        this.ctxA = this.canAfter.getContext('2d');
        this.histBefore = document.getElementById('histBefore');
        this.histAfter = document.getElementById('histAfter');
        this.inspector = document.getElementById('inspector');
        
        this.presetSelect = document.getElementById('presetSelect');
        this.padSelect = document.getElementById('padSelect');
        
        this.presetSelect.addEventListener('change', () => this.drawTestImage());
        
        const mouseMove = (e, canvas, buffer) => {
            if (!buffer) return;
            const rect = canvas.getBoundingClientRect();
            const x = Math.floor((e.clientX - rect.left) / (rect.width / canvas.width));
            const y = Math.floor((e.clientY - rect.top) / (rect.height / canvas.height));
            if (x>=0 && x<buffer.width && y>=0 && y<buffer.height) {
                let val = Math.round(buffer.getPixel(x, y, 'clamp'));
                this.inspector.innerHTML = `<span class="icon">📍</span> Координаты: [X: <b>${x}</b>, Y: <b>${y}</b>] &nbsp;&nbsp;|&nbsp;&nbsp; Яркость (0-255): <b>${val}</b>`;
            }
        };
        this.canBefore.addEventListener('mousemove', (e) => mouseMove(e, this.canBefore, this.bufBefore));
        this.canAfter.addEventListener('mousemove', (e) => mouseMove(e, this.canAfter, this.bufAfter));

        this.drawTestImage();
    }

    drawTestImage() {
        const type = this.presetSelect.value;
        const w = this.canBefore.width, h = this.canBefore.height;
        this.ctxB.fillStyle = '#fff'; this.ctxB.fillRect(0,0,w,h);
        
        if (type === 'shapes') {
            this.ctxB.fillStyle = '#1e293b'; this.ctxB.fillRect(0,0,w,h);
            this.ctxB.fillStyle = '#cbd5e1'; this.ctxB.beginPath(); this.ctxB.arc(150,150,70,0,6.28); this.ctxB.fill();
            this.ctxB.fillStyle = '#64748b'; this.ctxB.fillRect(250,100,120,120);
        } else if (type === 'points') {
            this.ctxB.fillStyle = '#0f172a'; this.ctxB.fillRect(0,0,w,h);
            this.ctxB.fillStyle = '#fff';
            this.ctxB.fillRect(50, 100, 350, 3);
            this.ctxB.fillRect(200, 200, 1, 1);
            this.ctxB.fillRect(220, 220, 1, 1);
            this.ctxB.fillRect(240, 200, 1, 1);
        } else if (type === 'gradient') {
            for(let r=200; r>0; r-=20) {
                this.ctxB.fillStyle = (r/20)%2===0 ? '#1e293b' : '#f1f5f9';
                this.ctxB.beginPath(); this.ctxB.arc(225,150,r,0,6.28); this.ctxB.fill();
            }
        }
        
        let imgData = this.ctxB.getImageData(0,0,w,h);
        this.bufBefore = new PixelBuffer(w, h, imgData);
        this.ctxA.clearRect(0,0,w,h);
        this.bufAfter = null;
        
        this.drawHist(this.histBefore, this.bufBefore.getHistogram());
        this.drawHist(this.histAfter, new Array(256).fill(0));
    }

    updateResult(resultObj) {
        this.bufAfter = resultObj.result;
        this.ctxA.putImageData(this.bufAfter.toImageData(), 0, 0);
        this.drawHist(this.histBefore, this.bufBefore.getHistogram(), resultObj.threshold, resultObj.curve);
        this.drawHist(this.histAfter, this.bufAfter.getHistogram());
    }

    drawHist(canvas, hist, threshold = null, curve = null) {
        const ctx = canvas.getContext('2d');
        const w = canvas.width, h = canvas.height;
        ctx.clearRect(0,0,w,h);
        
        let max = Math.max(...hist);
        if (max === 0) max = 1;

        ctx.fillStyle = '#3b82f6';
        for(let i=0; i<256; i++) {
            let bh = (hist[i]/max) * (h - 20); // Оставляем место сверху
            ctx.fillRect(i * (w/256), h - bh, Math.max(1, w/256), bh);
        }

        if (curve) {
            ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath();
            for(let i=0; i<256; i++) {
                let x = i*(w/256), y = h - (curve[i]*(h-20));
                i===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
            }
            ctx.stroke();
        }

        if (threshold !== null) {
            let tx = threshold * (w/256);
            ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, h); ctx.stroke();
            
            // Красивая плашка для порога
            ctx.fillStyle = '#f59e0b';
            ctx.beginPath(); ctx.roundRect(tx + 4, 4, 50, 20, 4); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font = 'bold 12px Inter, sans-serif';
            ctx.fillText('T=' + threshold, tx + 8, 18);
        }
    }

    runOtsu() { this.updateResult(ProcessingLayer.runOtsu(this.bufBefore)); }
    runIsodata() { this.updateResult(ProcessingLayer.runIsodata(this.bufBefore)); }
    runLaplace() { this.updateResult({ result: ProcessingLayer.runLaplace(this.bufBefore, this.padSelect.value) }); }
    runLines() { this.updateResult({ result: ProcessingLayer.runLines(this.bufBefore, this.padSelect.value) }); }
    runSobel() { this.updateResult({ result: ProcessingLayer.runSobel(this.bufBefore, this.padSelect.value) }); }
    runCanny() { this.updateResult({ result: ProcessingLayer.runCanny(this.bufBefore, this.padSelect.value) }); }
}

window.onload = () => { window.app = new PresentationUI(); };
