// main.js (V5.1)
// - Menú móvil accesible
// - Año dinámico
// - Formulario -> mailto
// - IntersectionObserver para revelar secciones
// - Header cambia estilo al hacer scroll
// - Carrusel de testimonios
// - aria-current dinámico en navegación

// Menú móvil
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

// Año dinámico
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// Formulario -> mailto
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

// IntersectionObserver para revelar elementos
const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!prefersReduced && 'IntersectionObserver' in window) {
  const els = document.querySelectorAll('.reveal');
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    });
  }, { threshold: 0.12 });
  els.forEach(el => io.observe(el));
}

// Header scrolled
const header = document.querySelector('.site-header');
if (header) {
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  onScroll();
  window.addEventListener('scroll', onScroll);
}

// Carrusel testimonios
const track = document.querySelector('.car-track');
const prev = document.querySelector('.car-btn.prev');
const next = document.querySelector('.car-btn.next');
if (track && prev && next) {
  next.addEventListener('click', () => track.scrollBy({left: track.clientWidth, behavior: 'smooth'}));
  prev.addEventListener('click', () => track.scrollBy({left: -track.clientWidth, behavior: 'smooth'}));
}

// aria-current dinámico
const sections = document.querySelectorAll('main section[id]');
const links = document.querySelectorAll('.menu a[href^="#"]');
const setActive = () => {
  let current = null;
  sections.forEach(sec => {
    const rect = sec.getBoundingClientRect();
    if (rect.top <= 120 && rect.bottom >= 120) current = sec.id;
  });
  links.forEach(a => {
    const h = a.getAttribute('href').slice(1);
    if (h === current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
};
window.addEventListener('scroll', setActive);
setActive();
