(() => {
  // Número do WhatsApp (só dígitos, com DDI 55 e DDD 27)
  const WHATSAPP = "552732081411";

  // Cada link com data-wa abre o WhatsApp já com a mensagem escrita
  document.querySelectorAll("[data-wa]").forEach((link) => {
    link.href = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(link.dataset.wa)}`;
  });

  // Menu do celular
  const toggle = document.querySelector("[data-menu-toggle]");
  const nav = document.querySelector("[data-nav]");
  const toggleLabel = toggle.querySelector(".sr-only");

  const setMenu = (open) => {
    toggle.setAttribute("aria-expanded", String(open));
    nav.classList.toggle("is-open", open);
    toggleLabel.textContent = open ? "Fechar menu" : "Abrir menu";
  };

  toggle.addEventListener("click", () => {
    setMenu(toggle.getAttribute("aria-expanded") !== "true");
  });

  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && nav.classList.contains("is-open")) {
      setMenu(false);
      toggle.focus();
    }
  });

  // Linha sob o topo depois que a página rola
  const topbar = document.querySelector("[data-topbar]");
  const onScroll = () => topbar.classList.toggle("is-scrolled", window.scrollY > 8);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  // Destaca no menu a seção que está na tela
  const links = new Map(
    [...nav.querySelectorAll("a")].map((link) => [link.getAttribute("href").slice(1), link])
  );

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          links.forEach((link) => link.removeAttribute("aria-current"));
          links.get(entry.target.id)?.setAttribute("aria-current", "true");
        });
      },
      { rootMargin: "-45% 0px -50% 0px" }
    );

    links.forEach((_, id) => {
      const section = document.getElementById(id);
      if (section) observer.observe(section);
    });
    observer.observe(document.getElementById("inicio"));
  }

  document.querySelectorAll("[data-year]").forEach((el) => {
    el.textContent = new Date().getFullYear();
  });

  // Transmissor 3D: só baixa o Three.js quando a seção está perto da tela.
  // Sem WebGL (ou sem JS), fica a imagem estática do mesmo modelo.
  const stage = document.querySelector("[data-stage]");
  if (stage && "IntersectionObserver" in window) {
    const lazy = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        lazy.disconnect();
        import("./instrument3d.js")
          .then((module) => module.mount(stage))
          .catch(() => {});
      },
      { rootMargin: "600px 0px" }
    );
    lazy.observe(stage);
  }
})();
