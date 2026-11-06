// Promise wrapper around the browser Geolocation API with readable error codes.
const ERROR_CODES = { 1: "denied", 2: "unavailable", 3: "timeout" };

// The API's own timeout doesn't count time spent on the permission prompt, and
// some browsers never call back if that prompt is dismissed. The watchdog makes
// sure the request always settles.
const WATCHDOG_GRACE_MS = 2000;

function geoError(code) {
  return Object.assign(new Error(`Geolocation ${code}`), { code });
}

export function getDevicePosition({ timeout = 10000, maximumAge = 300000 } = {}) {
  return new Promise((resolve, reject) => {
    const geolocation = typeof navigator !== "undefined" ? navigator.geolocation : undefined;
    if (!geolocation) {
      reject(geoError("unsupported"));
      return;
    }
    const watchdog = setTimeout(() => reject(geoError("timeout")), timeout + WATCHDOG_GRACE_MS);
    geolocation.getCurrentPosition(
      (position) => {
        clearTimeout(watchdog);
        resolve({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => {
        clearTimeout(watchdog);
        reject(geoError(ERROR_CODES[error?.code] ?? "unavailable"));
      },
      { enableHighAccuracy: false, timeout, maximumAge }
    );
  });
}
