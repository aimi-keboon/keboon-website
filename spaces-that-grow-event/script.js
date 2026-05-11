function scaleSite() {
  const content = document.getElementById("site-content");
  const wrapper = document.getElementById("site-scale-wrapper");

  const desktopWidth = 1200;
  const screenWidth = window.innerWidth;

  if (screenWidth < desktopWidth) {
    const scale = screenWidth / desktopWidth;

    content.style.width = `${desktopWidth}px`;
    content.style.transform = `scale(${scale})`;
    wrapper.style.height = `${content.offsetHeight * scale}px`;
  } else {
    content.style.width = "100vw";
    content.style.transform = "none";
    wrapper.style.height = "auto";
  }
}

function setupPackageFilters() {
  const filterButtons = document.querySelectorAll(".filter-btn");
  const packageCards = document.querySelectorAll(".package-card");

  filterButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const selectedFilter = button.dataset.filter;

      filterButtons.forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");

      packageCards.forEach((card) => {
        const category = card.dataset.category;

        if (selectedFilter === "all" || category === selectedFilter) {
          card.classList.remove("hidden");
        } else {
          card.classList.add("hidden");
        }
      });

      scaleSite();
    });
  });
}

function setupPackageSelection() {
  const payButtons = document.querySelectorAll(".pay-button");

  payButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const card = button.closest(".package-card");

      document.querySelectorAll(".package-card").forEach((item) => {
        item.classList.remove("selected");
      });

      card.classList.add("selected");
    });
  });
}

window.addEventListener("load", () => {
  scaleSite();
  setupPackageFilters();
  setupPackageSelection();
});

window.addEventListener("resize", scaleSite);