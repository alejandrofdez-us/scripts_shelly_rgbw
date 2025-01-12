// Variables globales
let lastBrightness = 0; // Último nivel de brillo aplicado
let lastWhite = 0; // Último nivel de blanco aplicado
let pwmValues = []; // Array para almacenar las últimas lecturas de PWM
const SMOOTHING_WINDOW = 10; // Número de lecturas a promediar
let isSettingInProgress = false; // Bandera para controlar solo las llamadas de ajuste

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

// Función para ajustar brillo y blanco
function setBrightnessAndWhite(smoothedPWM) {
    if (isSettingInProgress) return; // No iniciar nueva llamada si ya hay una en curso

    let desiredBrightness = Math.round(smoothedPWM); // Brillo (0-100)
    let desiredWhite = Math.round((smoothedPWM / 100) * 255); // Canal blanco (0-255)

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