const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyG8F65Q_9M_phyb7qCV_BmxUj9RFYlsqi3JVh3VRMPVO9MtjwW-ShnNmGNVuPFNNi1/exec";
const pricing = {
  normal: [
    {
      tag: "Compact size",
      title: "Compact Setup",
      price: "From RM500",
      text: "For balconies, compact patios, and small corners up to around 3 m².",
      featured: false,
      items: [
        "Materials included",
        "Installation and initial setup included",
        "Soil-based pots, boxes, or compact planters",
        "Starter herbs, leafy greens, or chillies",
      ],
    },
    {
      tag: "Standard size",
      title: "Standard Setup",
      price: "From RM1,000",
      text: "For backyards, side yards, and larger patios around 3–8 m².",
      featured: true,
      items: [
        "Materials included",
        "Installation and initial setup included",
        "Larger growing layout",
        "Practical crop mix for household use",
      ],
    },
    {
      tag: "Custom size",
      title: "Custom Setup",
      price: "Contact us",
      text: "For larger spaces, unusual layouts, or more tailored crop plans.",
      featured: false,
      items: [
        "For spaces above the standard band",
        "Quote depends on size, access, and materials",
        "Custom crop and layout planning",
        "Maintenance can be added separately",
      ],
    },
  ],
  hydro: [
    {
      tag: "Compact size",
      title: "Compact Hydroponic",
      price: "From RM900",
      text: "For compact spaces that want a cleaner hydroponic setup.",
      featured: false,
      items: [
        "Materials included",
        "Installation and initial setup included",
        "Hydroponic system parts included",
        "Best for herbs and leafy greens",
      ],
    },
    {
      tag: "Standard size",
      title: "Standard Hydroponic",
      price: "From RM1,800",
      text: "For larger home spaces that want a more productive hydroponic setup.",
      featured: true,
      items: [
        "Materials included",
        "Installation and initial setup included",
        "Larger hydroponic structure",
        "Higher price reflects extra system cost",
      ],
    },
    {
      tag: "Custom size",
      title: "Custom Hydroponic",
      price: "Contact us",
      text: "For bigger hydroponic systems or more complex spaces.",
      featured: false,
      items: [
        "For larger or custom hydroponic requests",
        "Quote depends on system and size",
        "Adjusted for layout and crop type",
        "Maintenance can be added separately",
      ],
    },
  ],
};

const pricingGrid = document.querySelector("#pricingGrid");
const toggleButtons = document.querySelectorAll(".toggle-btn");

function renderPricing(view = "normal") {
  if (!pricingGrid) return;

  pricingGrid.innerHTML = pricing[view]
    .map(
      (item) => `
    <article class="price-card ${item.featured ? "featured" : ""}">
      <span class="tag">${item.tag}</span>
      <h3>${item.title}</h3>
      <p>${item.text}</p>
      <div class="price">${item.price}</div>
      <ul>
        ${item.items.map((point) => `<li>${point}</li>`).join("")}
      </ul>
    </article>
  `,
    )
    .join("");
}

renderPricing("normal");

toggleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    toggleButtons.forEach((btn) => btn.classList.remove("active"));
    button.classList.add("active");
    renderPricing(button.dataset.view);
  });
});

const navToggle = document.querySelector(".nav-toggle");
const navMenu = document.querySelector("#navMenu");

if (navToggle && navMenu) {
  navToggle.addEventListener("click", () => {
    const isOpen = navMenu.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });

  navMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navMenu.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });
}

const revealItems = document.querySelectorAll(".reveal");

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.16 },
);

revealItems.forEach((item) => revealObserver.observe(item));

const faqButtons = document.querySelectorAll(".faq-item");

faqButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const panel = button.nextElementSibling;
    const isActive = button.classList.contains("active");

    faqButtons.forEach((btn) => {
      btn.classList.remove("active");
      if (btn.nextElementSibling) {
        btn.nextElementSibling.classList.remove("open");
      }
    });

    if (!isActive) {
      button.classList.add("active");
      panel.classList.add("open");
    }
  });
});

const leadForm = document.querySelector("#leadForm");
const formNote = document.querySelector("#formNote");

if (leadForm && formNote) {
  leadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = leadForm.querySelector("button[type='submit']");
    const originalButtonText = submitButton.textContent;

    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
    formNote.textContent = "Sending your quote request...";

    try {
      const formData = new FormData(leadForm);

      await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        body: formData,
        mode: "no-cors",
      });

      leadForm.reset();
      formNote.textContent = "Thank you. Your quote request has been received.";
    } catch (error) {
      formNote.textContent =
        "Sorry, something went wrong. Please try again or contact Keboon directly.";
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalButtonText;
    }
  });
}
