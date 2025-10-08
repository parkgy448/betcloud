
/**
 * BetCloud Auth (auth.js)
 * - Firebase v8 compatible
 * - Works with existing DOM IDs if present:
 *   #loginModal, #registerModal
 *   #loginId, #loginPassword, #loginSubmit
 *   #regId, #regPassword, #regPasswordConfirm, #regName, #regBank, #regAccount, #regAccountName, #withdrawPassword, #registerSubmit
 *   #logoutBtn (optional)
 *   #userInfoSection (optional, will render a basic UI if empty)
 * - Exposes window.BCAuth API for other pages:
 *   BCAuth.onReady(cb), BCAuth.user(), BCAuth.userData(), BCAuth.requireApproved(), BCAuth.logout()
 */

(function () {
  // ==== Firebase Init ====
  const firebaseConfig = {
    apiKey: "AIzaSyAr_S6URDXWbjQ4Gh0Nw_JOeTkHA_G8Uis",
    authDomain: "cloud-casino-34cc6.firebaseapp.com",
    projectId: "cloud-casino-34cc6",
    storageBucket: "cloud-casino-34cc6.firebasestorage.app",
    messagingSenderId: "289867400095",
    appId: "1:289867400095:web:c9060c2a534225db9cf3aa",
  };

  if (!window.firebase) {
    console.error("[BCAuth] Firebase SDK가 로드되지 않았습니다. <script src=...firebase-app.js> 등을 먼저 포함하세요.");
    return;
  }
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
  const db = firebase.firestore();
  const auth = firebase.auth();

  // ==== Helpers ====
  const $ = (id) => document.getElementById(id);
  const openModal = (id) => { const el = $(id); if (el) el.classList.remove("hidden"); };
  const closeModal = (id) => { const el = $(id); if (el) el.classList.add("hidden"); };
  const showLoading = () => { const el = $("loadingSpinner"); if (el) el.classList.remove("hidden"); };
  const hideLoading = () => { const el = $("loadingSpinner"); if (el) el.classList.add("hidden"); };
  const esc = (s="") => String(s).replace(/[&<>\"']/g, (c)=>({ "&":"&amp;","<":"&lt;", ">":"&gt;", "\"":"&quot;","'":"&#39;" }[c]));

  // bcrypt (optional for withdraw password)
  const hasBcrypt = () => typeof window.bcrypt !== "undefined" && typeof window.bcrypt.hashSync === "function" && typeof window.bcrypt.compareSync === "function";

  // callbacks to fire when auth is ready/changed
  const readyCallbacks = [];

  const state = {
    user: null,
    userData: null,
  };

  function renderBasicUserInfo() {
    const box = $("userInfoSection");
    if (!box) return;
    if (!state.user || !state.userData) {
      // Render guest UI if empty
      if (!box.dataset.locked) {
        box.innerHTML = `
          <div class="flex flex-col md:flex-row md:items-center md:justify-between">
            <div class="mt-3 md:mt-0 flex space-x-2">
              <h3 class="font-bold text-lg">BETCLOUD에 오신 것을 환영합니다</h3>
              <p class="text-sm text-gray-300 mt-1">로그인 후 모든 서비스를 이용하세요</p>
            </div>
            <div class="w-full md:w-auto mt-4 md:mt-0">
              <div class="grid grid-cols-3 gap-2 w-full">
                <button id="__bc_login_btn" class="w-full h-12 md:h-16 rounded-lg text-lg md:text-2xl font-extrabold text-white shadow-lg bg-gradient-to-r from-orange-500 to-amber-500">Login</button>
                <button id="__bc_register_btn" class="w-full h-12 md:h-16 rounded-lg text-lg md:text-2xl font-extrabold text-white shadow-lg bg-gradient-to-r from-amber-400 to-yellow-500">Sign Up</button>
                <button id="__bc_anon_btn" class="w-full h-12 md:h-16 rounded-lg text-lg md:text-2xl font-extrabold text-white shadow-lg bg-gradient-to-r from-emerald-400 to-green-500">Anonymous</button>
              </div>
            </div>
          </div>
        `;
        const l = $("__bc_login_btn"); if (l) l.onclick = () => openModal("loginModal");
        const r = $("__bc_register_btn"); if (r) r.onclick = () => openModal("registerModal");
      }
      return;
    }
    // Logged in
    const u = state.userData;
    if (!box.dataset.locked) {
      box.innerHTML = `
        <div class="flex flex-col md:flex-row md:items-center md:justify-between">
          <div class="mt-3 md:mt-0 flex space-x-2">
            <h3 class="font-bold text-lg">${esc(u.name || u.userId)} 님</h3>
            <div class="flex items-center space-x-2 mt-2">
              <span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">${(u.point || 0).toLocaleString()}P</span>
              <span class="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">${(u.balance || 0).toLocaleString()}원</span>
            </div>
            ${u.status !== "active" ? `<div class="text-xs text-red-400 mt-1">승인 대기중입니다. 관리자 승인 후 이용 가능합니다.</div>` : ""}
          </div>
          <div class="mt-3 md:mt-0 flex space-x-2">
            ${(u && (u.role==="admin" || u.isAdmin===true)) ? `<a href="admin.html" class="bg-gradient-to-r from-orange-500 to-yellow-500 text-white px-4 py-2 rounded-md font-bold">관리자페이지</a>` : ""}
            <button id="logoutBtn" class="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-4 py-2 rounded-md font-bold">로그아웃</button>
          </div>
        </div>
      `;
    }
    const out = $("logoutBtn");
    if (out) out.onclick = logout;
  }

  async function pullUserData(uid) {
    try {
      const doc = await db.collection("users").doc(uid).get();
      return doc.exists ? doc.data() : null;
    } catch (e) {
      console.error("[BCAuth] 사용자 데이터 로드 실패:", e);
      return null;
    }
  }

  // ==== Login ====
  async function doLogin() {
    const userId = $("loginId")?.value?.trim();
    const password = $("loginPassword")?.value?.trim();
    if (!userId || !password) return alert("아이디와 비밀번호를 입력해주세요.");
    showLoading();
    try {
      const cred = await auth.signInWithEmailAndPassword(`${userId}@betcloud.com`, password);
      const data = await pullUserData(cred.user.uid);
      if (!data) {
        await auth.signOut();
        return alert("등록되지 않은 사용자입니다.");
      }
      if (data.status !== "active") {
        await auth.signOut();
        return alert("승인 대기 중인 계정입니다. 관리자 승인 후 이용 가능합니다.");
      }
      renderBasicUserInfo();
      closeModal("loginModal");
      alert(`${data.name || data.userId}님, 환영합니다!`);
    } catch (err) {
      console.error("[BCAuth] 로그인 오류:", err);
      let msg = "로그인 중 오류가 발생했습니다.";
      if (err.code === "auth/user-not-found") msg = "등록되지 않은 아이디입니다.";
      else if (err.code === "auth/wrong-password") msg = "비밀번호가 일치하지 않습니다.";
      else if (err.code === "auth/internal-error" && typeof err.message === "string" && err.message.includes("INVALID_LOGIN_CREDENTIALS")) msg = "비밀번호가 일치하지 않습니다.";
      alert(msg);
    } finally {
      hideLoading();
    }
  }

  // ==== Register ====
  async function doRegister() {
    const userId = $("regId")?.value?.trim();
    const password = $("regPassword")?.value?.trim();
    const passwordConfirm = $("regPasswordConfirm")?.value?.trim();
    const name = $("regName")?.value?.trim();
    const bank = $("regBank")?.value;
    const account = $("regAccount")?.value?.trim();
    const accountName = $("regAccountName")?.value?.trim();
    const withdrawPassword = $("withdrawPassword")?.value?.trim();

    if (!userId || !password || !passwordConfirm || !name || !bank || !account || !accountName || !withdrawPassword) {
      return alert("모든 필수 항목을 입력해주세요.");
    }
    if (password !== passwordConfirm) return alert("비밀번호가 일치하지 않습니다.");

    // Hash withdraw password if possible
    let hashedWithdrawPassword = withdrawPassword;
    if (hasBcrypt()) {
      try {
        hashedWithdrawPassword = bcrypt.hashSync(withdrawPassword, 10);
      } catch (e) {
        console.warn("[BCAuth] bcrypt 해시 실패, 평문 저장(데모용).");
      }
    }

    showLoading();
    try {
      const cred = await auth.createUserWithEmailAndPassword(`${userId}@betcloud.com`, password);
      const userData = {
        userId,
        name,
        bank,
        account,
        accountName,
        balance: 0,
        point: 0,
        joinDate: new Date().toISOString(),
        status: "pending",
        isAdmin: false,
        withdrawPassword: hashedWithdrawPassword,
      };
      await db.collection("users").doc(cred.user.uid).set(userData);
      await db.collection("approvalRequests").add({
        userId: cred.user.uid,
        status: "pending",
        requestDate: new Date().toISOString(),
        userInfo: { name, userId, joinDate: userData.joinDate, bank, account, accountName },
      });
      await auth.signOut();
      state.user = null; state.userData = null;
      renderBasicUserInfo();
      closeModal("registerModal");
      alert("회원가입 신청이 완료되었습니다. 관리자 승인 후 로그인이 가능합니다.");
    } catch (err) {
      console.error("[BCAuth] 회원가입 오류:", err);
      alert("회원가입 중 오류가 발생했습니다: " + (err.message || err));
      try { await auth.signOut(); } catch {}
    } finally {
      hideLoading();
    }
  }

  // ==== Logout ====
  async function logout() {
    try {
      await auth.signOut();
      state.user = null; state.userData = null;
      renderBasicUserInfo();
      alert("로그아웃 되었습니다.");
    } catch (e) {
      console.error("[BCAuth] 로그아웃 오류:", e);
      alert("로그아웃 중 오류가 발생했습니다.");
    }
  }

  // ==== Guards ====
  async function requireApproved() {
    if (!state.user) {
      openModal("loginModal");
      throw new Error("AUTH_REQUIRED");
    }
    if (!state.userData || state.userData.status !== "active") {
      alert("승인 대기 중인 계정입니다. 관리자 승인 후 이용 가능합니다.");
      throw new Error("NOT_APPROVED");
    }
    return true;
  }

  // ==== Wire DOM (if elements exist) ====
  function wireDom() {
    const loginBtn = $("loginSubmit");
    if (loginBtn && !loginBtn.dataset.bound) {
      loginBtn.dataset.bound = "1";
      loginBtn.addEventListener("click", doLogin);
    }
    const registerBtn = $("registerSubmit");
    if (registerBtn && !registerBtn.dataset.bound) {
      registerBtn.dataset.bound = "1";
      registerBtn.addEventListener("click", doRegister);
    }
    const logoutBtn = $("logoutBtn");
    if (logoutBtn && !logoutBtn.dataset.bound) {
      logoutBtn.dataset.bound = "1";
      logoutBtn.addEventListener("click", logout);
    }

    // Close modal when backdrop clicked (optional: elements with .modal)
    document.querySelectorAll(".modal").forEach((modal) => {
      if (modal.dataset.bcBound) return;
      modal.dataset.bcBound = "1";
      modal.addEventListener("click", function (e) {
        if (e.target === this) this.classList.add("hidden");
      });
    });
  }

  // ==== Auth Listener ====
  auth.onAuthStateChanged(async (user) => {
    state.user = user;
    state.userData = user ? await pullUserData(user.uid) : null;
    renderBasicUserInfo();
    wireDom();
    readyCallbacks.splice(0).forEach((cb) => {
      try { cb(user, state.userData); } catch(e){ console.error(e); }
    });
  });

  // Periodic wire (in case of SPA content swaps)
  setInterval(wireDom, 800);

  // ==== Public API ====
  window.BCAuth = {
    onReady(cb) {
      if (typeof cb !== "function") return;
      if (state.user !== undefined) cb(state.user, state.userData);
      else readyCallbacks.push(cb);
    },
    user() { return state.user; },
    userData() { return state.userData; },
    requireApproved,
    logout,
  };

})();

