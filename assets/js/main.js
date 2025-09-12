// Ultra Pro main.js
const toggle = document.querySelector('.nav-toggle');
const menu = document.getElementById('menu');
if (toggle && menu) {
  const setHidden = (v) => v ? menu.setAttribute('hidden','') : menu.removeAttribute('hidden');
  toggle.addEventListener('click', () => {
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    setHidden(expanded);
  });
  setHidden(true);
}
const yearEl = document.getElementById('year'); if (yearEl) yearEl.textContent = new Date().getFullYear();

const form = document.getElementById('contact-form');
if (form) {
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const status = document.getElementById('status');
    const name = document.getElementById('name')?.value?.trim() || '';
    const email = document.getElementById('email')?.value?.trim() || '';
    const message = document.getElementById('message')?.value?.trim() || '';
    const body = encodeURIComponent(`Nombre: ${name}\nEmail: ${email}\n\nMensaje:\n${message}`);
    const subject = encodeURIComponent('Consulta desde la web');
    const href = `mailto:contapronoww@gmail.com?subject=${subject}&body=${body}`;
    window.location.href = href;
    if (status) {
      status.textContent = 'Abriendo tu cliente de correo…';
      setTimeout(() => { status.textContent = 'Si no se abrió, escribe a contapronoww@gmail.com'; }, 2500);
    }
  });
}

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced && 'IntersectionObserver' in window) {
  const els = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    });
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));
}
