let lastBrightness = -1; // Último valor de brillo registrado
let inputValues = []; // Array para almacenar los valores leídos
let lastSmoothedValue = null; // Último valor suavizado utilizado para detectar cambios bruscos
const SMOOTHING_WINDOW = 10; // Número de valores a promediar
const BUCKETS = [7, 14, 21, 28, 36, 43, 50, 57, 64, 71, 79, 86, 93, 100];
const REQUIRED_READINGS = 10; // Número de lecturas consecutivas necesarias para cambiar de bucket
const THRESHOLD_IMMEDIATE_CHANGE = 15; // Umbral para cambios bruscos

let consecutiveReadings = 0; // Contador de lecturas consecutivas en el mismo bucket
let currentBucket = -1; // Bucket actual basado en las lecturas consecutivas

// Función para reiniciar el array de lecturas
function resetInputValues() {
    inputValues = [];
    consecutiveReadings = 0;
}

// Función para calcular el promedio de un array
function calculateAverage(values) {
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
        sum += values[i];
    }
    return sum / values.length;
}

// Función para agregar valores al array y limitar su tamaño
function addValue(value) {
    if (inputValues.length >= SMOOTHING_WINDOW) {
        // Eliminar el valor más antiguo desplazando los elementos manualmente
        for (let i = 0; i < inputValues.length - 1; i++) {
            inputValues[i] = inputValues[i + 1];
        }
        inputValues[inputValues.length - 1] = value; // Agregar el nuevo valor
    } else {
        inputValues.push(value); // Agregar si aún hay espacio
    }
}

// Función para asignar el bucket correspondiente
function getBucket(value) {
    if (value === 0) return 0; // Apagar si el valor es exactamente 0
    let bucketIndex = Math.min(Math.floor((value / 100) * BUCKETS.length), BUCKETS.length - 1);
    return BUCKETS[bucketIndex];
}

// Función para mapear el brillo al rango del canal blanco (0 a 255)
function mapBrightnessToWhite(brightness) {
    return Math.round((brightness / 100) * 255);
}

// Función para configurar el brillo y el canal blanco en una única llamada
function setBrightnessAndWhite(brightness) {
    let whiteValue = mapBrightnessToWhite(brightness); // Calcular el valor de white a partir de brightness

    // Realizar una única llamada a RGBW.Set
    Shelly.call(
        "RGBW.Set",
        {
            id: 0,
            brightness: Math.round(brightness), // Asegurarse de que sea entero
            white: Math.round(whiteValue),     // Asegurarse de que sea entero
            on: true,
            transition_duration: 1
        },
        function (res, err) {
            if (err) {
                print("Error al configurar brillo y canal blanco:", JSON.stringify(err));
            } else {
                print("Brillo configurado a:", Math.round(brightness), "Canal blanco configurado a:", Math.round(whiteValue));
            }
        }
    );
}

// Función para verificar y actualizar el brillo
Timer.set(200 /* cada 200ms */, true /* repetitivo */, function () {
    // Intentar obtener el valor del Input3
    Shelly.call(
        "Input.GetStatus",
        { id: 3 },
        function (res, err) {
            if (err) {
                return; // Omitir en caso de error al obtener el estado
            }
            let inputPercent = res.percent; // Leer el porcentaje del Input3
            let smoothedValue = inputValues.length > 0 ? calculateAverage(inputValues) : inputPercent;

            // Actualizar el último valor suavizado
            if (lastSmoothedValue === null) {
                lastSmoothedValue = smoothedValue; // Inicializar si aún no está definido
            }

            // Detectar cambios bruscos comparando con el último valor suavizado
            if (Math.abs(inputPercent - lastSmoothedValue) > THRESHOLD_IMMEDIATE_CHANGE) {
                resetInputValues(); // Reiniciar lecturas
                lastSmoothedValue = inputPercent; // Actualizar referencia de suavizado
                let newBucket = getBucket(Math.round(inputPercent)); // Asignar directamente el nuevo bucket
                lastBrightness = newBucket; // Actualizar último brillo

                // Apagar el foco si el bucket es 0
                if (newBucket === 0) {
                    Shelly.call(
                        "RGBW.Set",
                        { id: 0, on: false },
                        function () {
                            print("Foco apagado.");
                        }
                    );
                } else {
                    // Configurar brillo y canal blanco juntos
                    setBrightnessAndWhite(newBucket);
                }
                return; // Terminar aquí para evitar procesar el cambio brusco como lectura normal
            }

            // Agregar el valor y calcular el promedio
            addValue(inputPercent);
            smoothedValue = calculateAverage(inputValues);
            lastSmoothedValue = smoothedValue; // Actualizar referencia de suavizado
            let newBucket = getBucket(Math.round(smoothedValue));

            // Verificar si seguimos en el mismo bucket
            if (newBucket === currentBucket) {
                consecutiveReadings++; // Incrementar el contador
            } else {
                consecutiveReadings = 1; // Reiniciar el contador
                currentBucket = newBucket; // Actualizar el bucket actual
            }

            // Cambiar el bucket si alcanzamos las lecturas necesarias
            if (consecutiveReadings >= REQUIRED_READINGS && newBucket !== lastBrightness) {
                lastBrightness = newBucket; // Actualizar último brillo
                // Configurar brillo y canal blanco juntos
                setBrightnessAndWhite(newBucket);
            }
        }
    );
});