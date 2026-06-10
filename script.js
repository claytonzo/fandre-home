// Subtle parallax tilt on the Lily card
const lilyCard = document.querySelector('.card--lily');
if (lilyCard) {
  lilyCard.addEventListener('mousemove', (e) => {
    const r = lilyCard.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width  - 0.5;
    const y = (e.clientY - r.top)  / r.height - 0.5;
    lilyCard.style.transform =
      `translateY(-8px) scale(1.02) rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
  });
  lilyCard.addEventListener('mouseleave', () => {
    lilyCard.style.transform = '';
  });
}
