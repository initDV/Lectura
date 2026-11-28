// The page remains fully visible without JavaScript and with reduced motion.
(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motion.matches || !('IntersectionObserver' in window)) return;

  const pending = [];
  const show = (element) => element.classList.remove('reveal-pending');
  const observer = new IntersectionObserver((entries) => {
    for (const { isIntersecting, target } of entries) {
      if (!isIntersecting) continue;
      show(target);
      observer.unobserve(target);
    }
  }, { threshold: 0.08 });

  for (const element of document.querySelectorAll('[data-reveal]')) {
    if (element.getBoundingClientRect().top < window.innerHeight) continue;
    element.classList.add('reveal-active', 'reveal-pending');
    pending.push(element);
    observer.observe(element);
  }
  motion.addEventListener('change', ({ matches }) => {
    if (!matches) return;
    observer.disconnect();
    pending.forEach(show);
  });
})();
