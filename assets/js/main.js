document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('.contact-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Gracias por tu mensaje. Te contactaremos pronto.');
    form.reset();
  });
});
