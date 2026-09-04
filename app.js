const map = L.map('map').setView([10.6926, 122.5737], 13);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution: '© OpenStreetMap'
}).addTo(map);

let routes = [];
let userLocation = null;
let segmentTimes = {}; 


const ILOILO_HUBS = [
  { name: "Molo Church", lat: 10.6953, lng: 122.5372 },
  { name: "Infante Flyover", lat: 10.6961, lng: 122.5532 },
  { name: "General Luna St", lat: 10.6968, lng: 122.5624 },
  { name: "Iloilo Provincial Capitol", lat: 10.6963, lng: 122.5678 },
  { name: "SM City Iloilo", lat: 10.7142, lng: 122.5492 },
  { name: "La Paz Public Market", lat: 10.7072, lng: 122.5714 }
];

// 📁 Load JSON Data Sources
fetch('iloilo_routes.json')
.then(res => res.json())
.then(data => {
  routes = data;
  showRoutes();
});

fetch('segment_times.json')
.then(res => res.json())
.then(data => {
  segmentTimes = data;
});


const FARE_TABLE = {
  1:[13,10.5],2:[13,10.5],3:[13,10.5],4:[13,10.5],5:[14.75,11.75],
  6:[16.5,13.25],7:[18.5,14.75],8:[20.25,16.25],9:[22,17.5],10:[23.75,19],
  11:[25.5,20.5],12:[27.5,22],13:[29.25,23.25],14:[31,24.75],15:[32.75,26.25],
  16:[34.5,27.75],17:[36.5,29],18:[38.25,30.5],19:[40,32],20:[41.75,33.5],
  21:[43.5,35],22:[45.5,36.25],23:[47.25,37.75],24:[49,39.25],25:[50.75,40.75],
  26:[52.5,42],27:[54.5,43.5],28:[56.25,45],29:[58,46.5],30:[59.75,47.75],
  31:[61.5,49.25],32:[63.5,50.75],33:[65.25,52.25],34:[67,53.5],35:[68.75,55],
  36:[70.5,56.5],37:[72.5,58],38:[74.25,59.25],39:[76,60.75],40:[77.75,62.25],
  41:[79.5,63.75],42:[81.5,65],43:[83.25,66.5],44:[85,68],45:[86.75,69.5],
  46:[88.5,71],47:[90.5,72.25],48:[92.25,73.75],49:[94,75.25],50:[95.75,76.75]
};

function calculateFare(distKm, passengerType){
  const km = Math.max(1, Math.ceil(distKm));
  const key = Math.min(km, 50);
  const discounted = ['student','senior','pwd'].includes(passengerType);
  return FARE_TABLE[key][discounted ? 1 : 0];
}

//  Fetch Browser Geolocation Coordinates
function useLocation(){
  navigator.geolocation.getCurrentPosition(pos => {
    userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    map.setView([userLocation.lat, userLocation.lng], 15);
    L.marker([userLocation.lat, userLocation.lng])
      .addTo(map).bindPopup("You are here").openPopup();
  }, () => alert("Enable location!"));
}

//  Geodesic Haversine Calculation Formula Matrix
function getDistance(lat1, lon1, lat2, lon2){
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Estimates Route Segment Travel Time 
function getMLTime(route, startIdx, endIdx, distanceKm){
  const segments = segmentTimes[route.route_name];

  if (!segments) {
    const totalStopsPassed = Math.abs(endIdx - startIdx);
    const drivingMinutes = (distanceKm / 20) * 60; // Assumes city transit velocity of 20 km/h
    const stopDelaysMinutes = totalStopsPassed * 0.5; // Adds a 30-second delay per stop passed
    return Math.round(drivingMinutes + stopDelaysMinutes);
  }

  let total = 0;
  const lowBound = Math.min(startIdx, endIdx);
  const highBound = Math.max(startIdx, endIdx);

  for (let i = lowBound; i < highBound; i++) {
    if (segments[i] && segments[i].avgTime) {
      total += segments[i].avgTime;
    } else {
      total += 1.5; 
    }
  }
  return Math.round(total);
}

// Returns stop data alongside array position index mapping
function getNearestStop(route, lat, lng){
  let nearest = null, min = Infinity, targetIndex = -1;
  route.stops.forEach((s, idx) => {
    const d = getDistance(lat, lng, s.lat, s.lng);
    if (d < min) { min = d; nearest = s; targetIndex = idx; }
  });
  return { stop: nearest, distance: min, index: targetIndex };
}

// Helper: Scans if a specific route contains a specific stop name keyword
function findStopIndexInRoute(route, stopNameKeyword) {
  for (let i = 0; i < route.stops.length; i++) {
    if (route.stops[i].name.toLowerCase().includes(stopNameKeyword.toLowerCase())) {
      return i;
    }
  }
  return -1;
}

//  CORE ENGINE LOGIC
function findRoute(){
  const input = document.getElementById("search-input").value.trim().toLowerCase();
  const passengerType = document.getElementById("passenger-type").value;

  if (!input) return;
  if (!userLocation) { alert("Click 📍 first to track your position!"); return; }

 
  
  let bestSingleRoute = null, bestSingleStop = null, destSingleIdx = -1, singleNearestBoarding = null, singleBoardIdx = -1;
  let minSingleWalk = Infinity;

  routes.forEach(route => {
    route.stops.forEach((stop, idx) => {
      const stopNameLower = stop.name.toLowerCase();
      
      if (stopNameLower.includes(input)) {
        // Match string priority shield: Don't let a broader string break an exact target name
        if (bestSingleStop && bestSingleStop.name.toLowerCase() !== input && stopNameLower === input) {
          const currentRouteBoarding = getNearestStop(route, userLocation.lat, userLocation.lng);
          minSingleWalk = currentRouteBoarding.distance;
          bestSingleRoute = route;
          bestSingleStop = stop;
          destSingleIdx = idx;
          singleNearestBoarding = currentRouteBoarding.stop;
          singleBoardIdx = currentRouteBoarding.index;
          return;
        }

        const currentRouteBoarding = getNearestStop(route, userLocation.lat, userLocation.lng);
        if (currentRouteBoarding.distance < minSingleWalk) {
          minSingleWalk = currentRouteBoarding.distance;
          bestSingleRoute = route;
          bestSingleStop = stop;
          destSingleIdx = idx;
          singleNearestBoarding = currentRouteBoarding.stop;
          singleBoardIdx = currentRouteBoarding.index;
        }
      }
    });
  });

  // Direct ride optimization threshold: If walking leg is under 500m, execute direct ride immediately
  if (bestSingleRoute && minSingleWalk <= 0.5) {
    executeSingleRideUI(bestSingleRoute, bestSingleStop, singleNearestBoarding, minSingleWalk, singleBoardIdx, destSingleIdx, passengerType);
    return;
  }

  
  let validTwoRideCombinations = [];

  for (const hub of ILOILO_HUBS) {
    // 1. Find all possible Ride 1 routes that can take the user to this Hub
    let possibleR1Routes = [];
    routes.forEach(route => {
      const hubIdx = findStopIndexInRoute(route, hub.name);
      if (hubIdx !== -1) {
        const nearStopInfo = getNearestStop(route, userLocation.lat, userLocation.lng);
        if (nearStopInfo.index !== -1 && nearStopInfo.index < hubIdx) {
          possibleR1Routes.push({
            route: route,
            boardIdx: nearStopInfo.index,
            dropIdx: hubIdx,
            walkDist: nearStopInfo.distance,
            boardStop: nearStopInfo.stop
          });
        }
      }
    });

    // 2. Find all possible Ride 2 routes that connect this Hub to your targeted destination
    let possibleR2Routes = [];
    routes.forEach(route => {
      const hubIdx = findStopIndexInRoute(route, hub.name);
      if (hubIdx !== -1) {
        route.stops.forEach((stop, destIdx) => {
          const stopNameLower = stop.name.toLowerCase();
          if (stopNameLower.includes(input) && hubIdx < destIdx) {
            possibleR2Routes.push({
              route: route,
              boardIdx: hubIdx,
              dropIdx: destIdx,
              destStop: stop
            });
          }
        });
      }
    });

    // 3. Cross-examine all Ride 1 and Ride 2 paths intersecting at this specific hub
    possibleR1Routes.forEach(r1 => {
      possibleR2Routes.forEach(r2 => {
        if (r1.route.route_name !== r2.route.route_name) {
          validTwoRideCombinations.push({
            hub: hub,
            r1: r1,
            r2: r2,
            totalWalk: r1.walkDist
          });
        }
      });
    });
  }

  // Sort combinations: Shortest overall footpaths rise to index position [0]
  if (validTwoRideCombinations.length > 0) {
    validTwoRideCombinations.sort((a, b) => a.totalWalk - b.totalWalk);
    const optimalCombo = validTwoRideCombinations[0];
    
    executeMultiRideUI(
      optimalCombo.r1.route, 
      optimalCombo.r2.route, 
      optimalCombo.hub, 
      optimalCombo.r1.boardIdx, 
      optimalCombo.r1.dropIdx, 
      optimalCombo.r2.boardIdx, 
      optimalCombo.r2.dropIdx, 
      optimalCombo.totalWalk, 
      passengerType
    );
  } else if (bestSingleRoute) {
    executeSingleRideUI(bestSingleRoute, bestSingleStop, singleNearestBoarding, minSingleWalk, singleBoardIdx, destSingleIdx, passengerType);
  } else {
    alert("No single-ride or two-ride route combinations could be found.");
  }
}

// =========================================================================
// PIPELINE UI HANDLERS AND MAP RENDERING SCHEMATICS
// =========================================================================

function executeSingleRideUI(route, stop, nearestStop, walkDist, boardIdx, destIdx, passengerType) {
  drawRoute(route);
  
  let rideDistanceKm = 0;
  const start = Math.min(boardIdx, destIdx);
  const end = Math.max(boardIdx, destIdx);

  for (let i = start; i < end; i++) {
    rideDistanceKm += getDistance(
      route.stops[i].lat, route.stops[i].lng, 
      route.stops[i+1].lat, route.stops[i+1].lng
    );
  }
  if (rideDistanceKm === 0) rideDistanceKm = getDistance(nearestStop.lat, nearestStop.lng, stop.lat, stop.lng);

  const fare = calculateFare(rideDistanceKm, passengerType);
  const regularFare = calculateFare(rideDistanceKm, 'regular');
  const routeTime = getMLTime(route, boardIdx, destIdx, rideDistanceKm);
  const walkTime = Math.round((walkDist / 4.5) * 60);

  // Generate intermediate stop string list for direct single rides
  let intermediateStopsHTML = "";
  for (let i = start; i <= end; i++) {
    intermediateStopsHTML += `<li>${route.stops[i].name}</li>`;
  }

  updateUI(route, stop, nearestStop, walkDist, (routeTime + walkTime), fare, regularFare, rideDistanceKm, passengerType, intermediateStopsHTML);
}

function executeMultiRideUI(r1, r2, hub, r1Board, r1Drop, r2Board, r2Drop, walkDist, passengerType) {
  map.eachLayer(l => { if(l instanceof L.Marker || l instanceof L.Polyline) map.removeLayer(l); });
  if(userLocation) L.marker([userLocation.lat, userLocation.lng]).addTo(map).bindPopup("You are here");

  const pts1 = r1.stops.map(s => [s.lat, s.lng]);
  const pts2 = r2.stops.map(s => [s.lat, s.lng]);
  
  L.polyline(pts1, {color: '#0284c7', weight: 4, dashArray: '5, 8'}).addTo(map); 
  L.polyline(pts2, {color: 'green', weight: 4}).addTo(map); 

  const bStop = r1.stops[r1Board];
  const dStop = r2.stops[r2Drop];
  L.marker([bStop.lat, bStop.lng]).addTo(map).bindPopup(`1️⃣ Board Here: ${bStop.name}`);
  L.marker([hub.lat, hub.lng]).addTo(map).bindPopup(`🔄 Transfer Hub: ${hub.name}`).openPopup();
  L.marker([dStop.lat, dStop.lng]).addTo(map).bindPopup(`🎯 Destination: ${dStop.name}`);

  map.fitBounds(L.featureGroup([L.polyline(pts1), L.polyline(pts2)]).getBounds());

  // Generate Stop Strings List for Ride 1
  let r1StopsList = "";
  for (let i = r1Board; i <= r1Drop; i++) {
    const activeName = r1.stops[i].name;
    r1StopsList += `<li>${activeName === hub.name ? `<mark><b>${activeName} (Transfer Hub)</b></mark>` : activeName}</li>`;
  }

  // Generate Stop Strings List for Ride 2
  let r2StopsList = "";
  for (let i = r2Board; i <= r2Drop; i++) {
    const activeName = r2.stops[i].name;
    r2StopsList += `<li>${activeName === hub.name ? `<mark><b>${activeName} (Board Here)</b></mark>` : activeName}</li>`;
  }

  // Accumulate In-Transit Route Path 1 Track
  let d1 = 0;
  for(let i = r1Board; i < r1Drop; i++) d1 += getDistance(r1.stops[i].lat, r1.stops[i].lng, r1.stops[i+1].lat, r1.stops[i+1].lng);
  const f1 = calculateFare(d1, passengerType);
  const t1 = getMLTime(r1, r1Board, r1Drop, d1);

  // Accumulate In-Transit Route Path 2 Track
  let d2 = 0;
  for(let i = r2Board; i < r2Drop; i++) d2 += getDistance(r2.stops[i].lat, r2.stops[i].lng, r2.stops[i+1].lat, r2.stops[i+1].lng);
  const f2 = calculateFare(d2, passengerType);
  const t2 = getMLTime(r2, r2Board, r2Drop, d2);

  const totalFare = f1 + f2;
  const totalTime = t1 + t2 + Math.round((walkDist / 4.5) * 60) + 4; 
  const discounted = passengerType !== 'regular';
  const totalRegFare = calculateFare(d1, 'regular') + calculateFare(d2, 'regular');

  document.getElementById("result").innerHTML = `
    <h2>✨ Recommended Route (2 Rides)</h2>
    <p style="color: #0369a1; font-weight: bold; background: #e0f2fe; padding: 6px; border-radius: 4px; font-size:0.9em; margin:4px 0;">🔄 Optimized Transfer Route Found</p>
    <p><b>🚶 Walk to Station:</b> ${(walkDist * 1000).toFixed(0)} meters</p>
    <p><b>⏱️ Total Travel Time:</b> ${totalTime} mins <span style="font-size:0.8em; color:#555;">(includes walking & transfer buffer)</span></p>
    <p><b>📏 Total Distance:</b> ${(d1 + d2).toFixed(2)} km</p>
    
    <div style="margin: 8px 0 4px 5px; border-left: 3px solid #0284c7; padding-left: 8px; font-size: 0.95em;">
      <span style="color:#0284c7; font-weight:bold;">1️⃣ First Ride:</span> ${r1.route_name}<br>
      <span style="color:#777;">Fare: ₱${f1.toFixed(2)} | Time: ${t1} mins</span>
      <details style="margin-top: 4px; cursor: pointer;">
        <summary style="font-size:0.85em; color:#0284c7;">View Passing Stops (${Math.abs(r1Drop - r1Board) + 1} stops)</summary>
        <ol style="margin: 4px 0; padding-left: 20px; font-size:0.85em; max-height:150px; overflow-y:auto; color:#444;">
          ${r1StopsList}
        </ol>
      </details>
    </div>

    <div style="margin: 8px 0 8px 5px; border-left: 3px solid green; padding-left: 8px; font-size: 0.95em;">
      <span style="color:green; font-weight:bold;">2️⃣ Second Ride:</span> ${r2.route_name}<br>
      <span style="color:#777;">Fare: ₱${f2.toFixed(2)} | Time: ${t2} mins</span>
      <details style="margin-top: 4px; cursor: pointer;">
        <summary style="font-size:0.85em; color:green;">View Passing Stops (${Math.abs(r2Drop - r2Board) + 1} stops)</summary>
        <ol style="margin: 4px 0; padding-left: 20px; font-size:0.85em; max-height:150px; overflow-y:auto; color:#444;">
          ${r2StopsList}
        </ol>
      </details>
    </div>
    
    <hr style="border: 0.5px dashed #ccc; margin: 8px 0;">
    ${discounted ? `<p style="margin:2px 0;"><s>₱${totalRegFare.toFixed(2)}</s> (Concession Discount applied)</p>` : ''}
    <p style="margin:4px 0;"><b>💸 Total Cumulative Fare:</b> <span style="font-size: 1.25em; color: #1b5e20; font-weight: bold;">₱${totalFare.toFixed(2)}</span></p>
  `;
}

function drawRoute(route){
  map.eachLayer(l => {
    if (l instanceof L.Marker || l instanceof L.Polyline) map.removeLayer(l);
  });

  if (userLocation) {
    L.marker([userLocation.lat, userLocation.lng]).addTo(map).bindPopup("You are here");
  }

  const pts = [];
  route.stops.forEach(s => {
    pts.push([s.lat, s.lng]);
    L.marker([s.lat, s.lng]).addTo(map).bindPopup(s.name);
  });

  L.polyline(pts, { color: 'green', weight: 4 }).addTo(map);
  map.fitBounds(L.polyline(pts).getBounds());
}

function updateUI(route, stop, nearestStop, walkDist, time, fare, regularFare, dist, type, intermediateStopsHTML){
  const discounted = type !== 'regular';
  document.getElementById("result").innerHTML = `
    <h2>✨ Recommended Route</h2>
    <p><b>🎯 Destination:</b> ${stop.name}</p>
    <p><b>🚌 Recommended Line:</b> ${route.route_name}</p>
    <p><b>📍 Nearest Boarding Stop:</b> ${nearestStop.name}</p>
    <p><b>🚶 Required Walk:</b> ${(walkDist * 1000).toFixed(0)} meters</p>
    <p><b>⏱ Total Est. Time (AI):</b> ${time} mins <span style="font-size:0.85em; color:#555;">(includes walking)</span></p>
    <p><b>📏 In-Transit Distance:</b> ${dist.toFixed(2)} km</p>
    
    <details style="margin: 8px 0; cursor: pointer; font-size:0.95em;">
      <summary style="color:green; font-weight:bold;">View All Passenger Stops</summary>
      <ol style="margin: 4px 0; padding-left: 20px; font-size:0.9em; color:#444; max-height:150px; overflow-y:auto;">
        ${intermediateStopsHTML}
      </ol>
    </details>

    ${discounted ? `<p style="margin: 2px 0;"><s>₱${regularFare.toFixed(2)}</s> (Discount Applied)</p>` : ''}
    <p><b>💸 Computed Fare:</b> <span style="font-size:1.15em; color:#1b5e20; font-weight:bold;">₱${fare.toFixed(2)}</span></p>
  `;
}

function showRoutes(){
  const list = document.getElementById("routesList");
  list.innerHTML = ""; 
  routes.forEach(r => {
    const div = document.createElement("div");
    div.className = "route-item";
    div.innerHTML = `<b>${r.route_name}</b>`;
    div.style.cursor = "pointer";
    div.onclick = () => {
      document.getElementById("search-input").value = r.stops[r.stops.length - 1].name;
      findRoute();
    };
    list.appendChild(div);
  });
}