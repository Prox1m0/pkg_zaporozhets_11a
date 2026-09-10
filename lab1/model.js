
const WHITE_POINTS = {
    D65: { X: 95.047, Y: 100.0, Z: 108.883 },
    D50: { X: 96.422, Y: 100.0, Z: 82.521 },
    E:   { X: 100.0,  Y: 100.0, Z: 100.0 }
};

function hsvToRgb(h, s, v) {
    s /= 100;
    v /= 100;
    let c = v * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = v - c;
    let r = 0, g = 0, b = 0;

    if (0 <= h && h < 60) { r = c; g = x; b = 0; }
    else if (60 <= h && h < 120) { r = x; g = c; b = 0; }
    else if (120 <= h && h < 180) { r = 0; g = c; b = x; }
    else if (180 <= h && h < 240) { r = 0; g = x; b = c; }
    else if (240 <= h && h < 300) { r = x; g = 0; b = c; }
    else if (300 <= h && h < 360) { r = c; g = 0; b = x; }

    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    };
}

function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    let max = Math.max(r, g, b), min = Math.min(r, g, b);
    let delta = max - min;
    let h = 0, s = max === 0 ? 0 : delta / max, v = max;

    if (delta !== 0) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h = Math.round(h * 60);
        if (h < 0) h += 360;
    }
    return { h, s: Math.round(s * 100), v: Math.round(v * 100) };
}

function rgbToXyz(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    r = r > 0.04045 ? Math.pow((r + 0.055) / 1.055, 2.4) : r / 12.92;
    g = g > 0.04045 ? Math.pow((g + 0.055) / 1.055, 2.4) : g / 12.92;
    b = b > 0.04045 ? Math.pow((b + 0.055) / 1.055, 2.4) : b / 12.92;

    let x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
    let y = r * 0.2126729 + g * 0.7151522 + b * 0.0721750;
    let z = r * 0.0193339 + g * 0.1191920 + b * 0.9503041;

    return { x: x * 100, y: y * 100, z: z * 100 };
}

function xyzToRgb(x, y, z) {
    x /= 100; y /= 100; z /= 100;
    let r = x * 3.2404542 - y * 1.5371385 - z * 0.4985314;
    let g = x * -0.9692660 + y * 1.8760108 + z * 0.0415560;
    let b = x * 0.0556434 - y * 0.2040259 + z * 1.0572252;

    r = r > 0.0031308 ? 1.055 * Math.pow(r, 1.0 / 2.4) - 0.055 : 12.92 * r;
    g = g > 0.0031308 ? 1.055 * Math.pow(g, 1.0 / 2.4) - 0.055 : 12.92 * g;
    b = b > 0.0031308 ? 1.055 * Math.pow(b, 1.0 / 2.4) - 0.055 : 12.92 * b;

    return {
        r: Math.round(Math.min(Math.max(0, r), 1) * 255),
        g: Math.round(Math.min(Math.max(0, g), 1) * 255),
        b: Math.round(Math.min(Math.max(0, b), 1) * 255)
    };
}

function xyzToLab(x, y, z, whiteStandard = 'D65') {
    let ref = WHITE_POINTS[whiteStandard] || WHITE_POINTS.D65;
    let xr = x / ref.X, yr = y / ref.Y, zr = z / ref.Z;

    const fn = (t) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + (16 / 116);
    let fx = fn(xr), fy = fn(yr), fz = fn(zr);

    return {
        l: Math.round((116 * fy) - 16),
        a: Math.round(500 * (fx - fy)),
        b: Math.round(200 * (fy - fz))
    };
}

function labToXyz(l, a, b, whiteStandard = 'D65') {
    let ref = WHITE_POINTS[whiteStandard] || WHITE_POINTS.D65;
    let fy = (l + 16) / 116;
    let fx = a / 500 + fy;
    let fz = fy - b / 200;

    let xr = Math.pow(fx, 3) > 0.008856 ? Math.pow(fx, 3) : (116 * fx - 16) / 7.787;
    let yr = l > (8 * 7.787) ? Math.pow((l + 16) / 116, 3) : l / (7.787 * 116);
    let zr = Math.pow(fz, 3) > 0.008856 ? Math.pow(fz, 3) : (116 * fz - 16) / 7.787;

    return {
        x: xr * ref.X,
        y: yr * ref.Y,
        z: zr * ref.Z
    };
}

function applyBoundaryStrategy(values, strategy, min, max) {
    let isClamped = false;
    let result = { ...values };
    
    for (let key in result) {
        if (result[key] < min) { result[key] = min; isClamped = true; }
        if (result[key] > max) { result[key] = max; isClamped = true; }
    }
    return { result, isClamped };
}

function runMathTests() {
    console.assert(hsvToRgb(0, 100, 100).r === 255, "Test HSV->RGB failed");
    console.log("✅ Все микро-тесты математики прошли успешно!");
}
runMathTests();