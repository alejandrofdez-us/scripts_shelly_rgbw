// Configuración inicial
let isSettingInProgress = false; // Flag para evitar llamadas simultáneas
let resetColorOnNextOn = false; // Indica si se debe configurar un color específico tras encender
let colorResetTimestamp = null; // Última marca de tiempo del apagado completo
const GAMMA = 2; // Valor de gamma para la curva
const COLOR_ON_NEXT_ON = { red: 20, green: 20, blue: 0 }; // Color específico (cálido)

// Umbral mínimo para evitar flickering
const PWM_MIN_THRESHOLD = 20; // Porcentaje mínimo del PWM de entrada
const BRIGHTNESS_MIN_OUTPUT = 1; // Porcentaje de brillo mínimo de salida forzado

// Función para aplicar corrección gamma
function applyGammaCurve(value, gamma) {
    return Math.round(100 * Math.pow(value / 100, gamma));
}

// Función para apagar el foco
function turnOffLight() {
    if (isSettingInProgress) return; // Evitar conflictos si ya se está configurando
    isSettingInProgress = true;

    Shelly.call(
        "RGBW.Set",
        { id: 0, on: false }, // Apagar el dispositivo
        function (res, err) {
            isSettingInProgress = false; // Liberar bloqueo
            if (err) {
                print("Error al apagar el foco:", JSON.stringify(err));
            }
        }
    );
}

// Función para ajustar brillo, blanco y opcionalmente color
function setBrightnessAndWhite(brightness, white, applyColor) {
    applyColor = applyColor || false; // Valor predeterminado para applyColor

    if (isSettingInProgress) return; // Evitar configuraciones simultáneas

    isSettingInProgress = true;

    let params = {
        id: 0,
        on: true,
        brightness: brightness,
        white: white,
        transition_duration: 1 // Transición suave
    };

    // Si se requiere aplicar color, añadimos el array RGB
    if (applyColor) {
        params.mode = "color_and_white";
        params.rgb = [COLOR_ON_NEXT_ON.red, COLOR_ON_NEXT_ON.green, COLOR_ON_NEXT_ON.blue];
    } else {
        params.mode = "white"; // Solo modo blanco
    }

    Shelly.call("RGBW.Set", params, function () {
        isSettingInProgress = false; // Liberar bloqueo
        if (applyColor) resetColorOnNextOn = false; // Resetear la bandera tras aplicar color
    });
}

function applyMinimumWhite(pwmValue) {
    if (isSettingInProgress) return;
    isSettingInProgress = true;

    Shelly.call("RGBW.Set", {
        id: 0,
        on: true,
        mode: "white",
        brightness: 0,
        white: 1,
        transition_duration: 1
    }, function () {
        isSettingInProgress = false;
    });
}

// Timer para leer el PWM y ajustar el foco
Timer.set(200 /* cada 200ms */, true /* repetitivo */, function () {
    Shelly.call("Input.GetStatus", { id: 3 }, function (res, err) {
        if (err || res.percent === undefined) return;

        let pwmValue = res.percent;

        // Detectar apagado completo
        if (pwmValue === 0) {
            if (colorResetTimestamp === null) colorResetTimestamp = Date.now(); // Registrar el tiempo de apagado
            turnOffLight(); // Apagar el foco inmediatamente
            return; // Salir para evitar configuraciones adicionales
        }

        // Si el foco estuvo apagado más de 3 segundos, aplicar el color en el próximo encendido
        if (colorResetTimestamp && Date.now() - colorResetTimestamp >= 3000) {
            resetColorOnNextOn = true;
        }
        colorResetTimestamp = null; // Resetear el contador de apagado

        // Aplicar valor fijo si está por debajo del umbral para evitar flickering
        let gammaCorrected;
        if (pwmValue < PWM_MIN_THRESHOLD) {
            applyMinimumWhite();
            return;
        } else {
            // Aplicar corrección gamma
            gammaCorrected = applyGammaCurve(pwmValue, GAMMA);
        }

        // Calcular valores de brillo y blanco
        let brightness = Math.round((gammaCorrected / 100) * 100); // Convertir a rango 0-100
        let white = Math.round((gammaCorrected / 100) * 255); // Convertir a rango 0-255

        // Aplicar configuración
        if (resetColorOnNextOn) {
            setBrightnessAndWhite(brightness, white, true); // Modo color_and_white
        } else {
            setBrightnessAndWhite(brightness, white); // Modo blanco
        }
    });
});