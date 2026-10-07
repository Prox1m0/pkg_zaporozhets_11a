self.onmessage = async function(e) {
    const files = e.data;
    
    for (const file of files) {
        let meta = { name: file.name, width: 0, height: 0, dpi: '-', colorDepth: '-', compression: '-', status: 'OK' };
        
        try {
            const headerBuffer = await file.slice(0, 4096).arrayBuffer();
            const view = new DataView(headerBuffer);
            const bytes = new Uint8Array(headerBuffer);
            const name = file.name.toLowerCase();

            if (name.endsWith('.png')) {
                if (bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4E || bytes[3] !== 0x47) {
                    meta.status = 'Подмена расширения (не PNG)';
                } else {
                    meta.width = view.getUint32(16, false);
                    meta.height = view.getUint32(20, false);
                    meta.colorDepth = view.getUint8(24) + ' bit';
                    meta.compression = 'Deflate';

                    // Парсинг DPI из чанка pHYs
                    let offset = 8;
                    while (offset < bytes.length - 8) {
                        const length = view.getUint32(offset, false);
                        const type = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]);
                        if (type === 'pHYs' && length >= 9) {
                            const ppuX = view.getUint32(offset + 8, false);
                            if (bytes[offset + 16] === 1) meta.dpi = Math.round(ppuX * 0.0254);
                            break;
                        }
                        if (type === 'IDAT' || type === 'IEND') break;
                        offset += 12 + length;
                    }

                    const tailBuffer = await file.slice(file.size - 12, file.size).arrayBuffer();
                    const tailBytes = new Uint8Array(tailBuffer);
                    const hasIEND = tailBytes[4] === 0x49 && tailBytes[5] === 0x45 && tailBytes[6] === 0x4E && tailBytes[7] === 0x44;
                    if (!hasIEND) meta.status = 'Поврежден (нет IEND)';
                }
            } 
            else if (name.endsWith('.bmp')) {
                if (bytes[0] !== 0x42 || bytes[1] !== 0x4D) {
                    meta.status = 'Подмена расширения (не BMP)';
                } else {
                    meta.width = view.getInt32(18, true);
                    meta.height = Math.abs(view.getInt32(22, true));
                    meta.colorDepth = view.getUint16(28, true) + ' bit';
                    
                    const comp = view.getUint32(30, true);
                    meta.compression = comp === 0 ? 'BI_RGB (Нет)' : comp === 1 ? 'BI_RLE8' : comp === 2 ? 'BI_RLE4' : 'Сжато';
                    
                    const xPels = view.getInt32(38, true); 
                    if (xPels > 0) meta.dpi = Math.round(xPels * 0.0254);
                }
            }
            else if (name.endsWith('.gif')) {
                if (bytes[0] !== 0x47 || bytes[1] !== 0x49 || bytes[2] !== 0x46) {
                    meta.status = 'Подмена расширения (не GIF)';
                } else {
                    meta.width = view.getUint16(6, true);
                    meta.height = view.getUint16(8, true);
                    meta.colorDepth = ((view.getUint8(10) & 7) + 1) + ' bit';
                    meta.compression = 'LZW';
                }
            }
            else if (name.endsWith('.pcx')) {
                if (bytes[0] !== 0x0A) {
                    meta.status = 'Подмена расширения (не PCX)';
                } else {
                    meta.width = view.getUint16(8, true) - view.getUint16(4, true) + 1;
                    meta.height = view.getUint16(10, true) - view.getUint16(6, true) + 1;
                    meta.colorDepth = view.getUint8(3) + ' bit';
                    meta.compression = bytes[2] === 1 ? 'RLE' : 'Нет';
                }
            }
            else if (name.endsWith('.jpg') || name.endsWith('.jpeg')) {
                if (bytes[0] !== 0xFF || bytes[1] !== 0xD8) {
                    meta.status = 'Подмена расширения (не JPG)';
                } else {
                    meta.compression = 'JPEG';
                    meta.colorDepth = '24 bit';
                    
                    // Чтение DPI (JFIF APP0)
                    if (bytes[2] === 0xFF && bytes[3] === 0xE0) {
                        const units = bytes[13];
                        const xDensity = view.getUint16(14, false);
                        if (units === 1) meta.dpi = xDensity;
                        else if (units === 2) meta.dpi = Math.round(xDensity * 2.54);
                    }

                    // Чтение размеров из SOF
                    let offset = 2;
                    while (offset < bytes.length - 8) {
                        if (bytes[offset] === 0xFF && (bytes[offset+1] === 0xC0 || bytes[offset+1] === 0xC2)) {
                            meta.height = view.getUint16(offset + 5, false);
                            meta.width = view.getUint16(offset + 7, false);
                            break;
                        }
                        offset++;
                    }

                    const tailBuffer = await file.slice(file.size - 2, file.size).arrayBuffer();
                    const tailBytes = new Uint8Array(tailBuffer);
                    if (tailBytes[0] !== 0xFF || tailBytes[1] !== 0xD9) {
                        meta.status = 'Поврежден (нет EOI)';
                    }
                }
            }
            else if (name.endsWith('.tif') || name.endsWith('.tiff')) {
                if ((bytes[0] === 0x49 && bytes[1] === 0x49) || (bytes[0] === 0x4D && bytes[1] === 0x4D)) {
                    meta.compression = 'LZW/ZIP';
                    meta.status = 'OK (TIF)';
                } else {
                    meta.status = 'Подмена расширения (не TIF)';
                }
            }
        } catch (err) {
            meta.status = 'Ошибка чтения файла';
        }

        self.postMessage(meta);
    }
};