// Generate GPS route from image points
class RouteGenerator {
    constructor(startLat, startLng, targetDistance, endLat, endLng) {
        this.startLat = startLat;
        this.startLng = startLng;
        this.endLat = endLat !== undefined ? endLat : startLat;
        this.endLng = endLng !== undefined ? endLng : startLng;
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

        if (totalLength === 0) return [];

        // Scale factor to achieve target distance
        // 1 degree latitude ≈ 111 km
        const scaleFactor = (this.targetDistance / totalLength) / 111;

        // If we have a distinct end point, interpolate the shape between start and end
        const hasDistinctEnd = (
            Math.abs(this.endLat - this.startLat) > 0.0001 ||
            Math.abs(this.endLng - this.startLng) > 0.0001
        );

        if (hasDistinctEnd) {
            return this._generateWaypointsWithEndPoint(normalized, scaleFactor);
        }

        // Single start point: center the shape around start
        const waypoints = normalized.map(p => {
            const offsetX = (p.x - 0.5) * scaleFactor;
            const offsetY = (p.y - 0.5) * scaleFactor;
            return {
                lat: this.startLat - offsetY,
                lng: this.startLng + offsetX / Math.cos(this.startLat * Math.PI / 180)
            };
        });

        return waypoints;
    }

    // Generate waypoints fitting the canvas shape between a start and end GPS point
    _generateWaypointsWithEndPoint(normalized, scaleFactor) {
        const n = normalized.length;
        const firstNorm = normalized[0];
        const lastNorm = normalized[n - 1];

        // Vector in normalized space from first to last
        const normDX = lastNorm.x - firstNorm.x;
        const normDY = lastNorm.y - firstNorm.y;
        const normLen = Math.sqrt(normDX * normDX + normDY * normDY);

        // Vector in GPS space from start to end
        const gpsDLat = this.endLat - this.startLat;
        const gpsDLng = this.endLng - this.startLng;

        const waypoints = normalized.map((p, i) => {
            // Shape offset relative to first normalized point
            const relX = p.x - firstNorm.x;
            const relY = p.y - firstNorm.y;

            if (normLen < 0.001) {
                // Degenerate: just spread around start
                return {
                    lat: this.startLat + (relX - 0.5) * scaleFactor,
                    lng: this.startLng + (relY - 0.5) * scaleFactor / Math.cos(this.startLat * Math.PI / 180)
                };
            }

            // Progress along path (0 → 1)
            const t = i / (n - 1);

            // Interpolated base GPS point
            const baseLat = this.startLat + t * gpsDLat;
            const baseLng = this.startLng + t * gpsDLng;

            // Perpendicular deviation (cross-track offset to preserve shape)
            // Project rel point onto the norm direction
            const along = (relX * normDX + relY * normDY) / (normLen * normLen);
            const perpX = relX - along * normDX;
            const perpY = relY - along * normDY;

            // Scale perpendicular offset
            const perpScale = scaleFactor * 0.5;
            const offsetLat = -perpY * perpScale;
            const offsetLng = perpX * perpScale / Math.cos(this.startLat * Math.PI / 180);

            return {
                lat: baseLat + offsetLat,
                lng: baseLng + offsetLng
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

            const coords = chunk.map(p => `${p.lng},${p.lat}`).join(';');
            const url = `https://router.project-osrm.org/route/v1/foot/${coords}?overview=full&geometries=geojson&steps=true`;

            try {
                const response = await fetch(url);
                const data = await response.json();

                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                    const geometry = data.routes[0].geometry.coordinates;
                    geometry.forEach(coord => {
                        snappedRoute.push({ lat: coord[1], lng: coord[0], ele: 0 });
                    });
                } else {
                    chunk.forEach(p => snappedRoute.push({ ...p, ele: 0 }));
                }
            } catch (error) {
                console.error('Routing error:', error);
                chunk.forEach(p => snappedRoute.push({ ...p, ele: 0 }));
            }
        }

        return snappedRoute;
    }

    // Generate complete route with road snapping + distance calibration (within 1 mile = 1.609 km)
    async generateRoute(canvasPoints, canvasWidth, canvasHeight) {
        const TOLERANCE_KM = 1.609; // 1 mile tolerance
        const MAX_ITERATIONS = 6;

        let scaleMult = 1.0;
        let route = [];
        let actualDistance = 0;

        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
            // Adjust target distance by scale multiplier for this iteration
            const adjustedTarget = this.targetDistance * scaleMult;
            const savedTarget = this.targetDistance;
            this.targetDistance = adjustedTarget;

            const waypoints = this.generateWaypoints(canvasPoints, canvasWidth, canvasHeight);
            this.targetDistance = savedTarget;

            route = await this.snapToRoads(waypoints);
            actualDistance = this.calculateDistance(route);

            const diff = Math.abs(actualDistance - this.targetDistance);
            if (diff <= TOLERANCE_KM) break;

            // Adjust scale for next iteration
            if (actualDistance > 0) {
                scaleMult *= this.targetDistance / actualDistance;
            }
        }

        return route;
    }

    // Calculate actual distance of route in km
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

    // Haversine formula for distance between two GPS points (km)
    haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}
