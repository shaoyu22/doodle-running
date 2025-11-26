// Main application logic
let canvas, ctx, imageProcessor, currentRoute, map, routeLine;
let isDrawing = false;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('drawCanvas');
    ctx = canvas.getContext('2d');
    imageProcessor = new ImageProcessor(canvas);

    // Set up canvas for drawing
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Drawing events
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    // Touch events for mobile
    canvas.addEventListener('touchstart', handleTouch);
    canvas.addEventListener('touchmove', handleTouch);
    canvas.addEventListener('touchend', stopDrawing);

    // Button events
    document.getElementById('clearBtn').addEventListener('click', clearCanvas);
    document.getElementById('imageUpload').addEventListener('change', handleImageUpload);
    document.getElementById('generateBtn').addEventListener('click', generateRoute);
    document.getElementById('downloadGPX').addEventListener('click', downloadGPX);
    document.getElementById('downloadTCX').addEventListener('click', downloadTCX);
    document.getElementById('useCurrentLocation').addEventListener('click', useCurrentLocation);
    document.getElementById('searchLocation').addEventListener('click', searchLocation);

    // Initialize map
    initMap();
});

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

function stopDrawing() {
    isDrawing = false;
}

function handleTouch(e) {
    e.preventDefault();
    const touch = e.touches[0];
    const mouseEvent = new MouseEvent(e.type === 'touchstart' ? 'mousedown' : 'mousemove', {
        clientX: touch.clientX,
        clientY: touch.clientY
    });
    canvas.dispatchEvent(mouseEvent);
}

function clearCanvas() {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            // Clear and draw image on canvas
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Scale image to fit canvas
            const scale = Math.min(canvas.width / img.width, canvas.height / img.height);
            const x = (canvas.width - img.width * scale) / 2;
            const y = (canvas.height - img.height * scale) / 2;
            
            ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
}

function initMap() {
    map = L.map('map').setView([40.7128, -74.0060], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    }).addTo(map);
}

function useCurrentLocation() {
    if (!navigator.geolocation) {
        alert('Geolocation is not supported by your browser');
        return;
    }

    const btn = document.getElementById('useCurrentLocation');
    btn.textContent = 'Getting location...';
    btn.disabled = true;

    navigator.geolocation.getCurrentPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            
            document.getElementById('startLat').value = lat.toFixed(6);
            document.getElementById('startLng').value = lng.toFixed(6);
            
            // Update map view
            map.setView([lat, lng], 15);
            L.marker([lat, lng]).addTo(map)
                .bindPopup('Your Location')
                .openPopup();
            
            btn.textContent = 'Use Current Location';
            btn.disabled = false;
        },
        (error) => {
            alert('Unable to get your location: ' + error.message);
            btn.textContent = 'Use Current Location';
            btn.disabled = false;
        }
    );
}

async function searchLocation() {
    const query = document.getElementById('locationSearch').value.trim();
    
    if (!query) {
        alert('Please enter a location to search');
        return;
    }

    const btn = document.getElementById('searchLocation');
    btn.textContent = 'Searching...';
    btn.disabled = true;

    try {
        // Use Nominatim (OpenStreetMap) geocoding service
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            
            document.getElementById('startLat').value = lat.toFixed(6);
            document.getElementById('startLng').value = lng.toFixed(6);
            
            // Update map view
            map.setView([lat, lng], 15);
            L.marker([lat, lng]).addTo(map)
                .bindPopup(data[0].display_name)
                .openPopup();
        } else {
            alert('Location not found. Please try a different search term.');
        }
    } catch (error) {
        alert('Error searching location: ' + error.message);
    }

    btn.textContent = 'Search';
    btn.disabled = false;
}

async function generateRoute() {
    // Extract points from canvas
    const points = imageProcessor.extractPoints();
    
    if (points.length === 0) {
        alert('Please draw something or upload an image first!');
        return;
    }

    // Order and simplify points
    const orderedPoints = imageProcessor.orderPoints(points);
    const simplifiedPoints = imageProcessor.simplifyPath(orderedPoints, 3);

    // Get configuration
    const distance = parseFloat(document.getElementById('distance').value);
    const startLat = parseFloat(document.getElementById('startLat').value);
    const startLng = parseFloat(document.getElementById('startLng').value);

    // Show loading state
    const btn = document.getElementById('generateBtn');
    btn.textContent = 'Generating route...';
    btn.disabled = true;

    try {
        // Generate GPS route with road snapping
        const generator = new RouteGenerator(startLat, startLng, distance);
        currentRoute = await generator.generateRoute(simplifiedPoints, canvas.width, canvas.height);

        // Calculate actual distance
        const actualDistance = generator.calculateDistance(currentRoute);

        // Update map
        if (routeLine) {
            map.removeLayer(routeLine);
        }
        
        const latLngs = currentRoute.map(p => [p.lat, p.lng]);
        routeLine = L.polyline(latLngs, { color: '#667eea', weight: 4 }).addTo(map);
        map.fitBounds(routeLine.getBounds());

        // Add start marker
        L.marker([startLat, startLng]).addTo(map)
            .bindPopup('Start Point')
            .openPopup();

        // Update info panel
        document.getElementById('totalDistance').textContent = actualDistance.toFixed(2);
        document.getElementById('numPoints').textContent = currentRoute.length;
        const estimatedMinutes = Math.round(actualDistance * 5);
        document.getElementById('estimatedTime').textContent = `${estimatedMinutes} minutes`;
        
        document.getElementById('routeInfo').style.display = 'block';
    } catch (error) {
        alert('Error generating route: ' + error.message);
    }

    btn.textContent = 'Generate Route';
    btn.disabled = false;
}

function downloadGPX() {
    if (!currentRoute || currentRoute.length === 0) {
        alert('Please generate a route first!');
        return;
    }

    const exporter = new GPXExporter(currentRoute, 'DoodleRun_' + Date.now());
    exporter.downloadGPX();
}

function downloadTCX() {
    if (!currentRoute || currentRoute.length === 0) {
        alert('Please generate a route first!');
        return;
    }

    const exporter = new GPXExporter(currentRoute, 'DoodleRun_' + Date.now());
    exporter.downloadTCX();
}
