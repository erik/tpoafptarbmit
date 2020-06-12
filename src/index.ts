import * as L from 'leaflet';
import * as GeoJson from 'geojson';

import { toGpx } from './gpx';


const CALIFORNIA_DONUTS = {lat: 34.0688093, lng: -118.2930864};

const LAYERS: {[key: string]: L.TileLayer} = {
    OSM: L.tileLayer(
        'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        {
            maxZoom: 19,
            attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }
    ),
    'ESRI.WorldTopo': L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
        {
            attribution:
            'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
        }
    ),
    'Stamen': L.tileLayer(
        'https://stamen-tiles-{s}.a.ssl.fastly.net/toner-background/{z}/{x}/{y}{r}.png', {
            attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            subdomains: 'abcd',
            minZoom: 0,
            maxZoom: 20,
        })
};

function fetchRoutes(): Promise<GeoJson.FeatureCollection> {
    return fetch('/index.geojson')
        .then(res => res.json())
        .then(json => <GeoJson.FeatureCollection>json);
}

// Given a URL containing GeoJSON data, fetch it and convert it to
// GPX.
//
// TODO: defining the callback this way is a lazy hack.
(<any>window).downloadGpx = (url: string): void => {
    fetch(url)
        .then(r => r.json())
        .then(json => <GeoJson.Feature<GeoJson.LineString, GeoJson.GeoJsonProperties>>json)
        .then(geo => {
            const name = geo.properties!.name!;
            const coords = geo.geometry!.coordinates!;

            const xml = toGpx(name, coords);
            const b64 = btoa(xml);

            // Trigger file download.
            const a = document.createElement('a');
            a.download = `${name}.gpx`;
            a.href = `data:application/gpx+xml;base64,${b64}`;
            a.click();
        });
}

(function() {
    const mapContainer = document.querySelector('#map');

    const donutShop = L.marker(CALIFORNIA_DONUTS, {
        icon: L.divIcon({
            className: 'donut-shop-icon',
            html: `<span class="text-3xl">🍩</span`
        })
    });

    const map = L.map('map', {
        center: CALIFORNIA_DONUTS,
        zoom: 10,
        layers: [LAYERS['Stamen'], donutShop],
    });

    L.control
        .layers(LAYERS, {
            'California Donuts': donutShop,
            // TODO: hide/show GeoJSON layer if possible
        })
        .addTo(map);

    // TODO: It would be far better to return a DOM node than a string here.
    const popupForFeature = (props: GeoJson.GeoJsonProperties) => {
        return `
<div class="route-info">
  <h1 class="text-xl font-bold">#${props!.number} - ${props!.name}</h1>
  <div class="text-sm">
    ${props!.description ?? 'No description.'}
    <a href="#" onclick="downloadGpx('${props!.geojson}')">Download GPX</a>
  </div>
</div>`;
    };

    const routeStyles: {[key: string]: L.PathOptions} = {
        base: {
            color: '#A0C8D8',
            weight: 2,
        },
        highlight: {
            color: '#B61326',
            weight: 3,
        },
        hide: {
            color: '#000',
            weight: 0,
        }
    };

    // Last route we had highlighted, so that it can be cleared.
    let previousRoute: L.FeatureGroup | null;

    // High-resolution route, we want to remove this from the map
    // when switching
    let hiresRoute: L.FeatureGroup | null;

    // Track each route individually rather than adding the entire geoJson
    // object to the map at once.
    const routeFeatures: L.LayerGroup[] = [];

    const highlightLayer = (layer: L.FeatureGroup) => {
        previousRoute?.closePopup();
        previousRoute?.setStyle(routeStyles.base);
        previousRoute = layer;

        if (hiresRoute != null) {
            map.removeLayer(hiresRoute);
        }

        layer.bringToFront();
        layer.setStyle(routeStyles.highlight);
    };

    const getRouteLayer = (num: number): L.FeatureGroup | null => {
        // Since we're reversed we have to look from the end
        const index = routeFeatures.length - num;
        const layers = routeFeatures[index]?.getLayers();
        return layers?.length > 0
            ? <L.FeatureGroup>layers[0]
            : null;
    };

    const selectLayer = (routeNum: number, lg: L.FeatureGroup) => {
        // Update the URL so that a reload wouldn't lose place.
        window.location.hash = '' + routeNum;

        highlightLayer(lg);
        map.fitBounds(lg.getBounds());

        const props = lg.feature?.properties;
        if (props?.geojson != null) {
          fetch(props.geojson)
            .then(r => r.json())
            .then(json => {
              hiresRoute = L.geoJSON(json).addTo(map);

              previousRoute?.setStyle(routeStyles.hide);
              hiresRoute.setStyle(routeStyles.highlight);
            })
            .catch(exc => console.error('Loading high resolution route failed', exc));
        }
    };

    const createGeoJsonLayer = (routes: GeoJson.FeatureCollection) => L.geoJSON(routes, {
        style: routeStyles.base,
        onEachFeature: (feature, layer: L.FeatureGroup) => {
            const lg: L.LayerGroup = L.layerGroup()
                .addLayer(
                    layer
                        .bindPopup(popupForFeature(feature.properties))
                        .on('click', () => selectLayer(feature.properties?.number, layer)))
                .addTo(map);

            routeFeatures.push(lg);
        }
    });

    fetchRoutes().then(routes => {
        const geoJson = createGeoJsonLayer(routes);

        const routeColumns = document.querySelectorAll('.route-col');
        const perColumn = Math.round(routeFeatures.length / routeColumns.length);
        let colIndex = 0;

        // Select a route without going through user Leaflet interaction. We'll
        // want to open the popup programmatically.
        const selectRouteWithPopup = (num: number) => {
            const layer = getRouteLayer(num);
            if (layer === null) return;

            selectLayer(num, layer);
            layer.openPopup();

            mapContainer!.scrollIntoView(/* alignToTop = */ true);
        }

        routes.features.reverse().forEach((route, i) => {
            const props = route.properties;

            const node = document.createElement('div');
            node.setAttribute('class', 'route-item hover-underline');
            node.setAttribute('title', props?.name);

            node.appendChild(document.createTextNode(`#${props?.number??''} - ${props?.name?? 'Unnamed'}`));
            // Off by 1 so that we can go from 0-based array indexing to
            // 1-based route numbering.
            node.onclick = () => selectRouteWithPopup(i+1);

            routeColumns[colIndex]?.appendChild(node);
            if (i+1 >= (1+colIndex) * perColumn) {
                colIndex++;
            }
        });

        // Allow choosing an initial route to select in the URL fragment
        const num = +window.location.hash.substr(1);
        if (num > 0 && num <= routes.features.length) {
            selectRouteWithPopup(num);
        }
    });
})();
