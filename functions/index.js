"use strict";

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");

admin.initializeApp();

setGlobalOptions({ region: "asia-northeast3" });

function httpsError(code, message) {
  throw new HttpsError(code, message);
}

async function requireAdmin(request) {
  if (!request.auth) {
    httpsError("unauthenticated", "Authentication required.");
  }

  const uid = request.auth.uid;
  const snap = await admin.firestore().collection("users").doc(uid).get();
  if (!snap.exists) {
    httpsError("permission-denied", "Admin access required.");
  }

  const data = snap.data() || {};
  if (!(data.isAdmin === true || data.role === "admin")) {
    httpsError("permission-denied", "Admin access required.");
  }

  return data;
}

function requireString(value, fieldName) {
  if (typeof value !== "string") {
    httpsError("invalid-argument", fieldName + " is required.");
  }
  const trimmed = value.trim();
  if (!trimmed) {
    httpsError("invalid-argument", fieldName + " is required.");
  }
  return trimmed;
}

exports.adminAction = onCall({ cors: ["http://127.0.0.1:5501", "http://localhost:5501", "http://localhost:5500", "https://cloud-casino-34cc6.web.app", "https://cloud-casino-34cc6.firebaseapp.com", "https://cloud-0707.com"] }, async (request) => {
  await requireAdmin(request);

  const data = request.data || {};
  const action = data.action;
  if (typeof action !== "string" || !action.trim()) {
    httpsError("invalid-argument", "action is required.");
  }

  const payload = data.payload || {};

  if (action === "resetPassword") {
    const uid = requireString(payload.uid, "uid");
    const newPassword = requireString(payload.newPassword, "newPassword");
    if (newPassword.length < 6) {
      httpsError("invalid-argument", "Password must be at least 6 characters.");
    }
    await admin.auth().updateUser(uid, { password: newPassword });
    return { success: true };
  }

  if (action === "deleteUser") {
    const uid = requireString(payload.uid, "uid");
    const userDoc = await admin.firestore().collection("users").doc(uid).get();

    if (userDoc.exists) {
      const userData = userDoc.data() || {};
      if (userData.isAdmin === true || userData.role === "admin") {
        httpsError("permission-denied", "Cannot delete admin user.");
      }
    }

    let authDeleted = false;
    try {
      await admin.auth().deleteUser(uid);
      authDeleted = true;
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        authDeleted = false;
      } else {
        console.error("Auth delete failed:", err);
        httpsError("internal", err && err.message ? err.message : "Auth delete failed.");
      }
    }

    if (userDoc.exists) {
      await userDoc.ref.delete();
    }

    return { success: true, authDeleted: authDeleted };
  }

  httpsError("invalid-argument", "Unknown action.");
});
