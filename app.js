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


import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";

import { firebaseConfig } from "./firebase-config.js";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const provider = new GoogleAuthProvider();
const $ = id => document.getElementById(id);

let currentUser = null;
let isAdmin = false;
let toastTimer;

const STATUS = {
  pending: "Шинэ",
  in_progress: "Ажиллаж байна",
  completed: "Дууссан",
  rejected: "Татгалзсан"
};

/**
 * STEP business rule function: escapeHtml.
 * TODO: Describe purpose, side effects, and expected node/context state.
 * @param {*} value
 */
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

/**
 * STEP business rule function: notify.
 * TODO: Describe purpose, side effects, and expected node/context state.
 * @param {*} message
 */
function notify(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.style.display = "block";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.style.display = "none";
  }, 4500);
}

async function api(endpoint, options = {}) {
  if (!currentUser) {
    throw new Error("Google-ээр нэвтэрнэ үү.");
  }

  const token = await currentUser.getIdToken();
  const response = await fetch(endpoint, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

// Mobile menu
$("menuToggle").addEventListener("click", () => {
  const menu = $("navLinks");
  const open = menu.classList.toggle("open");
  $("menuToggle").setAttribute("aria-expanded", String(open));
});

document.querySelectorAll(".nav-links a").forEach(link => {
  link.addEventListener("click", () => {
    $("navLinks").classList.remove("open");
    $("menuToggle").setAttribute("aria-expanded", "false");
  });
});

// Google Login
$("loginBtn").addEventListener("click", async () => {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    notify("Google Login: " + err.message);
  }
});

$("logoutBtn").addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    notify(err.message);
  }
});

// Service selection
document.querySelectorAll(".choose").forEach(button => {
  button.addEventListener("click", () => {
    $("service").value = button.dataset.service;
    $("request").scrollIntoView({ behavior: "smooth" });
  });
});

// Authentication state
onAuthStateChanged(auth, async user => {
  currentUser = user;
  isAdmin = false;

  $("loginBtn").hidden = !!user;
  $("logoutBtn").hidden = !user;
  $("userName").textContent = user?.displayName || "";
  $("admin").hidden = true;
  $("adminLink").hidden = true;

  if (!user) {
    $("myOrders").textContent =
      "Google-ээр нэвтэрч хүсэлтээ харна уу.";
    $("adminOrders").textContent = "";
    return;
  }

  try {
    const me = await api("/api/me");
    if (currentUser !== user) return;

    isAdmin = me.admin;
    $("admin").hidden = !isAdmin;
    $("adminLink").hidden = !isAdmin;

    await loadOrders();
    if (isAdmin) await loadAdmin();
  } catch (err) {
    notify(err.message);
  }
});

// Create order
$("orderForm").addEventListener("submit", async event => {
  event.preventDefault();

  if (!currentUser) {
    notify("Эхлээд Google-ээр нэвтэрнэ үү.");
    return;
  }

  const button = $("orderSubmit");
  button.disabled = true;

  try {
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        service: $("service").value,
        discord: $("discord").value,
        details: $("details").value
      })
    });

    notify(
      result.notification === "sent"
        ? "Захиалга хадгалагдаж, админд имэйл илгээгдлээ."
        : "Захиалга хадгалагдлаа. Имэйл мэдэгдлийг шалгана уу."
    );

    $("orderForm").reset();
    await loadOrders();
    if (isAdmin) await loadAdmin();
  } catch (err) {
    notify(err.message);
  } finally {
    button.disabled = false;
  }
});

// Render orders
/**
 * STEP business rule function: renderOrder.
 * TODO: Describe purpose, side effects, and expected node/context state.
 * @param {*} order
 * @param {*} adminMode
 */
function renderOrder(order, adminMode = false) {
  const replies = Object.values(order.replies || {})
    .sort((a, b) => (a.at || 0) - (b.at || 0));

  const replyHtml = replies.map(reply => `
    <div class="reply-box">
      <small>Admin reply ·
        ${new Date(reply.at).toLocaleString("mn-MN")}
        ${adminMode ? " · " + escapeHtml(reply.emailStatus || "") : ""}
      </small>
      <p>${escapeHtml(reply.message)}</p>
    </div>
  `).join("");

  const controls = adminMode ? `
    <div class="admin-actions">
      <select data-status="${escapeHtml(order.id)}">
        ${Object.entries(STATUS).map(([value, label]) => `
          <option value="${value}"
            ${order.status === value ? "selected" : ""}>
            ${label}
          </option>
        `).join("")}
      </select>
      <button class="btn btn-primary"
        data-save="${escapeHtml(order.id)}">
        Төлөв хадгалах
      </button>
    </div>
    <textarea rows="4" data-reply="${escapeHtml(order.id)}"
      placeholder="Хэрэглэгчийн Gmail рүү илгээх хариу..."></textarea>
    <div class="admin-actions">
      <button class="btn btn-primary"
        data-send="${escapeHtml(order.id)}">
        Gmail рүү хариу илгээх ↗
      </button>
    </div>
  ` : "";

  return `
    <article class="order-card">
      <div class="order-head">
        <h3>${escapeHtml(order.serviceName)}</h3>
        <small>${new Date(order.createdAt).toLocaleString("mn-MN")}</small>
      </div>
      <p><b>Төлөв:</b> ${escapeHtml(STATUS[order.status] || order.status)}</p>
      <p><b>Эхлэх үнэ:</b> ${Number(order.price).toLocaleString("mn-MN")}₮</p>
      <p><b>Discord / Холбоо барих:</b> ${escapeHtml(order.discord)}</p>
      ${adminMode ? `<p><b>Email:</b> ${escapeHtml(order.email)}</p>` : ""}
      <p><b>Тайлбар:</b> ${escapeHtml(order.details)}</p>
      ${replyHtml}
      ${controls}
    </article>
  `;
}

async function loadOrders() {
  const user = currentUser;
  const data = await api("/api/orders");
  if (currentUser !== user) return;

  $("myOrders").innerHTML = data.orders.length
    ? data.orders.map(o => renderOrder(o)).join("")
    : "Одоогоор хүсэлт байхгүй.";
}

async function loadAdmin() {
  if (!isAdmin) return;

  const user = currentUser;
  const data = await api("/api/admin/orders");
  if (currentUser !== user) return;

  $("totalOrders").textContent = data.orders.length;
  $("pendingOrders").textContent =
    data.orders.filter(o => o.status === "pending").length;
  $("completedOrders").textContent =
    data.orders.filter(o => o.status === "completed").length;

  $("adminOrders").innerHTML = data.orders.length
    ? data.orders.map(o => renderOrder(o, true)).join("")
    : "Одоогоор хүсэлт байхгүй.";
}

// Refresh Admin
$("refreshAdmin").addEventListener("click", async () => {
  try {
    await loadAdmin();
    notify("Хүсэлтүүд шинэчлэгдлээ.");
  } catch (err) {
    notify(err.message);
  }
});

// Admin actions
$("adminOrders").addEventListener("click", async event => {
  const save = event.target.closest("[data-save]");
  const send = event.target.closest("[data-send]");

  if (!save && !send) return;

  const button = save || send;
  const id = save?.dataset.save || send.dataset.send;

  button.disabled = true;

  try {
    if (save) {
      const select = document.querySelector(
        `[data-status="${CSS.escape(id)}"]`
      );

      await api(`/api/admin/orders/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: select.value })
      });

      notify("Захиалгын төлөв хадгалагдлаа.");
    } else {
      const field = document.querySelector(
        `[data-reply="${CSS.escape(id)}"]`
      );
      const message = field.value.trim();

      if (message.length < 2) {
        throw new Error("Хариу бичнэ үү.");
      }

      if (!confirm("Хэрэглэгчийн Gmail рүү хариу илгээх үү?")) {
        return;
      }

      await api(`/api/admin/orders/${encodeURIComponent(id)}/reply`, {
        method: "POST",
        body: JSON.stringify({ message })
      });

      notify("Хариу Gmail рүү илгээгдлээ.");
    }

    await loadAdmin();
    await loadOrders();
  } catch (err) {
    notify(err.message);
  } finally {
    button.disabled = false;
  }
});
