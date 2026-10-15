// Core/Business Logic Layer: Оркестратор пула Web Workers, состояния, фильтрации и виртуальной пагинации

const ALLOWED_EXTS = /\.(jpg|jpeg|png|bmp|gif|tif|tiff|pcx)$/i;

let allResults = [];
let filteredResults = [];
let fileMap = new Map(); // Хранит ссылки на File для рендеринга превью в модальном окне
let activeWorkers = [];
let isScanning = false;
let currentPreviewUrl = null;

// Параметры отображения таблицы
let currentPage = 1;
let pageSize = 100;
let sortField = null;
let sortAsc = true;

// DOM элементы
const folderInput = document.getElementById('folderInput');
const filesInput = document.getElementById('filesInput');
const stopBtn = document.getElementById('stopBtn');
const clearBtn = document.getElementById('clearBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');

const statProcessed = document.getElementById('statProcessed');
const statTotal = document.getElementById('statTotal');
const statSuccess = document.getElementById('statSuccess');
const statErrors = document.getElementById('statErrors');
const statTime = document.getElementById('statTime');
const statSpeed = document.getElementById('statSpeed');
const statStateText = document.getElementById('statStateText');
const statThreadsBadge = document.getElementById('statThreadsBadge');

const progressWrapper = document.getElementById('progressWrapper');
const progressBar = document.getElementById('progressBar');
const progressStatus = document.getElementById('progressStatus');
const progressPercent = document.getElementById('progressPercent');

const searchInput = document.getElementById('searchInput');
const statusFilter = document.getElementById('statusFilter');
const formatFilter = document.getElementById('formatFilter');
const pageSizeSelect = document.getElementById('pageSizeSelect');

const tableBody = document.getElementById('tableBody');
const paginationInfo = document.getElementById('paginationInfo');
const pageIndicator = document.getElementById('pageIndicator');
const prevPageBtn = document.getElementById('prevPageBtn');
const nextPageBtn = document.getElementById('nextPageBtn');

const numThreads = navigator.hardwareConcurrency || 4;
statThreadsBadge.textContent = `Потоков: ${numThreads}`;

// Слушатели загрузки
folderInput.addEventListener('change', (e) => startScan(e.target.files));
filesInput.addEventListener('change', (e) => startScan(e.target.files));

// Drag-and-Drop поддержка на всю страницу
document.body.addEventListener('dragover', (e) => { e.preventDefault(); });
document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        startScan(e.dataTransfer.files);
    }
});

// Кнопка ОСТАНОВИТЬ парсинг
stopBtn.addEventListener('click', () => {
    if (!isScanning) return;
    terminateAllWorkers();
    isScanning = false;
    stopBtn.disabled = true;
    statStateText.textContent = 'Остановлено пользователем';
    progressStatus.textContent = 'Парсинг принудительно остановлен';
    progressBar.style.backgroundColor = '#F59E0B';
    applyFiltersAndRender();
});

// Кнопка ОЧИСТИТЬ
clearBtn.addEventListener('click', () => {
    terminateAllWorkers();
    isScanning = false;
    allResults = [];
    filteredResults = [];
    fileMap.clear();
    folderInput.value = '';
    filesInput.value = '';

    statProcessed.textContent = '0';
    statTotal.textContent = '0';
    statSuccess.textContent = '0';
    statErrors.textContent = '0';
    statTime.textContent = '0.00 с';
    statSpeed.textContent = '0';
    statStateText.textContent = 'Ожидание выбора директории...';

    progressWrapper.style.display = 'none';
    progressBar.style.width = '0%';
    stopBtn.disabled = true;
    clearBtn.disabled = true;
    exportCsvBtn.disabled = true;

    renderEmptyState();
});

function terminateAllWorkers() {
    activeWorkers.forEach(w => w.terminate());
    activeWorkers = [];
}

function startScan(fileList) {
    const files = Array.from(fileList).filter(f => ALLOWED_EXTS.test(f.name));
    if (files.length === 0) {
        alert('В выбранной директории не найдено поддерживаемых графических файлов (JPG, PNG, BMP, GIF, TIF, PCX).');
        return;
    }

    terminateAllWorkers();
    allResults = [];
    filteredResults = [];
    fileMap.clear();
    currentPage = 1;
    isScanning = true;

    const totalFiles = files.length;
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const startTime = performance.now();

    statTotal.textContent = totalFiles;
    statProcessed.textContent = '0';
    statSuccess.textContent = '0';
    statErrors.textContent = '0';
    statStateText.textContent = 'Активное многопоточное чтение...';

    progressWrapper.style.display = 'block';
    progressBar.style.width = '0%';
    progressBar.style.backgroundColor = '#2563EB';
    progressStatus.textContent = 'Чтение бинарных заголовков...';

    stopBtn.disabled = false;
    clearBtn.disabled = false;
    exportCsvBtn.disabled = false;

    // Сохраняем ссылки для инспектора
    files.forEach((f, idx) => fileMap.set(idx, f));

    // Распределяем файлы по воркерам
    const workersCount = Math.min(numThreads, totalFiles);
    const chunkSize = Math.ceil(totalFiles / workersCount);
    let uiUpdateScheduled = false;

    function updateTelemetryAndUI() {
        uiUpdateScheduled = false;
        const elapsedSec = Math.max((performance.now() - startTime) / 1000, 0.001);
        const speed = Math.round(processedCount / elapsedSec);
        const pct = ((processedCount / totalFiles) * 100).toFixed(1);

        statProcessed.textContent = processedCount;
        statSuccess.textContent = successCount;
        statErrors.textContent = errorCount;
        statTime.textContent = elapsedSec.toFixed(2) + ' с';
        statSpeed.textContent = speed;

        progressBar.style.width = pct + '%';
        progressPercent.textContent = pct + '%';

        // Обновляем таблицу во время загрузки
        applyFiltersAndRender(false);

        if (processedCount === totalFiles) {
            isScanning = false;
            stopBtn.disabled = true;
            statStateText.textContent = 'Сканирование успешно завершено';
            progressStatus.textContent = 'Все заголовки обработаны';
            progressBar.style.backgroundColor = '#166534';
            terminateAllWorkers();
            applyFiltersAndRender(false);
        }
    }

    for (let i = 0; i < workersCount; i++) {
        const startIdx = i * chunkSize;
        const slice = files.slice(startIdx, startIdx + chunkSize).map((file, localIdx) => ({
            id: startIdx + localIdx,
            file: file
        }));
        if (slice.length === 0) continue;

        const worker = new Worker('worker.js');
        activeWorkers.push(worker);

        worker.onmessage = (event) => {
            const batchResults = event.data; // Воркер присылает пачками для скорости
            for (let k = 0; k < batchResults.length; k++) {
                const meta = batchResults[k];
                allResults.push(meta);
                processedCount++;
                if (meta.isOk) successCount++;
                else errorCount++;
            }

            if (!uiUpdateScheduled) {
                uiUpdateScheduled = true;
                requestAnimationFrame(updateTelemetryAndUI);
            }
        };

        worker.postMessage(slice);
    }
}

// Фильтрация, поиск и сортировка
searchInput.addEventListener('input', () => { currentPage = 1; applyFiltersAndRender(); });
statusFilter.addEventListener('change', () => { currentPage = 1; applyFiltersAndRender(); });
formatFilter.addEventListener('change', () => { currentPage = 1; applyFiltersAndRender(); });
pageSizeSelect.addEventListener('change', () => {
    const val = pageSizeSelect.value;
    pageSize = val === 'all' ? Infinity : parseInt(val, 10);
    currentPage = 1;
    applyFiltersAndRender();
});

// Сортировка по клику на колонку
document.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
        const field = th.getAttribute('data-sort');
        if (sortField === field) sortAsc = !sortAsc;
        else { sortField = field; sortAsc = true; }
        applyFiltersAndRender();
    });
});

function applyFiltersAndRender(resetPage = false) {
    if (resetPage) currentPage = 1;

    const query = searchInput.value.trim().toLowerCase();
    const stFilter = statusFilter.value;
    const fmtFilter = formatFilter.value;

    filteredResults = allResults.filter(item => {
        if (query && !item.name.toLowerCase().includes(query)) return false;
        if (stFilter === 'ok' && !item.isOk) return false;
        if (stFilter === 'error' && item.isOk) return false;
        if (fmtFilter !== 'all' && item.format !== fmtFilter) return false;
        return true;
    });

    if (sortField) {
        filteredResults.sort((a, b) => {
            let vA, vB;
            if (sortField === 'name') {
                vA = a.name.toLowerCase(); vB = b.name.toLowerCase();
            } else if (sortField === 'pixels') {
                vA = (a.width || 0) * (a.height || 0);
                vB = (b.width || 0) * (b.height || 0);
            } else if (sortField === 'depth') {
                vA = parseInt(a.colorDepth) || 0;
                vB = parseInt(b.colorDepth) || 0;
            }
            if (vA < vB) return sortAsc ? -1 : 1;
            if (vA > vB) return sortAsc ? 1 : -1;
            return 0;
        });
    }

    renderTablePage();
}

function renderEmptyState() {
    tableBody.innerHTML = `
        <tr class="empty-row">
            <td colspan="9">
                <div class="empty-state">
                    <p>Нет загруженных данных. Нажмите <strong>«Выбрать папку»</strong> или перетащите файлы сюда.</p>
                    <small>Поддерживаются: JPG, GIF, TIF, BMP, PNG, PCX (до 100 000 файлов)</small>
                </div>
            </td>
        </tr>`;
    paginationInfo.textContent = 'Показано 0 из 0 записей';
    pageIndicator.textContent = 'Стр. 1 из 1';
    prevPageBtn.disabled = true;
    nextPageBtn.disabled = true;
}

function renderTablePage() {
    const total = filteredResults.length;
    if (total === 0) {
        tableBody.innerHTML = `
            <tr class="empty-row">
                <td colspan="9"><div class="empty-state"><p>По вашему фильтру ничего не найдено.</p></div></td>
            </tr>`;
        paginationInfo.textContent = 'Показано 0 из 0 записей';
        pageIndicator.textContent = 'Стр. 1 из 1';
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        return;
    }

    const totalPages = pageSize === Infinity ? 1 : Math.ceil(total / pageSize);
    if (currentPage > totalPages) currentPage = totalPages;

    const startIdx = pageSize === Infinity ? 0 : (currentPage - 1) * pageSize;
    const endIdx = pageSize === Infinity ? total : Math.min(startIdx + pageSize, total);
    const pageItems = filteredResults.slice(startIdx, endIdx);

    const fragment = document.createDocumentFragment();
    for (let i = 0; i < pageItems.length; i++) {
        const data = pageItems[i];
        const tr = document.createElement('tr');
        const badgeClass = data.isOk ? 'badge ok' : 'badge error';
        const dimText = (data.width && data.height) ? `${data.width} ×${data.height}` : '—';

        tr.innerHTML = `
            <td class="mono text-muted">${startIdx + i + 1}</td>
            <td style="font-weight: 600;">${escapeHtml(data.name)}</td>
            <td><span class="fmt-tag">${data.format}</span></td>
            <td class="mono">${dimText}</td>
            <td>${data.dpi}</td>
            <td>${data.colorDepth}</td>
            <td>${data.compression}</td>
            <td style="color: #475569; font-size: 12.5px;">${escapeHtml(data.extra || '—')}</td>
            <td><span class="${badgeClass}">${escapeHtml(data.status)}</span></td>
        `;
        tr.addEventListener('click', () => openInspectorModal(data));
        fragment.appendChild(tr);
    }

    tableBody.innerHTML = '';
    tableBody.appendChild(fragment);

    paginationInfo.textContent = `Показаны строки ${startIdx + 1}–${endIdx} из ${total}`;
    pageIndicator.textContent = `Стр. ${currentPage} из ${totalPages}`;
    prevPageBtn.disabled = currentPage <= 1;
    nextPageBtn.disabled = currentPage >= totalPages;
}

prevPageBtn.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderTablePage(); }
});
nextPageBtn.addEventListener('click', () => {
    const totalPages = pageSize === Infinity ? 1 : Math.ceil(filteredResults.length / pageSize);
    if (currentPage < totalPages) { currentPage++; renderTablePage(); }
});

// Инспектор файла (Модальное окно + разрешенный рендер картинки)
const inspectorModal = document.getElementById('inspectorModal');
const closeModalBtn = document.getElementById('closeModalBtn');
const modalTitle = document.getElementById('modalTitle');
const modalSubtitle = document.getElementById('modalSubtitle');
const modalImage = document.getElementById('modalImage');
const modalNoPreview = document.getElementById('modalNoPreview');
const modalHexDump = document.getElementById('modalHexDump');
const modalDetailsTable = document.querySelector('#modalDetailsTable tbody');

function openInspectorModal(data) {
    modalTitle.textContent = data.name;
    modalSubtitle.textContent = `Размер файла: ${formatBytes(data.fileSize)} \vert{} Статус: ${data.status}`;
    modalHexDump.textContent = data.hexHead || 'Нет данных';

    if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
        currentPreviewUrl = null;
    }

    const fileObj = fileMap.get(data.id);
    if (fileObj && data.isOk && ['JPG', 'PNG', 'BMP', 'GIF'].includes(data.format)) {
        currentPreviewUrl = URL.createObjectURL(fileObj);
        modalImage.src = currentPreviewUrl;
        modalImage.style.display = 'block';
        modalNoPreview.style.display = 'none';
    } else {
        modalImage.style.display = 'none';
        modalNoPreview.style.display = 'block';
        modalNoPreview.textContent = data.isOk
            ? `Нативный браузерный рендер для ${data.format} не поддерживается, но метаданные успешно извлечены вручную.`
            : `Файл поврежден или имеет подмененное расширение (${data.status}).`;
    }

    const rows = [
        ['Имя файла', data.name],
        ['Определенный формат', data.format],
        ['Геометрия (Ширина × Высота)', `${data.width} ×${data.height} px`],
        ['Разрешение (X × Y)', data.dpi],
        ['Глубина цвета', data.colorDepth],
        ['Алгоритм сжатия', data.compression],
        ['Дополнительные структуры', data.extra || 'Стандартная структура'],
        ['Статус целостности', data.status]
    ];

    modalDetailsTable.innerHTML = rows.map(([k, v]) => `
        <tr><th>${escapeHtml(k)}</th><td>${escapeHtml(String(v))}</td></tr>
    `).join('');

    inspectorModal.style.display = 'flex';
}

closeModalBtn.addEventListener('click', () => { inspectorModal.style.display = 'none'; });
inspectorModal.addEventListener('click', (e) => {
    if (e.target === inspectorModal) inspectorModal.style.display = 'none';
});

// Экспорт в CSV
exportCsvBtn.addEventListener('click', () => {
    if (filteredResults.length === 0) return;
    const headers = ['Имя файла', 'Формат', 'Ширина', 'Высота', 'DPI', 'Глубина цвета', 'Сжатие', 'Дополнительно', 'Статус'];
    const csvRows = [headers.join(';')];

    for (const r of filteredResults) {
        const row = [
            `"${r.name.replace(/"/g, '""')}"`,
            r.format,
            r.width,
            r.height,
            `"${r.dpi}"`,
            `"${r.colorDepth}"`,
            `"${r.compression}"`,
            `"${(r.extra || '').replace(/"/g, '""')}"`,
            `"${r.status}"`
        ];
        csvRows.push(row.join(';'));
    }

    const blob = new Blob(["\uFEFF" + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `image_metadata_report_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
});

function formatBytes(bytes) {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
}