
const View = {
    getValues(modelName) {
        if (modelName === 'hsv') {
            return {
                h: parseFloat(document.getElementById('hsv-h-range').value) || 0,
                s: parseFloat(document.getElementById('hsv-s-range').value) || 0,
                v: parseFloat(document.getElementById('hsv-v-range').value) || 0
            };
        } else if (modelName === 'xyz') {
            return {
                x: parseFloat(document.getElementById('xyz-x-range').value) || 0,
                y: parseFloat(document.getElementById('xyz-y-range').value) || 0,
                z: parseFloat(document.getElementById('xyz-z-range').value) || 0
            };
        } else if (modelName === 'lab') {
            return {
                l: parseFloat(document.getElementById('lab-l-range').value) || 0,
                a: parseFloat(document.getElementById('lab-a-range').value) || 0,
                b: parseFloat(document.getElementById('lab-b-range').value) || 0
            };
        }
    },

    setValues(modelName, data) {
        for (let key in data) {
            let numInput = document.getElementById(`${modelName}-${key}-num`);
            let rangeInput = document.getElementById(`${modelName}-${key}-range`);
            if (numInput && rangeInput) {
                let val = Math.round(data[key] * 10) / 10;
                if (document.activeElement !== numInput) numInput.value = val;
                if (document.activeElement !== rangeInput) rangeInput.value = val;
            }
        }
    },

    updatePreview(rgb) {
        const preview = document.getElementById('colorPreview');
        const hexText = document.getElementById('colorHexText');
        
        // Красим блок
        preview.style.backgroundColor = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        
        // Считаем HEX
        const hex = "#" + [rgb.r, rgb.g, rgb.b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? "0" + hex : hex;
        }).join("").toUpperCase();
        
        hexText.innerText = hex;

        // Автоматически меняем цвет текста на белый, если фон темный, и черный, если светлый
        const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
        hexText.style.color = brightness > 125 ? '#1e293b' : '#ffffff';
        hexText.style.backgroundColor = brightness > 125 ? 'rgba(255, 255, 255, 0.8)' : 'rgba(0, 0, 0, 0.5)';
    },

    showWarning(show, text = "Внимание: произошло обрезание/округление цвета!") {
        const warningBox = document.getElementById('warningBox');
        warningBox.innerText = text;
        if (show) {
            warningBox.classList.remove('hidden');
        } else {
            warningBox.classList.add('hidden');
        }
    },

    getSettings() {
        return {
            whiteStandard: document.getElementById('whiteStandard').value,
            strategy: document.getElementById('strategy').value
        };
    },

    bindEvents(handler) {
        const models = ['hsv', 'xyz', 'lab'];
        models.forEach(model => {
            const inputs = document.querySelectorAll(`[id^="${model}-"]`);
            inputs.forEach(input => {
                input.addEventListener('input', (e) => {
                    let baseId = input.id.replace(/-num|-range$/, '');
                    let numVal = document.getElementById(`${baseId}-num`).value;
                    let rangeVal = document.getElementById(`${baseId}-range`).value;
                    
                    if (input.type === 'number') {
                        document.getElementById(`${baseId}-range`).value = numVal;
                    } else {
                        document.getElementById(`${baseId}-num`).value = rangeVal;
                    }

                    handler(model);
                });
            });
        });

        document.getElementById('whiteStandard').addEventListener('change', () => handler('settings'));
        document.getElementById('strategy').addEventListener('change', () => handler('settings'));
    }
    
    
};