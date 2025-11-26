// Generate GPS route from image points
class RouteGenerator {
    constructor(startLat, startLng, targetDistance) {
        this.startLat = startLat;
        this.startLng = startLng;
        this.targetDistance = targetDistance; // in kilometers
    }

    // Convert canvas points to GPS coordinates (waypoints)
    generateWaypoints(canvasPoints, canvasWidth, canvasHeight) {
        if (canvasPoints.length === 0) return [];

        // Normalize points to 0-1 range
        const normalized = canvasPoints.map(p => ({
            x: p.x / canvasWidth,
            y: p.y / canvasHeight
        }));

        // Calculate total path length in normalized space
        let totalLength = 0;
        for (let i = 1; i < normalized.length; i++) {
            const dx = normalized[i].x - normalized[i - 1].x;
            const dy = normalized[i].y - normalized[i - 1].y;
            totalLength += Math.sqrt(dx * dx + dy * dy);
        }

        // Scale factor to achieve target distance
        // Approximate: 1 degree latitude ≈ 111 km
        const scaleFactor = (this.targetDistance / totalLength) / 111;

        // Convert to GPS coordinates
        const waypoints = normalized.map(p => {
            // Center the drawing and apply scale
            const offsetX = (p.x - 0.5) * scaleFactor;
            const offsetY = (p.y - 0.5) * scaleFactor;

            return {
                lat: this.startLat - offsetY, // Y is inverted (canvas top = north)
                lng: this.startLng + offsetX / Math.cos(this.startLat * Math.PI / 180)
            };
        });

        return waypoints;
    }

    // Snap waypoints to actual roads using OSRM routing
    async snapToRoads(waypoints) {
        if (waypoints.length < 2) return waypoints;

        const snappedRoute = [];
        
        // Process waypoints in chunks (OSRM has coordinate limits)
        const chunkSize = 25;
        for (let i = 0; i < waypoints.length - 1; i += chunkSize - 1) {
            const chunk = waypoints.slice(i, Math.min(i + chunkSize, waypoints.length));
            
            // Build OSRM request
            const coords = chunk.map(p => `${p.lng},${p.lat}`).join(';');
            const url = `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=true`;

            try {
                const response = await fetch(url);
                const data = await response.json();

                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                    const geometry = data.routes[0].geometry.coordinates;
                    
                    // Convert to our format
                    geometry.forEach(coord => {
                        snappedRoute.push({
                            lat: coord[1],
                            lng: coord[0],
                            ele: 0
                        });
                    });
                } else {
                    // Fallback: use original waypoints if routing fails
                    chunk.forEach(p => snappedRoute.push({ ...p, ele: 0 }));
                }
            } catch (error) {
                console.error('Routing error:', error);
                // Fallback: use original waypoints
                chunk.forEach(p => snappedRoute.push({ ...p, ele: 0 }));
            }
        }

        return snappedRoute;
    }

    // Generate complete route with road snapping
    async generateRoute(canvasPoints, canvasWidth, canvasHeight) {
        // First, generate waypoints from canvas
        const waypoints = this.generateWaypoints(canvasPoints, canvasWidth, canvasHeight);
        
        // Then snap to actual roads
        const route = await this.snapToRoads(waypoints);
        
        return route;
    }

    // Calculate actual distance of route
    calculateDistance(route) {
        let distance = 0;
        for (let i = 1; i < route.length; i++) {
            distance += this.haversineDistance(
                route[i - 1].lat, route[i - 1].lng,
                route[i].lat, route[i].lng
            );
        }
        return distance;
    }

    // Haversine formula for distance between two GPS points
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}
