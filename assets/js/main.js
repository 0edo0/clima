let mapa;
let marcadorPrincipal; // El "globito" azul que indicará la selección
let marcadoresTurismo = []; // Lista para gestionar los puntos dorados

window.onload = () => {
    // Inicializamos el mapa centrado en Cusco por defecto
    // Desactivamos doubleClickZoom para que no haga zoom al usar nuestra función de selección
    mapa = L.map('map', { 
        zoomControl: false,
        doubleClickZoom: false 
    }).setView([-13.52, -71.97], 13);
    
    // Capa de mapa con atribución para evitar bloqueos 403
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(mapa);

    // Creamos el marcador principal (el globito) inicialmente oculto
    marcadorPrincipal = L.marker([0, 0]).addTo(mapa);

    // --- FUNCIÓN DE DOBLE CLIC ---
    // Al hacer doble clic, obtenemos las coordenadas y movemos el globito
    mapa.on('dblclick', function(e) {
        const { lat, lng } = e.latlng;
        
        // Mover el globito inmediatamente al lugar del clic
        marcadorPrincipal.setLatLng([lat, lng])
            .bindPopup("Ubicación seleccionada")
            .openPopup();
        
        buscarPorCoordenadas(lat, lng);
    });
};

// Lógica para cuando se busca escribiendo el nombre de una ciudad
async function buscarClima() {
    const ciudad = document.getElementById('ciudad').value.trim();
    if (!ciudad) return;

    document.getElementById('loader').style.display = 'block';

    try {
        const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${ciudad}&limit=1`);
        const geoData = await geoRes.json();
        if (geoData.length === 0) throw new Error("Ciudad no encontrada");

        const { lat, lon, display_name } = geoData[0];
        const nombreLimpio = display_name.split(',')[0];

        // Posicionar el globito en la ciudad encontrada
        marcadorPrincipal.setLatLng([lat, lon])
            .bindPopup(`<b>${nombreLimpio}</b>`)
            .openPopup();

        ejecutarBusquedaCompleta(lat, lon, nombreLimpio);

    } catch (e) {
        alert("No se pudo encontrar la ciudad seleccionada.");
    } finally {
        document.getElementById('loader').style.display = 'none';
    }
}

// Lógica para el doble clic (Geocodificación inversa para saber el nombre del lugar)
async function buscarPorCoordenadas(lat, lon) {
    document.getElementById('loader').style.display = 'block';
    try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
        const data = await res.json();
        const nombre = data.display_name.split(',')[0] || "Punto en el mapa";
        
        ejecutarBusquedaCompleta(lat, lon, nombre);
    } catch (e) {
        console.error("Error identificando punto:", e);
    } finally {
        document.getElementById('loader').style.display = 'none';
    }
}

// Función maestra: Obtiene clima, humedad y actualiza mapa/interfaz
async function ejecutarBusquedaCompleta(lat, lon, nombre) {
    try {
        // Pedimos datos actuales y la humedad horaria (Open-Meteo)
        const climaRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true&hourly=relative_humidity_2m&timezone=auto`);
        const climaData = await climaRes.json();
        
        // Extraemos la humedad de la hora actual
        const horaActual = new Date().getHours();
        const humedad = climaData.hourly.relative_humidity_2m[horaActual] || "--";

        // Centrar el mapa suavemente
        mapa.flyTo([lat, lon], 15, { duration: 1.5 });

        // Actualizar la tarjeta flotante y buscar turismo
        renderUI(climaData, nombre, lat, lon, humedad);
        buscarTurismo(lat, lon); 

    } catch (e) {
        console.error("Error al procesar datos del destino:", e);
    }
}

// Dibuja los datos en la tarjeta lateral
function renderUI(data, nombre, lat, lon, hum) {
    const current = data.current_weather;
    const isDay = current.is_day; // 1 para día, 0 para noche

    // Mostrar el panel lateral
    document.getElementById('resultado').style.display = 'block';
    
    // Llenar textos básicos
    document.getElementById('nombreCiudad').innerText = nombre;
    document.getElementById('latText').innerText = parseFloat(lat).toFixed(2);
    document.getElementById('lonText').innerText = parseFloat(lon).toFixed(2);
    document.getElementById('temp').innerText = Math.round(current.temperature);
    document.getElementById('viento').innerText = `${current.windspeed} km/h`;
    document.getElementById('humedad').innerText = `${hum}%`;
    document.getElementById('momento').innerText = isDay ? "Día" : "Noche";

    // Hora Local basada en el dispositivo
    const hora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    document.getElementById('horaLocal').innerText = `🕒 Local: ${hora}`;

    // Cambiar icono principal según código de clima y día/noche
    let icono = isDay ? "☀️" : "🌙";
    if (current.weathercode > 0 && current.weathercode < 50) icono = isDay ? "⛅" : "☁️";
    if (current.weathercode >= 50) icono = "🌧️";
    document.getElementById('descClima').innerText = icono;

    // Recomendación inteligente según clima
    let recomendacion = "¡Clima ideal para explorar!";
    if (current.temperature < 10) recomendacion = "Hace frío. ¡Abrígate bien!";
    if (hum > 80) recomendacion = "Ambiente muy húmedo. Prepárate.";
    document.getElementById('recomendacion').innerText = recomendacion;
}

// Busca lugares turísticos en un radio de 3km
async function buscarTurismo(lat, lon) {
    // Limpiamos los marcadores anteriores para no saturar el mapa
    marcadoresTurismo.forEach(m => mapa.removeLayer(m));
    marcadoresTurismo = [];

    const query = `[out:json];node(around:3000,${lat},${lon})["tourism"];out;`;
    try {
        const res = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`);
        const data = await res.json();

        data.elements.forEach(poi => {
            if (poi.tags.name) {
                // Creamos círculos dorados llamativos
                const marker = L.circleMarker([poi.lat, poi.lon], {
                    radius: 10,
                    fillColor: "#ffcf33",
                    color: "#fff",
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.9
                }).addTo(mapa).bindPopup(`🏛️ <b>Lugar:</b> ${poi.tags.name}`);
                
                marcadoresTurismo.push(marker);
            }
        });
    } catch (e) {
        console.warn("No se pudieron cargar los lugares turísticos en esta zona.");
    }
}