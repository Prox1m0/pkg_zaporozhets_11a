let currentHsv = { h: 0, s: 0, v: 100 };
let currentXyz = { x: 95.047, y: 100.0, z: 108.883 };
let currentLab = { l: 100, a: 0, b: 0 };

function updateAllFromSource(sourceModel) {
    const settings = View.getSettings();

    if (sourceModel === 'hsv') {
        currentHsv = View.getValues('hsv');
        let rgb = hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v);
        let xyz = rgbToXyz(rgb.r, rgb.g, rgb.b);
        currentXyz = xyz;
        currentLab = xyzToLab(xyz.x, xyz.y, xyz.z, settings.whiteStandard);
        View.updatePreview(rgb);
    } 
    else if (sourceModel === 'xyz' || sourceModel === 'settings') {
        if (sourceModel === 'xyz') {
            currentXyz = View.getValues('xyz');
        } else {
            currentXyz = labToXyz(currentLab.l, currentLab.a, currentLab.b, settings.whiteStandard);
        }
        
        let rgb = xyzToRgb(currentXyz.x, currentXyz.y, currentXyz.z);
        currentHsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
        currentLab = xyzToLab(currentXyz.x, currentXyz.y, currentXyz.z, settings.whiteStandard);
        View.updatePreview(rgb);
    } 
    else if (sourceModel === 'lab') {
        currentLab = View.getValues('lab');
        let xyz = labToXyz(currentLab.l, currentLab.a, currentLab.b, settings.whiteStandard);
        currentXyz = xyz;
        let rgbCalculated = xyzToRgb(xyz.x, xyz.y, xyz.z);
        currentHsv = rgbToHsv(rgbCalculated.r, rgbCalculated.g, rgbCalculated.b);
        View.updatePreview(rgbCalculated);
    }

    View.setValues('hsv', currentHsv);
    View.setValues('xyz', currentXyz);
    View.setValues('lab', currentLab);
    View.showWarning(false);
}

document.addEventListener('DOMContentLoaded', () => {
    View.setValues('hsv', currentHsv);
    View.setValues('xyz', currentXyz);
    View.setValues('lab', currentLab);
    View.updatePreview(hsvToRgb(currentHsv.h, currentHsv.s, currentHsv.v));

    View.bindEvents((sourceModel) => {
        updateAllFromSource(sourceModel);
    });

    const colorPicker = document.getElementById('colorPicker');
    if (colorPicker) {
        colorPicker.addEventListener('input', (e) => {
            let hex = e.target.value;
            let r = parseInt(hex.slice(1, 3), 16);
            let g = parseInt(hex.slice(3, 5), 16);
            let b = parseInt(hex.slice(5, 7), 16);

            const settings = View.getSettings();

            currentXyz = rgbToXyz(r, g, b);
            currentHsv = rgbToHsv(r, g, b);
            currentLab = xyzToLab(currentXyz.x, currentXyz.y, currentXyz.z, settings.whiteStandard);

            View.setValues('hsv', currentHsv);
            View.setValues('xyz', currentXyz);
            View.setValues('lab', currentLab);
            View.updatePreview({ r, g, b });
            View.showWarning(false);
        });
    }

    const testBtn = document.getElementById('runTestsBtn');
    if (testBtn) {
        testBtn.addEventListener('click', () => {
            try {
                if (typeof runMathTests === 'function') {
                    runMathTests();
                    alert('✅ Все микро-тесты математики успешно пройдены!');
                } else {
                    alert('⚠️ Функция runMathTests не найдена.');
                }
            } catch (error) {
                alert('❌ Ошибка в тестах: ' + error.message);
            }
        });
    }
});