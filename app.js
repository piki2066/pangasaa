if (window.lucide) {
  lucide.createIcons();
}

// Elements
const loadingState = document.getElementById('loading-state');
const dashboardView = document.getElementById('dashboard-view');
const welcomeView = document.getElementById('welcome-view');
const appHeader = document.getElementById('app-header');
const btnStart = document.getElementById('btn-start');
const searchInput = document.getElementById('search-input');
const provinceFilter = document.getElementById('province-filter');
const resultsList = document.getElementById('results-list');
const statModels = document.getElementById('stat-models');
const statStock = document.getElementById('stat-stock');
const noResults = document.getElementById('no-results');

let inventoryData = [];
let isDataLoaded = false;
let hasStarted = false;
// Dynamic sizes columns parsed from Excel structure
let sizeColumns = ['0M', '3M', '6M', '9M', '12M', '18M', '24M', 'TALLA8', 'TALLA9', 'TALLA10'];

// Initialize App
window.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('data.xlsx');
        if (!response.ok) throw new Error("Fallo al descargar data.xlsx");
        
        const arrayBuffer = await response.arrayBuffer();
        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
        
        processData(jsonData);
        
    } catch (err) {
        console.error("Error cargando Excel:", err);
        loadingState.innerHTML = `
      <p style="color:white; text-align:center; padding: 1rem;">
        Error cargando los datos.<br>
        Revisa conexión, librerías externas y archivo data.xlsx.
      </p>`;
    }
});

// Process
function processData(rawData) {
    let validRecords = [];
    let provincesSet = new Set();
    
    // Variables for holding merged-cell values
    let currentModel = '';
    let currentDesc = '';
    let currentSerie = '';
    let currentColor = '';

    rawData.forEach((row, index) => {
        // Skip header substrings if they show up in data
        if (row['0M'] === '0M' || row['0M'] === '0 M') return;
        
        // Due to Excel merged cells, the model name might only appear in the first row. Track the last seen values.
        if (row['Modelo'] !== null && row['Modelo'] !== undefined && String(row['Modelo']).trim() !== '') {
            currentModel = String(row['Modelo']).trim();
        }
        if (row['Desc. Modelo'] !== null && row['Desc. Modelo'] !== undefined) {
            currentDesc = String(row['Desc. Modelo']).trim();
        }
        if (row['Color'] !== null && row['Color'] !== undefined) {
            currentColor = String(row['Color']).trim();
        }

        if (!currentModel) return; // if completely blank
        
        let clientName = row['Nombre comercial cliente'] || row['Razón social cliente'] || 'Desconocido';
        let localidad = row['Localidad cliente'] || '';
        let provincia = row['Provincia'] || '';
        
        if (provincia && provincia !== '0' && provincia !== '#N/A') {
            provincesSet.add(provincia.trim());
        }

        let sizesInStock = [];
        let rowTotalStock = 0;

        sizeColumns.forEach(size => {
            let val = row[size];
            // Accept numbers parsed properly
            if (val !== null && val !== undefined && !isNaN(val)) {
                let qty = parseInt(val, 10);
                if (qty > 0) {
                    sizesInStock.push({ sizeName: size, qty: qty });
                    rowTotalStock += qty;
                }
            }
        });

        // Skip rows that have literally 0 stock for everything (unless we want to track clients with no stock, but user wants to "see stock")
        if (rowTotalStock === 0) return;

        // Diacritic removal helper
        const normalize = str => str ? String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
        
        // Comprehensive highly functional search string
        let searchString = normalize(`${currentModel} ${currentDesc} ${currentColor} ${clientName} ${localidad} ${provincia}`);

        validRecords.push({
            id: index,
            modelo: currentModel,
            desc: currentDesc,
            color: currentColor,
            clientName,
            localidad,
            provincia: provincia.trim(),
            sizesInStock,
            totalStock: rowTotalStock,
            searchString
        });
    });

    inventoryData = validRecords;
    
    // Populate Province Dropdown
    const sortedProvinces = Array.from(provincesSet).sort();
    sortedProvinces.forEach(prov => {
        const option = document.createElement('option');
        option.value = prov;
        option.textContent = prov;
        provinceFilter.appendChild(option);
    });

    isDataLoaded = true;
    
    if (hasStarted) {
        showDashboard();
    }
}

btnStart.addEventListener('click', () => {
    hasStarted = true;
    welcomeView.classList.remove('active');
    welcomeView.classList.add('hidden');
    appHeader.classList.remove('hidden');
    
    if (isDataLoaded) {
        showDashboard();
    } else {
        loadingState.classList.remove('hidden');
    }
});

function showDashboard() {
    loadingState.classList.add('hidden');
    dashboardView.classList.remove('hidden');
    dashboardView.classList.add('active');
    
    statModels.textContent = new Set(inventoryData.map(r => r.modelo)).size;
    renderResults();
}

// Search & Filter Logic
searchInput.addEventListener('input', renderResults);
provinceFilter.addEventListener('change', renderResults);

function renderResults() {
    resultsList.innerHTML = '';
    const query = searchInput.value;
    const selectedProv = provinceFilter.value;

    const normalize = str => str ? str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : '';
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    
    let filtered = inventoryData;
    
    // 1. Filter by Province First
    if (selectedProv) {
        filtered = filtered.filter(item => item.provincia === selectedProv);
    }

    // 2. Filter by Search Query next (functional robust search)
    if (terms.length > 0) {
        filtered = filtered.filter(item => {
            // Every typed word must match EXACTLY somewhere in the search string
            return terms.every(t => item.searchString.includes(t));
        });
    }

    statStock.textContent = filtered.reduce((acc, curr) => acc + curr.totalStock, 0);

    if (filtered.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');

    const itemsToRender = filtered.slice(0, 150); // limit to avoid lag
    const fragment = document.createDocumentFragment();

    itemsToRender.forEach(item => {
        const card = document.createElement('div');
        card.className = 'stock-card glass-card';
        
        let sizesHtml = item.sizesInStock.map(s => `
            <div class="size-badge ${s.qty > 5 ? 'high-stock' : ''}">
                <span class="size-name">${s.sizeName}</span>
                <span class="size-qty">${s.qty}</span>
            </div>
        `).join('');

        let locationSub = item.localidad && item.provincia ? `${item.localidad}, ${item.provincia}` : (item.localidad || item.provincia);

        card.innerHTML = `
            <div class="card-main">
                <span class="model-id">Mod: ${item.modelo}</span>
                <span class="model-desc">${item.desc || 'Sin descripción'}</span>
                ${item.color ? `<span class="model-color"><i data-lucide="palette" style="width:14px;height:14px;"></i> ${item.color}</span>` : ''}
            </div>
            <div class="card-location">
                <span class="client-name"><i data-lucide="store"></i> ${item.clientName}</span>
                ${locationSub ? `<span class="location-name"><i data-lucide="map-pin"></i> ${locationSub}</span>` : ''}
            </div>
            <div class="card-sizes">
                ${sizesHtml || '<span style="color:var(--text-secondary);font-size:0.9rem;font-style:italic">Stock agotado</span>'}
            </div>
        `;
        fragment.appendChild(card);
    });

    resultsList.appendChild(fragment);
    if (window.lucide) {
        lucide.createIcons();
    }
}
