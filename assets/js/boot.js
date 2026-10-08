/* Se carga de forma síncrona en <head>, antes de pintar nada.
   Activa las animaciones de entrada (clase .motion) solo si la página arranca
   visible y sin "reducir movimiento". En cualquier otro caso el contenido se
   muestra directamente: nunca queda oculto esperando una animación. */
(function () {
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (document.visibilityState === 'visible' && !reduce) {
    document.documentElement.classList.add('motion');
  }
})();
