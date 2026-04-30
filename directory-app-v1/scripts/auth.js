document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupForm");
  const signinForm = document.getElementById("signinForm");
  const forgotPasswordForm = document.getElementById("forgotPasswordForm");
  const whatsappCheckbox = document.getElementById("whatsappSameAsPhone");
  const whatsappFields = document.getElementById("whatsappFields");

  if (whatsappCheckbox && whatsappFields) {
    whatsappCheckbox.addEventListener("change", () => {
      whatsappFields.classList.toggle("hidden", whatsappCheckbox.checked);
    });
  }

  if (signupForm) {
    signupForm.addEventListener("submit", handleSignupSubmit);
  }

  if (signinForm) {
    signinForm.addEventListener("submit", handleSigninSubmit);
  }
  if (forgotPasswordForm) {
    forgotPasswordForm.addEventListener("submit", handleForgotPasswordSubmit);
  }
});

async function handleSignupSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const messageEl = document.getElementById("signupMessage");
  const submitButton = form.querySelector('button[type="submit"]');

  messageEl.textContent = "";
  messageEl.className = "form-message";

  submitButton.disabled = true;
  submitButton.textContent = "Creating account...";

  try {
    const formData = new FormData(form);

    const phoneCountryCode = formData.get("phone_country_code");
    const phone = formData.get("phone");
    const whatsappSameAsPhone = formData.get("whatsapp_same_as_phone") === "on";

    const whatsappCountryCode = whatsappSameAsPhone
      ? phoneCountryCode
      : formData.get("whatsapp_country_code");

    const whatsappNumber = whatsappSameAsPhone
      ? phone
      : formData.get("whatsapp");

    const payload = {
      grower_name: formData.get("grower_name"),
      contact_name: formData.get("contact_name"),
      email: formData.get("email"),
      password: formData.get("password"),
      phone_country_code: phoneCountryCode,
      phone,
      whatsapp_country_code: whatsappCountryCode,
      whatsapp: whatsappNumber,
    };

    const result = await apiPost("signup_grower", payload);

    messageEl.textContent = result.message || "Account created successfully.";
    messageEl.classList.add("success");

    form.reset();

    const mobileCountrySelect = form.querySelector(
      '[name="phone_country_code"]',
    );
    const whatsappCountrySelect = form.querySelector(
      '[name="whatsapp_country_code"]',
    );
    const checkbox = form.querySelector('[name="whatsapp_same_as_phone"]');
    const whatsappFieldsEl = document.getElementById("whatsappFields");

    if (mobileCountrySelect) mobileCountrySelect.value = "+60";
    if (whatsappCountrySelect) whatsappCountrySelect.value = "+60";
    if (checkbox) checkbox.checked = true;
    if (whatsappFieldsEl) whatsappFieldsEl.classList.add("hidden");
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.classList.add("error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Create grower account";
  }
}

async function handleSigninSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const messageEl = document.getElementById("signinMessage");
  const submitButton = form.querySelector('button[type="submit"]');

  messageEl.textContent = "";
  messageEl.className = "form-message";

  submitButton.disabled = true;
  submitButton.textContent = "Signing in...";

  try {
    const formData = new FormData(form);

    showGlobalLoading("Signing in...");

    const result = await apiPost("signin_grower", {
      email: formData.get("email"),
      password: formData.get("password"),
    });

    localStorage.setItem("keboon_session_token", result.session_token);
    localStorage.setItem(
      "keboon_session_expires_at",
      result.session_expires_at,
    );
    localStorage.setItem("keboon_grower_id", result.grower_id);
    localStorage.setItem("keboon_grower_name", result.grower_name || "");

    showGlobalLoading("Loading your profile and produce...");

    const appData = await apiPost("get_current_grower_app_data", {
      session_token: result.session_token,
    });

    storeGrowerAppData(appData);

    refreshPublicDirectoryCacheQuietly();

    messageEl.textContent = "Signed in successfully. Redirecting...";
    messageEl.classList.add("success");

    window.location.href = "./dashboard.html";
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.classList.add("error");
  } finally {
    hideGlobalLoading();
    submitButton.disabled = false;
    submitButton.textContent = "Sign in";
  }
}

function getStoredSession() {
  return {
    token: localStorage.getItem("keboon_session_token"),
    expires_at: localStorage.getItem("keboon_session_expires_at"),
    grower_id: localStorage.getItem("keboon_grower_id"),
    grower_name: localStorage.getItem("keboon_grower_name"),
  };
}

function clearStoredSession() {
  localStorage.removeItem("keboon_session_token");
  localStorage.removeItem("keboon_session_expires_at");
  localStorage.removeItem("keboon_grower_id");
  localStorage.removeItem("keboon_grower_name");
  clearStoredGrowerAppData();
}

async function handleForgotPasswordSubmit(event) {
  event.preventDefault();

  const form = event.target;
  const messageEl = document.getElementById("forgotPasswordMessage");
  const submitButton = form.querySelector('button[type="submit"]');

  messageEl.textContent = "";
  messageEl.className = "form-message";

  submitButton.disabled = true;
  submitButton.textContent = "Sending reset link...";

  try {
    const formData = new FormData(form);

    const result = await apiPost("request_password_reset", {
      email: formData.get("email"),
    });

    messageEl.textContent =
      result.message ||
      "If an account exists for this email, a password reset link has been sent.";
    messageEl.classList.add("success");

    form.reset();
  } catch (error) {
    messageEl.textContent = error.message;
    messageEl.classList.add("error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Send reset link";
  }
}

function showGlobalLoading(message = "Loading...") {
  const overlay = document.getElementById("globalLoadingOverlay");
  const text = document.getElementById("globalLoadingText");

  if (!overlay) {
    return;
  }

  if (text) {
    text.textContent = message;
  }

  overlay.classList.add("is-active");
  overlay.setAttribute("aria-hidden", "false");
}

function hideGlobalLoading() {
  const overlay = document.getElementById("globalLoadingOverlay");

  if (!overlay) {
    return;
  }

  overlay.classList.remove("is-active");
  overlay.setAttribute("aria-hidden", "true");
}

function storeGrowerAppData(data) {
  localStorage.setItem(
    "keboon_current_grower",
    JSON.stringify(data.grower || null),
  );
  localStorage.setItem(
    "keboon_current_products",
    JSON.stringify(data.products || []),
  );
  localStorage.setItem("keboon_cached_at", new Date().toISOString());
}

function getStoredGrower() {
  try {
    return JSON.parse(localStorage.getItem("keboon_current_grower") || "null");
  } catch (error) {
    return null;
  }
}

function getStoredProducts() {
  try {
    return JSON.parse(localStorage.getItem("keboon_current_products") || "[]");
  } catch (error) {
    return [];
  }
}

function clearStoredGrowerAppData() {
  localStorage.removeItem("keboon_current_grower");
  localStorage.removeItem("keboon_current_products");
  localStorage.removeItem("keboon_cached_at");
}

function getGrowerCacheAgeMs() {
  const cachedAt = localStorage.getItem("keboon_cached_at");

  if (!cachedAt) {
    return Infinity;
  }

  const cachedDate = new Date(cachedAt);

  if (Number.isNaN(cachedDate.getTime())) {
    return Infinity;
  }

  return Date.now() - cachedDate.getTime();
}

function hasGrowerAppCache() {
  const grower = getStoredGrower();

  return Boolean(grower && grower.grower_id);
}

function isGrowerCacheFresh(maxAgeMs = 5 * 60 * 1000) {
  return hasGrowerAppCache() && getGrowerCacheAgeMs() <= maxAgeMs;
}

function storePublicDirectoryData(data) {
  localStorage.setItem("keboon_public_directory", JSON.stringify(data || null));
  localStorage.setItem(
    "keboon_public_directory_cached_at",
    new Date().toISOString(),
  );
}

function getStoredPublicDirectoryData() {
  try {
    return JSON.parse(
      localStorage.getItem("keboon_public_directory") || "null",
    );
  } catch (error) {
    return null;
  }
}

function getPublicDirectoryCacheAgeMs() {
  const cachedAt = localStorage.getItem("keboon_public_directory_cached_at");

  if (!cachedAt) {
    return Infinity;
  }

  const cachedDate = new Date(cachedAt);

  if (Number.isNaN(cachedDate.getTime())) {
    return Infinity;
  }

  return Date.now() - cachedDate.getTime();
}

function hasPublicDirectoryCache() {
  const data = getStoredPublicDirectoryData();
  return Boolean(data && Array.isArray(data.growers));
}

function isPublicDirectoryCacheFresh(maxAgeMs = 10 * 60 * 1000) {
  return (
    hasPublicDirectoryCache() && getPublicDirectoryCacheAgeMs() <= maxAgeMs
  );
}

function clearPublicDirectoryCache() {
  localStorage.removeItem("keboon_public_directory");
  localStorage.removeItem("keboon_public_directory_cached_at");
}

async function refreshPublicDirectoryCacheQuietly() {
  try {
    const directoryData = await apiGet("public_directory");
    storePublicDirectoryData(directoryData);
  } catch (error) {
    // Do not block signin if public directory refresh fails.
  }
}
async function refreshGrowerAppDataQuietlyAfterSignin(sessionToken) {
  try {
    const appData = await apiPost("get_current_grower_app_data", {
      session_token: sessionToken,
    });

    storeGrowerAppData(appData);
  } catch (error) {
    // Do not block signin if full grower data refresh fails.
  }
}

function storeDirectoryLocationPreference(location) {
  localStorage.setItem("keboon_directory_location_preference", "nearby");
  localStorage.setItem(
    "keboon_directory_user_location",
    JSON.stringify(location),
  );
}

function storeDirectoryShowAllPreference() {
  localStorage.setItem("keboon_directory_location_preference", "all");
}

function getDirectoryLocationPreference() {
  return localStorage.getItem("keboon_directory_location_preference") || "all";
}

function getStoredDirectoryUserLocation() {
  try {
    return JSON.parse(
      localStorage.getItem("keboon_directory_user_location") || "null",
    );
  } catch (error) {
    return null;
  }
}
