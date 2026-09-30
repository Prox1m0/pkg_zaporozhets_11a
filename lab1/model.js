const ColorModel = {
    WHITE_POINTS: {
        D65: { x: 0.3127, y: 0.3290 }, 
        D50: { x: 0.3457, y: 0.3585 }, 
        E:   { x: 1/3,    y: 1/3 }     
    },

    DISPLAY_PRIMARIES: {
        c1: { x: 0.6400, y: 0.3300 },
        c2: { x: 0.3000, y: 0.6000 },
        c3: { x: 0.1500, y: 0.0600 }
    },

    getWhitePointXYZ(standard = 'D65') {
        const wp = this.WHITE_POINTS[standard] || this.WHITE_POINTS.D65;
        const Xn = (wp.x / wp.y) * 100;
        const Yn = 100.0;
        const Zn = ((1 - wp.x - wp.y) / wp.y) * 100;
        return { Xn, Yn, Zn };
    },

    getTransformationMatrix(standard = 'D65') {
        const wp = this.WHITE_POINTS[standard] || this.WHITE_POINTS.D65;
        const P = this.DISPLAY_PRIMARIES;

        const xr = P.c1.x, yr = P.c1.y, zr = 1 - xr - yr;
        const xg = P.c2.x, yg = P.c2.y, zg = 1 - xg - yg;
        const xb = P.c3.x, yb = P.c3.y, zb = 1 - xb - yb;

        const XW = wp.x / wp.y;
        const YW = 1.0;
        const ZW = (1 - wp.x - wp.y) / wp.y;

        const detM = xr * (yg * zb - yb * zg) - xg * (yr * zb - yb * zr) + xb * (yr * zg - yg * zr);

        const Sr = (XW * (yg * zb - yb * zg) - xg * (YW * zb - yb * ZW) + xb * (YW * zg - yg * ZW)) / detM;
        const Sg = (xr * (YW * zb - yb * ZW) - XW * (yr * zb - yb * zr) + xb * (yr * ZW - YW * zr)) / detM;
        const Sb = (xr * (yg * ZW - YW * zg) - xg * (yr * ZW - YW * zr) + XW * (yr * zg - yg * zr)) / detM;

        const forward = [
            [Sr * xr * 100, Sg * xg * 100, Sb * xb * 100],
            [Sr * yr * 100, Sg * yg * 100, Sb * yb * 100],
            [Sr * zr * 100, Sg * zg * 100, Sb * zb * 100]
        ];

        const M = forward;
        const det = M[0][0]*(M[1][1]*M[2][2] - M[1][2]*M[2][1]) -
                    M[0][1]*(M[1][0]*M[2][2] - M[1][2]*M[2][0]) +
                    M[0][2]*(M[1][0]*M[2][1] - M[1][1]*M[2][0]);

        const inverse = [
            [ (M[1][1]*M[2][2] - M[1][2]*M[2][1])/det, (M[0][2]*M[2][1] - M[0][1]*M[2][2])/det, (M[0][1]*M[1][2] - M[0][2]*M[1][1])/det ],
            [ (M[1][2]*M[2][0] - M[1][0]*M[2][2])/det, (M[0][0]*M[2][2] - M[0][2]*M[2][0])/det, (M[0][2]*M[1][0] - M[0][0]*M[1][2])/det ],
            [ (M[1][0]*M[2][1] - M[1][1]*M[2][0])/det, (M[0][1]*M[2][0] - M[0][0]*M[2][1])/det, (M[0][0]*M[1][1] - M[0][1]*M[1][0])/det ]
        ];

        return { forward, inverse };
    },

    hsvToXyz(h, s, v, standard = 'D65') {
        h = h % 360; if (h < 0) h += 360;
        s = s / 100; v = v / 100;

        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;

        let v1 = 0, v2 = 0, v3 = 0;
        if (h >= 0 && h < 60)        { v1 = c; v2 = x; v3 = 0; }
        else if (h >= 60 && h < 120) { v1 = x; v2 = c; v3 = 0; }
        else if (h >= 120 && h < 180){ v1 = 0; v2 = c; v3 = x; }
        else if (h >= 180 && h < 240){ v1 = 0; v2 = x; v3 = c; }
        else if (h >= 240 && h < 300){ v1 = x; v2 = 0; v3 = c; }
        else if (h >= 300 && h < 360){ v1 = c; v2 = 0; v3 = x; }

        const compand = (val) => val > 0.04045 ? Math.pow((val + 0.055) / 1.055, 2.4) : val / 12.92;
        const c1 = compand(v1 + m);
        const c2 = compand(v2 + m);
        const c3 = compand(v3 + m);

        const { forward } = this.getTransformationMatrix(standard);
        const X = c1 * forward[0][0] + c2 * forward[0][1] + c3 * forward[0][2];
        const Y = c1 * forward[1][0] + c2 * forward[1][1] + c3 * forward[1][2];
        const Z = c1 * forward[2][0] + c2 * forward[2][1] + c3 * forward[2][2];

        return { x: X, y: Y, z: Z };
    },

    xyzToHsv(x, y, z, standard = 'D65') {
        const { inverse } = this.getTransformationMatrix(standard);
        
        const v1 = x * inverse[0][0] + y * inverse[0][1] + z * inverse[0][2];
        const v2 = x * inverse[1][0] + y * inverse[1][1] + z * inverse[1][2];
        const v3 = x * inverse[2][0] + y * inverse[2][1] + z * inverse[2][2];

        const uncompand = (val) => val > 0.0031308 ? 1.055 * Math.pow(val, 1 / 2.4) - 0.055 : 12.92 * val;
        const c1 = uncompand(v1);
        const c2 = uncompand(v2);
        const c3 = uncompand(v3);

        const max = Math.max(c1, c2, c3);
        const min = Math.min(c1, c2, c3);
        const delta = max - min;

        let h = 0, s = 0, v = max;

        if (delta !== 0) {
            s = delta / max;
            if (max === c1) h = ((c2 - c3) / delta) % 6;
            else if (max === c2) h = (c3 - c1) / delta + 2;
            else h = (c1 - c2) / delta + 4;

            h = Math.round(h * 60);
            if (h < 0) h += 360;
        }

        return { h, s: Math.round(s * 100), v: Math.round(v * 100) };
    },

    xyzToLab(x, y, z, standard = 'D65') {
        const { Xn, Yn, Zn } = this.getWhitePointXYZ(standard);
        const fx = x / Xn;
        const fy = y / Yn;
        const fz = z / Zn;

        const f = (val) => val > 0.008856 ? Math.cbrt(val) : 7.787 * val + (16 / 116);
        const fX = f(fx);
        const fY = f(fy);
        const fZ = f(fz);

        return { l: 116 * fY - 16, a: 500 * (fX - fY), b: 200 * (fY - fZ) };
    },

    labToXyz(l, a, b, standard = 'D65') {
        const { Xn, Yn, Zn } = this.getWhitePointXYZ(standard);
        const fY = (l + 16) / 116;
        const fX = a / 500 + fY;
        const fZ = fY - b / 200;

        const finv = (val) => {
            const val3 = Math.pow(val, 3);
            return val3 >= 0.008856 ? val3 : (val - 16 / 116) / 7.787;
        };

        return { x: finv(fX) * Xn, y: finv(fY) * Yn, z: finv(fZ) * Zn };
    },

    hsvToLab(h, s, v, standard = 'D65') {
        const xyz = this.hsvToXyz(h, s, v, standard);
        return this.xyzToLab(xyz.x, xyz.y, xyz.z, standard);
    },

    labToHsv(l, a, b, standard = 'D65') {
        const xyz = this.labToXyz(l, a, b, standard);
        return this.xyzToHsv(xyz.x, xyz.y, xyz.z, standard);
    },

    displayPixelsToHsv(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const delta = max - min;
        let h = 0, s = 0, v = max;
        if (delta !== 0) {
            s = delta / max;
            if (max === r) h = ((g - b) / delta) % 6;
            else if (max === g) h = (b - r) / delta + 2;
            else h = (r - g) / delta + 4;
            h = Math.round(h * 60);
            if (h < 0) h += 360;
        }
        return { h, s: Math.round(s * 100), v: Math.round(v * 100) };
    },

    getDisplayPixels(x, y, z, standard = 'D65', strategy = 'clipping') {
        const { inverse } = this.getTransformationMatrix(standard);
        let c1 = x * inverse[0][0] + y * inverse[0][1] + z * inverse[0][2];
        let c2 = x * inverse[1][0] + y * inverse[1][1] + z * inverse[1][2];
        let c3 = x * inverse[2][0] + y * inverse[2][1] + z * inverse[2][2];

        const uncompand = (val) => val > 0.0031308 ? 1.055 * Math.pow(val, 1 / 2.4) - 0.055 : 12.92 * val;
        let r = uncompand(c1) * 255;
        let g = uncompand(c2) * 255;
        let b = uncompand(c3) * 255;

        let isOut = r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255;

        if (isOut) {
            if (strategy === 'scaling') {
                const minVal = Math.min(r, g, b, 0);
                if (minVal < 0) { r -= minVal; g -= minVal; b -= minVal; }
                const maxVal = Math.max(r, g, b);
                if (maxVal > 255) {
                    r = (r / maxVal) * 255; g = (g / maxVal) * 255; b = (b / maxVal) * 255;
                }
            } else {
                r = Math.min(255, Math.max(0, r)); g = Math.min(255, Math.max(0, g)); b = Math.min(255, Math.max(0, b));
            }
        }
        return { r: Math.round(r), g: Math.round(g), b: Math.round(b), isOut };
    },

    hsvToAll(h, s, v, standard, strategy) {
        const xyz = this.hsvToXyz(h, s, v, standard);
        const lab = this.xyzToLab(xyz.x, xyz.y, xyz.z, standard);
        const display = this.getDisplayPixels(xyz.x, xyz.y, xyz.z, standard, strategy);
        return { hsv: { h, s, v }, display, xyz, lab, isOut: display.isOut };
    },

    xyzToAll(x, y, z, standard, strategy) {
        const hsv = this.xyzToHsv(x, y, z, standard);
        const lab = this.xyzToLab(x, y, z, standard);
        const display = this.getDisplayPixels(x, y, z, standard, strategy);
        return { hsv, display, xyz: { x, y, z }, lab, isOut: display.isOut };
    },

    labToAll(l, a, b, standard, strategy) {
        const xyz = this.labToXyz(l, a, b, standard);
        const hsv = this.xyzToHsv(xyz.x, xyz.y, xyz.z, standard);
        const display = this.getDisplayPixels(xyz.x, xyz.y, xyz.z, standard, strategy);
        return { hsv, display, xyz, lab: { l, a, b }, isOut: display.isOut };
    }
};
