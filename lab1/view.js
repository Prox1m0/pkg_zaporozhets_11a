const View = {
    getStandard() {
        return document.getElementById('whiteStandard').value;
    },

    getStrategy() {
        return document.getElementById('strategy').value;
    },

    setValues(data) {
        document.getElementById('input-h').value = Math.round(data.hsv.h);
        document.getElementById('slider-h').value = Math.round(data.hsv.h);
        document.getElementById('input-s').value = Math.round(data.hsv.s);
        document.getElementById('slider-s').value = Math.round(data.hsv.s);
        document.getElementById('input-v').value = Math.round(data.hsv.v);
        document.getElementById('slider-v').value = Math.round(data.hsv.v);

        document.getElementById('input-x').value = Math.round(data.xyz.x);
        document.getElementById('slider-x').value = Math.round(data.xyz.x);
        document.getElementById('input-y').value = Math.round(data.xyz.y);
        document.getElementById('slider-y').value = Math.round(data.xyz.y);
        document.getElementById('input-z').value = Math.round(data.xyz.z);
        document.getElementById('slider-z').value = Math.round(data.xyz.z);

        document.getElementById('input-l').value = Math.round(data.lab.l);
        document.getElementById('slider-l').value = Math.round(data.lab.l);
        document.getElementById('input-a').value = Math.round(data.lab.a);
        document.getElementById('slider-a').value = Math.round(data.lab.a);
        document.getElementById('input-b').value = Math.round(data.lab.b);
        document.getElementById('slider-b').value = Math.round(data.lab.b);

        const hex = this.formatHex(data.display.r, data.display.g, data.display.b);
        document.getElementById('colorDisplay').style.backgroundColor = hex;
        document.getElementById('colorHexText').innerText = hex.toUpperCase();
        document.getElementById('colorPicker').value = hex;
        document.getElementById('rgbInfoText').innerText = `Координаты экрана: (${data.display.r}, ${data.display.g}, ${data.display.b})`;

        const warningBox = document.getElementById('warningBox');
        if (data.isOut) {
            warningBox.classList.remove('hidden');
        } else {
            warningBox.classList.add('hidden');
        }

        this.updateSliderGradients(data.hsv);

        this.drawCieDiagram(data.xyz);
    },

    formatHex(r, g, b) {
        return "#" + [r, g, b].map(x => {
            const hex = Math.min(255, Math.max(0, x)).toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        }).join("");
    },

    updateSliderGradients(hsv) {
        const standard = this.getStandard();
        const strategy = this.getStrategy();

        const sliderH = document.getElementById('slider-h');
        sliderH.style.background = 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)';

        const sliderS = document.getElementById('slider-s');
        const sMin = ColorModel.hsvToAll(hsv.h, 0, hsv.v, standard, strategy).display;
        const sMax = ColorModel.hsvToAll(hsv.h, 100, hsv.v, standard, strategy).display;
        sliderS.style.background = `linear-gradient(to right, ${this.formatHex(sMin.r, sMin.g, sMin.b)}, ${this.formatHex(sMax.r, sMax.g, sMax.b)})`;

        const sliderV = document.getElementById('slider-v');
        const vMax = ColorModel.hsvToAll(hsv.h, hsv.s, 100, standard, strategy).display;
        sliderV.style.background = `linear-gradient(to right, #000000, ${this.formatHex(vMax.r, vMax.g, vMax.b)})`;

        const setGradient = (id, color1, color2) => {
            document.getElementById(id).style.background = `linear-gradient(to right, ${color1}, ${color2})`;
        };

        setGradient('slider-x', '#000', '#ff0055');
        setGradient('slider-y', '#000', '#00ff66');
        setGradient('slider-z', '#000', '#0066ff');

        setGradient('slider-l', '#000', '#fff');
        setGradient('slider-a', '#00ff88', '#ff0055');
        setGradient('slider-b', '#0066ff', '#ffff00');
    },

    drawCieDiagram(xyz) {
        const canvas = document.getElementById('cieCanvas');
        const ctx = canvas.getContext('2d');
        const w = canvas.width;
        const h = canvas.height;

        ctx.clearRect(0, 0, w, h);

        const sum = xyz.x + xyz.y + xyz.z;
        const x = sum === 0 ? 1/3 : xyz.x / sum;
        const y = sum === 0 ? 1/3 : xyz.y / sum;

        document.getElementById('cieCoordsText').innerText = `x: ${x.toFixed(3)}, y: ${y.toFixed(3)}`;

        const imgData = ctx.createImageData(w, h);
        for (let py = 0; py < h; py++) {
            for (let px = 0; px < w; px++) {
                const cx = px / w;
                const cy = 1 - (py / h);

                if (cy > 0 && cx > 0 && (cx + cy <= 1.0) && cy > -1.5*cx + 0.3) {
                    const index = (py * w + px) * 4;
                    imgData.data[index] = Math.floor(cx * 255);
                    imgData.data[index+1] = Math.floor(cy * 255);
                    imgData.data[index+2] = Math.floor((1 - cx - cy) * 200);
                    imgData.data[index+3] = 180;
                }
            }
        }
        ctx.putImageData(imgData, 0, 0);

        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0.64 * w, (1 - 0.33) * h);
        ctx.lineTo(0.30 * w, (1 - 0.60) * h);
        ctx.lineTo(0.15 * w, (1 - 0.06) * h);
        ctx.closePath();
        ctx.stroke();

        const px = x * w;
        const py = (1 - y) * h;

        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, 6, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }
};
