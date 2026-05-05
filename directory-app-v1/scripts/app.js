document.addEventListener("DOMContentLoaded", () => {
  initPrivateTopbarActions();
  initPublicDirectoryPage();
  initDashboardPage();
  initEditProfilePage();
  initManageProducePage();
  initPreviewProfilePage();
  initInboxPage();
});

let profileMap = null;
let profileMarker = null;
let currentProducts = [];
let directoryMap = null;
let directoryMarkers = [];
let publicDirectoryGrowers = [];
let currentDirectoryResults = [];
let currentUserLocation = null;
let directoryCurrentPage = 1;
const DIRECTORY_PAGE_SIZE = 5;
const PROFILE_PRODUCE_PAGE_SIZE = 4;
const profileProducePages = {};
const DIRECTORY_RADIUS_KM = 20;

async function requireValidSession() {
  const session = getStoredSession();

  if (!session || !session.token) {
    clearStoredSession();
    window.location.href = "./signin.html";
    return null;
  }

  if (session.expires_at) {
    const expiresAt = new Date(session.expires_at);

    if (!Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date()) {
      clearStoredSession();
      window.location.href = "./signin.html";
      return null;
    }
  }

  return {
    session,
    grower: getStoredGrower(),
    products: getStoredProducts(),
  };
}

async function refreshGrowerAppData(sessionToken) {
  const appData = await apiPost("get_current_grower_app_data", {
    session_token: sessionToken,
  });

  storeGrowerAppData(appData);

  if (appData.grower) {
    localStorage.setItem(
      "keboon_grower_name",
      appData.grower.grower_name || "",
    );
  }

  return appData;
}

function handleInvalidSession() {
  clearStoredSession();
  window.location.href = "./signin.html";
}

async function initDashboardPage() {
  const dashboardTitle = document.getElementById("dashboardTitle");
  const signoutButton = document.getElementById("signoutButton");

  if (!dashboardTitle && !signoutButton) {
    return;
  }

  const auth = await requireValidSession();

  if (!auth) {
    return;
  }

  if (dashboardTitle) {
    dashboardTitle.textContent = `Welcome, ${auth.grower?.grower_name || auth.session.grower_name || "Grower"}`;
  }

  if (!isGrowerCacheFresh()) {
    refreshGrowerAppDataQuietly(auth.session.token, (appData) => {
      if (dashboardTitle) {
        dashboardTitle.textContent = `Welcome, ${appData.grower?.grower_name || "Grower"}`;
      }
    });
  }
}

async function initEditProfilePage() {
  const form = document.getElementById("editProfileForm");

  if (!form) {
    return;
  }

  const messageEl = document.getElementById("editProfileMessage");
  const submitButton = form.querySelector('button[type="submit"]');

  const auth = await requireValidSession();

  if (!auth) {
    return;
  }

  if (auth.grower) {
    fillEditProfileForm(form, auth.grower);
    initProfileLocationMap(form, auth.grower);
  } else {
    showGlobalLoading("Loading your profile...");

    try {
      const appData = await refreshGrowerAppData(auth.session.token);
      fillEditProfileForm(form, appData.grower);
      initProfileLocationMap(form, appData.grower);
    } catch (error) {
      handleInvalidSession();
      return;
    } finally {
      hideGlobalLoading();
    }
  }

  if (!isGrowerCacheFresh()) {
    refreshGrowerAppDataQuietly(auth.session.token, (appData) => {
      if (appData.grower) {
        fillEditProfileForm(form, appData.grower);

        if (!profileMap) {
          initProfileLocationMap(form, appData.grower);
        } else {
          updateMapFromFields(form);
        }
      }
    });
  }

  messageEl.textContent = "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    messageEl.textContent = "";
    messageEl.className = "form-message";

    submitButton.disabled = true;
    submitButton.textContent = "Saving profile...";

    try {
      showGlobalLoading("Saving your profile...");

      const formData = new FormData(form);

      const result = await apiPost("update_current_grower_profile", {
        session_token: auth.session.token,
        grower_name: formData.get("grower_name"),
        contact_name: formData.get("contact_name"),
        location_label: formData.get("location_label"),
        address_text: formData.get("address_text"),
        latitude: formData.get("latitude"),
        longitude: formData.get("longitude"),
        description: formData.get("description"),
        categories: formData.get("categories"),
        link_1_url: formData.get("link_1_url"),
        link_1_text: formData.get("link_1_text"),
        link_2_url: formData.get("link_2_url"),
        link_2_text: formData.get("link_2_text"),
        is_public: formData.get("is_public") === "on",
      });

      const appData = await refreshGrowerAppData(auth.session.token);

      if (appData.grower) {
        fillEditProfileForm(form, appData.grower);
      }

      clearPublicDirectoryCache();
      refreshPublicDirectoryCacheQuietly();

      messageEl.textContent = result.message || "Profile saved.";
      messageEl.classList.add("success");
    } catch (error) {
      messageEl.textContent = error.message;
      messageEl.classList.add("error");
    } finally {
      hideGlobalLoading();
      submitButton.disabled = false;
      submitButton.textContent = "Save profile";
    }
  });
}

async function initManageProducePage() {
  const form = document.getElementById("produceForm");
  const produceList = document.getElementById("produceList");

  if (!form || !produceList) {
    return;
  }

  const messageEl = document.getElementById("produceMessage");
  const submitButton = form.querySelector('button[type="submit"]');
  const clearButton = document.getElementById("clearProduceFormButton");
  const addButton = document.getElementById("addProduceButton");
  const closeEditorButton = document.getElementById("closeProduceEditorButton");
  const editorPanel = document.getElementById("produceEditorPanel");
  const auth = await requireValidSession();

  if (!auth) {
    return;
  }

  currentProducts = auth.products || [];
  renderProduceList(currentProducts);

  if (!currentProducts.length) {
    try {
      showGlobalLoading("Loading your produce...");
      currentProducts = await refreshCurrentGrowerProducts(auth.session.token);
      renderProduceList(currentProducts);
    } catch (error) {
      messageEl.textContent = error.message;
      messageEl.classList.add("error");
    } finally {
      hideGlobalLoading();
    }
  }

  if (!hasGrowerAppCache()) {
    showGlobalLoading("Loading your produce...");

    try {
      const appData = await refreshGrowerAppData(auth.session.token);

      currentProducts = appData.products || [];
      renderProduceList(currentProducts);
    } catch (error) {
      handleInvalidSession();
      return;
    } finally {
      hideGlobalLoading();
    }
  } else if (!isGrowerCacheFresh()) {
    refreshGrowerAppDataQuietly(auth.session.token, (appData) => {
      currentProducts = appData.products || [];
      renderProduceList(currentProducts);
    });
  }

  messageEl.textContent = "";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    messageEl.textContent = "";
    messageEl.className = "form-message";

    submitButton.disabled = true;
    submitButton.textContent = "Saving produce...";

    try {
      showGlobalLoading("Saving produce...");

      const formData = new FormData(form);

      const result = await apiPost("save_current_grower_product", {
        session_token: auth.session.token,
        product_id: formData.get("product_id"),
        product_name: formData.get("product_name"),
        category: formData.get("category"),
        description: formData.get("description"),
        price_text: formData.get("price_text"),
        availability_status: formData.get("availability_status"),
        harvest_timing: formData.get("harvest_timing"),
        pickup_options: formData.get("pickup_options"),
        is_public: formData.get("is_public") === "on",
      });

      clearProduceForm(form);

      const appData = await refreshGrowerAppData(auth.session.token);

      currentProducts = appData.products || [];
      renderProduceList(currentProducts);

      clearPublicDirectoryCache();
      refreshPublicDirectoryCacheQuietly();

      messageEl.textContent = result.message || "Produce saved.";
      messageEl.classList.add("success");
      closeProduceEditor();
    } catch (error) {
      messageEl.textContent = error.message;
      messageEl.classList.add("error");
    } finally {
      hideGlobalLoading();
      submitButton.disabled = false;
      submitButton.textContent = "Save produce";
    }
  });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      clearProduceForm(form);
      messageEl.textContent = "";
      messageEl.className = "form-message";
    });
  }
  if (addButton) {
    addButton.addEventListener("click", () => {
      clearProduceForm(form);
      messageEl.textContent = "";
      messageEl.className = "form-message";
      openProduceEditor();
    });
  }

  if (closeEditorButton) {
    closeEditorButton.addEventListener("click", () => {
      closeProduceEditor();
    });
  }

  if (editorPanel) {
    editorPanel.addEventListener("click", (event) => {
      if (event.target === editorPanel) {
        closeProduceEditor();
      }
    });
  }
}

async function loadCurrentGrowerProducts(sessionToken) {
  const produceList = document.getElementById("produceList");

  if (!produceList) {
    return;
  }

  produceList.innerHTML = '<p class="muted">Loading produce...</p>';

  try {
    const result = await apiPost("get_current_grower_products", {
      session_token: sessionToken,
    });

    currentProducts = result.products || [];
    renderProduceList(currentProducts);
  } catch (error) {
    produceList.innerHTML = `<p class="form-message error">${escapeHtml(error.message)}</p>`;
  }
}

function renderProduceList(products) {
  const produceList = document.getElementById("produceList");

  if (!produceList) {
    return;
  }

  if (!products.length) {
    produceList.innerHTML = `
      <div class="content-card">
        <p class="muted">No produce added yet. Use the Add produce button to create your first listing.</p>
      </div>
    `;
    return;
  }

  produceList.innerHTML = products
    .map((product) => {
      const isVisible =
        String(product.is_public).toLowerCase() === "true" &&
        product.availability_status !== "hidden";

      return `
      <button class="produce-crud-card" type="button" data-product-id="${escapeHtml(product.product_id)}">
        <div class="produce-crud-card-header">
          <div>
            <h3>${escapeHtml(product.product_name)}</h3>
            <p>${escapeHtml(product.category || "Uncategorized")}</p>
          </div>

          <span class="status-pill">
            ${isVisible ? "Public" : "Hidden"}
          </span>
        </div>

        <div class="grower-meta">
          <span class="meta-pill">${escapeHtml(product.availability_status || "available")}</span>
          ${product.price_text ? `<span class="meta-pill">${escapeHtml(product.price_text)}</span>` : ""}
        </div>
      </button>
    `;
    })
    .join("");

  produceList.querySelectorAll(".produce-crud-card").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = button.getAttribute("data-product-id");
      const product = currentProducts.find(
        (item) => item.product_id === productId,
      );

      if (product) {
        fillProduceForm(product);
        openProduceEditor();
      }
    });
  });
}

function fillProduceForm(product) {
  const form = document.getElementById("produceForm");
  const title = document.getElementById("produceFormTitle");

  if (!form) {
    return;
  }

  form.elements.product_id.value = product.product_id || "";
  form.elements.product_name.value = product.product_name || "";
  form.elements.category.value = product.category || "";
  form.elements.description.value = product.description || "";
  form.elements.price_text.value = product.price_text || "";
  form.elements.availability_status.value =
    product.availability_status || "available";
  form.elements.harvest_timing.value = product.harvest_timing || "";
  form.elements.pickup_options.value = product.pickup_options || "";
  form.elements.is_public.checked =
    String(product.is_public).toLowerCase() === "true";

  if (title) {
    title.textContent = "Edit produce";
  }

  window.scrollTo({
    top: 0,
    behavior: "smooth",
  });
}

function clearProduceForm(form) {
  form.reset();
  form.elements.product_id.value = "";
  form.elements.availability_status.value = "available";
  form.elements.is_public.checked = true;

  const title = document.getElementById("produceFormTitle");

  if (title) {
    title.textContent = "Add produce";
  }
}

function fillEditProfileForm(form, grower) {
  form.elements.grower_name.value = grower.grower_name || "";
  form.elements.contact_name.value = grower.contact_name || "";
  form.elements.location_label.value = grower.location_label || "";
  form.elements.address_text.value = grower.address_text || "";
  form.elements.latitude.value = grower.latitude || "";
  form.elements.longitude.value = grower.longitude || "";
  form.elements.description.value = grower.description || "";
  form.elements.categories.value = grower.categories || "";
  form.elements.link_1_url.value = grower.link_1_url || "";
  form.elements.link_1_text.value = grower.link_1_text || "";
  form.elements.link_2_url.value = grower.link_2_url || "";
  form.elements.link_2_text.value = grower.link_2_text || "";
  form.elements.is_public.checked =
    String(grower.is_public).toLowerCase() === "true";
}

function initProfileLocationMap(form, grower) {
  const mapEl = document.getElementById("profileLocationMap");
  const locationButton = document.getElementById("useCurrentLocationButton");
  const locationMessage = document.getElementById("locationMessage");

  if (!mapEl || typeof L === "undefined") {
    return;
  }

  const existingLat = Number(grower.latitude);
  const existingLng = Number(grower.longitude);

  const hasExistingLocation =
    !Number.isNaN(existingLat) &&
    !Number.isNaN(existingLng) &&
    existingLat >= -90 &&
    existingLat <= 90 &&
    existingLng >= -180 &&
    existingLng <= 180;

  const defaultLat = hasExistingLocation
    ? existingLat
    : APP_CONFIG.DEFAULT_MAP.LAT;
  const defaultLng = hasExistingLocation
    ? existingLng
    : APP_CONFIG.DEFAULT_MAP.LNG;
  const defaultZoom = hasExistingLocation ? 15 : APP_CONFIG.DEFAULT_MAP.ZOOM;

  profileMap = L.map(mapEl).setView([defaultLat, defaultLng], defaultZoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(profileMap);

  profileMarker = L.marker([defaultLat, defaultLng], {
    draggable: true,
  }).addTo(profileMap);

  if (!hasExistingLocation) {
    setLocationMessage(
      locationMessage,
      "Use current location or move the pin to your grower location.",
    );
  }

  profileMarker.on("dragend", () => {
    const position = profileMarker.getLatLng();
    updateLatLngFields(form, position.lat, position.lng);
    setLocationMessage(locationMessage, "Location pin updated.");
  });

  profileMap.on("click", (event) => {
    setMapLocation(form, event.latlng.lat, event.latlng.lng, 16);
    setLocationMessage(locationMessage, "Location pin updated.");
  });

  form.elements.latitude.addEventListener("change", () => {
    updateMapFromFields(form);
  });

  form.elements.longitude.addEventListener("change", () => {
    updateMapFromFields(form);
  });

  if (locationButton) {
    locationButton.addEventListener("click", () => {
      useBrowserLocation(form, locationMessage);
    });
  }

  if (!hasExistingLocation) {
    useBrowserLocation(form, locationMessage, false);
  }

  setTimeout(() => {
    profileMap.invalidateSize();
  }, 250);
}

function useBrowserLocation(form, locationMessage, showErrors = true) {
  if (!navigator.geolocation) {
    if (showErrors) {
      setLocationMessage(
        locationMessage,
        "Current location is not supported by this browser.",
      );
    }
    return;
  }

  setLocationMessage(locationMessage, "Getting your current location...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      setMapLocation(form, lat, lng, 16);
      setLocationMessage(
        locationMessage,
        "Current location detected. You can move the pin if needed.",
      );
    },
    () => {
      if (showErrors) {
        setLocationMessage(
          locationMessage,
          "Unable to get current location. You can move the pin manually.",
        );
      } else {
        setLocationMessage(
          locationMessage,
          "Use current location or move the pin to your grower location.",
        );
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    },
  );
}

function setMapLocation(form, lat, lng, zoom) {
  if (!profileMap || !profileMarker) {
    return;
  }

  updateLatLngFields(form, lat, lng);

  const nextLatLng = [Number(lat), Number(lng)];
  profileMarker.setLatLng(nextLatLng);
  profileMap.setView(nextLatLng, zoom || profileMap.getZoom());
}

function updateLatLngFields(form, lat, lng) {
  form.elements.latitude.value = Number(lat).toFixed(6);
  form.elements.longitude.value = Number(lng).toFixed(6);
}

function updateMapFromFields(form) {
  const lat = Number(form.elements.latitude.value);
  const lng = Number(form.elements.longitude.value);

  if (
    Number.isNaN(lat) ||
    Number.isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return;
  }

  setMapLocation(form, lat, lng, 16);
}

function setLocationMessage(element, message) {
  if (element) {
    element.textContent = message || "";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function initPublicDirectoryPage() {
  const mapEl = document.getElementById("directoryMap");
  const listEl = document.getElementById("directoryList");

  if (!mapEl || !listEl) {
    return;
  }

  const statusEl = document.getElementById("directoryStatus");
  const searchInput = document.getElementById("directorySearchInput");
  const searchButton = document.getElementById("directorySearchButton");
  const useLocationButton = document.getElementById(
    "directoryUseLocationButton",
  );
  const showAllButton = document.getElementById("directoryShowAllButton");
  const closeDrawerButton = document.getElementById("closeGrowerDrawerButton");

  setDirectoryStatus("Loading directory...");

  initDirectoryMap();

  const cachedDirectory = getStoredPublicDirectoryData();

  if (cachedDirectory && Array.isArray(cachedDirectory.growers)) {
    publicDirectoryGrowers = cachedDirectory.growers || [];
    currentDirectoryResults = publicDirectoryGrowers;

    trySetDirectoryLocationFromBrowser(true);
    applyDirectoryFilters(1);

    setDirectoryStatus(
      `Showing cached directory data from ${formatDisplayDateTime(cachedDirectory.generated_at)}.`,
    );
  }

  try {
    const shouldShowLoadingState = !cachedDirectory;

    if (shouldShowLoadingState) {
      setDirectoryStatus("Loading directory...");
    }

    const result = await apiGet("public_directory");

    storePublicDirectoryData(result);

    publicDirectoryGrowers = result.growers || [];
    currentDirectoryResults = publicDirectoryGrowers;

    trySetDirectoryLocationFromBrowser(true);
    applyDirectoryFilters(1);

    setDirectoryStatus(
      `Directory updated at ${formatDisplayDateTime(result.generated_at)}.`,
    );
  } catch (error) {
    if (!cachedDirectory) {
      setDirectoryStatus(error.message || "Unable to load directory.");
      listEl.innerHTML = `<p class="form-message error">${escapeHtml(error.message)}</p>`;
    } else {
      setDirectoryStatus(
        "Showing cached directory data. Fresh update is unavailable right now.",
      );
    }
  }

  if (searchButton) {
    searchButton.onclick = () => {
      applyDirectoryFilters(1);
    };
  }

  if (searchInput) {
    searchInput.onkeydown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        applyDirectoryFilters(1);
      }
    };
  }

  if (useLocationButton) {
    useLocationButton.onclick = () => {
      trySetDirectoryLocationFromBrowser(true);
    };
  }

  if (showAllButton) {
    showAllButton.onclick = () => {
      currentUserLocation = null;
      storeDirectoryShowAllPreference();

      currentDirectoryResults = filterDirectoryGrowers(
        searchInput ? searchInput.value : "",
      );

      renderDirectory(currentDirectoryResults, 1);
      setDirectoryStatus("Showing all public growers.");

      if (directoryMap && directoryMarkers.length) {
        const group = L.featureGroup(directoryMarkers);
        directoryMap.fitBounds(group.getBounds().pad(0.18));
      }
    };
  }

  if (cachedDirectory && isPublicDirectoryCacheFresh()) {
    return;
  }

  if (closeDrawerButton) {
    closeDrawerButton.addEventListener("click", closeGrowerDrawer);
  }

  const drawer = document.getElementById("growerDrawer");

  if (drawer) {
    drawer.addEventListener("click", (event) => {
      if (event.target === drawer) {
        closeGrowerDrawer();
      }
    });
  }
}

function initDirectoryMap() {
  const mapEl = document.getElementById("directoryMap");

  if (!mapEl || typeof L === "undefined") {
    return;
  }

  directoryMap = L.map(mapEl).setView(
    [APP_CONFIG.DEFAULT_MAP.LAT, APP_CONFIG.DEFAULT_MAP.LNG],
    APP_CONFIG.DEFAULT_MAP.ZOOM,
  );

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(directoryMap);

  setTimeout(() => {
    directoryMap.invalidateSize();
  }, 250);
}

function renderDirectory(growers, page = 1) {
  directoryCurrentPage = page;

  renderDirectoryList(growers, page);
  renderDirectoryMarkers(growers);
  updateDirectoryCount(growers.length);
  renderDirectoryPagination(growers);
  zoomToCurrentUserLocation();
}

function renderDirectoryList(growers, page = 1) {
  const listEl = document.getElementById("directoryList");

  if (!listEl) {
    return;
  }

  if (!growers.length) {
    listEl.innerHTML = '<p class="muted">No growers found.</p>';
    return;
  }

  const startIndex = (page - 1) * DIRECTORY_PAGE_SIZE;
  const pageGrowers = growers.slice(
    startIndex,
    startIndex + DIRECTORY_PAGE_SIZE,
  );

  listEl.innerHTML = pageGrowers
    .map((grower) => {
      const productCount = grower.products ? grower.products.length : 0;
      const distanceText = currentUserLocation
        ? formatDistanceKm(grower.distance_km)
        : "Use location to see distance";

      return `
      <button class="directory-grower-card" type="button" data-grower-id="${escapeHtml(grower.grower_id)}">
        <h3>${escapeHtml(grower.grower_name)}</h3>
        <p>${escapeHtml(grower.location_label || "Location not listed")}</p>
        <div class="grower-meta">
          <span class="meta-pill">${escapeHtml(grower.categories || "Grower")}</span>
          <span class="meta-pill">${productCount} produce listed</span>
          <span class="meta-pill">${escapeHtml(distanceText)}</span>
        </div>
      </button>
    `;
    })
    .join("");

  listEl.querySelectorAll(".directory-grower-card").forEach((button) => {
    button.addEventListener("click", () => {
      const growerId = button.getAttribute("data-grower-id");
      const grower = publicDirectoryGrowers.find(
        (item) => item.grower_id === growerId,
      );

      if (grower) {
        focusDirectoryGrower(grower);
        openDirectoryMarkerPopup(grower.grower_id);
      }
    });
  });
}

function renderDirectoryMarkers(growers) {
  if (!directoryMap) {
    return;
  }

  directoryMarkers.forEach((marker) => marker.remove());
  directoryMarkers = [];

  growers.forEach((grower) => {
    const lat = Number(grower.latitude);
    const lng = Number(grower.longitude);

    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return;
    }

    const marker = L.marker([lat, lng], {
      icon: getGreenMapMarkerIcon(),
      growerId: grower.grower_id,
    }).addTo(directoryMap);

    marker.bindPopup(renderMarkerPopup(grower));

    directoryMarkers.push(marker);
  });

  const isNearbyMode = getDirectoryLocationPreference() === "nearby";

  if (directoryMarkers.length && !currentUserLocation && !isNearbyMode) {
    const group = L.featureGroup(directoryMarkers);
    directoryMap.fitBounds(group.getBounds().pad(0.18));
  }
}

function updateDirectoryCount(count) {
  const countEl = document.getElementById("directoryCount");

  if (countEl) {
    countEl.textContent = `${count} grower${count === 1 ? "" : "s"} found`;
  }
}

function setDirectoryStatus(message) {
  const statusEl = document.getElementById("directoryStatus");

  if (statusEl) {
    statusEl.textContent = message || "";
  }
}

function focusDirectoryGrower(grower) {
  if (!directoryMap) {
    return;
  }

  const lat = Number(grower.latitude);
  const lng = Number(grower.longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return;
  }

  directoryMap.setView([lat, lng], 15);
}

function filterDirectoryGrowers(query) {
  const searchTerm = String(query || "")
    .trim()
    .toLowerCase();

  if (!searchTerm) {
    return [...publicDirectoryGrowers];
  }

  return publicDirectoryGrowers.filter((grower) => {
    const products = grower.products || [];

    const searchableText = [
      grower.grower_name,
      grower.location_label,
      grower.description,
      grower.categories,
      ...products.map((product) => product.product_name),
      ...products.map((product) => product.category),
      ...products.map((product) => product.description),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return searchableText.includes(searchTerm);
  });
}

function formatDisplayDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toLocaleString();
}

function openGrowerDrawer(grower) {
  const drawer = document.getElementById("growerDrawer");
  const content = document.getElementById("growerDrawerContent");

  if (!drawer || !content) {
    return;
  }

  const products = grower.products || [];

  content.innerHTML = `
    <h1 class="drawer-grower-title">${escapeHtml(grower.grower_name)}</h1>

    <p class="muted">${escapeHtml(grower.location_label || "Location not listed")}</p>

    <div class="grower-meta">
      <span class="meta-pill">${escapeHtml(grower.categories || "Grower")}</span>
      <span class="meta-pill">${products.length} produce listed</span>
    </div>

    <section class="drawer-section">
      <h2>About</h2>
      <p class="muted">
        ${escapeHtml(grower.description || "No description added yet.")}
      </p>
    </section>

        <section class="drawer-section">
  <h2>Links</h2>
  ${renderGrowerLinks(grower)}
</section>

<section class="drawer-section">
  <h2>Available produce</h2>
  ${renderDrawerProducts(products, `drawer-${grower.grower_id}`)}
</section>

    <section class="drawer-section drawer-section-separated">
  <details class="drawer-enquiry-panel">
    <summary>
      <span>Send enquiry</span>
      <span class="summary-helper">Contact this grower through Keboon</span>
    </summary>

    <form id="publicEnquiryForm" class="form-stack enquiry-form">
      <input type="hidden" name="grower_id" value="${escapeHtml(grower.grower_id)}" />

      <label>
        Interested Produce
        <select name="product_id">
          <option value="">General enquiry</option>
          ${products
            .map(
              (product) => `
            <option value="${escapeHtml(product.product_id)}">
              ${escapeHtml(product.product_name)}
            </option>
          `,
            )
            .join("")}
        </select>
      </label>

      ${(() => {
        const session =
          typeof getStoredSession === "function" ? getStoredSession() : null;

        const isLoggedInGrower = Boolean(session && session.token);

        if (isLoggedInGrower) {
          return `
      <div class="enquiry-signed-in-note">
        <strong>Sending as ${escapeHtml(session.grower_name || "your grower account")}</strong>
        <span>Your grower account details will be used for this enquiry.</span>
      </div>
    `;
        }

        return `
    <label>
      Your Name
      <input type="text" name="sender_name" required />
    </label>

    <label>
      Your Email
      <input type="email" name="sender_email" required />
    </label>

    <label>
      Your Phone
      <input type="tel" name="sender_phone" />
    </label>
  `;
      })()}

      <label>
        Message
        <textarea
          name="message"
          rows="4"
          placeholder="Ask about availability, pickup, or anything you need to know"
          required
        ></textarea>
      </label>

      <button type="submit" class="primary-button">
        Send enquiry
      </button>

      <p id="publicEnquiryMessage" class="form-message"></p>
    </form>
  </details>
</section>
  `;

  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  initPublicEnquiryForm();
}

function closeGrowerDrawer() {
  const drawer = document.getElementById("growerDrawer");

  if (!drawer) {
    return;
  }

  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
}

function renderDrawerProducts(products, contextId = "drawer") {
  return renderPaginatedProfileProducts(
    products,
    contextId,
    "No produce listed yet.",
  );
}

function initPublicEnquiryForm() {
  const form = document.getElementById("publicEnquiryForm");

  if (!form) {
    return;
  }

  const messageEl = document.getElementById("publicEnquiryMessage");
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    messageEl.textContent = "";
    messageEl.className = "form-message";

    submitButton.disabled = true;
    submitButton.textContent = "Sending enquiry...";

    try {
      const formData = new FormData(form);
      const session =
        typeof getStoredSession === "function" ? getStoredSession() : null;

      const payload = {
        grower_id: formData.get("grower_id"),
        product_id: formData.get("product_id"),
        message: formData.get("message"),
        source_page: "public_directory",
      };

      if (session && session.token) {
        payload.session_token = session.token;
      } else {
        payload.sender_name = formData.get("sender_name");
        payload.sender_email = formData.get("sender_email");
        payload.sender_phone = formData.get("sender_phone");
      }

      const result = await apiPost("submit_public_enquiry", payload);

      messageEl.textContent = result.message || "Your enquiry has been sent.";
      messageEl.classList.add("success");

      form.reset();
    } catch (error) {
      messageEl.textContent = error.message;
      messageEl.classList.add("error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Send enquiry";
    }
  });
}

function trySetDirectoryLocationFromBrowser(showMessage) {
  if (!navigator.geolocation) {
    if (showMessage) {
      setDirectoryStatus("Current location is not supported by this browser.");
    }

    applyDirectoryFilters(1);
    return;
  }

  if (showMessage) {
    setDirectoryStatus("Getting your current location...");
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentUserLocation = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };

      storeDirectoryLocationPreference(currentUserLocation);

      applyDirectoryFilters(1);

      if (directoryMap) {
        directoryMap.setView(
          [currentUserLocation.lat, currentUserLocation.lng],
          14,
        );

        L.circleMarker([currentUserLocation.lat, currentUserLocation.lng], {
          radius: 7,
        })
          .addTo(directoryMap)
          .bindPopup("Your location");
      }

      setDirectoryStatus(
        `Showing growers within ${DIRECTORY_RADIUS_KM} km of your location.`,
      );
    },
    () => {
      if (showMessage) {
        setDirectoryStatus(
          "Unable to get current location. You can still browse all growers.",
        );
      }

      applyDirectoryFilters(1);
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 60000,
    },
  );
}

function sortDirectoryByDistance() {
  if (!currentUserLocation) {
    return;
  }

  publicDirectoryGrowers.forEach((grower) => {
    grower.distance_km = calculateDistanceKm(
      currentUserLocation.lat,
      currentUserLocation.lng,
      Number(grower.latitude),
      Number(grower.longitude),
    );
  });

  currentDirectoryResults = currentDirectoryResults
    .map((grower) => {
      return {
        ...grower,
        distance_km: calculateDistanceKm(
          currentUserLocation.lat,
          currentUserLocation.lng,
          Number(grower.latitude),
          Number(grower.longitude),
        ),
      };
    })
    .filter((grower) => {
      return (
        Number.isFinite(grower.distance_km) &&
        grower.distance_km <= DIRECTORY_RADIUS_KM
      );
    })
    .sort((a, b) => a.distance_km - b.distance_km);
}

function calculateDistanceKm(lat1, lng1, lat2, lng2) {
  if (
    Number.isNaN(lat1) ||
    Number.isNaN(lng1) ||
    Number.isNaN(lat2) ||
    Number.isNaN(lng2)
  ) {
    return null;
  }

  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function formatDistanceKm(distanceKm) {
  if (!Number.isFinite(distanceKm)) {
    return "Distance unavailable";
  }

  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m away`;
  }

  return `${distanceKm.toFixed(1)} km away`;
}

function renderDirectoryPagination(growers) {
  const listEl = document.getElementById("directoryList");

  if (!listEl) {
    return;
  }

  const totalPages = Math.ceil(growers.length / DIRECTORY_PAGE_SIZE);

  if (totalPages <= 1) {
    return;
  }

  const pagination = document.createElement("div");
  pagination.className = "directory-pagination";

  const previousButton = document.createElement("button");
  previousButton.type = "button";
  previousButton.className = "secondary-button";
  previousButton.textContent = "Previous";
  previousButton.disabled = directoryCurrentPage <= 1;

  const pageText = document.createElement("span");
  pageText.className = "pagination-text";
  pageText.textContent = `Page ${directoryCurrentPage} of ${totalPages}`;

  const nextButton = document.createElement("button");
  nextButton.type = "button";
  nextButton.className = "secondary-button";
  nextButton.textContent = "Next";
  nextButton.disabled = directoryCurrentPage >= totalPages;

  previousButton.addEventListener("click", () => {
    renderDirectory(growers, directoryCurrentPage - 1);
  });

  nextButton.addEventListener("click", () => {
    renderDirectory(growers, directoryCurrentPage + 1);
  });

  pagination.appendChild(previousButton);
  pagination.appendChild(pageText);
  pagination.appendChild(nextButton);

  listEl.appendChild(pagination);
}

function applyDirectoryFilters(page = 1) {
  const searchInput = document.getElementById("directorySearchInput");
  const query = searchInput ? searchInput.value : "";

  currentDirectoryResults = filterDirectoryGrowers(query);

  const preference = getDirectoryLocationPreference();

  if (preference === "nearby" && currentUserLocation) {
    sortDirectoryByDistance();
  }

  renderDirectory(currentDirectoryResults, page);
}

async function refreshGrowerAppDataQuietly(sessionToken, onSuccess) {
  try {
    const appData = await refreshGrowerAppData(sessionToken);

    if (typeof onSuccess === "function") {
      onSuccess(appData);
    }

    return appData;
  } catch (error) {
    handleInvalidSession();
    return null;
  }
}
async function initPreviewProfilePage() {
  const previewContent = document.getElementById("profilePreviewContent");

  if (!previewContent) {
    return;
  }

  const auth = await requireValidSession();

  if (!auth) {
    return;
  }

  if (auth.grower) {
    renderProfilePreview(auth.grower, auth.products || []);

    if (!auth.products || !auth.products.length) {
      try {
        const products = await refreshCurrentGrowerProducts(auth.session.token);
        renderProfilePreview(auth.grower, products);
      } catch (error) {
        renderProfilePreview(auth.grower, []);
      }
    }
  } else {
    showGlobalLoading("Loading your profile preview...");

    try {
      const appData = await refreshGrowerAppData(auth.session.token);
      renderProfilePreview(appData.grower, appData.products || []);
    } catch (error) {
      handleInvalidSession();
      return;
    } finally {
      hideGlobalLoading();
    }
  }

  if (!isGrowerCacheFresh()) {
    refreshGrowerAppDataQuietly(auth.session.token, (appData) => {
      renderProfilePreview(appData.grower, appData.products || []);
    });
  }
}

function renderProfilePreview(grower, products) {
  const previewContent = document.getElementById("profilePreviewContent");

  if (!previewContent || !grower) {
    return;
  }

  const publicStatusText = getProfilePublicStatusText(grower);
  const visibleProducts = (products || []).filter((product) => {
    return (
      String(product.is_public).toLowerCase() === "true" &&
      product.availability_status !== "hidden"
    );
  });

  previewContent.innerHTML = `
    <article class="profile-preview">
      <div class="profile-preview-header">
        <div>
          <p class="eyebrow">Public profile preview</p>
          <h2>${escapeHtml(grower.grower_name || "Unnamed grower")}</h2>
          <p class="muted">${escapeHtml(grower.location_label || "Location not listed")}</p>
        </div>

        <span class="status-pill">${escapeHtml(publicStatusText)}</span>
      </div>

      <div class="grower-meta">
        <span class="meta-pill">${escapeHtml(grower.categories || "Grower")}</span>
        <span class="meta-pill">${visibleProducts.length} public produce listed</span>
      </div>

      <section class="drawer-section">
        <h2>About</h2>
        <p class="muted">
          ${escapeHtml(grower.description || "No description added yet.")}
        </p>
      </section>

      <section class="drawer-section">
  <h2>Links</h2>
  ${renderGrowerLinks(grower)}
</section>

<section class="drawer-section">
  <h2>Available produce</h2>
  ${renderPreviewProducts(
    visibleProducts,
    `preview-${grower.grower_id || "current"}`,
  )}
</section>
    </article>
  `;
}

function renderPreviewProducts(products, contextId = "preview") {
  return renderPaginatedProfileProducts(
    products,
    contextId,
    "No public produce listed yet.",
  );
}

function getProfilePublicStatusText(grower) {
  const isPublic = String(grower.is_public).toLowerCase() === "true";

  if (
    grower.account_status === "active" &&
    grower.email_verification_status === "verified" &&
    grower.approval_status === "approved" &&
    isPublic
  ) {
    return "Visible publicly";
  }

  if (!isPublic) {
    return "Hidden";
  }

  if (grower.approval_status !== "approved") {
    return "Pending approval";
  }

  return "Not publicly visible";
}
function renderMarkerPopup(grower) {
  const products = grower.products || [];
  const firstProducts = products.slice(0, 5);
  const remainingCount = Math.max(products.length - firstProducts.length, 0);

  const produceText = firstProducts.length
    ? firstProducts
        .map((product) => escapeHtml(product.product_name))
        .join(", ")
    : "No produce listed yet";

  const moreText = remainingCount > 0 ? ` +${remainingCount} more` : "";

  return `
    <div class="map-popup map-popup-compact">
      <h3>${escapeHtml(grower.grower_name || "Grower")}</h3>
      <p class="map-popup-location">${escapeHtml(grower.location_label || "Location not listed")}</p>

      <p class="map-popup-produce-text">
        ${produceText}${escapeHtml(moreText)}
      </p>

      <button
        type="button"
        class="map-popup-button"
        onclick="openGrowerFromPopup('${escapeHtml(grower.grower_id)}')"
      >
        View profile
      </button>
    </div>
  `;
}

function openGrowerFromPopup(growerId) {
  const grower = publicDirectoryGrowers.find(
    (item) => item.grower_id === growerId,
  );

  if (!grower) {
    return;
  }

  openGrowerDrawer(grower);
  focusDirectoryGrower(grower);
}
window.openGrowerFromPopup = openGrowerFromPopup;
function getGreenMapMarkerIcon() {
  return L.divIcon({
    className: "keboon-map-marker",
    html: `
      <svg viewBox="0 0 32 42" width="32" height="42" aria-hidden="true">
        <path
          d="M16 1C8.3 1 2 7.3 2 15c0 10.5 14 26 14 26s14-15.5 14-26C30 7.3 23.7 1 16 1Z"
          fill="#2f6b3f"
          stroke="#214d2d"
          stroke-width="2"
        />
        <circle cx="16" cy="15" r="6" fill="#ffffff" />
      </svg>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -40],
  });
}
function openProduceEditor() {
  const panel = document.getElementById("produceEditorPanel");

  if (!panel) {
    return;
  }

  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
}

function closeProduceEditor() {
  const panel = document.getElementById("produceEditorPanel");

  if (!panel) {
    return;
  }

  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
}

async function refreshCurrentGrowerProducts(sessionToken) {
  const result = await apiPost("get_current_grower_products", {
    session_token: sessionToken,
  });

  const products = result.products || [];

  localStorage.setItem("keboon_current_products", JSON.stringify(products));
  localStorage.setItem("keboon_cached_at", new Date().toISOString());

  return products;
}

function openDirectoryMarkerPopup(growerId) {
  const marker = directoryMarkers.find((item) => {
    return item.options && item.options.growerId === growerId;
  });

  if (marker) {
    marker.openPopup();
  }
}

function renderGrowerLinks(grower) {
  const links = [
    {
      url: grower.link_1_url,
      text: grower.link_1_text,
    },
    {
      url: grower.link_2_url,
      text: grower.link_2_text,
    },
  ]
    .map((link) => {
      const url = normalizeDisplayUrl(link.url);

      if (!url) {
        return null;
      }

      return {
        url,
        text: cleanLinkText(link.text, url),
      };
    })
    .filter(Boolean);

  if (!links.length) {
    return '<p class="muted">No links added yet.</p>';
  }

  return `
    <div class="grower-links-list">
      ${links
        .map(
          (link) => `
        <a
          class="grower-link-button"
          href="${escapeHtml(link.url)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span>${escapeHtml(link.text)}</span>
          <small>${escapeHtml(getUrlHost(link.url))}</small>
        </a>
      `,
        )
        .join("")}
    </div>
  `;
}

function cleanLinkText(value, fallbackUrl) {
  const text = String(value || "").trim();

  if (text) {
    return text;
  }

  return getUrlHost(fallbackUrl);
}

function normalizeDisplayUrl(value) {
  const rawValue = String(value || "").trim();

  if (!rawValue) {
    return "";
  }

  if (rawValue.startsWith("http://") || rawValue.startsWith("https://")) {
    return rawValue;
  }

  return `https://${rawValue}`;
}

function getUrlHost(value) {
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch (error) {
    return value;
  }
}

function applySavedDirectoryLocationPreference() {
  const preference = getDirectoryLocationPreference();

  if (preference !== "nearby") {
    currentUserLocation = null;
    return;
  }

  const savedLocation = getStoredDirectoryUserLocation();

  if (
    !savedLocation ||
    !Number.isFinite(Number(savedLocation.lat)) ||
    !Number.isFinite(Number(savedLocation.lng))
  ) {
    currentUserLocation = null;
    return;
  }

  currentUserLocation = {
    lat: Number(savedLocation.lat),
    lng: Number(savedLocation.lng),
  };

  if (directoryMap) {
    directoryMap.setView(
      [currentUserLocation.lat, currentUserLocation.lng],
      14,
    );

    L.circleMarker([currentUserLocation.lat, currentUserLocation.lng], {
      radius: 7,
    })
      .addTo(directoryMap)
      .bindPopup("Your location");
  }

  setDirectoryStatus(
    `Showing growers within ${DIRECTORY_RADIUS_KM} km of your location.`,
  );
  zoomToCurrentUserLocation();
}
document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("#closeGrowerDrawerButton");

  if (closeButton) {
    event.preventDefault();
    closeGrowerDrawer();
  }
});
document.addEventListener("click", (event) => {
  const button = event.target.closest(".profile-produce-page-button");

  if (!button) {
    return;
  }

  event.preventDefault();

  const contextId = button.getAttribute("data-profile-produce-context");
  const action = button.getAttribute("data-profile-produce-action");

  if (!contextId || !action) {
    return;
  }

  const currentPage = profileProducePages[contextId] || 1;

  if (action === "prev") {
    profileProducePages[contextId] = Math.max(1, currentPage - 1);
  }

  if (action === "next") {
    profileProducePages[contextId] = currentPage + 1;
  }

  if (contextId.startsWith("drawer-")) {
    const growerId = contextId.replace("drawer-", "");
    const grower = publicDirectoryGrowers.find(
      (item) => item.grower_id === growerId,
    );

    if (grower) {
      openGrowerDrawer(grower);
    }

    return;
  }

  if (contextId.startsWith("preview-")) {
    const grower = getStoredGrower();
    const products = getStoredProducts();

    if (grower) {
      renderProfilePreview(grower, products);
    }
  }
});
document.addEventListener("click", (event) => {
  const closeButton = event.target.closest("#closeMailboxThreadButton");

  if (closeButton) {
    event.preventDefault();
    closeMailboxThreadDrawer();
  }

  const drawer = document.getElementById("mailboxThreadDrawer");

  if (drawer && event.target === drawer) {
    closeMailboxThreadDrawer();
  }
});
function zoomToCurrentUserLocation() {
  if (!directoryMap || !currentUserLocation) {
    return;
  }

  const latLng = [currentUserLocation.lat, currentUserLocation.lng];

  directoryMap.setView(latLng, 14);

  setTimeout(() => {
    if (directoryMap && currentUserLocation) {
      directoryMap.invalidateSize();
      directoryMap.setView(latLng, 14);
    }
  }, 250);

  setTimeout(() => {
    if (directoryMap && currentUserLocation) {
      directoryMap.setView(latLng, 14);
    }
  }, 600);
}

function renderPaginatedProfileProducts(products, contextId, emptyMessage) {
  if (!products.length) {
    return `<p class="muted">${escapeHtml(emptyMessage)}</p>`;
  }

  const safeContextId = String(contextId || "profile").replace(
    /[^a-zA-Z0-9_-]/g,
    "",
  );
  const totalPages = Math.max(
    1,
    Math.ceil(products.length / PROFILE_PRODUCE_PAGE_SIZE),
  );
  const currentPage = Math.min(
    Math.max(profileProducePages[safeContextId] || 1, 1),
    totalPages,
  );

  profileProducePages[safeContextId] = currentPage;

  const startIndex = (currentPage - 1) * PROFILE_PRODUCE_PAGE_SIZE;
  const pageProducts = products.slice(
    startIndex,
    startIndex + PROFILE_PRODUCE_PAGE_SIZE,
  );

  return `
    <div
      class="profile-produce-pagination-wrap"
      data-profile-produce-context="${escapeHtml(safeContextId)}"
    >
      <div class="drawer-product-list collapsible-product-list">
        ${pageProducts
          .map(
            (product) => `
          <details class="collapsible-product-card">
            <summary>
              <span>${escapeHtml(product.product_name)}</span>
              <span class="meta-pill">${escapeHtml(product.availability_status || "available")}</span>
            </summary>

            <div class="collapsible-product-body">
              ${product.description ? `<p>${escapeHtml(product.description)}</p>` : ""}
              <div class="grower-meta">
                <span class="meta-pill">${escapeHtml(product.category || "Produce")}</span>
              </div>
              ${product.price_text ? `<p><strong>Price:</strong> ${escapeHtml(product.price_text)}</p>` : ""}
              ${product.harvest_timing ? `<p><strong>Timing:</strong> ${escapeHtml(product.harvest_timing)}</p>` : ""}
              ${product.pickup_options ? `<p><strong>Pickup:</strong> ${escapeHtml(product.pickup_options)}</p>` : ""}
            </div>
          </details>
        `,
          )
          .join("")}
      </div>

      ${
        totalPages > 1
          ? `
        <div class="profile-produce-pagination">
          <button
            type="button"
            class="secondary-button profile-produce-page-button"
            data-profile-produce-action="prev"
            data-profile-produce-context="${escapeHtml(safeContextId)}"
            ${currentPage === 1 ? "disabled" : ""}
          >
            Previous
          </button>

          <span class="pagination-text">
            Page ${currentPage} of ${totalPages}
          </span>

          <button
            type="button"
            class="secondary-button profile-produce-page-button"
            data-profile-produce-action="next"
            data-profile-produce-context="${escapeHtml(safeContextId)}"
            ${currentPage === totalPages ? "disabled" : ""}
          >
            Next
          </button>
        </div>
      `
          : ""
      }
    </div>
  `;
}

function initPrivateTopbarActions() {
  const signoutButton = document.getElementById("signoutButton");

  if (!signoutButton) {
    return;
  }

  signoutButton.onclick = () => {
    clearStoredSession();
    clearStoredInboxData();
    clearAllStoredInboxThreadData();
    window.location.href = "./signin.html";
  };
  refreshInboxUnreadCountQuietly();
}
let currentInboxEnquiries = [];

async function initInboxPage() {
  const mailboxList = document.getElementById("mailboxList");

  if (!mailboxList) {
    return;
  }

  console.log("Inbox init started");

  const auth = await requireValidSession();

  if (!auth) {
    return;
  }

  const filterSelect = document.getElementById("mailboxFilter");
  const sortSelect = document.getElementById("mailboxSort");
  const searchInput = document.getElementById("mailboxSearchInput");
  const refreshButton = document.getElementById("mailboxRefreshButton");
  const markReadButton = document.getElementById("mailboxMarkReadButton");
  const markUnreadButton = document.getElementById("mailboxMarkUnreadButton");
  const deleteButton = document.getElementById("mailboxDeleteButton");

  async function loadInbox(showOverlay = true) {
    try {
      if (showOverlay) {
        showGlobalLoading("Loading inbox...");
      }

      const result = await apiPost("get_current_grower_inbox_data", {
        session_token: auth.session.token,
      });

      console.log("Inbox data loaded", result);

      currentInboxEnquiries = result.enquiries || [];
      storeInboxData(result);

      renderInbox();
      updateInboxUnreadDots(result.unread_count || 0);
      preloadInboxThreadsQuietly(auth.session.token, currentInboxEnquiries);
    } catch (error) {
      console.error("Inbox load failed", error);

      mailboxList.innerHTML = `
        <p class="form-message error">
          ${escapeHtml(error.message || "Unable to load inbox.")}
        </p>
      `;
    } finally {
      hideGlobalLoading();
    }
  }

  if (filterSelect) {
    filterSelect.onchange = renderInbox;
  }

  if (sortSelect) {
    sortSelect.onchange = renderInbox;
  }

  if (searchInput) {
    searchInput.oninput = renderInbox;
  }

  if (refreshButton) {
    refreshButton.onclick = async () => {
      await refreshInboxWithInboundCheck(auth.session.token);
    };
  }

  if (markReadButton) {
    markReadButton.onclick = () => {
      updateSelectedInboxEnquiries(auth.session.token, "mark_read");
    };
  }

  if (markUnreadButton) {
    markUnreadButton.onclick = () => {
      updateSelectedInboxEnquiries(auth.session.token, "mark_unread");
    };
  }

  if (deleteButton) {
    deleteButton.onclick = () => {
      updateSelectedInboxEnquiries(auth.session.token, "delete");
    };
  }

  const cachedInbox = getStoredInboxData();

  if (cachedInbox && Array.isArray(cachedInbox.enquiries)) {
    currentInboxEnquiries = cachedInbox.enquiries || [];
    renderInbox();
    updateInboxUnreadDots(cachedInbox.unread_count || 0);

    return;
  }

  await loadInbox(true);
}
function getFilteredInboxEnquiries() {
  const filterSelect = document.getElementById("mailboxFilter");
  const sortSelect = document.getElementById("mailboxSort");
  const searchInput = document.getElementById("mailboxSearchInput");

  const filterValue = filterSelect ? filterSelect.value : "all";
  const sortValue = sortSelect ? sortSelect.value : "newest";
  const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";

  let enquiries = [...currentInboxEnquiries];

  if (filterValue === "unread") {
    enquiries = enquiries.filter((enquiry) => {
      return String(enquiry.read_status || "unread").toLowerCase() !== "read";
    });
  }

  if (filterValue === "read") {
    enquiries = enquiries.filter((enquiry) => {
      return String(enquiry.read_status || "unread").toLowerCase() === "read";
    });
  }

  if (searchTerm) {
    enquiries = enquiries.filter((enquiry) => {
      const searchableText = [
        enquiry.sender_name,
        enquiry.sender_email,
        enquiry.sender_phone,
        enquiry.enquiry_subject,
        enquiry.product_name,
        enquiry.message,
        enquiry.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(searchTerm);
    });
  }

  enquiries.sort((a, b) => {
    const aDate = String(a.last_message_at || a.created_at || "");
    const bDate = String(b.last_message_at || b.created_at || "");

    if (sortValue === "oldest") {
      return aDate.localeCompare(bDate);
    }

    return bDate.localeCompare(aDate);
  });

  return enquiries;
}

function renderInbox() {
  const mailboxList = document.getElementById("mailboxList");
  const mailboxCount = document.getElementById("mailboxCount");

  if (!mailboxList) {
    return;
  }

  const enquiries = getFilteredInboxEnquiries();

  if (mailboxCount) {
    mailboxCount.textContent = `${enquiries.length} message thread${enquiries.length === 1 ? "" : "s"}`;
  }

  if (!enquiries.length) {
    mailboxList.innerHTML = `
      <div class="mailbox-empty-state">
        <p class="muted">No messages found.</p>
      </div>
    `;

    const selectAll = document.getElementById("mailboxSelectAll");

    if (selectAll) {
      selectAll.checked = false;
    }

    return;
  }

  mailboxList.innerHTML = `
    <div class="mailbox-table">
      <div class="mailbox-table-head">
        <label class="mailbox-row-check mailbox-head-check">
          <input
            id="mailboxSelectAll"
            type="checkbox"
            aria-label="Select all messages"
          />
        </label>
        <div>Sender</div>
        <div>Message</div>
        <div>Status</div>
        <div>Date</div>
      </div>

      <div class="mailbox-table-body">
        ${enquiries
          .map((enquiry) => {
            const isUnread =
              String(enquiry.read_status || "unread").toLowerCase() !== "read";

            const isSentThread = enquiry.inbox_direction === "sent";

            const partyLabel = isSentThread ? "To" : "From";

            const partyName = isSentThread
              ? enquiry.grower_name || enquiry.recipient_grower_name || "Grower"
              : enquiry.sender_name || "Unknown sender";

            const partyEmail = isSentThread
              ? enquiry.grower_email || enquiry.recipient_grower_email || ""
              : enquiry.sender_email || "";

            const previewParts = [];

            if (partyEmail) {
              previewParts.push(partyEmail);
            }

            if (!isSentThread && enquiry.sender_phone) {
              previewParts.push(enquiry.sender_phone);
            }

            const previewMeta = previewParts.length
              ? `${previewParts.map((part) => escapeHtml(part)).join(" · ")} — `
              : "";

            return `
              <article class="mailbox-row ${isUnread ? "is-unread" : ""}">
                <label class="mailbox-row-check">
                  <input
                    class="mailbox-checkbox"
                    type="checkbox"
                    value="${escapeHtml(enquiry.enquiry_id)}"
                    aria-label="Select message from ${escapeHtml(partyName)}"
                  />
                </label>

                <button
                  class="mailbox-row-main"
                  type="button"
                  data-enquiry-id="${escapeHtml(enquiry.enquiry_id)}"
                >
                  <span class="mailbox-row-sender">
                    <span class="mailbox-direction-label">${partyLabel}</span>
                    ${escapeHtml(partyName)}
                  </span>

                  <span class="mailbox-row-message">
                    <strong>
                      ${escapeHtml(enquiry.enquiry_subject || "General enquiry")}
                    </strong>
                    <span>
                      ${previewMeta}${escapeHtml(enquiry.message || "No message")}
                    </span>
                  </span>

                  <span class="mailbox-row-status">
                    ${isUnread ? "Unread" : "Read"}
                  </span>

                  <span class="mailbox-row-date">
                    ${escapeHtml(formatDisplayDateTime(enquiry.last_message_at || enquiry.created_at))}
                  </span>
                </button>
              </article>
            `;
          })
          .join("")}
      </div>
    </div>
  `;

  const selectAll = document.getElementById("mailboxSelectAll");

  if (selectAll) {
    selectAll.checked = false;
  }

  mailboxList.querySelectorAll(".mailbox-row-main").forEach((button) => {
    button.onclick = () => {
      const enquiryId = button.getAttribute("data-enquiry-id");
      const enquiry = currentInboxEnquiries.find(
        (item) => item.enquiry_id === enquiryId,
      );

      if (enquiry) {
        openInboxThread(enquiry);
      }
    };
  });
}

function getSelectedInboxEnquiryIds() {
  return Array.from(document.querySelectorAll(".mailbox-checkbox:checked"))
    .map((checkbox) => checkbox.value)
    .filter(Boolean);
}

async function updateSelectedInboxEnquiries(sessionToken, action) {
  const messageEl = document.getElementById("mailboxMessage");
  const selectedIds = getSelectedInboxEnquiryIds();

  if (messageEl) {
    messageEl.textContent = "";
    messageEl.className = "form-message";
  }

  if (!selectedIds.length) {
    if (messageEl) {
      messageEl.textContent = "Please select at least one message.";
      messageEl.classList.add("error");
    }
    return;
  }

  try {
    showGlobalLoading("Updating inbox...");

    const result = await apiPost("update_current_grower_enquiries", {
      session_token: sessionToken,
      enquiry_ids: selectedIds,
      mailbox_action: action,
    });

    if (messageEl) {
      messageEl.textContent = result.message || "Inbox updated.";
      messageEl.classList.add("success");
    }

    const inboxResult = await apiPost("get_current_grower_inbox_data", {
      session_token: sessionToken,
    });

    currentInboxEnquiries = inboxResult.enquiries || [];
    storeInboxData(inboxResult);
    clearAllStoredInboxThreadData();

    renderInbox();
    updateInboxUnreadDots(inboxResult.unread_count || 0);
  } catch (error) {
    if (messageEl) {
      messageEl.textContent = error.message;
      messageEl.classList.add("error");
    }
  } finally {
    hideGlobalLoading();
  }
}

function updateInboxUnreadDots(unreadCount) {
  document.querySelectorAll(".inbox-unread-dot").forEach((dot) => {
    dot.classList.toggle("is-visible", Number(unreadCount) > 0);
  });
}

async function openInboxThread(enquiry) {
  const auth = await requireValidSession();

  if (!auth || !enquiry || !enquiry.enquiry_id) {
    return;
  }
  const currentGrowerEmail =
    auth.grower?.email ||
    getStoredGrower()?.email ||
    getStoredSession()?.email ||
    "";

  const drawer = document.getElementById("mailboxThreadDrawer");
  const titleEl = document.getElementById("mailboxThreadTitle");
  const metaEl = document.getElementById("mailboxThreadMeta");
  const messagesEl = document.getElementById("mailboxThreadMessages");
  const replyForm = document.getElementById("mailboxReplyForm");
  const replyMessageEl = document.getElementById("mailboxReplyMessage");

  if (!drawer || !messagesEl) {
    return;
  }

  const isSentThread = enquiry.inbox_direction === "sent";

  const threadPartyName = isSentThread
    ? enquiry.recipient_grower_name || "Grower"
    : enquiry.sender_name || "Enquiry";

  const threadPartyEmail = isSentThread
    ? enquiry.recipient_grower_email || ""
    : enquiry.sender_email || "";

  drawer.classList.add("is-open");
  drawer.setAttribute("aria-hidden", "false");
  drawer.removeAttribute("inert");

  if (titleEl) {
    titleEl.textContent = `${isSentThread ? "To" : "From"} ${threadPartyName}`;
  }

  if (metaEl) {
    const senderPhone = !isSentThread
      ? cleanPhoneDisplay(enquiry.sender_phone)
      : "";

    const phoneText = senderPhone ? ` · ${senderPhone}` : "";
    const emailText = threadPartyEmail ? ` · ${threadPartyEmail}` : "";

    metaEl.textContent = `${enquiry.enquiry_subject || "General enquiry"}${emailText}${phoneText} · ${formatDisplayDateTime(
      enquiry.created_at,
    )}`;
  }

  messagesEl.innerHTML = '<p class="muted">Loading thread...</p>';

  if (replyMessageEl) {
    replyMessageEl.textContent = "";
    replyMessageEl.className = "form-message";
  }

  const cachedThread = getStoredInboxThreadData(enquiry.enquiry_id);
  const shouldFetchFreshThread =
    String(enquiry.read_status || "unread").toLowerCase() !== "read";

  if (
    cachedThread &&
    Array.isArray(cachedThread.messages) &&
    !shouldFetchFreshThread
  ) {
    renderInboxThreadMessages(cachedThread.messages || [], currentGrowerEmail);
    scrollInboxThreadToBottom();
  } else {
    try {
      const result = await apiPost("get_current_grower_enquiry_thread", {
        session_token: auth.session.token,
        enquiry_id: enquiry.enquiry_id,
        mark_read: true,
      });

      storeInboxThreadData(enquiry.enquiry_id, result);
      renderInboxThreadMessages(result.messages || [], currentGrowerEmail);
      scrollInboxThreadToBottom();
    } catch (error) {
      messagesEl.innerHTML = `<p class="form-message error">${escapeHtml(
        error.message || "Unable to load thread.",
      )}</p>`;
      return;
    }
  }

  currentInboxEnquiries = currentInboxEnquiries.map((item) => {
    if (item.enquiry_id !== enquiry.enquiry_id) {
      return item;
    }

    return {
      ...item,
      read_status: "read",
      read_at: new Date().toISOString(),
    };
  });

  const updatedUnreadCount = currentInboxEnquiries.filter((item) => {
    return String(item.read_status || "unread").toLowerCase() !== "read";
  }).length;

  const cachedInbox = getStoredInboxData();

  if (cachedInbox && Array.isArray(cachedInbox.enquiries)) {
    storeInboxData({
      ...cachedInbox,
      enquiries: currentInboxEnquiries,
      unread_count: updatedUnreadCount,
    });
  }

  updateInboxUnreadDots(updatedUnreadCount);

  if (replyForm) {
    replyForm.onsubmit = async (event) => {
      event.preventDefault();

      const formData = new FormData(replyForm);
      const replyMessage = String(formData.get("reply_message") || "").trim();

      if (replyMessageEl) {
        replyMessageEl.textContent = "";
        replyMessageEl.className = "form-message";
      }

      if (!replyMessage) {
        if (replyMessageEl) {
          replyMessageEl.textContent = "Reply message is required.";
          replyMessageEl.classList.add("error");
        }

        return;
      }

      const optimisticMessage = {
        message_id: `temp_${Date.now()}`,
        enquiry_id: enquiry.enquiry_id,
        sender_type: "grower",
        sender_name:
          auth.grower?.grower_name ||
          auth.session?.grower_name ||
          getStoredSession()?.grower_name ||
          "You",
        sender_email: currentGrowerEmail,
        message: replyMessage,
        created_at: new Date().toISOString(),
        email_delivery_status: "sending",
        is_optimistic: true,
      };

      const cachedThread = getStoredInboxThreadData(enquiry.enquiry_id);
      const existingMessages =
        cachedThread && Array.isArray(cachedThread.messages)
          ? cachedThread.messages
          : [];

      const optimisticThread = {
        ...(cachedThread || {}),
        messages: [...existingMessages, optimisticMessage],
      };

      storeInboxThreadData(enquiry.enquiry_id, optimisticThread);
      renderInboxThreadMessages(
        optimisticThread.messages || [],
        currentGrowerEmail,
      );
      scrollInboxThreadToBottom();

      replyForm.reset();

      try {
        const replyResult = await apiPost("reply_current_grower_enquiry", {
          session_token: auth.session.token,
          enquiry_id: enquiry.enquiry_id,
          message: replyMessage,
        });

        const refreshedThread = await apiPost(
          "get_current_grower_enquiry_thread",
          {
            session_token: auth.session.token,
            enquiry_id: enquiry.enquiry_id,
            mark_read: true,
          },
        );

        storeInboxThreadData(enquiry.enquiry_id, refreshedThread);
        renderInboxThreadMessages(
          refreshedThread.messages || [],
          currentGrowerEmail,
        );
        scrollInboxThreadToBottom();

        const inboxResult = await apiPost("get_current_grower_inbox_data", {
          session_token: auth.session.token,
        });

        currentInboxEnquiries = inboxResult.enquiries || [];
        storeInboxData(inboxResult);
        updateInboxUnreadDots(inboxResult.unread_count || 0);

        drawer.classList.add("is-open");
        drawer.setAttribute("aria-hidden", "false");
        drawer.removeAttribute("inert");
      } catch (error) {
        const failedThread = getStoredInboxThreadData(enquiry.enquiry_id);

        if (failedThread && Array.isArray(failedThread.messages)) {
          failedThread.messages = failedThread.messages.map((message) => {
            if (message.message_id !== optimisticMessage.message_id) {
              return message;
            }

            return {
              ...message,
              email_delivery_status: "failed",
              send_error: error.message || "Unable to send reply.",
            };
          });

          storeInboxThreadData(enquiry.enquiry_id, failedThread);
          renderInboxThreadMessages(
            failedThread.messages || [],
            currentGrowerEmail,
          );
          scrollInboxThreadToBottom();
        }

        if (replyMessageEl) {
          replyMessageEl.textContent = error.message || "Unable to send reply.";
          replyMessageEl.className = "form-message error";
        }
      }
    };
  }
}
function renderInboxThreadMessages(messages, currentUserEmail = "") {
  const messagesEl = document.getElementById("mailboxThreadMessages");

  if (!messagesEl) {
    return;
  }

  if (!messages.length) {
    messagesEl.innerHTML =
      '<p class="muted">No messages found for this thread.</p>';
    return;
  }

  const cleanCurrentUserEmail = String(currentUserEmail || "")
    .trim()
    .toLowerCase();

  messagesEl.innerHTML = messages
    .map((message) => {
      const senderType = String(message.sender_type || "").toLowerCase();
      const senderEmail = String(message.sender_email || "")
        .trim()
        .toLowerCase();

      const isMyMessage =
        cleanCurrentUserEmail && senderEmail === cleanCurrentUserEmail;

      const bubbleClass = isMyMessage
        ? "is-my-message"
        : senderType === "grower"
          ? "is-other-grower"
          : "is-public-user";

      return `
        <article class="mailbox-thread-message ${bubbleClass}">
          <div class="mailbox-thread-message-header">
            <strong>${escapeHtml(
              message.sender_name ||
                (isMyMessage
                  ? "You"
                  : senderType === "grower"
                    ? "Grower"
                    : "Sender"),
            )}</strong>
            <span>${escapeHtml(formatDisplayDateTime(message.created_at))}</span>
          </div>

          <p>${escapeHtml(message.message || "").replace(/\n/g, "<br>")}</p>

          ${
            message.email_delivery_status &&
            message.email_delivery_status !== "not_sent"
              ? `<small class="${message.email_delivery_status === "failed" ? "message-send-failed" : ""}">
        ${
          message.email_delivery_status === "sending"
            ? "Sending..."
            : message.email_delivery_status === "failed"
              ? `Failed to send${message.send_error ? `: ${escapeHtml(message.send_error)}` : ""}`
              : `Email status: ${escapeHtml(message.email_delivery_status)}`
        }
      </small>`
              : ""
          }
        </article>
      `;
    })
    .join("");
}

function scrollInboxThreadToBottom() {
  const messagesEl = document.getElementById("mailboxThreadMessages");

  if (!messagesEl) {
    return;
  }

  requestAnimationFrame(() => {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  });
}
function closeMailboxThreadDrawer() {
  const drawer = document.getElementById("mailboxThreadDrawer");

  if (!drawer) {
    return;
  }

  const activeElement = document.activeElement;

  if (activeElement && drawer.contains(activeElement)) {
    activeElement.blur();
  }

  drawer.classList.remove("is-open");
  drawer.setAttribute("aria-hidden", "true");
  drawer.setAttribute("inert", "");
  renderInbox();
}
async function refreshInboxUnreadCountQuietly() {
  const inboxDot = document.querySelector(".inbox-unread-dot");

  if (!inboxDot) {
    return;
  }

  const cachedInbox = getStoredInboxData();

  if (!cachedInbox || !Array.isArray(cachedInbox.enquiries)) {
    updateInboxUnreadDots(0);
    return;
  }

  const unreadCount = cachedInbox.enquiries.filter((enquiry) => {
    return String(enquiry.read_status || "unread").toLowerCase() !== "read";
  }).length;

  updateInboxUnreadDots(unreadCount);
}
function cleanPhoneDisplay(value) {
  return String(value || "").replace(/^'/, "");
}
document.addEventListener("change", (event) => {
  const selectAll = event.target.closest("#mailboxSelectAll");

  if (!selectAll) {
    return;
  }

  const mailboxList = document.getElementById("mailboxList");

  if (!mailboxList) {
    return;
  }

  mailboxList.querySelectorAll(".mailbox-checkbox").forEach((checkbox) => {
    checkbox.checked = selectAll.checked;
  });
});

document.addEventListener("change", (event) => {
  const checkbox = event.target.closest(".mailbox-checkbox");

  if (!checkbox) {
    return;
  }

  const mailboxList = document.getElementById("mailboxList");
  const selectAll = document.getElementById("mailboxSelectAll");

  if (!mailboxList || !selectAll) {
    return;
  }

  const checkboxes = Array.from(
    mailboxList.querySelectorAll(".mailbox-checkbox"),
  );

  selectAll.checked =
    checkboxes.length > 0 && checkboxes.every((item) => item.checked);
});
async function preloadInboxThreadsQuietly(sessionToken, enquiries, limit = 10) {
  if (!sessionToken || !Array.isArray(enquiries) || !enquiries.length) {
    return;
  }

  const recentEnquiries = [...enquiries]
    .sort((a, b) => {
      return String(b.last_message_at || b.created_at || "").localeCompare(
        String(a.last_message_at || a.created_at || ""),
      );
    })
    .slice(0, limit);

  for (const enquiry of recentEnquiries) {
    if (!enquiry.enquiry_id) {
      continue;
    }

    try {
      const threadData = await apiPost("get_current_grower_enquiry_thread", {
        session_token: sessionToken,
        enquiry_id: enquiry.enquiry_id,
        mark_read: false,
      });

      storeInboxThreadData(enquiry.enquiry_id, threadData);
    } catch (error) {
      // Do not block inbox loading if a thread preload fails.
    }
  }
}
async function refreshInboxWithInboundCheck(sessionToken) {
  const mailboxList = document.getElementById("mailboxList");
  const messageEl = document.getElementById("mailboxMessage");

  if (messageEl) {
    messageEl.textContent = "";
    messageEl.className = "form-message";
  }

  try {
    showGlobalLoading("Checking latest messages...");

    await apiPost("check_inbound_enquiry_replies", {
      session_token: sessionToken,
    });

    const inboxResult = await apiPost("get_current_grower_inbox_data", {
      session_token: sessionToken,
    });

    currentInboxEnquiries = inboxResult.enquiries || [];
    storeInboxData(inboxResult);
    clearAllStoredInboxThreadData();

    renderInbox();
    updateInboxUnreadDots(inboxResult.unread_count || 0);

    if (messageEl) {
      messageEl.textContent = "Inbox refreshed.";
      messageEl.classList.add("success");
    }
  } catch (error) {
    if (messageEl) {
      messageEl.textContent = error.message || "Unable to refresh inbox.";
      messageEl.classList.add("error");
    }

    if (mailboxList && !currentInboxEnquiries.length) {
      mailboxList.innerHTML = `
        <p class="form-message error">
          ${escapeHtml(error.message || "Unable to refresh inbox.")}
        </p>
      `;
    }
  } finally {
    hideGlobalLoading();
  }
}
async function initDashboardPage() {
  const dashboardTitle = document.getElementById("dashboardTitle");
  const signoutButton = document.getElementById("signoutButton");

  if (!dashboardTitle && !signoutButton) {
    return;
  }

  const auth = await requireValidSession();

  if (!auth) {
    return;
  }
  refreshInboxUnreadCountQuietly();

  if (dashboardTitle) {
    dashboardTitle.textContent = `Welcome, ${auth.grower?.grower_name || auth.session.grower_name || "Grower"}`;
  }

  if (!isGrowerCacheFresh()) {
    refreshGrowerAppDataQuietly(auth.session.token, (appData) => {
      if (dashboardTitle) {
        dashboardTitle.textContent = `Welcome, ${appData.grower?.grower_name || "Grower"}`;
      }
    });
  }
}
