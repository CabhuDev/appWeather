/* ------------- CONFIGURACIÓN ------------- */
// Clave de API personal para acceder a los servicios de WeatherAPI
const API_KEY   = 'f18af230f0f14b579fe162405250605';

// URL base del servicio de datos meteorológicos
const API_BASE  = 'https://api.weatherapi.com/v1/';

// URL base del servicio de datos geográficos (para obtener coordenadas y datos demográficos)
const GEO_BASE  = 'https://geodb-free-service.wirefreethought.com/v1/geo/places';



// Esperar a que el DOM esté completamente cargado antes de ejecutar cualquier código
$(function () {

  /* ----- listeners de eventos para los botones ----- */
  // Cuando se hace clic en el botón "Hoy", llama a la función obtenerDatos con el parámetro 'hoy'
  $('#btnHoy').click(() => obtenerDatos('hoy'));

  // Cuando se hace clic en el botón "3 días", llama a la función obtenerDatos con el parámetro 'tres'
  $('#btn3dias').click(() => obtenerDatos('tres'));

  // Cuando se hace clic en el botón "Mi posición", obtiene y muestra la ubicación actual del usuario
  $('#btnMiPos').click(() => mapaMiPosicion);


  /* ----- función principal ----- */
  // Función asíncrona principal que obtiene datos meteorológicos según el tipo solicitado
  async function obtenerDatos(tipo) {
    // Obtiene el valor del campo 'localidad' y elimina espacios innecesarios
    let query = $('#localidad').val().trim();
    
    // Si no se ha introducido ninguna localidad, muestra un mensaje y termina la función
    if (!query) { alert('Escribe una localidad.'); return; }

    // ----- 1. localizar en GeoDB (si está disponible) -----
    // Inicializa variables para almacenar información geográfica y la consulta para WeatherAPI
    let geoInfo = null;
    let qWeather = query;
    
    try {
      // Construye la URL para consultar la API GeoDB buscando ciudades que coincidan con la consulta
      let geoUrl = `${GEO_BASE}?limit=5&offset=0&types=CITY&namePrefix=${encodeURIComponent(query.split(',')[0])}&languageCode=es`;
      
      // Realiza la petición a GeoDB
      let geoRes = await fetch(geoUrl);
      
      // Si la petición fue exitosa, procesa los datos
      if (geoRes.ok) {
        let geoData = await geoRes.json();
        
        // Extrae el código de país si existe en la consulta, o usa 'ES' (España) por defecto
        let paisInput = query.includes(',') ? query.split(',')[1].trim().toUpperCase() : 'ES';
        
        // Busca la ciudad que coincida con el país especificado, o toma la primera sugerencia
        geoInfo = geoData.data.find(c => c.countryCode.toUpperCase() === paisInput) || geoData.data[0];
        
        // Si se encontró información geográfica, usa las coordenadas exactas para la consulta meteorológica
        if (geoInfo) qWeather = `${geoInfo.latitude},${geoInfo.longitude}`;
      }
    } catch (e) {
      // Si GeoDB falla, continuamos usando solo la API del tiempo
      console.warn('GeoDB falló, continuamos sólo con Weather API');
    }

    // ----- 2. preparar URL de WeatherAPI -----
    // Construye la URL adecuada según se solicite el tiempo actual o la previsión de 3 días
    let weatherUrl = tipo === 'hoy'
      ? `${API_BASE}current.json?key=${API_KEY}&q=${encodeURIComponent(qWeather)}&aqi=yes` // Para tiempo actual, incluye calidad del aire
      : `${API_BASE}forecast.json?key=${API_KEY}&q=${encodeURIComponent(qWeather)}&days=3&alerts=yes&aqi=no`; // Para previsión, incluye alertas

    try {
      if (tipo === 'hoy') {
        // Para datos actuales, usa fetch 
        let res = await fetch(weatherUrl);
        if (!res.ok) throw new Error('Weather API error');
        let datos = await res.json();
        // Llama a la función para mostrar los datos del tiempo actual
        pintarHoy(datos, geoInfo);
      } else {
        // Para la previsión de 3 días, usa $.ajax (método de jQuery)
        $.ajax({
          url: weatherUrl,
          dataType: 'json',
          success: datos => pintarTresDias(datos, geoInfo), // Si hay éxito, muestra la previsión
          error: () => $('#resultado').html('<p class="error">Error obteniendo previsión.</p>') // Manejo de errores
        });
      }
    } catch (err) {
      // Si ocurre algún error, muestra un mensaje
      $('#resultado').html('<p class="error">No se pudo obtener la información.</p>');
    }
  }

  /* ----- 3. pintado en DOM ----- */
  // Función que muestra los datos meteorológicos actuales en la página
  function pintarHoy(datos, geo) {
    // Destructura los datos para acceder más fácilmente a location y current
    let { location, current } = datos;
    
    // Genera HTML condicional para viento, lluvia y calidad del aire (solo se muestra si hay datos)
    let viento = current.wind_kph ? `<p><strong>Viento:</strong> ${current.wind_kph} km/h (${current.wind_dir})</p>` : '';
    let lluvia = current.precip_mm ? `<p><strong>Lluvia:</strong> ${current.precip_mm} mm</p>` : '';
    let aire   = current.air_quality ? `
      <p><strong>Calidad del aire:</strong> CO ${current.air_quality.co.toFixed(0)} μg/m³,
       NO₂ ${current.air_quality.no2.toFixed(0)} μg/m³</p>` : '';

    // Genera la tarjeta HTML con toda la información del tiempo actual
    let card = `
      <div class="card hoy">
        <h2>${location.name} (${location.country})</h2>
        <img src="https:${current.condition.icon}" alt="${current.condition.text}">
        <p><strong>${current.condition.text}</strong></p>
        <p><strong>Temperatura:</strong> ${current.temp_c} °C</p>
        ${viento}${lluvia}${aire}
      </div>`;
    
    // Actualiza el contenido del elemento con id 'resultado'
    $('#resultado').html(card);

    // Actualiza el mapa con las coordenadas obtenidas
    actualizarMapa(location.lat, location.lon);
    
    // Si hay información demográfica disponible, la añade
    if (geo) $('#resultado').append(`<p>Población: ${geo.population.toLocaleString('es-ES')}, Región: ${geo.region}</p>`);
  }

  // Función que muestra la previsión meteorológica de 3 días
  function pintarTresDias(datos, geo) {
    // Destructura los datos para acceder más fácilmente a location y forecast
    let { location, forecast } = datos;
    
    // Comienza a construir el HTML con el título
    let html = `<h2>${location.name} – Próximos 3 días</h2>`;

    // Recorre cada día de la previsión
    forecast.forecastday.forEach(d => {
      // Extrae datos específicos para cada día
      let amanecer = d.astro.sunrise;
      let ocaso    = d.astro.sunset;
      let alerta   = (d.alert && d.alert.alert && d.alert.alert.length) ? '⚠️ Sí' : '–';
      
      // Busca información para horas específicas (5 AM y 2 PM)
      let hora5   = d.hour.find(h => h.time.includes('05:00'));
      let hora14  = d.hour.find(h => h.time.includes('14:00'));
      
      // Añade una tarjeta para cada día
      html += `
        <div class="card dia">
          <h3>${d.date}</h3>
          <img src="https:${d.day.condition.icon}" alt="${d.day.condition.text}">
          <p>${d.day.condition.text}</p>
          <p>T max/min: ${d.day.maxtemp_c}/${d.day.mintemp_c} °C</p>
          <p>05 h: ${hora5 ? hora5.temp_c+' °C' : '–'} | 14 h: ${hora14 ? hora14.temp_c+' °C' : '–'}</p>
          <p>Salida/puesta de sol: ${amanecer} / ${ocaso}</p>
          <p>Alerta: ${alerta}</p>
        </div>`;
    });
    
    // Actualiza el contenido del elemento con id 'resultado'
    $('#resultado').html(html);
    
    // Actualiza el mapa con las coordenadas obtenidas
    actualizarMapa(location.lat, location.lon);
    
    // Si hay información demográfica disponible, la añade al principio
    if (geo) $('#resultado').prepend(`<p>Población: ${geo.population.toLocaleString('es-ES')}, Región: ${geo.region}</p>`);
  }

  /* ----- 4. mapa OpenStreetMaps ----- */
  // Función asíncrona para actualizar el mapa con las coordenadas proporcionadas
  async function actualizarMapa(lat, lon) {
    let zoom = 12;
    
    // Calcula el área visible del mapa (bounding box)
    let bbox = `${lon-0.2},${lat-0.2},${lon+0.2},${lat+0.2}`;
    
    // Construye la URL para el iframe de OpenStreetMap
    let src  = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
    
    // Obtiene el elemento iframe y actualiza su fuente
    let iframe = document.getElementById('mapa');
    iframe.src = src;
    
    // Espera a que el iframe termine de cargar antes de continuar
    await new Promise(r => iframe.onload = r);   // asegurar carga (async/await)
  }

  /* botón "Mi posición" */
  // Función para obtener y mostrar la ubicación actual del usuario
  function mapaMiPosicion() {
    // Comprueba si el navegador soporta geolocalización
    if (!navigator.geolocation) return alert('Geolocalización no soportada.');
    
    // Solicita la posición actual del usuario
    navigator.geolocation.getCurrentPosition(pos => {
      // Extrae las coordenadas de la posición
      let { latitude, longitude } = pos.coords;
      // Actualiza el mapa con la posición actual
      actualizarMapa(latitude, longitude);
    }, () => alert('No se pudo obtener la posición.')); // Maneja errores de geolocalización
  }

});