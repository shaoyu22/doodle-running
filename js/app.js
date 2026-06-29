// Main application logic
let canvas, ctx, imageProcessor, currentRoute, map, routeLine;
let isDrawing = false;

// Unit state: 'km' or 'mi'
let currentUnit = 'km';

// Stored geocoded coordinates
let startCoords = null; // { lat, lng, name }
let endCoords   = null; // { lat, lng, name }

// Markers on map
let startMarker = null;
let endMarker   = null;

// Last calculated distances (always stored in km)
let lastDistanceKm = 0;
let lastTargetKm   = 0;

// Debounce timer for end-point autocomplete
let endSearchTimer = null;

// ─── Init ────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('drawCanvas');
    ctx    = canvas.getContext('2d');
    imageProcessor = new ImageProcessor(canvas);

    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.fillStyle   = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Canvas drawing
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup',   stopDrawing);
    canvas.addEventListener('mouseout',  stopDrawing);
    canvas.addEventListener('touchstart', handleTouch);
    canvas.addEventListener('touchmove',  handleTouch);
    canvas.addEventListener('touchend',   stopDrawing);

    // Buttons
    document.getElementById('clearBtn').addEventListener('click', clearCanvas);
    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    document.getElementById('generateBtn').addEventListener('click', generateRoute);
    document.getElementById('downloadGPX').addEventListener('click', downloadGPX);
    document.getElementById('downloadTCX').addEventListener('click', downloadTCX);
    document.getElementById('useCurrentLocation').addEventListener('click', useCurrentLocation);
    document.getElementById('searchStart').addEventListener('click', () => searchLocation('start'));
    document.getElementById('searchEnd').addEventListener('click',   () => searchLocation('end'));
    document.getElementById('clearEnd').addEventListener('click', clearEndPoint);

    // Enter key search
    document.getElementById('startSearch').addEventListener('keydown', e => {
        if (e.key === 'Enter') searchLocation('start');
    });
    document.getElementById('endSearch').addEventListener('keydown', e => {
        if (e.key === 'Enter') searchLocation('end');
    });

    // End-point live autocomplete (Google Maps style)
    document.getElementById('endSearch').addEventListener('input', onEndSearchInput);

    // Hide dropdown when clicking elsewhere
    document.addEventListener('click', e => {
        if (!e.target.closest('.autocomplete-wrap')) {
            document.getElementById('endDropdown').style.display = 'none';
        }
    });

    // Unit toggle
    document.getElementById('unitKm').addEventListener('click', () => setUnit('km'));
    document.getElementById('unitMi').addEventListener('click', () => setUnit('mi'));

    // Pace change → live re-compute estimated time
    document.getElementById('paceMin').addEventListener('input', recomputeEstimatedTime);
    document.getElementById('paceSec').addEventListener('input', recomputeEstimatedTime);

    initMap();
});

// ─── Unit handling ────────────────────────────────────────────────────────────

function setUnit(unit) {
    if (unit === currentUnit) return;

    // Convert the distance input value before switching
    const distInput = document.getElementById('distance');
    const val = parseFloat(distInput.value) || 0;
    if (currentUnit === 'km' && unit === 'mi') {
        distInput.value = (val * 0.621371).toFixed(2);
    } else if (currentUnit === 'mi' && unit === 'km') {
        distInput.value = (val / 0.621371).toFixed(2);
    }

    currentUnit = unit;

    // Toggle button states
    document.getElementById('unitKm').classList.toggle('active', unit === 'km');
    document.getElementById('unitMi').classList.toggle('active', unit === 'mi');

    // Update all unit labels in the UI
    document.querySelectorAll('.unit-label').forEach(el => { el.textContent = unit; });

    // Re-render info panel if route exists
    if (lastDistanceKm > 0) renderRouteInfo();
}

// Simpler toggle: store target always in km, just convert display
function getTargetDistanceKm() {
    const val = parseFloat(document.getElementById('distance').value) || 5;
    return currentUnit === 'mi' ? val / 0.621371 : val;
}

function formatDist(km) {
    if (currentUnit === 'mi') {
        return `${(km * 0.621371).toFixed(2)} mi`;
    }
    return `${km.toFixed(2)} km`;
}

function getPaceTotalSec() {
    const min = parseInt(document.getElementById('paceMin').value) || 5;
    const sec = parseInt(document.getElementById('paceSec').value) || 0;
    return min * 60 + Math.max(0, Math.min(59, sec));
}

function getPacePerKm() {
    // Always return pace in sec/km regardless of unit toggle
    const totalSec = getPaceTotalSec();
    if (currentUnit === 'mi') {
        return totalSec / 0.621371; // convert min/mi → sec/km
    }
    return totalSec;
}

function formatTime(totalSeconds) {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.round(totalSeconds % 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${s}s`;
}

function recomputeEstimatedTime() {
    if (lastDistanceKm <= 0) return;
    renderRouteInfo();
}

function renderRouteInfo() {
    const distKm = lastDistanceKm;
    const targetKm = lastTargetKm;

    document.getElementById('totalDistanceDisplay').textContent = formatDist(distKm);
    document.getElementById('targetDistanceInfo').textContent   = formatDist(targetKm);

    const diffKm = Math.abs(distKm - targetKm);
    const diffMi = diffKm * 0.621371;
    const warningEl = document.getElementById('distanceWarning');
    if (diffMi > 1.0) {
        document.getElementById('distanceDiff').textContent = formatDist(diffKm);
        warningEl.style.display = 'block';
    } else {
        warningEl.style.display = 'none';
    }

    // Estimated time from user pace
    const paceSecPerKm = getPacePerKm();
    const totalSec = distKm * paceSecPerKm;
    document.getElementById('estimatedTime').textContent = formatTime(totalSec);

    const paceMin = document.getElementById('paceMin').value;
    const paceSec = document.getElementById('paceSec').value.toString().padStart(2, '0');
    document.getElementById('paceNote').textContent =
        `@ ${paceMin}:${paceSec} min/${currentUnit}`;
}

// ─── Drawing ──────────────────────────────────────────────────────────────────

function startDrawing(e) {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
}

function draw(e) {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
}

function stopDrawing() { isDrawing = false; }

function handleTouch(e) {
    e.preventDefault();
    const touch = e.touches[0];
    canvas.dispatchEvent(new MouseEvent(
        e.type === 'touchstart' ? 'mousedown' : 'mousemove',
        { clientX: touch.clientX, clientY: touch.clientY }
    ));
}

function clearCanvas() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = event => {
        const img = new Image();
        img.onload = () => {
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const x = (canvas.width  - img.width  * scale) / 2;
            const y = (canvas.height - img.height * scale) / 2;
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

// ─── Map ──────────────────────────────────────────────────────────────────────

function initMap() {
    map = L.map('map').setView([40.7128, -74.0060], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

// ─── Location search ──────────────────────────────────────────────────────────

function useCurrentLocation() {
    if (!navigator.geolocation) { alert('Geolocation not supported'); return; }
    const btn = document.getElementById('useCurrentLocation');
    btn.textContent = 'Getting...';
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(async pos => {
        const { latitude: lat, longitude: lng } = pos.coords;
        let name = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        try {
            const res  = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            if (data.display_name) name = data.display_name;
        } catch (_) {}

        startCoords = { lat, lng, name };
        document.getElementById('startSearch').value = name;
        document.getElementById('startResult').textContent = `📍 ${name}`;
        updateMapMarker('start', lat, lng, name);

        btn.textContent = '📍 My Location';
        btn.disabled = false;
    }, err => {
        alert('Unable to get location: ' + err.message);
        btn.textContent = '📍 My Location';
        btn.disabled = false;
    });
}

async function searchLocation(which) {
    const inputId  = which === 'start' ? 'startSearch'  : 'endSearch';
    const btnId    = which === 'start' ? 'searchStart'   : 'searchEnd';
    const resultId = which === 'start' ? 'startResult'   : 'endResult';

    const query = document.getElementById(inputId).value.trim();
    if (!query) { alert(`Please enter a ${which} location`); return; }

    const btn = document.getElementById(btnId);
    btn.textContent = 'Searching...';
    btn.disabled = true;

    try {
        // For end point: bias search near start if available (Google Maps style)
        let url;
        if (which === 'end' && startCoords) {
            const viewbox = buildViewbox(startCoords.lat, startCoords.lng, 50); // 50 km radius
            url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&viewbox=${viewbox}&bounded=0`;
        } else {
            url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
        }

        const response = await fetch(url);
        const data     = await response.json();

        if (data.length > 0) {
            // Pick closest result to start (for end), or first result
            const best = which === 'end' && startCoords
                ? pickClosest(data, startCoords.lat, startCoords.lng)
                : data[0];

            const lat  = parseFloat(best.lat);
            const lng  = parseFloat(best.lon);
            const name = best.display_name;

            if (which === 'start') {
                startCoords = { lat, lng, name };
                document.getElementById('startResult').textContent = `✅ ${name}`;
            } else {
                endCoords = { lat, lng, name };
                document.getElementById('endResult').textContent = `✅ ${name}`;
                document.getElementById('endDropdown').style.display = 'none';
            }
            updateMapMarker(which, lat, lng, name);
        } else {
            document.getElementById(resultId).textContent = '❌ Not found. Try a more specific search.';
        }
    } catch (err) {
        alert('Search error: ' + err.message);
    }

    btn.textContent = 'Search';
    btn.disabled    = false;
}

// Live autocomplete for end point — fires 400 ms after typing stops
function onEndSearchInput() {
    clearTimeout(endSearchTimer);
    const query = document.getElementById('endSearch').value.trim();
    const dropdown = document.getElementById('endDropdown');

    if (query.length < 2) { dropdown.style.display = 'none'; return; }

    endSearchTimer = setTimeout(async () => {
        try {
            let url;
            if (startCoords) {
                const viewbox = buildViewbox(startCoords.lat, startCoords.lng, 50);
                url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6&viewbox=${viewbox}&bounded=0`;
            } else {
                url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=6`;
            }
            const res  = await fetch(url);
            const data = await res.json();

            if (!data.length) { dropdown.style.display = 'none'; return; }

            // Sort by proximity to start if available
            const sorted = startCoords ? sortByDistance(data, startCoords.lat, startCoords.lng) : data;

            dropdown.innerHTML = '';
            sorted.forEach(item => {
                const li = document.createElement('li');
                const distText = startCoords
                    ? ` <span class="dropdown-dist">${formatDist(haversine(startCoords.lat, startCoords.lng, parseFloat(item.lat), parseFloat(item.lon)))}</span>`
                    : '';

                // Shorten display name: show first 2 meaningful parts
                const shortName = item.display_name.split(',').slice(0, 3).join(',');
                li.innerHTML = `<span class="dropdown-name">${shortName}</span>${distText}`;
                li.addEventListener('click', () => {
                    const lat  = parseFloat(item.lat);
                    const lng  = parseFloat(item.lon);
                    const name = item.display_name;
                    endCoords  = { lat, lng, name };
                    document.getElementById('endSearch').value = shortName;
                    document.getElementById('endResult').textContent = `✅ ${name}`;
                    dropdown.style.display = 'none';
                    updateMapMarker('end', lat, lng, name);
                });
                dropdown.appendChild(li);
            });

            dropdown.style.display = 'block';
        } catch (_) {
            dropdown.style.display = 'none';
        }
    }, 400);
}

function clearEndPoint() {
    endCoords = null;
    document.getElementById('endSearch').value = '';
    document.getElementById('endResult').textContent = '';
    document.getElementById('endDropdown').style.display = 'none';
    if (endMarker) { map.removeLayer(endMarker); endMarker = null; }
}

// Build a viewbox string (lon_min,lat_min,lon_max,lat_max) around a point within ~radiusKm
function buildViewbox(lat, lng, radiusKm) {
    const dLat = radiusKm / 111;
    const dLng = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    return `${lng - dLng},${lat - dLat},${lng + dLng},${lat + dLat}`;
}

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pickClosest(items, lat, lng) {
    return items.reduce((best, item) => {
        const d = haversine(lat, lng, parseFloat(item.lat), parseFloat(item.lon));
        const dBest = haversine(lat, lng, parseFloat(best.lat), parseFloat(best.lon));
        return d < dBest ? item : best;
    });
}

function sortByDistance(items, lat, lng) {
    return [...items].sort((a, b) =>
        haversine(lat, lng, parseFloat(a.lat), parseFloat(a.lon)) -
        haversine(lat, lng, parseFloat(b.lat), parseFloat(b.lon))
    );
}

function updateMapMarker(which, lat, lng, name) {
    const color  = which === 'start' ? '#667eea' : '#e53e3e';
    const letter = which === 'start' ? 'S' : 'E';
    const icon   = L.divIcon({
        className: '',
        html: `<div style="background:${color};color:white;padding:3px 7px;border-radius:4px;font-size:12px;font-weight:bold;box-shadow:0 2px 6px rgba(0,0,0,.3)">${letter}</div>`,
        iconAnchor: [14, 14]
    });

    if (which === 'start') {
        if (startMarker) map.removeLayer(startMarker);
        startMarker = L.marker([lat, lng], { icon }).addTo(map).bindPopup(`Start: ${name}`).openPopup();
    } else {
        if (endMarker) map.removeLayer(endMarker);
        endMarker = L.marker([lat, lng], { icon }).addTo(map).bindPopup(`End: ${name}`).openPopup();
    }
    map.setView([lat, lng], 15);
}

// ─── Generate route ───────────────────────────────────────────────────────────

async function generateRoute() {
    if (!startCoords) { alert('Please set a Start Point first!'); return; }

    const points = imageProcessor.extractPoints();
    if (points.length === 0) { alert('Please draw something or upload an image first!'); return; }

    const orderedPoints    = imageProcessor.orderPoints(points);
    const simplifiedPoints = imageProcessor.simplifyPath(orderedPoints, 3);
    if (simplifiedPoints.length < 2) {
        alert('Not enough path points extracted. Try a clearer drawing or image.');
        return;
    }

    const targetDistanceKm = getTargetDistanceKm();

    const btn = document.getElementById('generateBtn');
    btn.textContent = 'Generating route...';
    btn.disabled    = true;

    try {
        const generator = new RouteGenerator(
            startCoords.lat, startCoords.lng, targetDistanceKm,
            endCoords ? endCoords.lat : undefined,
            endCoords ? endCoords.lng : undefined
        );
        currentRoute = await generator.generateRoute(simplifiedPoints, canvas.width, canvas.height);

        const actualDistanceKm = generator.calculateDistance(currentRoute);
        lastDistanceKm = actualDistanceKm;
        lastTargetKm   = targetDistanceKm;

        // Draw route on map
        if (routeLine) map.removeLayer(routeLine);
        routeLine = L.polyline(currentRoute.map(p => [p.lat, p.lng]), { color: '#667eea', weight: 4 }).addTo(map);
        map.fitBounds(routeLine.getBounds());

        // Re-pin markers on top
        updateMapMarker('start', startCoords.lat, startCoords.lng, startCoords.name);
        if (endCoords) updateMapMarker('end', endCoords.lat, endCoords.lng, endCoords.name);

        // Route description
        const startName = startCoords.name.split(',')[0];
        const endName   = endCoords ? endCoords.name.split(',')[0] : startName;
        document.getElementById('routeDescription').textContent = startName === endName
            ? `Loop from ${startName}`
            : `${startName} → ${endName}`;

        renderRouteInfo();
        document.getElementById('routeInfo').style.display = 'block';
    } catch (err) {
        alert('Error generating route: ' + err.message);
    }

    btn.textContent = 'Generate Route';
    btn.disabled    = false;
}

// ─── Download ─────────────────────────────────────────────────────────────────

function downloadGPX() {
    if (!currentRoute?.length) { alert('Please generate a route first!'); return; }
    new GPXExporter(currentRoute, 'DoodleRun_' + Date.now()).downloadGPX();
}

function downloadTCX() {
    if (!currentRoute?.length) { alert('Please generate a route first!'); return; }
    new GPXExporter(currentRoute, 'DoodleRun_' + Date.now()).downloadTCX();
}
