const GAMMA = 2.0; // Curva gamma
const MIN_BRIGHTNESS = 1; // Brillo mínimo
const MIN_WHITE = 3; // Blanco mínimo

let lastBrightness = -1; // Último nivel de brillo
let lastWhite = -1; // Último nivel de blanco
let isSettingInProgress = false; // Bandera para controlar llamadas activas
let isFocoApagado = false; // Bandera para controlar estado de apagado

// Función para apagar el foco directamente
function turnOffShelly() {
    if (isSettingInProgress || isFocoApagado) {
        print("El foco ya está apagado o en proceso de configuración. Ignorando comando.");
        return;
    }

    isSettingInProgress = true; // Marcar que hay una llamada activa

    Shelly.call(
        "RGBW.Set",
        {
            id: 0,
            on: false, // Apagar el dispositivo
        },
        function (res, err) {
            isSettingInProgress = false; // Liberar bloqueo

            if (err) {
                print("Error al apagar el foco:", JSON.stringify(err));
            } else {
                isFocoApagado = true; // Actualizar estado de apagado
                print("Foco apagado.");
            }
        }
    );
}

// Función para ajustar brillo y blanco
function setBrightnessAndWhite(brightness, white) {
    if (isSettingInProgress) {
        print("Configuración en progreso. Comando ignorado.");
        return;
    }

    if (isFocoApagado) {
        isFocoApagado = false; // Actualizar estado de encendido
    }

    isSettingInProgress = true; // Marcar que hay una llamada activa

    Shelly.call(
        "RGBW.Set",
        {
            id: 0,
            on: true, // Encender el dispositivo
            brightness: brightness,
            white: white,
            red: 0,
            green: 0,
            blue: 0,
            transition_duration: 1 // Transición suave
        },
        function (res, err) {
            isSettingInProgress = false; // Liberar bloqueo

            if (err) {
                print("Error al ajustar brillo y blanco:", JSON.stringify(err));
            } else {
                print(
                    "Brillo ajustado a:",
                    brightness,
                    "Canal blanco ajustado a:",
                    white
                );
                lastBrightness = brightness; // Actualizar último brillo
                lastWhite = white; // Actualizar último blanco
            }
        }
    );
}

// Función para leer el valor de PWM
function readPWM() {
    Shelly.call("Input.GetStatus", { id: 3 }, function (res, err) {
        if (err) {
            print("Error al leer la entrada I3:", JSON.stringify(err));
            return;
        }

        if (typeof res.percent === "number") {
            let inputPWM = res.percent;
            print("PWM Duty Cycle read:", inputPWM);

            // Apagar el dispositivo si el valor es 0
            if (inputPWM === 0) {
                turnOffShelly();
                return;
            }

            // Encender el dispositivo si estaba apagado
            if (isFocoApagado) {
                print("Foco encendido tras detectar cambio en PWM.");
                isFocoApagado = false;
            }

            // Calcular el valor ajustado
            let adjustedPWM = applyGammaCurve(inputPWM, GAMMA);
            let desiredBrightness = Math.max(Math.round(adjustedPWM), MIN_BRIGHTNESS);
            let desiredWhite = Math.max(
                Math.round((adjustedPWM / 100) * 255),
                MIN_WHITE
            );

            // Ajustar brillo y blanco
            setBrightnessAndWhite(desiredBrightness, desiredWhite);
        } else {
            print("Error: PWM Duty Cycle is not a number.");
        }
    });
}

// Función para aplicar la curva gamma
function applyGammaCurve(value, gamma) {
    let normalizedInput = value / 100; // Normalizar el PWM (0-1)
    let adjustedOutput = Math.pow(normalizedInput, gamma); // Aplicar la curva gamma
    return adjustedOutput * 100; // Escalar de vuelta a rango 0-100
}

// Temporizador para leer el valor de PWM periódicamente
Timer.set(200 /* cada 200 ms */, true /* repetitivo */, function () {
    readPWM(); // Leer la señal PWM
});