(() => {
  const reservationPath = '/reservation';
  const reservationForm = () => document.querySelector('#reservation-form');

  function showReservationPage() {
    if (location.pathname !== reservationPath) return;

    const home = document.querySelector('#home');
    const homeActions = document.querySelector('#home-actions');
    const menu = document.querySelector('#menu');
    const reservation = document.querySelector('#reservation');
    const about = document.querySelector('#about');
    const productPage = document.querySelector('#product-page');
    const categoryView = document.querySelector('#category-view');
    const categoryDetail = document.querySelector('#category-detail');
    const menuHeading = document.querySelector('#menu-heading');

    if (!reservation || !reservationForm()) return;

    if (home) home.hidden = true;
    if (homeActions) homeActions.hidden = true;
    if (menu) menu.hidden = true;
    if (reservation) reservation.hidden = false;
    if (about) about.hidden = true;
    if (productPage) productPage.hidden = true;
    if (categoryView) categoryView.hidden = true;
    if (categoryDetail) categoryDetail.hidden = true;
    if (menuHeading) menuHeading.hidden = true;

    document.body.classList.remove('category-route');
    document.title = 'حجز طاولة — ARABISK';
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a[href="#reservation"],a[href="/#reservation"]');
    if (!link) return;
    event.preventDefault();
    location.assign(reservationPath);
  });

  if (location.hash === '#reservation') {
    history.replaceState(null, '', reservationPath);
  }

  showReservationPage();
  const refreshTimer = setInterval(showReservationPage, 300);
  window.addEventListener('beforeunload', () => clearInterval(refreshTimer));
})();
