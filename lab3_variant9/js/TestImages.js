/**
 * Генератор базы тестовых изображений для Лабораторной работы №3 (Вариант 9).
 * Каждое изображение специально сконструировано так, чтобы наглядно доказать
 * преимущества одного метода над другим (20 баллов по критериям оценки).
 */

class TestImages {
    /**
     * Генерирует выбранную сцену на переданном контексте Canvas 2D.
     */
    static renderPreset(ctx, width, height, presetName) {
        ctx.clearRect(0, 0, width, height);

        if (presetName === 'shadow_doc') {
            TestImages.drawShadowDocument(ctx, width, height);
        } else if (presetName === 'bimodal_shapes') {
            TestImages.drawBimodalShapes(ctx, width, height);
        } else if (presetName === 'points_lines') {
            TestImages.drawPointsAndLines(ctx, width, height);
        } else {
            TestImages.drawGradientsAndRings(ctx, width, height);
        }
    }

    /**
     * Пресет 1: Текстовый документ с сильной диагональной тенью (неравномерным освещением).
     * На нем Глобальная пороговая обработка (Оцу / ISODATA) теряет половину текста в тени,
     * а Адаптивная обработка (Лекционный метод / Саувола через SAT) идеально выделяет все строки!
     */
    static drawShadowDocument(ctx, w, h) {
        const imgData = ctx.createImageData(w, h);
        const data = imgData.data;

        // Создаем неравномерный градиент освещения от 240 (слева сверху) до 55 (справа снизу)
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const illumination = 235 - 175 * ((0.65 * x / w) + (0.35 * y / h));
                const noise = (Math.random() - 0.5) * 8;
                const val = Math.max(0, Math.min(255, illumination + noise));
                const p = (y * w + x) * 4;
                data[p] = data[p + 1] = data[p + 2] = val;
                data[p + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);

        // Рисуем печатный текст и таблицы с яркостью, зависящей от локального освещения
        ctx.font = "bold 20px Georgia, serif";
        ctx.fillStyle = "rgba(20, 20, 20, 0.72)";
        ctx.fillText("ЛАБОРАТОРНЫЙ ДОКУМЕНТ №9", 28, 42);

        ctx.font = "14px Georgia, serif";
        const lines = [
            "Глобальный порог Оцу не справляется при сильном градиенте освещения,",
            "так как правая часть страницы темнее, чем буквы в левой части.",
            "Адаптивная пороговая обработка (через Интегральное изображение SAT)",
            "вычисляет локальное среднее за O(1) и сохраняет четкость всех символов!",
            "Формула Сауволы: T(x,y) = m(x,y) * [ 1 + k * (s(x,y)/R - 1) ]",
            "Проверка мелких деталей: 0123456789  (x + y)^2 = x^2 + 2xy + y^2"
        ];
        lines.forEach((line, idx) => {
            ctx.fillText(line, 28, 82 + idx * 34);
        });

        // Штрих-код и печать в затененном углу
        for (let i = 0; i < 32; i++) {
            ctx.fillRect(40 + i * 7, 300, (i % 3 === 0) ? 4 : 2, 55);
        }
        ctx.strokeStyle = "rgba(25, 25, 25, 0.68)";
        ctx.lineWidth = 3;
        ctx.strokeRect(330, 290, 145, 65);
        ctx.font = "bold 15px sans-serif";
        ctx.fillText("ШТАМП В ТЕНИ", 345, 328);
    }

    /**
     * Пресет 2: Контрастные геометрические объекты с гауссовым шумом (бимодальная гистограмма).
     * Идеально подходит для демонстрации работы глобального метода Оцу и ISODATA.
     */
    static drawBimodalShapes(ctx, w, h) {
        ctx.fillStyle = "#262626";
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = "#dcdcdc";
        ctx.beginPath();
        ctx.arc(140, 140, 80, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#262626";
        ctx.beginPath();
        ctx.arc(140, 140, 32, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#e2e2e2";
        ctx.fillRect(270, 65, 190, 130);

        ctx.fillStyle = "#bababa";
        ctx.beginPath();
        ctx.moveTo(90, 340);
        ctx.lineTo(250, 240);
        ctx.lineTo(420, 340);
        ctx.closePath();
        ctx.fill();

        // Добавляем легкий шум для реалистичной бимодальной гистограммы
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
            const n = (Math.random() - 0.5) * 32;
            const v = Math.max(0, Math.min(255, d[i] + n));
            d[i] = d[i + 1] = d[i + 2] = v;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    /**
     * Пресет 3: Специальная тест-мишень с одиночными изолированными точками (1 пиксель)
     * и тонкими линиями под углами 0°, 45°, 90° и -45° (135°) для раздела Сегментации.
     */
    static drawPointsAndLines(ctx, w, h) {
        ctx.fillStyle = "#141414";
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = "#f0f0f0";
        ctx.lineWidth = 1.5;

        // Горизонтальные линии (0°)
        for (let y = 40; y <= 120; y += 25) {
            ctx.beginPath();
            ctx.moveTo(30, y);
            ctx.lineTo(220, y);
            ctx.stroke();
        }

        // Вертикальные линии (90°)
        for (let x = 270; x <= 460; x += 30) {
            ctx.beginPath();
            ctx.moveTo(x, 30);
            ctx.lineTo(x, 150);
            ctx.stroke();
        }

        // Диагональные линии +45° и -45°
        for (let offset = 0; offset < 120; offset += 30) {
            ctx.beginPath();
            ctx.moveTo(40 + offset, 330);
            ctx.lineTo(150 + offset, 220);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(290 + offset, 220);
            ctx.lineTo(400 + offset, 330);
            ctx.stroke();
        }

        // Записываем яркие изолированные одиночные пиксели (точки) напрямую в буфер
        const imgData = ctx.getImageData(0, 0, w, h);
        const d = imgData.data;
        const pointCoords = [
            [80, 175], [130, 185], [180, 170], [230, 190], [280, 175],
            [330, 190], [380, 175], [430, 185], [110, 200], [350, 205]
        ];
        for (const [px, py] of pointCoords) {
            const idx = (py * w + px) * 4;
            d[idx] = d[idx + 1] = d[idx + 2] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
    }

    /**
     * Пресет 4: Концентрические кольца и плавные перепады яркости со всеми углами [0..360°].
     * Наглядно демонстрирует цветовую карту углов градиента Собеля и тонкие границы Кэнни.
     */
    static drawGradientsAndRings(ctx, w, h) {
        const imgData = ctx.createImageData(w, h);
        const d = imgData.data;
        const cx = w * 0.36;
        const cy = h * 0.5;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const dist = Math.hypot(x - cx, y - cy);
                let val = 30;
                if (dist < 145) {
                    val = Math.sin(dist * 0.15) > 0 ? 225 : 45;
                } else if (x > w * 0.68) {
                    val = ((y >> 5) & 1) ? 210 : 60;
                }
                const p = (y * w + x) * 4;
                d[p] = d[p + 1] = d[p + 2] = val;
                d[p + 3] = 255;
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }
}

window.TestImages = TestImages;
