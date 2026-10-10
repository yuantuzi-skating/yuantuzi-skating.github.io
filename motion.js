(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hero = document.querySelector('.hero');
  const visual = document.querySelector('.hero-bunny');
  if (!reduced && window.matchMedia('(pointer: fine)').matches) {
    let frame;
    hero.addEventListener('pointermove', (event) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = hero.getBoundingClientRect();
        visual.style.transform = `translate(${((event.clientX-r.left)/r.width-.5)*16}px,${((event.clientY-r.top)/r.height-.5)*10}px) rotate(${((event.clientX-r.left)/r.width-.5)*2}deg)`;
      });
    });
    hero.addEventListener('pointerleave', () => {cancelAnimationFrame(frame);visual.style.transform = '';});
  }
  const header = document.querySelector('.site-header');
  const updateHeader = () => header.classList.toggle('scrolled', window.scrollY > 30);
  window.addEventListener('scroll', updateHeader, {passive:true});updateHeader();
  document.getElementById('footer-year').textContent = new Intl.DateTimeFormat('en',{timeZone:'Asia/Shanghai',year:'numeric'}).format(new Date());
})();
