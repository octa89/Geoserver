(function(POSM) {
    'use strict';

    // ---- BASEMAPS ----
    var basemaps = {
        street: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap contributors',
            maxNativeZoom: 19,
            maxZoom: 22
        }),
        satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri',
            maxNativeZoom: 19,
            maxZoom: 22
        }),
        dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; CartoDB',
            maxNativeZoom: 19,
            maxZoom: 22
        })
    };

    // ---- MAP INIT ----
    POSM.map = L.map('map', {
        center: [41.897, -84.037],
        zoom: 14,
        maxZoom: 22,
        layers: [basemaps.street],
        zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(POSM.map);

    var currentBasemap = 'street';

    // ---- BASEMAP SWITCHER ----
    POSM.initBasemaps = function() {
        document.querySelectorAll('.basemap-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                var key = btn.dataset.basemap;
                if (key === currentBasemap) return;
                POSM.map.removeLayer(basemaps[currentBasemap]);
                POSM.map.addLayer(basemaps[key]);
                currentBasemap = key;
                document.querySelectorAll('.basemap-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
                btn.classList.add('active');
                if (POSM.scheduleSave) POSM.scheduleSave();
            });
        });
    };

})(window.POSM);
