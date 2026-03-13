// ================= CONFIGURATION =================
const DEVICE_NAME       = 'AirSampler';
const SERVICE_UUID      = '32ff44d8-dbac-4fe6-bb74-ed682397c699';
const SERIAL_CHAR_UUID  = '5ae0db2e-f1d4-4736-b435-2c3fe60bd846';
const VALUE_CHAR_UUID   = '863848ed-4743-45b5-b600-e69281cfe806';
const STRING_CHAR_UUID  = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// ================= STATE =================
let bleDevice  = null;
let bleServer  = null;
let bleService = null;
let serialChar = null;
let stringChar = null;
let isManualDisconnect = false;

// ================= DOM ELEMENTS =================
const bleState           = document.getElementById('bleState');
const valueContainer     = document.getElementById('valueContainer');
const timestampContainer = document.getElementById('timestamp');
const valueSent          = document.getElementById('valueSent');
const messageLog         = document.getElementById('messageLog');
const receivedTimestamp  = document.getElementById('receivedTimestamp');

// ================= LIVE CLOCK =================
setInterval(() => {
    document.getElementById('clock').innerText = new Date().toLocaleString();
}, 1000);

// ================= CONNECTION =================
async function connect() {
    try {
        isManualDisconnect = false;

        if (!bleDevice) {
            console.log("Requesting device...");
            bleDevice = await navigator.bluetooth.requestDevice({
                filters: [{ name: DEVICE_NAME }],
                optionalServices: [SERVICE_UUID]
            });
            bleDevice.addEventListener('gattservicedisconnected', onDisconnected);
        }

        console.log("Connecting to GATT Server...");
        bleState.innerText = "Connecting...";
        bleState.style.color = "orange";

        bleServer  = await bleDevice.gatt.connect();
        bleService = await bleServer.getPrimaryService(SERVICE_UUID);

        // Setup sensor notifications
        serialChar = await bleService.getCharacteristic(SERIAL_CHAR_UUID);
        serialChar.addEventListener('characteristicvaluechanged', (e) => {
            const val = new TextDecoder().decode(e.target.value);
            valueContainer.innerText = val;
            timestampContainer.innerText = new Date().toLocaleTimeString();
        });
        await serialChar.startNotifications();

        // Mark as connected now — core GATT + serialChar are ready
        bleState.innerText = "Connected";
        bleState.style.color = "#24af37";
        console.log("Connected successfully.");

        // Setup string characteristic notifications (ESP32 → browser)
        // Wrapped in its own try-catch so a missing characteristic doesn't break the connection status
        try {
            stringChar = await bleService.getCharacteristic(STRING_CHAR_UUID);
            stringChar.addEventListener('characteristicvaluechanged', (e) => {
                const val = new TextDecoder().decode(e.target.value);
                logMessage('received', val);
                receivedTimestamp.innerText = new Date().toLocaleString();
                console.log("String received from ESP32:", val);
            });
            await stringChar.startNotifications();

            // Sync current time to ESP32 after 3s (gives ESP32 time to stabilise)
            setTimeout(async () => {
                try {
                    const timeChar = await bleService.getCharacteristic(STRING_CHAR_UUID);
                    await timeChar.writeValue(new TextEncoder().encode("TIME:" + Math.floor(Date.now() / 1000)));
                    console.log("Time synced to ESP32:", new Date().toLocaleString());
                } catch (e) {
                    console.error("Time sync failed:", e);
                }
            }, 3000);
        } catch (e) {
            console.warn("String characteristic not available (STRING_CHAR_UUID):", e);
        }

    } catch (error) {
        console.error("Connection failed:", error);
        bleState.innerText = "Connection Failed";
        bleState.style.color = "#d13a30";
    }
}

/*
// ================= AUTO-RECONNECT =================
async function onDisconnected() {
    bleState.innerText = "Disconnected (Searching...)";
    bleState.style.color = "red";

    if (isManualDisconnect) {
        console.log("Manual disconnect. Auto-reconnect disabled.");
        return;
    }

    console.log("Attempting auto-reconnect via advertisement watching...");
    try {
        await bleDevice.watchAdvertisements();
        bleDevice.addEventListener('advertisementreceived', async () => {
            console.log("Device found! Reconnecting...");
            await connect();
        }, { once: true });
    } catch (error) {
        console.error("Auto-reconnect setup failed:", error);
    }
}*/

// ================= SEND VALUE =================
async function sendValue(uuid, value) {
    if (!bleService) return alert("Not connected!");
    try {
        const char = await bleService.getCharacteristic(uuid);
        await char.writeValue(new Uint8Array([value]));
        valueSent.innerText = value;
    } catch (e) {
        console.error(e);
    }
}

// ================= MESSAGE LOG HELPER =================
function logMessage(direction, text) {
    const time = new Date().toLocaleString();
    const entry = document.createElement('p');
    entry.style.color = direction === 'sent' ? '#1a6bbf' : '#222';
    entry.innerText = `[${time}] ${direction === 'sent' ? '→' : '←'} ${text}`;
    messageLog.appendChild(entry);
    messageLog.scrollTop = messageLog.scrollHeight;
}

// ================= SEND STRING =================
async function sendString(uuid, text) {
    if (!bleService) return alert("Not connected!");
    try {
        const char = await bleService.getCharacteristic(uuid);
        await char.writeValue(new TextEncoder().encode(text));
        valueSent.innerText = '"' + text + '"';
        logMessage('sent', text);
        console.log("String sent:", text);
    } catch (e) {
        console.error(e);
    }
}

// ================= BUTTON BINDINGS =================
document.getElementById('connectBleButton').addEventListener('click', connect);

document.getElementById('disconnectBleButton').addEventListener('click', () => {
    isManualDisconnect = true;
    bleState.innerText = "Disconnected by User";
    bleState.style.color = "red";
    if (bleDevice && bleDevice.gatt.connected) {
        bleDevice.gatt.disconnect();
    }
});

document.getElementById('FanOnButton').addEventListener('click',     () => sendValue(VALUE_CHAR_UUID,   11));
document.getElementById('FanOffButton').addEventListener('click',    () => sendValue(VALUE_CHAR_UUID,   10));
document.getElementById('OpenClampButton').addEventListener('click', () => sendValue(VALUE_CHAR_UUID,   21));
document.getElementById('CloseClampButton').addEventListener('click',() => sendValue(VALUE_CHAR_UUID,   20));
document.getElementById('RotateButton').addEventListener('click',    () => sendValue(VALUE_CHAR_UUID,   31));
document.getElementById('ReadRFIDButton').addEventListener('click',  () => sendValue(VALUE_CHAR_UUID,   41));
document.getElementById('ResetSystemButton').addEventListener('click',() => sendString(STRING_CHAR_UUID, "The Reset Button is pressed"));
document.getElementById('TestButton').addEventListener('click',      () => sendString(STRING_CHAR_UUID,  "The Test Button is pressed"));
document.getElementById('SendStringButton').addEventListener('click', () => {
    const text = document.getElementById('stringInput').value;
    if (!text) return alert("Please type a string first.");
    sendString(STRING_CHAR_UUID, text);
});