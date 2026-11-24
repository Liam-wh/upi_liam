'use strict';

const byId = id => document.getElementById(id);
const all = selector => [...document.querySelectorAll(selector)];
const preview = document.body.dataset.preview === 'true';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const firstPhoto = document.querySelector('.hero-shot img');
Promise.allSettled([document.fonts.ready, firstPhoto.decode()]).then(() => {
  document.documentElement.classList.add('assets-ready');
});
const cards = all('[data-program]');
const programs = new Map(cards.map(card => [card.dataset.program, card]));
const menuButton = byId('menu');
const navigation = byId('navegacion');

function setMenu(open) {
  navigation.classList.toggle('open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
  menuButton.querySelector('use').setAttribute('href', open ? '#i-close' : '#i-menu');
}
menuButton.addEventListener('click', () => setMenu(!navigation.classList.contains('open')));
navigation.addEventListener('click', event => {
  if (event.target.closest('a')) setMenu(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navigation.classList.contains('open')) {
    setMenu(false);
    menuButton.focus();
  }
});
matchMedia('(min-width: 768px)').addEventListener('change', () => setMenu(false));

// En portada. El visitante controla los cambios con botones, teclado o un gesto horizontal.
const slides = all('[data-slide]');
const featureName = byId('feature-name');
let slideIndex = 0;
function moveSlide(direction) {
  slides[slideIndex].classList.remove('is-current');
  slideIndex = (slideIndex + direction + slides.length) % slides.length;
  const slide = slides[slideIndex];
  slide.classList.add('is-current');
  const card = programs.get(slide.dataset.slide);
  featureName.dataset.open = slide.dataset.slide;
  featureName.textContent = card.querySelector('h3').textContent;
  featureName.classList.remove('changed');
  requestAnimationFrame(() => featureName.classList.add('changed'));
  byId('slide-number').textContent = String(slideIndex + 1).padStart(2, '0');
  byId('slide-status').textContent = (slideIndex + 1) + ' de ' + slides.length + '. ' + featureName.textContent;
}
byId('slide-prev').addEventListener('click', () => moveSlide(-1));
byId('slide-next').addEventListener('click', () => moveSlide(1));
const hero = document.querySelector('.hero');
hero.addEventListener('keydown', event => {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  event.preventDefault();
  moveSlide(event.key === 'ArrowRight' ? 1 : -1);
});
let swipeStart;
hero.addEventListener('touchstart', event => {
  swipeStart = event.touches.length === 1 ? event.touches[0] : null;
}, {passive: true});
hero.addEventListener('touchcancel', () => { swipeStart = null; });
hero.addEventListener('touchend', event => {
  if (!swipeStart || !event.changedTouches.length) return;
  const end = event.changedTouches[0];
  const dx = end.clientX - swipeStart.clientX;
  const dy = end.clientY - swipeStart.clientY;
  swipeStart = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) moveSlide(dx < 0 ? 1 : -1);
}, {passive: true});

// La misma selección funciona en Flask y al abrir el HTML de muestra desde el disco.
const fullCatalog = preview
  ? new URLSearchParams(location.search).get('vista') === 'completa'
  : document.body.dataset.full === 'true';
const group = fullCatalog ? 'completo' : 'seleccion';
const filterBar = document.querySelector('[data-filters="' + group + '"]');
const shelf = byId('programas');
shelf.classList.toggle('shelf', fullCatalog);
byId('shelf-controls').hidden = !fullCatalog;
function updateShelf() {
  byId('shelf-prev').disabled = shelf.scrollLeft < 2;
  byId('shelf-next').disabled = shelf.scrollLeft + shelf.clientWidth >= shelf.scrollWidth - 2;
}
if (fullCatalog) {
  for (const [id, direction] of [['shelf-prev', -1], ['shelf-next', 1]]) {
    byId(id).addEventListener('click', () => {
      const visible = shelf.querySelector('article:not([hidden])');
      const step = visible.getBoundingClientRect().width + parseFloat(getComputedStyle(shelf).columnGap);
      shelf.scrollBy({left: direction * step, behavior: reducedMotion.matches ? 'instant' : 'smooth'});
    });
  }
  shelf.addEventListener('scroll', updateShelf, {passive: true});
  new ResizeObserver(updateShelf).observe(shelf);
}
for (const bar of all('[data-filters]')) bar.hidden = bar !== filterBar;
if (preview) {
  const link = byId('scope-link');
  link.href = (fullCatalog ? '?vista=seleccion' : '?vista=completa') + '#catalogo';
  link.querySelector('span').textContent = fullCatalog ? 'Ver selección' : 'Ver los ' + cards.length + ' diplomados';
}
const reveal = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    if (!reducedMotion.matches) entry.target.classList.add('enter');
    reveal.unobserve(entry.target);
  }
}, {threshold: 0.05}) : null;
byId('programas').addEventListener('animationend', event => {
  if (event.animationName === 'card-in') event.target.classList.remove('enter');
});
function filterCatalog(area) {
  let count = 0;
  for (const card of cards) {
    const category = fullCatalog ? card.dataset.area : card.dataset.selection;
    card.hidden = !category || Boolean(area && area !== category);
    if (card.hidden) {
      card.classList.remove('enter');
      reveal?.unobserve(card);
    } else {
      card.querySelector('.area-tag span').textContent = category;
      count++;
      reveal?.observe(card);
    }
  }
  for (const button of filterBar.querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.filter === area));
  }
  byId('count').textContent = count + (count === 1 ? ' diplomado' : ' diplomados');
  if (fullCatalog) {
    shelf.scrollLeft = 0;
    updateShelf();
  }
}
filterBar.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button) filterCatalog(button.dataset.filter);
});
filterCatalog('');

// Solicitudes por programa: los borradores viven sólo en la memoria de esta pestaña.
const dialog = byId('consulta');
const form = byId('lead');
const formId = document.body.dataset.formId;
const field = name => form.elements.namedItem(name);
const inputNames = ['name','ci','email','sede','asesor','perfil','certificacion','pago','fecha_pago','monto','comprobante','message'];
const inquiries = new Map();
let activeProgram;
let opener;
form.noValidate = true;

function todayInBolivia() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}
function inquiryFor(id) {
  if (!inquiries.has(id)) inquiries.set(id, {step: 1, phase: 'draft', values: {}, error: '', key: '', signature: ''});
  return inquiries.get(id);
}
function saveDraft() {
  if (!activeProgram) return;
  const saved = inquiryFor(activeProgram).values;
  for (const name of inputNames) saved[name] = field(name).value;
}
function syncPayment() {
  const external = field('perfil').value === 'externo';
  field('certificacion').querySelector('[value="digital"]').disabled = external;
  if (external) field('certificacion').value = 'fisico';
  const amount = field('certificacion').selectedOptions[0]?.dataset.tarifa;
  byId('tarifa').hidden = !amount;
  byId('tarifa').textContent = external
    ? 'Referencia para externos: Bs 1.500 al inscribirte y Bs 700 por la certificación al finalizar. Total: Bs 2.200.'
    : 'Tarifa de certificación del Plan Alumni: Bs ' + (amount || '') + '.';
  const paid = field('pago').value === 'realizado';
  byId('payment-data').hidden = !paid;
  for (const name of ['fecha_pago','monto','comprobante','attachment']) field(name).disabled = !paid;
  if (!paid && field('attachment').files.length) clearProof();
  field('fecha_pago').max = todayInBolivia();
  field('fecha_pago').required = paid;
  field('monto').required = paid;
}
function showStep(step, focus = false) {
  const student = step === 1;
  inquiryFor(activeProgram).step = step;
  byId('student-step').hidden = !student;
  byId('payment-step').hidden = student;
  byId('submit').hidden = student;
  if (focus) {
    const target = student ? field('name') : field('perfil');
    target.focus({preventScroll: true});
    target.scrollIntoView({block: 'nearest', behavior: 'instant'});
  }
}
function validStep(step) {
  if (step === 1) {
    field('name').setCustomValidity(field('name').value.trim() ? '' : 'Escribe tu nombre completo.');
    field('ci').setCustomValidity(field('ci').value.trim() ? '' : 'Escribe tu número de CI.');
  } else {
    const link = field('comprobante');
    link.setCustomValidity('');
    if (!link.disabled && link.value.trim()) {
      try {
        const u = new URL(link.value);
        if (u.protocol !== 'https:' || u.username || u.password || /\s/.test(link.value)) throw new Error();
      } catch { link.setCustomValidity('Usa un enlace HTTPS válido para el comprobante.'); }
    }
  }
  const panel = byId(step === 1 ? 'student-step' : 'payment-step');
  const invalid = [...panel.querySelectorAll('input, select, textarea')].find(el => !el.checkValidity());
  if (!invalid) return true;
  showStep(step);
  const details = invalid.closest('details');
  if (details) details.open = true;
  invalid.reportValidity();
  return false;
}
function providerFields(data, programTitle) {
  const get = name => (data.get(name) || '').trim();
  const lines = [
    ['Fecha de solicitud de inscripción (Bolivia)', todayInBolivia()],
    ['Nombre del estudiante', get('name')], ['CI del estudiante', get('ci')],
    ['Correo del estudiante', get('email')], ['Programa', programTitle],
    ['Perfil declarado', field('perfil').selectedOptions[0].textContent],
    ['Sede indicada', get('sede') || 'Por asignar'], ['Personal de sede indicado', get('asesor') || 'Por asignar'],
    ['Tipo de certificación', field('certificacion').selectedOptions[0].textContent],
    ['Tarifa de certificación (Bs)', field('certificacion').selectedOptions[0].dataset.tarifa],
  ];
  if (get('perfil') === 'externo') lines.push(['Referencia para externos (Bs)', '1.500 de formación + 700 de certificación = 2.200']);
  if (get('pago') === 'realizado') {
    lines.push(['Pago declarado', 'Realizado · pendiente de verificación por la sede'],
      ['Fecha de pago', get('fecha_pago')], ['Monto declarado (Bs)', Number(get('monto')).toFixed(2)],
      ['Enlace al comprobante', get('comprobante') || (data.get('attachment')?.size ? 'Se adjunta imagen' : 'Pendiente de entrega')]);
  } else {
    lines.push(['Pago declarado', 'Aún no realizado']);
  }
  if (get('message')) lines.push(['Mensaje', get('message')]);
  const subject = 'Solicitud de inscripción UPI · ' + programTitle;
  const fields = Object.fromEntries(lines);
  fields.email = get('email');
  fields._subject = subject;
  fields._template = 'table';
  fields._captcha = 'false';
  fields._honey = get('website');
  fields._url = location.protocol === 'file:' ? document.body.dataset.formUrl : location.origin + location.pathname;
  if (!preview) fields._next = location.origin + '/solicitud-recibida';
  if (data.get('intento')) fields['Referencia de solicitud'] = get('intento');
  return fields;
}
function renderProof() {
  const file = field('attachment').files[0];
  const image = byId('proof-thumb');
  if (image.dataset.objectUrl) URL.revokeObjectURL(image.dataset.objectUrl);
  image.removeAttribute('src');
  delete image.dataset.objectUrl;
  const problem = file && (!file.size || file.size > 4 * 1024 * 1024 || !['image/jpeg','image/png','image/webp'].includes(file.type));
  field('attachment').setCustomValidity(problem ? 'Elige una imagen JPG, PNG o WebP de hasta 4 MB.' : '');
  byId('proof-preview').hidden = !file || Boolean(problem);
  if (file && !problem) { image.dataset.objectUrl = URL.createObjectURL(file); image.src = image.dataset.objectUrl; }
}
function clearProof() {
  field('attachment').value = '';
  if (activeProgram) inquiryFor(activeProgram).file = null;
  renderProof();
}
async function checkedProof(file) {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const starts = (...signature) => signature.every((byte, index) => header[index] === byte);
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return new File([file], 'comprobante.png', {type: 'image/png'});
  if (starts(0xff, 0xd8, 0xff)) return new File([file], 'comprobante.jpg', {type: 'image/jpeg'});
  if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...header.slice(8, 12)) === 'WEBP') {
    return new File([file], 'comprobante.webp', {type: 'image/webp'});
  }
  throw new Error('El archivo seleccionado debe contener una imagen JPG, PNG o WebP. Elige otra foto del comprobante.');
}
byId('remove-proof').addEventListener('click', clearProof);
field('attachment').addEventListener('change', () => {
  inquiryFor(activeProgram).file = field('attachment').files[0] || null;
  renderProof();
  if (!field('attachment').validity.valid) field('attachment').reportValidity();
});
function renderInquiry() {
  const entry = inquiryFor(activeProgram);
  const finished = entry.phase === 'accepted';
  const pending = entry.phase === 'sending';
  const failed = entry.phase === 'error' || entry.phase === 'activation';
  byId('compose').hidden = finished;
  byId('receipt').hidden = !finished;
  byId('fields').disabled = pending;
  byId('submit').disabled = pending || finished;
  byId('submit').classList.toggle('is-sending', pending);
  form.setAttribute('aria-busy', String(pending));
  byId('submit-label').textContent = pending ? 'Enviando solicitud…'
    : failed ? 'Reintentar envío' : 'Enviar solicitud';
  byId('form-error').hidden = !failed;
  byId('form-error').querySelector('span').textContent = failed ? entry.error : '';
  byId('form-status').textContent = pending ? 'Enviando solicitud…' : '';
  if (finished) {
    byId('receipt-heading').textContent = 'Solicitud enviada';
    byId('receipt-text').textContent = 'FormSubmit aceptó tu solicitud para enviarla a admisiones. El equipo podrá responderte en ' + entry.values.email + '.';
    byId('receipt-heading').focus({preventScroll: true});
  } else { showStep(entry.step); }
}
function openInquiry(button) {
  const id = button.dataset.open;
  const card = programs.get(id);
  if (!card) return;
  setMenu(false);
  opener = button;
  activeProgram = id;
  const entry = inquiryFor(id);
  const title = card.dataset.title;
  byId('chosen-title').textContent = title;
  byId('wa').href = 'https://wa.me/' + document.body.dataset.phone + '?text='
    + encodeURIComponent('Hola, me interesa ' + title + '. ¿Me orientas sobre la inscripción?');
  form.reset();
  form.elements.program.value = id;
  if (entry.file) { const list = new DataTransfer(); list.items.add(entry.file); field('attachment').files = list.files; }
  renderProof();
  for (const name of inputNames) {
    if (Object.hasOwn(entry.values, name)) field(name).value = entry.values[name];
    field(name).setCustomValidity('');
  }
  document.querySelector('.staff-details').open = Boolean(field('sede').value || field('asesor').value);
  syncPayment();
  dialog.showModal();
  dialog.scrollTop = 0;
  renderInquiry();
}
document.addEventListener('click', event => {
  const button = event.target.closest('[data-open]');
  if (button) openInquiry(button);
});
byId('close').addEventListener('click', () => dialog.close());
byId('done').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => {
  saveDraft();
  if (byId('proof-thumb').dataset.objectUrl) {
    URL.revokeObjectURL(byId('proof-thumb').dataset.objectUrl);
    delete byId('proof-thumb').dataset.objectUrl;
    byId('proof-thumb').removeAttribute('src');
  }
  activeProgram = null;
  opener?.focus({preventScroll: true});
});
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom) dialog.close();
});
byId('continue').addEventListener('click', () => {
  if (validStep(1)) showStep(2, true);
});
byId('back-step').addEventListener('click', () => showStep(1, true));
form.addEventListener('input', event => event.target.setCustomValidity?.(''));
form.addEventListener('change', syncPayment);
function submitToProvider(fields, file) {
  // El POST nativo permite adjuntar el binario y completar la confirmación del proveedor en el navegador.
  const outgoing = document.createElement('form');
  outgoing.className = 'provider-post';
  outgoing.hidden = true;
  outgoing.method = 'POST';
  outgoing.enctype = 'multipart/form-data';
  outgoing.action = 'https://formsubmit.co/' + formId;
  for (const [key,value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden'; input.name = key; input.value = value;
    outgoing.append(input);
  }
  if (file?.size) {
    const upload = document.createElement('input');
    upload.type = 'file'; upload.name = 'attachment';
    const transfer = new DataTransfer();
    transfer.items.add(file);
    upload.files = transfer.files;
    outgoing.append(upload);
  }
  document.body.append(outgoing);
  HTMLFormElement.prototype.submit.call(outgoing);
  return outgoing;
}
window.addEventListener('pageshow', event => {
  if (event.persisted) document.querySelectorAll('.provider-post').forEach(el => el.remove());
  if (event.persisted && activeProgram && inquiryFor(activeProgram).phase === 'sending') {
    const entry = inquiryFor(activeProgram);
    entry.phase = 'error';
    entry.error = 'Has vuelto al formulario. Revisa la respuesta de FormSubmit antes de volver a enviar.';
    renderInquiry();
  }
});
async function deliver(data) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 37000);
  try {
    const response = await fetch(preview ? new URL('/consulta', document.body.dataset.formUrl) : '/consulta', {method:'POST',body:data,headers:{Accept:'application/json'},signal:controller.signal});
    const result = await response.json().catch(() => null);
    if (result?.status === 'activation_pending') return 'activation';
    if (response.ok && result?.status === 'accepted') return 'accepted';
    throw new Error(result?.message || 'FormSubmit no confirmó el envío. Conservamos los datos de esta solicitud.');
  } finally { clearTimeout(timeout); }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  const id = activeProgram;
  if (!id) return;
  const entry = inquiryFor(id);
  if (!['draft','error','activation'].includes(entry.phase)) return;
  if (!validStep(1)) return;
  if (entry.step === 1) { showStep(2, true); return; }
  if (!validStep(2)) return;
  saveDraft();
  const data = new FormData(form);
  const proof = data.get('attachment');
  if (!proof?.size) data.delete('attachment');
  const signature = JSON.stringify([...data].map(([k,v]) => [k, v instanceof File ? [v.name,v.size,v.lastModified] : v]));
  if (signature !== entry.signature) {
    entry.signature = signature;
    entry.key = globalThis.crypto?.randomUUID?.() || '';
  }
  if (entry.key) data.set('intento', entry.key);
  entry.phase = 'sending';
  renderInquiry();
  try {
    // En el HTML descargable y en los envíos con imagen usamos el formulario oficial de FormSubmit.
    if (formId) {
      const fields = providerFields(data, programs.get(id).dataset.title);
      const image = proof?.size ? await checkedProof(proof) : null;
      const outgoing = submitToProvider(fields, image);
      setTimeout(() => {
        outgoing.remove();
        if (entry.phase !== 'sending') return;
        entry.phase = 'error';
        entry.error = 'Falta la confirmación de FormSubmit. Consulta con admisiones antes de reenviar tu solicitud.';
        if (activeProgram === id && dialog.open) renderInquiry();
      }, 45000);
      return;
    }
    entry.phase = await deliver(data);
    if (entry.phase === 'activation') {
      entry.error = 'FormSubmit solicitó verificar esta dirección de formulario. Puedes avisar a admisiones por WhatsApp.';
    }
  } catch (error) {
    entry.phase = 'error';
    entry.error = error.name === 'AbortError' ? 'FormSubmit tardó en responder. No se pudo confirmar la recepción.'
      : error instanceof TypeError ? 'Revisa tu conexión. FormSubmit no confirmó el envío.' : error.message;
  }
  if (activeProgram === id && dialog.open) renderInquiry();
});
