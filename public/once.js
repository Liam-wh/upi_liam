'use strict';
(() => {
  const get = id => document.getElementById(id);
  const select = get('once-program');
  const panel = get('once-panel');
  const trigger = get('once-toggle');
  const log = get('once-log');
  const input = get('once-input');
  const chat = get('once-form');
  const qr = get('qr-dialog');
  get('once-face').src = trigger.querySelector('img').src;
  const topics = JSON.parse(get('once-data').textContent);
  const courses = [...document.querySelectorAll('[data-program]')].map(el => ({
    id: Number(el.dataset.program), name: el.querySelector('h3').textContent,
    area: el.dataset.area, fullName: el.dataset.title, el, ...topics[el.dataset.program]
  }));
  const history = [];
  let lastId = 0;
  let waiting = false;
  let qrOpener;
  let qrBlob;
  function showQR(button) {
    qrOpener = button;
    if (document.body.dataset.preview === 'true' && !qrBlob) {
      const imageURL = get('qr-imagen').src;
      get('qr-download').href = imageURL;
      qrBlob = fetch(imageURL).then(response => response.blob()).then(file => {
        get('qr-download').href = URL.createObjectURL(file);
      }).catch(() => { qrBlob = null; });
    }
    if (!qr.open) qr.showModal();
  }
  document.querySelectorAll('[data-show-qr]').forEach(b=>b.addEventListener('click',()=>showQR(b)));
  get('qr-close').addEventListener('click',()=>qr.close());
  qr.addEventListener('close',()=>qrOpener?.focus({preventScroll:true}));
  qr.addEventListener('click',event=>{
    if (event.target !== qr) return;
    const r=qr.getBoundingClientRect();
    if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) qr.close();
  });

  function openChat(open) {
    panel.hidden = !open;
    trigger.setAttribute('aria-expanded',String(open));
    trigger.setAttribute('aria-label',open?'Cerrar chat con ONCE':'Abrir chat con ONCE');
    if (open) {
      if (matchMedia('(min-width:768px)').matches) input.focus({preventScroll:true});
      else get('once-close').focus({preventScroll:true});
    } else trigger.focus({preventScroll:true});
  }
  trigger.addEventListener('click',()=>openChat(panel.hidden));
  get('once-close').addEventListener('click',()=>openChat(false));
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape' && !panel.hidden && !document.querySelector('dialog[open]')) openChat(false);
  });
  select.addEventListener('change',()=>{
    lastId = Number(select.value);
    get('once-discover').textContent = select.value ? '¿Qué aprenderé?' : '¿Qué diplomados hay?';
  });
  function bubble(text, who='once') {
    const node = document.createElement('div');
    node.className='once-bubble'+(who==='user'?' own':'');
    node.textContent=text;
    log.append(node);
    log.scrollTop=log.scrollHeight;
    return node;
  }
  function action(parent, text, fn, href) {
    const el=document.createElement(href?'a':'button');
    el.textContent=text;
    el.className='once-action';
    if(href){el.href=href;el.target='_blank';el.rel='noopener';}
    else {el.type='button';el.addEventListener('click',fn);}
    parent.append(el);
  }
  function addActions(node, result) {
    const group=document.createElement('div');
    group.className='once-actions';
    const course=courses.find(c=>c.id===result.programa);
    if(course) {
      action(group,'Ver temario',null,course.fuente);
      action(group,'Me interesa',()=>{openChat(false);course.el.querySelector('[data-open]').click();});
    }
    if(result.accion==='qr') action(group,'QR de pago',e=>showQR(e.currentTarget));
    if(result.accion==='catalogo' || (result.accion==='registro' && !course)) {
      action(group,'Explorar diplomados',()=>{
        openChat(false);
        if(!document.getElementById('programas').classList.contains('shelf')) location.assign(get('scope-link').href);
        else get('catalogo').scrollIntoView();
      });
    }
    if(group.childElementCount) node.append(group);
    const start = log.scrollTop + node.getBoundingClientRect().top - log.getBoundingClientRect().top - 6;
    log.scrollTop = Math.min(start, log.scrollHeight - log.clientHeight);
  }
  const fold = s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const stop = new Set('para como quiero tiene sobre diplomado diplomados saber tiene cuales cuales aprender aprenderé estudio estudiar puedo interesan informacion detalles puedes temas'.split(' '));
  function matchCourse(q) {
    const terms=q.split(/[^a-z0-9]+/).filter(t=>t.length>2&&!stop.has(t));
    const ranked=courses.map(c=>{
      const words=fold(c.fullName).split(/[^a-z0-9]+/);
      const score=terms.reduce((n,t)=>n+(words.includes(t)?1:0),0);
      return {course:c,score};
    }).sort((a,b)=>b.score-a.score);
    return ranked[0]?.score && ranked[0].score>ranked[1]?.score ? ranked[0].course : null;
  }
  function guide(question) {
    const q=fold(question);
    const explicit=matchCourse(q);
    const c=explicit || courses.find(p=>p.id===(Number(select.value)||lastId));
    let respuesta, accion='ninguna';
    if(/\bqr\b|banco|transferencia/.test(q)) {
      respuesta='Pulsa «QR de pago» para ver o descargar el QR de titulaciones. Después de pagar, pulsa «Enviar comprobante por WhatsApp» y adjunta la imagen en la conversación.';accion='qr';
    } else if(/comprobante|voucher|captura|adjuntar/.test(q)) {
      respuesta='En el segundo paso elige «Sí, ya realicé el pago». Indica fecha y monto. Puedes subir una foto JPG, PNG o WebP de hasta 4 MB, pegar un enlace, o incluir ambos. Admisiones verificará el pago.';accion='registro';
    } else if(/cuesta|precio|costo|tarifa|cuanto (?:se )?paga|apostilla/.test(q)) {
      respuesta='En el Plan Alumni, la formación tiene beca del 100% para alumnos seleccionados. La certificación digital cuesta Bs 550 y la física con apostilla Bs 700. Para un participante nuevo o externo, la referencia es Bs 1.500 al inscribirse y Bs 700 al finalizar (Bs 2.200 en total).';accion='registro';
    } else if(/inscri|registr|anotar|matricul|usar|funciona (la|esta) (pagina|web)/.test(q)) {
      respuesta='1. Elige tu diplomado y pulsa «Me interesa».\n2. Completa nombre, CI y correo. Elige tu perfil y certificación.\n3. Si ya pagaste, agrega fecha, monto y, si lo tienes, el comprobante. Pulsa «Enviar solicitud». La sede revisa el pago antes de habilitar Moodle.';accion='registro';
    } else if(/modalidad|tiempo|dura|horas|moodle|acceso|plazo/.test(q)) {
      respuesta='Los diplomados son autogestionados en Moodle y tienen 160 horas académicas. Desde que recibes el acceso dispones de 90 días para completar y aprobar el programa. La sede tramita la certificación después de la aprobación.';
    } else if(/beca|alumni|aplic|elegib/.test(q)) {
      respuesta='El Plan Alumni está dirigido a alumnos seleccionados, incluidos alumnos en curso, titulados y personas que dejaron sus estudios. La sede confirma la elegibilidad. La beca cubre la formación; se paga la certificación elegida.';
    } else if(/que diplomados hay|catalogo|que areas|lista de diplomados/.test(q)) {
      respuesta='Hay '+courses.length+' diplomados. Puedes explorar estas áreas: '+[...new Set(courses.map(p=>p.area))].join(', ')+'. Elige uno en el selector de este chat para ver qué se estudia.';accion='catalogo';
    } else if(c) {
      return {respuesta:c.name+'\n'+c.resumen+' Puedes consultar el temario completo aquí.',programa:c.id,accion:'ninguna'};
    } else {
      const terms=q.split(/[^a-z0-9]+/).filter(w=>w.length>=3&&!stop.has(w));
      const matches=courses.filter(c=>terms.some(w=>fold(c.fullName+' '+c.area).split(/[^a-z0-9]+/).includes(w))).slice(0,4);
      respuesta=matches.length?'Podrían interesarte estos diplomados: '+matches.map(c=>c.name).join('; ')+'. Selecciona uno para conocer sus temas.':'Puedo ayudarte a elegir un diplomado, consultar su temario o inscribirte. Selecciona un diplomado arriba o dime qué tema te interesa.';
      accion='catalogo';
    }
    return {respuesta,accion,programa:accion==='catalogo'?0:(c?.id||0)};
  }
  async function ask(question) {
    const q=question.trim().slice(0,650);
    if(waiting || !q) return;
    waiting=true; input.value='';
    chat.querySelector('button').disabled=true;
    document.querySelectorAll('.once-suggest button').forEach(b=>b.disabled=true);
    bubble(q,'user');
    const pending=bubble('ONCE está escribiendo…');
    pending.classList.add('thinking');
    let result;
    let motivo = 'El navegador no recibió una respuesta de ONCE.';
    const useGemini=document.body.dataset.gemini==='true';
    try {
      if(useGemini) {
        const controller=new AbortController();
        const timer=setTimeout(()=>controller.abort(),50000);
        try {
          const r=await fetch('/api/once',{method:'POST',headers:{'Content-Type':'application/json'},
            body:JSON.stringify({contexto:Number(select.value)||lastId,mensajes:[...history.slice(-6),{rol:'user',texto:q}]}),
            signal:controller.signal});
          const data=await r.json();
          if(r.ok && data.modo==='gemini' && typeof data.respuesta==='string') result=data;
          else if(typeof data.error==='string') motivo=data.error;
        } finally {clearTimeout(timer);}
      }
    } catch { /* La guía del catálogo sigue disponible si Gemini no responde. */ }
    if(!result) result=guide(q);
    get('once-mode').textContent=result.modo==='gemini'?'Con Gemini · Comparte solo tu consulta académica.'
      :useGemini?'Guía del catálogo · '+motivo:'Guía del catálogo · Comparte solo tu consulta académica.';
    pending.classList.remove('thinking');
    pending.textContent=result.respuesta;
    if (result.programa && courses.some(c => c.id === result.programa)) {
      lastId = result.programa;
      select.value = String(lastId);
      get('once-discover').textContent = '¿Qué aprenderé?';
    }
    addActions(pending,result);
    history.push({rol:'user',texto:q},{rol:'model',texto:result.respuesta});
    if(history.length>8) history.splice(0,2);
    waiting=false;
    chat.querySelector('button').disabled=false;
    document.querySelectorAll('.once-suggest button').forEach(b=>b.disabled=false);
  }
  document.querySelectorAll('.once-suggest button').forEach(b=>b.addEventListener('click',()=>ask(b.textContent)));
  chat.addEventListener('submit',e=>{e.preventDefault();ask(input.value);});
})();
