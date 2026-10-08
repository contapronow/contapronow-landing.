(function () {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setDynamicYear();
    setupNavToggle();
    setupSmoothScroll();
    setupHeaderScroll();
    setupTitleAnimation();
    setupRevealObserver();
    setupAudienceSlider();
    setupContactForm();
    setupProcessLine();
  }

  function setDynamicYear() {
    const yearEl = document.getElementById('year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
  }

  function setupNavToggle() {
    const toggle = document.querySelector('.nav-toggle');
    const menu = document.getElementById('menu');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!open));
      if (open) {
        menu.setAttribute('hidden', '');
      } else {
        menu.removeAttribute('hidden');
      }
    });

    menu.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => {
        if (window.matchMedia('(max-width: 980px)').matches) {
          menu.setAttribute('hidden', '');
          toggle.setAttribute('aria-expanded', 'false');
        }
      });
    });
  }

  function setupSmoothScroll() {
    if (reduceMotion) return;

    document.querySelectorAll('a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (e) => {
        const href = link.getAttribute('href');
        if (!href || href === '#') return;
        const target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();

        const header = document.querySelector('.site-header');
        const offset = header ? header.offsetHeight : 0;
        const top = target.getBoundingClientRect().top + window.scrollY - offset - 12;

        smoothScrollTo(top, 850);
      });
    });
  }

  function smoothScrollTo(targetY, duration) {
    const startY = window.scrollY;
    const diff = targetY - startY;
    const startTime = performance.now();

    function ease(t) {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    function step(now) {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      window.scrollTo(0, startY + diff * ease(t));
      if (t < 1) requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  }

  function setupHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    let ticking = false;
    function update() {
      if (window.scrollY > 50) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
      ticking = false;
    }

    window.addEventListener(
      'scroll',
      () => {
        if (!ticking) {
          requestAnimationFrame(update);
          ticking = true;
        }
      },
      { passive: true }
    );
  }

  function setupTitleAnimation() {
    if (reduceMotion) {
      document.querySelectorAll('.title-word').forEach((w) => w.classList.add('in'));
      return;
    }

    const words = document.querySelectorAll('.hero-title-anim .title-word');
    words.forEach((word, i) => {
      setTimeout(() => word.classList.add('in'), 200 + i * 75);
    });
  }

  function setupRevealObserver() {
    const elements = document.querySelectorAll('.reveal');
    if (!elements.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      elements.forEach((el) => el.classList.add('visible'));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const siblings = entry.target.parentElement
              ? Array.from(entry.target.parentElement.querySelectorAll(':scope > .reveal'))
              : [];
            const idx = siblings.indexOf(entry.target);
            const delay = idx >= 0 ? idx * 90 : 0;
            setTimeout(() => entry.target.classList.add('visible'), delay);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
    );

    elements.forEach((el) => observer.observe(el));
  }

  function setupAudienceSlider() {
    const slider = document.getElementById('audience-slider');
    if (!slider) return;

    document.querySelectorAll('.audience-arrow').forEach((btn) => {
      btn.addEventListener('click', () => {
        const card = slider.querySelector('.audience-slide');
        const gap = 20;
        const step = card ? card.getBoundingClientRect().width + gap : 380;
        slider.scrollBy({
          left: step * Number(btn.dataset.dir || 1),
          behavior: reduceMotion ? 'auto' : 'smooth'
        });
      });
    });
  }

  function setupProcessLine() {
    const line = document.querySelector('.process-line');
    if (!line) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      line.classList.add('in');
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            line.classList.add('in');
            observer.unobserve(line);
          }
        });
      },
      { threshold: 0.4 }
    );
    observer.observe(line);
  }

  function setupContactForm() {
    const form = document.getElementById('contact-form');
    if (!form) return;

    const status = form.querySelector('#status');
    const submitBtn = form.querySelector('.btn-submit');
    const fields = form.querySelectorAll('.field-float');

    function setError(field, hasError) {
      const input = field.querySelector('input, textarea');
      field.classList.toggle('error', hasError);
      if (input) input.setAttribute('aria-invalid', String(hasError));
    }

    fields.forEach((field) => {
      const input = field.querySelector('input, textarea');
      if (!input) return;
      input.addEventListener('input', () => setError(field, false));
    });

    // El formulario no envía a ningún servidor: prepara el mensaje y abre
    // WhatsApp (único objetivo de conversión). Nada se guarda en la web.
    form.addEventListener('submit', (e) => {
      e.preventDefault();

      let firstInvalid = null;
      fields.forEach((field) => {
        const input = field.querySelector('input, textarea');
        const invalid = !!input && input.required && !input.value.trim();
        setError(field, invalid);
        if (invalid && !firstInvalid) firstInvalid = input;
      });

      if (firstInvalid) {
        status.textContent = 'Revisa los campos marcados.';
        status.className = 'error';
        firstInvalid.focus();
        return;
      }

      const name = form.elements.name.value.trim();
      const message = form.elements.message.value.trim();
      const text = `Hola ContaProNow, soy ${name}. ${message}`;
      const url = `https://wa.me/34634753021?text=${encodeURIComponent(text)}`;

      // Con 'noopener' window.open devuelve null siempre, así que se corta
      // el opener a mano para poder detectar si el navegador bloqueó la pestaña.
      const win = window.open(url, '_blank');
      if (win) {
        win.opener = null;
      } else {
        window.location.href = url;
      }

      submitBtn.classList.add('success');
      status.textContent = 'Listo: te hemos abierto WhatsApp con tu mensaje.';
      status.className = 'success';

      setTimeout(() => {
        submitBtn.classList.remove('success');
        form.reset();
      }, 2400);
    });
  }
})();
