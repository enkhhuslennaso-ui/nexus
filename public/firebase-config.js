function getStepLogger(manager) {
    try {
        if (manager && typeof manager.getLogger === "function") {
            return manager.getLogger();
        }
    }
    catch (_error) {
        // Ignore and fall back to console logger.
    }
    return {
        info: function (message) { if (typeof console !== "undefined" && console.log) { console.log(message); } },
        warn: function (message) { if (typeof console !== "undefined" && console.warn) { console.warn(message); } },
        error: function (message) { if (typeof console !== "undefined" && console.error) { console.error(message); } },
        severe: function (message) { if (typeof console !== "undefined" && console.error) { console.error(message); } }
    };
}

/**
 * STEP Business Rule
 * Trademark: AI Labz Ltd (TM)
 * Purpose: Describe the rule intent and expected side effects.
 * Notes: Keep transactions short and avoid repeated writes in loops.
 */


export const firebaseConfig = {
  apiKey: "AIzaSyDJPlt-Jk4sRFmbvleNKxfwzi7udTFBgLw",
  authDomain: "nexus-e7476.firebaseapp.com",
  databaseURL: "https://nexus-e7476-default-rtdb.firebaseio.com",
  projectId: "nexus-e7476",
  storageBucket: "nexus-e7476.firebasestorage.app",
  messagingSenderId: "43558709462",
  appId: "1:43558709462:web:0972845636a9f3cc524177",
  measurementId: "G-4GFZMY94P9"
};
