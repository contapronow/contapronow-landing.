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
    setupTiltCards();
    setupMagneticButtons();
    setupHeroParallax();
    setupCursorDot();
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

  function setupTiltCards() {
    if (reduceMotion) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    document.querySelectorAll('.tilt-card').forEach((card) => {
      let rafId = null;
      const maxTilt = 5;

      function isReady() {
        if (!card.classList.contains('reveal')) return true;
        return card.classList.contains('visible');
      }

      function onMove(e) {
        if (!isReady()) return;
        const rect = card.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const rx = ((y - cy) / cy) * -maxTilt;
        const ry = ((x - cx) / cx) * maxTilt;
        const mx = (x / rect.width) * 100;
        const my = (y / rect.height) * 100;

        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
          card.style.transform = `perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(-6px)`;
          card.style.setProperty('--mx', `${mx}%`);
          card.style.setProperty('--my', `${my}%`);
        });
      }

      function onLeave() {
        if (rafId) cancelAnimationFrame(rafId);
        card.style.transform = '';
      }

      card.addEventListener('mousemove', onMove);
      card.addEventListener('mouseleave', onLeave);
    });
  }

  function setupMagneticButtons() {
    if (reduceMotion) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    document.querySelectorAll('.btn-magnetic').forEach((btn) => {
      let targetX = 0;
      let targetY = 0;
      let curX = 0;
      let curY = 0;
      let rafId = null;
      let active = false;

      function loop() {
        curX += (targetX - curX) * 0.18;
        curY += (targetY - curY) * 0.18;
        btn.style.transform = `translate(${curX.toFixed(2)}px, ${curY.toFixed(2)}px)`;
        if (Math.abs(curX - targetX) > 0.1 || Math.abs(curY - targetY) > 0.1 || active) {
          rafId = requestAnimationFrame(loop);
        } else {
          btn.style.transform = '';
          rafId = null;
        }
      }

      btn.addEventListener('mousemove', (e) => {
        const rect = btn.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = e.clientX - cx;
        const dy = e.clientY - cy;
        targetX = dx * 0.25;
        targetY = dy * 0.4;
        active = true;
        if (!rafId) rafId = requestAnimationFrame(loop);
      });

      btn.addEventListener('mouseleave', () => {
        targetX = 0;
        targetY = 0;
        active = false;
        if (!rafId) rafId = requestAnimationFrame(loop);
      });
    });
  }

  function setupHeroParallax() {
    if (reduceMotion) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const visual = document.querySelector('.hero [data-parallax]');
    const hero = document.querySelector('.hero-premium');
    if (!visual || !hero) return;

    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let rafId = null;

    function loop() {
      curX += (targetX - curX) * 0.08;
      curY += (targetY - curY) * 0.08;
      visual.style.transform = `translate3d(${curX.toFixed(2)}px, ${curY.toFixed(2)}px, 0)`;
      if (Math.abs(curX - targetX) > 0.1 || Math.abs(curY - targetY) > 0.1) {
        rafId = requestAnimationFrame(loop);
      } else {
        rafId = null;
      }
    }

    hero.addEventListener('mousemove', (e) => {
      const rect = hero.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      targetX = ((e.clientX - cx) / rect.width) * 18;
      targetY = ((e.clientY - cy) / rect.height) * 14;
      if (!rafId) rafId = requestAnimationFrame(loop);
    });

    hero.addEventListener('mouseleave', () => {
      targetX = 0;
      targetY = 0;
      if (!rafId) rafId = requestAnimationFrame(loop);
    });
  }

  function setupCursorDot() {
    if (reduceMotion) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    const dot = document.querySelector('.cursor-dot');
    if (!dot) return;

    let mx = -100;
    let my = -100;
    let dx = -100;
    let dy = -100;
    let started = false;
    let rafId = null;

    function loop() {
      dx += (mx - dx) * 0.18;
      dy += (my - dy) * 0.18;
      dot.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0) translate(-50%, -50%)`;
      rafId = requestAnimationFrame(loop);
    }

    document.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!started) {
        dx = mx;
        dy = my;
        started = true;
        dot.classList.add('visible');
        if (!rafId) rafId = requestAnimationFrame(loop);
      }
    });

    document.addEventListener('mouseleave', () => dot.classList.remove('visible'));
    document.addEventListener('mouseenter', () => {
      if (started) dot.classList.add('visible');
    });

    const interactiveSelector = 'a, button, .btn, .tool-pill, .benefit-pill, .card, .tool-group, .capability-card, .strip-card, .mini-metric-card';
    document.querySelectorAll(interactiveSelector).forEach((el) => {
      el.addEventListener('mouseenter', () => dot.classList.add('hover'));
      el.addEventListener('mouseleave', () => dot.classList.remove('hover'));
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

    fields.forEach((field) => {
      const input = field.querySelector('input, textarea');
      if (!input) return;
      input.addEventListener('input', () => field.classList.remove('error'));
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      let valid = true;
      fields.forEach((field) => {
        const input = field.querySelector('input, textarea');
        if (input && input.required && !input.value.trim()) {
          field.classList.add('error');
          valid = false;
        }
        if (input && input.type === 'email' && input.value) {
          const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!re.test(input.value)) {
            field.classList.add('error');
            valid = false;
          }
        }
      });

      if (!valid) {
        status.textContent = 'Por favor revisa los campos marcados.';
        status.className = 'error';
        return;
      }

      status.textContent = '';
      status.className = '';
      submitBtn.classList.add('loading');
      submitBtn.disabled = true;

      const nameVal = form.name.value.trim();
      const emailVal = form.email.value.trim();
      const messageVal = form.message.value.trim();

      setTimeout(() => {
        submitBtn.classList.remove('loading');
        submitBtn.classList.add('success');
        status.textContent = '¡Listo! Abriendo tu cliente de correo...';
        status.className = 'success';

        const subject = encodeURIComponent('Consulta desde ContaProNow');
        const body = encodeURIComponent(`Nombre: ${nameVal}\nEmail: ${emailVal}\n\n${messageVal}`);
        window.location.href = `mailto:contapronoww@gmail.com?subject=${subject}&body=${body}`;

        setTimeout(() => {
          submitBtn.classList.remove('success');
          submitBtn.disabled = false;
          form.reset();
          fields.forEach((f) => f.classList.remove('error'));
        }, 2400);
      }, 1100);
    });
  }
})();
