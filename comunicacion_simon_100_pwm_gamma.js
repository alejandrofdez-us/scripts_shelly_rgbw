// Variables globales
let lastBrightness = 0; // Último nivel de brillo aplicado
let lastWhite = 0; // Último nivel de blanco aplicado
let pwmValues = []; // Array para almacenar las últimas lecturas de PWM
const SMOOTHING_WINDOW = 10; // Número de lecturas a promediar
const GAMMA = 2; // Controla la forma de la curva (valores <1 para regulación fina en valores bajos)
let isSettingInProgress = false; // Bandera para controlar solo las llamadas de ajuste
const MIN_BRIGHTNESS = 1; // Valor mínimo de brillo
const MIN_WHITE = 1; // Valor mínimo del canal blanco


// Función para agregar un valor PWM al array y limitar el tamaño
function addPWMValue(value) {
    if (pwmValues.length >= SMOOTHING_WINDOW) {
        // Desplazar los valores hacia la izquierda
        for (let i = 0; i < pwmValues.length - 1; i++) {
            pwmValues[i] = pwmValues[i + 1];
        }
        pwmValues[pwmValues.length - 1] = value; // Agregar el nuevo valor
    } else {
        pwmValues.push(value); // Agregar si aún hay espacio
    }
}

// Función para calcular el promedio de los valores PWM
function calculateSmoothedPWM() {
    let sum = 0;
    for (let i = 0; i < pwmValues.length; i++) {
        sum += pwmValues[i];
    }
    return pwmValues.length > 0 ? sum / pwmValues.length : 0;
}

// Función para aplicar la curva gamma
function applyGammaCurve(value, gamma) {
    let normalizedInput = value / 100; // Normalizar el PWM (0-1)
    let adjustedOutput = Math.pow(normalizedInput, gamma); // Aplicar la curva gamma
    return adjustedOutput * 100; // Escalar de vuelta a rango 0-100
}

// Función para ajustar brillo y blanco
function setBrightnessAndWhite(smoothedPWM) {
    if (isSettingInProgress) return; // No iniciar nueva llamada si ya hay una en curso

    // Aplicar la curva gamma al valor suavizado
    let adjustedPWM = applyGammaCurve(smoothedPWM, GAMMA);

    // Asegurar valores mínimos para brillo y blanco
    let desiredBrightness = Math.max(Math.round(adjustedPWM), smoothedPWM > 0 ? MIN_BRIGHTNESS : 0);
    let desiredWhite = Math.max(Math.round((adjustedPWM / 100) * 255), smoothedPWM > 0 ? MIN_WHITE : 0);

    // Verificar si los valores han cambiado
    if (desiredBrightness !== lastBrightness || desiredWhite !== lastWhite) {
        isSettingInProgress = true; // Marcar que hay una llamada activa
        Shelly.call(
            "RGBW.Set",
            {
                id: 0,
                on: desiredBrightness > 0, // Encender si el brillo es mayor que 0
                brightness: desiredBrightness,
                white: desiredWhite,
                red: 0,
                green: 0,
                blue: 0,
                transition_duration: 1 // Duración de la transición en segundos
            },
            function (res, err) {
                isSettingInProgress = false; // Marcar que la llamada ha terminado
                if (err) {
                    print("Error al ajustar brillo y blanco:", JSON.stringify(err));
                } else {
                    print(
                        "Brillo ajustado a:",
                        desiredBrightness,
                        "Canal blanco ajustado a:",
                        desiredWhite
                    );
                    lastBrightness = desiredBrightness; // Actualizar último brillo
                    lastWhite = desiredWhite; // Actualizar último blanco
                }
            }
        );
    }
}


// Función para leer el valor de PWM desde I3
function readPWM() {
    Shelly.call("Input.GetStatus", { id: 3 }, function (res, err) {
        if (err) {
            print("Error al leer la entrada I3:", JSON.stringify(err));
            return;
        }

        if (typeof res.percent === "number") {
            print("PWM Duty Cycle read:", res.percent);
            addPWMValue(res.percent); // Agregar el nuevo valor al array

            let smoothedPWM = calculateSmoothedPWM(); // Calcular el promedio suavizado
            print("Smoothed PWM:", smoothedPWM);

            setBrightnessAndWhite(smoothedPWM); // Ajustar brillo y blanco
        } else {
            print("Error: PWM Duty Cycle is not a number.");
        }
    });
}

// Temporizador para leer el valor de PWM periódicamente
Timer.set(200 /* cada 200 ms */, true /* repetitivo */, function () {
    readPWM(); // Leer la señal PWM
});