const ColorModel = {
    WHITE_POINTS: {
        D65: { x: 0.3127, y: 0.3290 }, 
        D50: { x: 0.3457, y: 0.3585 }, 
        E:   { x: 1/3,    y: 1/3 }     
    },

    PRIMARIES: {
        r: { x: 0.6400, y: 0.3300 },
        g: { x: 0.3000, y: 0.6000 },
        b: { x: 0.1500, y: 0.0600 }
    },


    getWhitePointXYZ(standard = 'D65') {
        const wp = this.WHITE_POINTS[standard] || this.WHITE_POINTS.D65;
        const Xn = (wp.x / wp.y) * 100;
        const Yn = 100.0;
        const Zn = ((1 - wp.x - wp.y) / wp.y) * 100;
        return { Xn, Yn, Zn };
    },


    getRGBtoXYZMatrix(standard = 'D65') {
        const wp = this.WHITE_POINTS[standard] || this.WHITE_POINTS.D65;
        const P = this.PRIMARIES;

        const xr = P.r.x, yr = P.r.y, zr = 1 - xr - yr;
        const xg = P.g.x, yg = P.g.y, zg = 1 - xg - yg;
        const xb = P.b.x, yb = P.b.y, zb = 1 - xb - yb;

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

    hsvToRgb(h, s, v) {
        h = h % 360;
        if (h < 0) h += 360;
        s = s / 100;
        v = v / 100;

        const c = v * s;
        const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
        const m = v - c;

        let r1 = 0, g1 = 0, b1 = 0;
        if (h >= 0 && h < 60) { r1 = c; g1 = x; b1 = 0; }
        else if (h >= 60 && h < 120) { r1 = x; g1 = c; b1 = 0; }
        else if (h >= 120 && h < 180) { r1 = 0; g1 = c; b1 = x; }
        else if (h >= 180 && h < 240) { r1 = 0; g1 = x; b1 = c; }
        else if (h >= 240 && h < 300) { r1 = x; g1 = 0; b1 = c; }
        else if (h >= 300 && h < 360) { r1 = c; g1 = 0; b1 = x; }

        return {
            r: Math.round((r1 + m) * 255),
            g: Math.round((g1 + m) * 255),
            b: Math.round((b1 + m) * 255)
        };
    },

    rgbToHsv(r, g, b) {
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

    rgbToXyz(r, g, b, standard = 'D65') {
        const compand = (val) => {
            val /= 255;
            return val > 0.04045 ? Math.pow((val + 0.055) / 1.055, 2.4) : val / 12.92;
        };

        const Rn = compand(r);
        const Gn = compand(g);
        const Bn = compand(b);

        const { forward } = this.getRGBtoXYZMatrix(standard);

        const X = Rn * forward[0][0] + Gn * forward[0][1] + Bn * forward[0][2];
        const Y = Rn * forward[1][0] + Gn * forward[1][1] + Bn * forward[1][2];
        const Z = Rn * forward[2][0] + Gn * forward[2][1] + Bn * forward[2][2];

        return { x: X, y: Y, z: Z };
    },

    xyzToRgb(x, y, z, standard = 'D65', strategy = 'clipping') {
        const { inverse } = this.getRGBtoXYZMatrix(standard);

        let Rn = x * inverse[0][0] + y * inverse[0][1] + z * inverse[0][2];
        let Gn = x * inverse[1][0] + y * inverse[1][1] + z * inverse[1][2];
        let Bn = x * inverse[2][0] + y * inverse[2][1] + z * inverse[2][2];

        const uncompand = (val) => {
            return val > 0.0031308 ? 1.055 * Math.pow(val, 1 / 2.4) - 0.055 : 12.92 * val;
        };

        let r = uncompand(Rn) * 255;
        let g = uncompand(Gn) * 255;
        let b = uncompand(Bn) * 255;

        let isOut = false;
        if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
            isOut = true;
        }

        if (isOut) {
            if (strategy === 'scaling') {
                const minVal = Math.min(r, g, b, 0);
                if (minVal < 0) {
                    r -= minVal; g -= minVal; b -= minVal;
                }
                const maxVal = Math.max(r, g, b);
                if (maxVal > 255) {
                    r = (r / maxVal) * 255;
                    g = (g / maxVal) * 255;
                    b = (b / maxVal) * 255;
                }
            } else {
                r = Math.min(255, Math.max(0, r));
                g = Math.min(255, Math.max(0, g));
                b = Math.min(255, Math.max(0, b));
            }
        }

        return {
            rgb: { r: Math.round(r), g: Math.round(g), b: Math.round(b) },
            isOut
        };
    },

    xyzToLab(x, y, z, standard = 'D65') {
        const { Xn, Yn, Zn } = this.getWhitePointXYZ(standard);

        const fx = x / Xn;
        const fy = y / Yn;
        const fz = z / Zn;

        const f = (val) => {
            return val > 0.008856 ? Math.cbrt(val) : 7.787 * val + (16 / 116);
        };

        const fX = f(fx);
        const fY = f(fy);
        const fZ = f(fz);

        const L = 116 * fY - 16;
        const a = 500 * (fX - fY);
        const b = 200 * (fY - fZ);

        return { l: L, a, b };
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

        const X = finv(fX) * Xn;
        const Y = finv(fY) * Yn;
        const Z = finv(fZ) * Zn;

        return { x: X, y: Y, z: Z };
    },

    hsvToAll(h, s, v, standard, strategy) {
        const rgb = this.hsvToRgb(h, s, v);
        const xyz = this.rgbToXyz(rgb.r, rgb.g, rgb.b, standard);
        const lab = this.xyzToLab(xyz.x, xyz.y, xyz.z, standard);
        return { hsv: { h, s, v }, rgb, xyz, lab, isOut: false };
    },

    xyzToAll(x, y, z, standard, strategy) {
        const { rgb, isOut } = this.xyzToRgb(x, y, z, standard, strategy);
        const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
        const lab = this.xyzToLab(x, y, z, standard);
        return { hsv, rgb, xyz: { x, y, z }, lab, isOut };
    },

    labToAll(l, a, b, standard, strategy) {
        const xyz = this.labToXyz(l, a, b, standard);
        const { rgb, isOut } = this.xyzToRgb(xyz.x, xyz.y, xyz.z, standard, strategy);
        const hsv = this.rgbToHsv(rgb.r, rgb.g, rgb.b);
        return { hsv, rgb, xyz, lab: { l, a, b }, isOut };
    }
};