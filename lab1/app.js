document.addEventListener('DOMContentLoaded', () => {
    updateFromHsv();

    const bindModelGroup = (ids, updateFn) => {
        ids.forEach(id => {
            const el = document.getElementById(id);
            el.addEventListener('input', () => {
                if (id.startsWith('input-')) {
                    const sliderId = id.replace('input-', 'slider-');
                    document.getElementById(sliderId).value = el.value;
                } else if (id.startsWith('slider-')) {
                    const inputId = id.replace('slider-', 'input-');
                    document.getElementById(inputId).value = el.value;
                }
                updateFn();
            });
        });
    };

    bindModelGroup(['input-h', 'slider-h', 'input-s', 'slider-s', 'input-v', 'slider-v'], updateFromHsv);
    bindModelGroup(['input-x', 'slider-x', 'input-y', 'slider-y', 'input-z', 'slider-z'], updateFromXyz);
    bindModelGroup(['input-l', 'slider-l', 'input-a', 'slider-a', 'input-b', 'slider-b'], updateFromLab);

    document.getElementById('whiteStandard').addEventListener('change', updateFromHsv);
    document.getElementById('strategy').addEventListener('change', updateFromHsv);

    document.getElementById('colorPicker').addEventListener('input', (e) => {
        const hex = e.target.value;
        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);

        const hsv = ColorModel.rgbToHsv(r, g, b);
        document.getElementById('input-h').value = hsv.h;
        document.getElementById('slider-h').value = hsv.h;
        document.getElementById('input-s').value = hsv.s;
        document.getElementById('slider-s').value = hsv.s;
        document.getElementById('input-v').value = hsv.v;
        document.getElementById('slider-v').value = hsv.v;

        updateFromHsv();
    });

    document.getElementById('runTestsBtn').addEventListener('click', runMicroTests);

    function updateFromHsv() {
        const h = parseFloat(document.getElementById('input-h').value) || 0;
        const s = parseFloat(document.getElementById('input-s').value) || 0;
        const v = parseFloat(document.getElementById('input-v').value) || 0;

        const data = ColorModel.hsvToAll(h, s, v, View.getStandard(), View.getStrategy());
        View.setValues(data);
    }

    function updateFromXyz() {
        const x = parseFloat(document.getElementById('input-x').value) || 0;
        const y = parseFloat(document.getElementById('input-y').value) || 0;
        const z = parseFloat(document.getElementById('input-z').value) || 0;

        const data = ColorModel.xyzToAll(x, y, z, View.getStandard(), View.getStrategy());
        View.setValues(data);
    }

    function updateFromLab() {
        const l = parseFloat(document.getElementById('input-l').value) || 0;
        const a = parseFloat(document.getElementById('input-a').value) || 0;
        const b = parseFloat(document.getElementById('input-b').value) || 0;

        const data = ColorModel.labToAll(l, a, b, View.getStandard(), View.getStrategy());
        View.setValues(data);
    }
});

function runMicroTests() {
    let passed = 0;
    let total = 0;

    function assert(condition, testName) {
        total++;
        if (condition) {
            passed++;
            console.log(`[PASS] ${testName}`);
        } else {
            console.error(`[FAIL] ${testName}`);
        }
    }

    const hsvRed = ColorModel.rgbToHsv(255, 0, 0);
    assert(hsvRed.h === 0 && hsvRed.s === 100 && hsvRed.v === 100, "RGB(255,0,0) -> HSV(0, 100%, 100%)");

    const rgbRed = ColorModel.hsvToRgb(0, 100, 100);
    assert(rgbRed.r === 255 && rgbRed.g === 0 && rgbRed.b === 0, "HSV(0, 100%, 100%) -> RGB(255,0,0)");

    const xyzWhite = ColorModel.rgbToXyz(255, 255, 255, 'D65');
    assert(Math.abs(xyzWhite.y - 100.0) < 0.1, "RGB(255,255,255) D65 -> Y = 100.0");

    const labWhite = ColorModel.xyzToLab(xyzWhite.x, xyzWhite.y, xyzWhite.z, 'D65');
    assert(Math.abs(labWhite.l - 100.0) < 0.5, "White in LAB -> L* = 100");

    alert(`Результаты тестов: Пройдено ${passed} из ${total}.
Подробности выведены в консоль браузера (F12).`);
}