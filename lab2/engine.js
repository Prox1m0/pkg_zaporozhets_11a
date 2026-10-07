document.getElementById('folderInput').addEventListener('change', (e) => {
    const allowedExts = /\.(jpg|jpeg|png|bmp|gif|tif|tiff|pcx)$/i;
    const files = Array.from(e.target.files).filter(f => allowedExts.test(f.name));
    
    if (files.length === 0) return alert('Графические файлы не найдены!');

    const tbody = document.getElementById('tableBody');
    tbody.innerHTML = '';
    document.getElementById('progress-wrapper').style.display = 'block';
    
    const statTotal = document.getElementById('statTotal');
    const statSuccess = document.getElementById('statSuccess');
    const statErrors = document.getElementById('statErrors');
    const statTime = document.getElementById('statTime');
    const statSpeed = document.getElementById('statSpeed');
    const progressBar = document.getElementById('progressBar');

    const totalFiles = files.length;
    statTotal.innerText = totalFiles;
    
    let processedCount = 0;
    let successCount = 0;
    let errorCount = 0;
    const startTime = performance.now();
    
    const numWorkers = navigator.hardwareConcurrency || 4;
    const chunkSize = Math.ceil(totalFiles / numWorkers);
    
    let uiQueue = [];
    let isDrawing = false;

    function renderQueue() {
        if (uiQueue.length === 0) {
            isDrawing = false;
            return;
        }
        
        const fragment = document.createDocumentFragment();
        const batch = uiQueue.splice(0, 150); 
        
        batch.forEach(data => {
            if (data.status.startsWith('OK')) successCount++;
            else errorCount++;

            const tr = document.createElement('tr');
            const badgeClass = data.status.startsWith('OK') ? 'badge ok' : 'badge error';
            tr.innerHTML = `
                <td style="font-weight: 500;">${data.name}</td>
                <td style="font-family: monospace;">${data.width}x${data.height}</td>
                <td>${data.dpi !== '-' ? data.dpi + ' dpi' : '-'}</td>
                <td>${data.colorDepth}</td>
                <td>${data.compression}</td>
                <td><span class="${badgeClass}">${data.status}</span></td>
            `;
            fragment.appendChild(tr);
        });
        
        tbody.appendChild(fragment);

        const elapsedSec = (performance.now() - startTime) / 1000;
        const speed = Math.round(processedCount / elapsedSec) || 0;
        
        statSuccess.innerText = successCount;
        statErrors.innerText = errorCount;
        statTime.innerText = elapsedSec.toFixed(2) + ' с';
        statSpeed.innerText = speed + ' ф/сек';
        progressBar.style.width = ((processedCount / totalFiles) * 100) + '%';

        if (processedCount === totalFiles && uiQueue.length === 0) {
            progressBar.style.backgroundColor = '#166534';
        } else {
            requestAnimationFrame(renderQueue);
        }
    }

    for (let i = 0; i < numWorkers; i++) {
        const workerFiles = files.slice(i * chunkSize, (i + 1) * chunkSize);
        if (workerFiles.length === 0) continue;

        const worker = new Worker('worker.js');
        worker.onmessage = (event) => {
            uiQueue.push(event.data);
            processedCount++;
            if (!isDrawing) {
                isDrawing = true;
                requestAnimationFrame(renderQueue);
            }
        };
        worker.postMessage(workerFiles);
    }
});