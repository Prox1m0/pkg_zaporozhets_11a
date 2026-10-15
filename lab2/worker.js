// Data/Parsing Layer: Побайтовый парсинг заголовков (JPG, GIF, TIF, BMP, PNG, PCX) без сторонних библиотек.
// Используется Lazy Loading (чтение только нужных срезов через Blob.slice).

self.onmessage = async function(e) {
    const items = e.data;
    const batch = [];

    for (let i = 0; i < items.length; i++) {
        const { id, file } = items[i];
        const meta = await parseImageFile(id, file);
        batch.push(meta);

        // Отправляем результаты пачками по 40 штук для минимальных накладных расходов IPC
        if (batch.length >= 40) {
            self.postMessage(batch.splice(0, batch.length));
        }
    }

    if (batch.length > 0) {
        self.postMessage(batch);
    }
};

function toHexString(bytes, maxLen = 32) {
    const len = Math.min(bytes.length, maxLen);
    const out = [];
    for (let i = 0; i < len; i++) {
        out.push(bytes[i].toString(16).padStart(2, '0').toUpperCase());
    }
    return out.join(' ');
}

function detectActualFormatByMagic(bytes) {
    if (bytes.length < 4) return null;
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) return 'PNG';
    if (bytes[0] === 0x42 && bytes[1] === 0x4D) return 'BMP';
    if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) return 'GIF';
    if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) return 'JPG';
    if ((bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2A && bytes[3] === 0x00) ||
        (bytes[0] === 0x4D && bytes[1] === 0x4D && bytes[2] === 0x00 && bytes[3] === 0x2A)) return 'TIF';
    if (bytes[0] === 0x0A && bytes[1] <= 0x05 && bytes[2] <= 0x01) return 'PCX';
    return 'НЕИЗВЕСТНЫЙ/ТЕКСТ';
}

async function parseImageFile(id, file) {
    const extMatch = file.name.toLowerCase().match(/\.([a-z0-9]+)$/);
    const ext = extMatch ? extMatch[1] : '';
    const expectedFormat = (ext === 'jpeg' || ext === 'jpg') ? 'JPG' :
                           (ext === 'tiff' || ext === 'tif') ? 'TIF' : ext.toUpperCase();

    const meta = {
        id,
        name: file.name,
        fileSize: file.size,
        format: expectedFormat,
        width: 0,
        height: 0,
        dpi: '—',
        colorDepth: '—',
        compression: '—',
        extra: '',
        hexHead: '',
        status: 'OK',
        isOk: true
    };

    try {
        if (file.size < 14) {
            meta.status = 'Файл поврежден (размер < 14 байт)';
            meta.isOk = false;
            return meta;
        }

        // Lazy Loading: читаем первые 64 КБ (достаточно для заголовков, JFIF/EXIF, DQT и большинства IFD)
        const headSize = Math.min(file.size, 65536);
        const headerBuffer = await file.slice(0, headSize).arrayBuffer();
        const view = new DataView(headerBuffer);
        const bytes = new Uint8Array(headerBuffer);

        meta.hexHead = toHexString(bytes, 32);
        const detectedMagic = detectActualFormatByMagic(bytes);

        // Проверка на подмену расширения
        if (detectedMagic !== expectedFormat) {
            meta.status = `Подмена расширения (внутри ${detectedMagic})`;
            meta.isOk = false;
            return meta;
        }

        // ==================== 1. PNG ====================
        if (expectedFormat === 'PNG') {
            // Сигнатура 89 50 4E 47 0D 0A 1A 0A проверена, ищем IHDR (смещение 12..15)
            const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
            if (chunkType !== 'IHDR' || file.size < 33) {
                meta.status = 'Файл поврежден (нарушен IHDR)';
                meta.isOk = false;
                return meta;
            }

            meta.width = view.getUint32(16, false);
            meta.height = view.getUint32(20, false);
            const bitDepth = view.getUint8(24);
            const colorType = view.getUint8(25);
            const compressionMethod = view.getUint8(26);
            const filterMethod = view.getUint8(27);
            const interlaceMethod = view.getUint8(28);

            const channelsMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
            const colorNames = { 0: 'Grayscale', 2: 'Truecolor RGB', 3: 'Indexed-color', 4: 'Gray+Alpha', 6: 'RGBA' };
            const totalBits = bitDepth * (channelsMap[colorType] || 1);

            meta.colorDepth = `${totalBits} bit (${bitDepth}b/ch)`;
            meta.compression = compressionMethod === 0 ? 'Deflate (LZ77+Huffman)' : `Код ${compressionMethod}`;
            meta.extra = `${colorNames[colorType] || 'Unknown'}, Фильтр: ${filterMethod === 0 ? 'Adaptive (0)' : filterMethod}, Интерлейс: ${interlaceMethod === 1 ? 'Adam7' : 'Нет'}`;

            // Обход чанков для поиска pHYs (разрешение) и PLTE (палитра)
            let offset = 8;
            while (offset + 8 <= bytes.length) {
                const len = view.getUint32(offset, false);
                const type = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]);
                if (type === 'pHYs' && offset + 8 + 9 <= bytes.length) {
                    const ppuX = view.getUint32(offset + 8, false);
                    const ppuY = view.getUint32(offset + 12, false);
                    const unit = bytes[offset + 16];
                    if (unit === 1) {
                        meta.dpi = `${Math.round(ppuX * 0.0254)} × ${Math.round(ppuY * 0.0254)} dpi`;
                    }
                } else if (type === 'PLTE') {
                    const colorsCount = Math.floor(len / 3);
                    meta.extra += `, Палитра: ${colorsCount} цв.`;
                }
                if (type === 'IDAT' || type === 'IEND') break;
                offset += 12 + len;
            }

            // Проверка конца файла на чанк IEND (00 00 00 00 49 45 4E 44 + 4 байта CRC)
            const tailBuffer = await file.slice(Math.max(0, file.size - 16), file.size).arrayBuffer();
            const tailBytes = new Uint8Array(tailBuffer);
            let hasIEND = false;
            for (let i = 0; i <= tailBytes.length - 8; i++) {
                if (tailBytes[i] === 0x49 && tailBytes[i+1] === 0x45 && tailBytes[i+2] === 0x4E && tailBytes[i+3] === 0x44) {
                    hasIEND = true; break;
                }
            }
            if (!hasIEND) {
                meta.status = 'Файл поврежден (нет чанка IEND)';
                meta.isOk = false;
            }
        }

        // ==================== 2. BMP ====================
        else if (expectedFormat === 'BMP') {
            if (file.size < 54) {
                meta.status = 'Файл поврежден (заголовок BMP < 54 байт)';
                meta.isOk = false;
                return meta;
            }
            const declaredSize = view.getUint32(2, true);
            const dibHeaderSize = view.getUint32(14, true);

            meta.width = view.getInt32(18, true);
            const rawHeight = view.getInt32(22, true);
            meta.height = Math.abs(rawHeight);
            const bpp = view.getUint16(28, true);
            meta.colorDepth = `${bpp} bit`;

            const compCode = view.getUint32(30, true);
            const compMap = {
                0: 'BI_RGB (Без сжатия)',
                1: 'BI_RLE8 (8-bit RLE)',
                2: 'BI_RLE4 (4-bit RLE)',
                3: 'BI_BITFIELDS (Маски каналов)',
                4: 'BI_JPEG',
                5: 'BI_PNG'
            };
            meta.compression = compMap[compCode] || `Код ${compCode}`;

            const xPels = view.getInt32(38, true);
            const yPels = view.getInt32(42, true);
            if (xPels > 0 && yPels > 0) {
                meta.dpi = `${Math.round(xPels * 0.0254)} × ${Math.round(yPels * 0.0254)} dpi`;
            } else {
                meta.dpi = '96 × 96 dpi (стандарт)';
            }

            const clrUsed = view.getUint32(46, true);
            const paletteColors = bpp <= 8 ? (clrUsed > 0 ? clrUsed : (1 << bpp)) : 0;
            meta.extra = paletteColors > 0
                ? `Палитра: ${paletteColors} цв. (RGBA-квадруп, ${paletteColors * 4} байт), DIB: ${dibHeaderSize}B`
                : `Палитра не используется (Direct Color), DIB: ${dibHeaderSize}B`;

            // Валидация размера файла
            if (declaredSize > file.size) {
                meta.status = 'Файл поврежден (обрезан по размеру заголовка)';
                meta.isOk = false;
            }
        }

        // ==================== 3. GIF ====================
        else if (expectedFormat === 'GIF') {
            const ver = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3], bytes[4], bytes[5]);
            meta.width = view.getUint16(6, true);
            meta.height = view.getUint16(8, true);

            const packed = view.getUint8(10);
            const gctFlag = (packed & 0x80) !== 0;
            const colorResolution = ((packed >> 4) & 0x07) + 1;
            const gctSize = 1 << ((packed & 0x07) + 1);

            meta.colorDepth = `${ packed ? ((packed & 0x07) + 1) : colorResolution } bit`;
            meta.compression = 'LZW (Lempel-Ziv-Welch)';
            meta.dpi = '72 × 72 dpi';
            meta.extra = `Версия: ${ver}, Глобальная палитра: ${gctFlag ? gctSize + ' цветов' : 'Отсутствует'}`;

            // Проверка терминатора GIF (0x3B в конце файла)
            const tailBuf = await file.slice(file.size - 1, file.size).arrayBuffer();
            const tailByte = new Uint8Array(tailBuf)[0];
            if (tailByte !== 0x3B) {
                meta.status = 'Файл поврежден (нет Trailer 0x3B)';
                meta.isOk = false;
            }
        }

        // ==================== 4. PCX ====================
        else if (expectedFormat === 'PCX') {
            if (file.size < 128) {
                meta.status = 'Файл поврежден (заголовок PCX < 128 байт)';
                meta.isOk = false;
                return meta;
            }
            const version = bytes[1];
            const encoding = bytes[2];
            const bitsPerPlane = bytes[3];
            const xMin = view.getUint16(4, true);
            const yMin = view.getUint16(6, true);
            const xMax = view.getUint16(8, true);
            const yMax = view.getUint16(10, true);
            const hDpi = view.getUint16(12, true);
            const vDpi = view.getUint16(14, true);
            const numPlanes = bytes[65];
            const bytesPerLine = view.getUint16(66, true);

            meta.width = xMax - xMin + 1;
            meta.height = yMax - yMin + 1;
            meta.dpi = (hDpi > 0 && vDpi > 0) ? `${hDpi} × ${vDpi} dpi` : '72 × 72 dpi';
            meta.colorDepth = `${bitsPerPlane * numPlanes} bit (${numPlanes} пл. × ${bitsPerPlane}b)`;
            meta.compression = encoding === 1 ? 'RLE (Run-Length Encoding)' : 'Без сжатия';
            meta.extra = `PCX v${version}, BytesPerLine: ${bytesPerLine}`;

            if (meta.width <= 0 || meta.height <= 0) {
                meta.status = 'Файл поврежден (некорректная геометрия PCX)';
                meta.isOk = false;
            }
        }

        // ==================== 5. JPG / JPEG ====================
        else if (expectedFormat === 'JPG') {
            meta.compression = 'JPEG (Baseline DCT)';
            meta.dpi = '72 × 72 dpi';
            let dqtTablesCount = 0;
            let sofFound = false;

            let offset = 2;
            while (offset + 4 < bytes.length) {
                if (bytes[offset] !== 0xFF) { offset++; continue; }
                while (offset < bytes.length && bytes[offset] === 0xFF) offset++;
                if (offset >= bytes.length) break;

                const marker = bytes[offset];
                offset++;

                if (marker === 0xD8 || marker === 0xD9 || (marker >= 0xD0 && marker <= 0xD7) || marker === 0x01) {
                    continue;
                }
                if (offset + 2 > bytes.length) break;
                const segLength = view.getUint16(offset, false);
                if (segLength < 2) break;

                // APP0 JFIF (разрешение DPI)
                if (marker === 0xE0 && offset + 14 <= bytes.length) {
                    if (bytes[offset+2] === 0x4A && bytes[offset+3] === 0x46 && bytes[offset+4] === 0x49 && bytes[offset+5] === 0x46) {
                        const units = bytes[offset + 9];
                        const xDens = view.getUint16(offset + 10, false);
                        const yDens = view.getUint16(offset + 12, false);
                        if (units === 1 && xDens > 0) meta.dpi = `${xDens} × ${yDens} dpi`;
                        else if (units === 2 && xDens > 0) meta.dpi = `${Math.round(xDens * 2.54)} × ${Math.round(yDens * 2.54)} dpi`;
                    }
                }

                // DQT (Матрицы квантования - на доп. баллы)
                if (marker === 0xDB) {
                    dqtTablesCount++;
                }

                // SOF0 / SOF1 / SOF2 (Геометрия и каналы)
                if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
                    const precision = bytes[offset + 2];
                    meta.height = view.getUint16(offset + 3, false);
                    meta.width = view.getUint16(offset + 5, false);
                    const components = bytes[offset + 7];
                    meta.colorDepth = `${precision * components} bit (${components} кан. × ${precision}b)`;
                    meta.compression = marker === 0xC2 ? 'JPEG (Progressive DCT)' : 'JPEG (Baseline DCT)';
                    sofFound = true;
                }

                if (marker === 0xDA) break; // Начало сжатых данных SOS
                offset += segLength;
            }

            meta.extra = `Матриц квантования (DQT): ${dqtTablesCount} шт.`;

            // Детекция битого JPG: проверяем маркер EOI (FF D9) в конце файла
            const tailBuf = await file.slice(Math.max(0, file.size - 6), file.size).arrayBuffer();
            const tailBytes = new Uint8Array(tailBuf);
            let hasEOI = false;
            for (let i = 0; i < tailBytes.length - 1; i++) {
                if (tailBytes[i] === 0xFF && tailBytes[i+1] === 0xD9) {
                    hasEOI = true; break;
                }
            }
            if (!hasEOI) {
                meta.status = 'Файл поврежден (отсутствует маркер EOI FF D9)';
                meta.isOk = false;
            } else if (!sofFound || meta.width === 0) {
                meta.status = 'Файл поврежден (не найден фрейм SOF)';
                meta.isOk = false;
            }
        }

        // ==================== 6. TIF / TIFF (Ручной разбор IFD) ====================
        else if (expectedFormat === 'TIF') {
            const isLittleEndian = (bytes[0] === 0x49 && bytes[1] === 0x49);
            const ifdOffset = view.getUint32(4, isLittleEndian);

            if (ifdOffset >= file.size || ifdOffset + 2 > file.size) {
                meta.status = 'Файл поврежден (некорректное смещение IFD)';
                meta.isOk = false;
                return meta;
            }

            // Если IFD лежит дальше первых 64 КБ, догружаем нужный кусок файла
            let ifdView = view;
            let baseShift = 0;
            if (ifdOffset + 1024 > bytes.length) {
                const ifdSlice = await file.slice(ifdOffset, Math.min(file.size, ifdOffset + 8192)).arrayBuffer();
                ifdView = new DataView(ifdSlice);
                baseShift = ifdOffset;
            }

            const numEntries = ifdView.getUint16(ifdOffset - baseShift, isLittleEndian);
            let bpp = 8;
            let samplesPerPixel = 1;
            let compCode = 1;
            let xRes = 72, yRes = 72, resUnit = 2;

            for (let i = 0; i < numEntries; i++) {
                const entryPos = (ifdOffset - baseShift) + 2 + (i * 12);
                if (entryPos + 12 > ifdView.byteLength) break;

                const tag = ifdView.getUint16(entryPos, isLittleEndian);
                const type = ifdView.getUint16(entryPos + 2, isLittleEndian);
                const count = ifdView.getUint32(entryPos + 4, isLittleEndian);

                const readVal = () => {
                    if (type === 3) return ifdView.getUint16(entryPos + 8, isLittleEndian); // SHORT
                    if (type === 4) return ifdView.getUint32(entryPos + 8, isLittleEndian); // LONG
                    return ifdView.getUint16(entryPos + 8, isLittleEndian);
                };

                if (tag === 256) meta.width = readVal(); // ImageWidth
                else if (tag === 257) meta.height = readVal(); // ImageLength
                else if (tag === 258) { // BitsPerSample
                    if (count === 1) bpp = readVal();
                    else {
                        const valOffset = ifdView.getUint32(entryPos + 8, isLittleEndian) - baseShift;
                        if (valOffset >= 0 && valOffset + 2 <= ifdView.byteLength) {
                            bpp = ifdView.getUint16(valOffset, isLittleEndian);
                        }
                    }
                }
                else if (tag === 259) compCode = readVal(); // Compression
                else if (tag === 277) samplesPerPixel = readVal(); // SamplesPerPixel
                else if (tag === 282 || tag === 283) { // XResolution / YResolution (RATIONAL = 2x LONG)
                    const ratOffset = ifdView.getUint32(entryPos + 8, isLittleEndian) - baseShift;
                    if (ratOffset >= 0 && ratOffset + 8 <= ifdView.byteLength) {
                        const num = ifdView.getUint32(ratOffset, isLittleEndian);
                        const den = ifdView.getUint32(ratOffset + 4, isLittleEndian);
                        const val = den > 0 ? Math.round(num / den) : 72;
                        if (tag === 282) xRes = val;
                        else yRes = val;
                    }
                }
                else if (tag === 296) resUnit = readVal(); // ResolutionUnit (2=inch, 3=cm)
            }

            const tiffCompMap = { 1: 'Uncompressed', 2: 'CCITT 1D', 5: 'LZW', 6: 'Old JPEG', 7: 'JPEG', 8: 'Deflate (ZIP)', 32773: 'PackBits RLE' };
            meta.compression = tiffCompMap[compCode] || `TIFF Код ${compCode}`;
            meta.colorDepth = `${bpp * samplesPerPixel} bit (${samplesPerPixel} кан. × ${bpp}b)`;
            if (resUnit === 3) { xRes = Math.round(xRes * 2.54); yRes = Math.round(yRes * 2.54); }
            meta.dpi = `${xRes} × ${yRes} dpi`;
            meta.extra = `Порядок байт: ${isLittleEndian ? 'Little-Endian (II)' : 'Big-Endian (MM)'}, Тегов в IFD: ${numEntries}`;

            if (meta.width === 0 || meta.height === 0) {
                meta.status = 'Файл поврежден (IFD не содержит геометрии)';
                meta.isOk = false;
            }
        }

    } catch (err) {
        meta.status = 'Файл поврежден (ошибка чтения структуры)';
        meta.isOk = false;
    }

    return meta;
}